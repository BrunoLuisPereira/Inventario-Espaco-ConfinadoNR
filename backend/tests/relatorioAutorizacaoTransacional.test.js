const { conferir: conferirCapacidadeSql } = require('./helpers/rbacSqlSimulado.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
const repo = require('../src/repositories/relatorioMultiTenantRepository');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const campos = ['nome_responsavel_tecnico', 'crea', 'numero_art', 'data_art', 'status'];
const camposCaracterizacao = ['codigo_identificacao','volume_m3','quantidade_aberturas','dimensoes_aberturas',
  'formas_acesso','geometria','utilizacao_produto','perigos_antes_liberacao'];
function caracterizacao(ambiente) {
  return { codigo_identificacao:'EC_'+ambiente,volume_m3:'123.456789',quantidade_aberturas:0,
    dimensoes_aberturas:'DIM_'+ambiente,formas_acesso:'ACESSO_'+ambiente,geometria:'GEOMETRIA_'+ambiente,
    utilizacao_produto:'USO_'+ambiente,perigos_antes_liberacao:'PERIGOS_'+ambiente };
}
function preparar(t, ambiente = A, engenheiro = false, criacao = false) {
  const u = { id_usuario: ambiente === A ? 11 : 21, id_ambiente: ambiente };
  const estado = { ativo: true, ambienteAtivo: true, ambiente, criadorAmbiente: ambiente, perfil: engenheiro ? 'ENGENHEIRO_SEGURANCA' : 'ADMINISTRADOR', responsavel: u.id_usuario,
    campanha: 10, local: { id_local: 40, id_campanha: 10 }, registro: criacao ? null : { id_relatorio: 50, id_local: 40, id_usuario_responsavel: 99, nome_responsavel_tecnico: 'Historico', crea: 'CREA', numero_art: 'ART', data_art: '2026-10-18', status: 'RASCUNHO', caminho_pdf: 'uploads/relatorios/legado.pdf', hash_pdf: 'a'.repeat(64) },
    consultas: [], escritas: [], liberacoes: [], inesperadas: [], falha: null, hook: null, vazio: false, rollbackFalha: false, aberta: false, trabalho: undefined };
  const permitido = () => estado.ativo && estado.ambienteAtivo && estado.ambiente === u.id_ambiente && ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR'].includes(estado.perfil);
  function contexto(sql, params) {
    assert.match(sql, /c\.id_ambiente\s*=\s*\$[12]|a\.id_ambiente\s*=\s*\$2/);
    assert.match(sql, /u\.id_usuario\s*=\s*\$[23]/);
    assert.match(sql, /u\.id_ambiente\s*=\s*c\.id_ambiente|u\.id_ambiente\s*=\s*a\.id_ambiente/);
    assert.match(sql, /u\.ativo\s*=\s*TRUE/); assert.match(sql, /a\.ativo\s*=\s*TRUE/);
    conferirCapacidadeSql(sql, 'u');
    assert.ok(params.includes(u.id_ambiente)); assert.ok(params.includes(u.id_usuario)); assert.equal(sql.includes(u.id_ambiente), false);
  }
  estado.geracoes = [];
  const client = {
    async query(texto, params = []) {
      const sql = texto.replace(/\s+/g, ' ').trim(); estado.consultas.push({ sql, params: [...params] });
      if (estado.falha?.prefixo && sql.startsWith(estado.falha.prefixo)) throw estado.falha.erro;
      if (sql === 'BEGIN ISOLATION LEVEL READ COMMITTED') { assert.equal(estado.aberta, false); estado.aberta = true; estado.trabalho = undefined; estado.geracoesTrabalho = [...estado.geracoes]; return { rows: [] }; }
      if (sql === 'ROLLBACK') { if (estado.rollbackFalha) throw new Error('Rollback falhou'); estado.trabalho = undefined; estado.geracoesTrabalho = undefined; estado.aberta = false; return { rows: [] }; }
      if (sql === 'COMMIT') { assert.equal(estado.aberta, true); if (estado.trabalho !== undefined) estado.registro = estado.trabalho; estado.geracoes = estado.geracoesTrabalho; estado.aberta = false; return { rows: [] }; }
      const lock = sql.match(/FOR (?:UPDATE|SHARE) OF (a|u|c|l|r)$/);
      if (lock && sql.startsWith('SELECT c.id_campanha, l.id_local FROM ambiente AS a')) {
        assert.equal(estado.aberta, true); contexto(sql, params);
        const criar = !sql.includes('INNER JOIN relatorio AS r');
        assert.deepEqual(params.slice(0, 3), [criar ? 40 : 50, u.id_ambiente, u.id_usuario]);
        if (params.length === 5) { assert.deepEqual(params.slice(3), [10, 40]); assert.match(sql, /c\.id_campanha = \$4 AND l\.id_local = \$5/); }
        if (estado.hook?.alias === lock[1]) estado.hook.executar(estado);
        const vinculo = estado.local.id_campanha === estado.campanha && (criar || estado.registro?.id_local === estado.local.id_local);
        const pais = params.length === 3 || params[3] === estado.campanha && params[4] === estado.local.id_local;
        return { rows: permitido() && vinculo && pais ? [{ id_campanha: estado.campanha, id_local: estado.local.id_local }] : [] };
      }
      if (sql.startsWith('SELECT r.* FROM relatorio AS r')) {
        contexto(sql, params); assert.equal(estado.aberta, true);
        return { rows: permitido() && estado.registro ? [{ ...estado.registro }] : [] };
      }
      if (sql.startsWith('SELECT r.id_relatorio,')) {
        contexto(sql, params); assert.equal(estado.aberta, true);
        for(const campo of [...camposCaracterizacao, ...require('../src/utils/adaptadorCamposNr33').CAMPOS_NR33])assert.ok(sql.includes('ch.'+campo),campo+' precisa vir do Checklist autorizado');
        assert.match(sql, /WHERE e\.id_local = l\.id_local/);
        assert.match(sql, /ON ch\.id_local = l\.id_local/);
        assert.match(sql, /ON dt\.id_local = l\.id_local/);
        assert.match(sql, /u\.id_ambiente = c\.id_ambiente/);
        return { rows: permitido() ? [{ ...estado.registro, ...caracterizacao(estado.ambiente), id_checklist: 7, criterio_a: 'SIM', id_dados: 8, oxigenio: 0, evidencias: [{ id_evidencia: 9, latitude: 0, longitude: 0, id_local: 40 }] }] : [] };
      }
      if (sql.startsWith('SELECT to_regclass')) return { rows: [{ tabela: estado.semMigration ? null : 'relatorio_pdf_geracao' }] };
      if (sql.startsWith('SELECT g.')) {
        assert.equal(estado.aberta, true);
        assert.match(sql, /g.id_relatorio = \$1 AND g.id_ambiente = \$2/);
        assert.equal(params[0], 50); assert.equal(params[1], u.id_ambiente);
        const uuid = sql.includes('g.id_geracao = $3');
        return { rows: estado.geracoesTrabalho.filter(g => g.id_relatorio === params[0] && g.id_ambiente === params[1] && (uuid ? g.id_geracao === params[2] : g.idioma === params[2])) };
      }
      if (sql.startsWith('INSERT INTO public.relatorio_pdf_geracao')) {
        assert.equal(estado.aberta, true);
        assert.deepEqual(params.slice(0, 3), [50, u.id_ambiente, u.id_usuario]);
        const inicio = estado.consultas.findLastIndex(q => q.sql === 'BEGIN ISOLATION LEVEL READ COMMITTED');
        assert.equal(estado.consultas.slice(inicio).filter(q => /FOR (?:UPDATE|SHARE) OF/.test(q.sql)).length, 5);
        estado.geracao = { id_geracao: params[3], id_relatorio: params[0], id_ambiente: params[1], id_solicitante: params[2], idioma: params[4], caminho_pdf: params[5], hash_pdf: params[6] };
        estado.geracoesTrabalho.push(estado.geracao);
        return { rows: [estado.geracao] };
      }
      if (sql.startsWith('UPDATE relatorio AS r SET status')) {
        contexto(sql, params); assert.equal(estado.aberta, true);
        assert.deepEqual(params, [50, u.id_ambiente, u.id_usuario]);
        estado.escritas.push({ sql, params });
        const set = sql.split(' FROM ')[0];
        assert.doesNotMatch(set, /caminho_pdf|hash_pdf|numero_art|nome_responsavel_tecnico|crea\s*=/);
        estado.trabalho = { ...estado.registro, status: 'GERADO' };
        return { rows: [estado.trabalho] };
      }
      if (/^(INSERT INTO relatorio AS r|UPDATE relatorio AS r|DELETE FROM relatorio AS r)\b/.test(sql)) {
        estado.escritas.push({ sql, params }); // Registra a tentativa mesmo se uma asserção falhar.
        assert.equal(estado.aberta, true); contexto(sql, params);
        const criar = sql.startsWith('INSERT');
        const inicio = estado.consultas.findLastIndex(q => q.sql === 'BEGIN ISOLATION LEVEL READ COMMITTED');
        const locks = estado.consultas.slice(inicio).map(q => q.sql.match(/FOR (?:UPDATE|SHARE) OF (a|u|c|l|r)$/)?.[1]).filter(Boolean);
        assert.deepEqual(locks, criar ? ['a', 'u', 'c', 'l'] : ['a', 'u', 'c', 'l', 'r']);
        assert.equal(permitido(), true, 'Nunca tentar escrita depois de recusar autorização');
        if (estado.vazio) return { rows: [] };
        if (criar) {
          assert.match(sql, /SELECT l\.id_local, \$4, \$5, \$6, \$7, \$8, \$3 FROM local AS l/);
          assert.equal(params.length, 8);
          if (estado.registro?.id_local === 40) throw Object.assign(new Error('Duplicidade simulada'), { code: '23505', constraint: 'relatorio_id_local_key' });
          estado.trabalho = { id_relatorio: 99, id_local: 40, id_usuario_responsavel: params[2], ...Object.fromEntries(campos.map((c,i) => [c, params[i+3]])) };
          return { rows: [{ ...estado.trabalho }] };
        }
        assert.match(sql, /l\.id_local = r\.id_local/); assert.match(sql, /c\.id_campanha = l\.id_campanha/);
        if (sql.startsWith('DELETE')) {
          assert.match(sql, /USING local AS l, campanha AS c/); assert.match(sql, /RETURNING r\.\*/); assert.deepEqual(params, [50, u.id_ambiente, u.id_usuario]);
          estado.trabalho = null; return { rows: [{ ...estado.registro }] };
        }
        assert.equal(params.length, 13);
        const set = sql.split(' SET ')[1].split(' FROM ')[0]; assert.doesNotMatch(set, /id_local|id_usuario|id_ambiente/);
        estado.trabalho = { ...estado.registro };
        for (const [i, campo] of campos.entries()) {
          assert.ok(sql.includes(`${campo} = CASE WHEN $${9+i}::boolean THEN $${4+i} ELSE r.${campo} END`));
          if (params[i+8]) estado.trabalho[campo] = params[i+3];
        }
        return { rows: [{ ...estado.trabalho }] };
      }
      estado.inesperadas.push(sql); throw new Error('SQL transacional desconhecido');
    },
    release(erro) { estado.liberacoes.push(erro); },
  };
  t.mock.method(pool, 'connect', async () => client);
  t.mock.method(pool, 'query', async (texto, params) => {
    const sql = texto.replace(/\s+/g, ' ').trim(); estado.consultas.push({ sql, params });
    if (sql.startsWith('SELECT r.id_relatorio,')) {
      contexto(sql, params); assert.match(sql, /WHERE e\.id_local = l\.id_local/);
      for(const campo of camposCaracterizacao)assert.ok(sql.includes('ch.'+campo));
      assert.match(sql, /ON ch\.id_local = l\.id_local/); assert.match(sql, /ON dt\.id_local = l\.id_local/);
      return { rows: permitido() ? [{ ...estado.registro,...caracterizacao(estado.ambiente), evidencias: [{ id_local: 40 }] }] : [] };
    }
    const local = sql.startsWith('SELECT l.id_local FROM local AS l');
    if (!local && !sql.startsWith('SELECT r.*,')) { estado.inesperadas.push(sql); throw new Error('Leitura desconhecida'); }
    contexto(sql, params); assert.match(sql, /c\.id_campanha = l\.id_campanha/);
    if (local) { assert.deepEqual(params, [40, u.id_ambiente, u.id_usuario]); return { rows: permitido() ? [{ id_local: 40 }] : [] }; }
    assert.match(sql, /l\.id_local = r\.id_local/); assert.match(sql, /LEFT JOIN usuario AS criador/); assert.match(sql, /criador\.id_ambiente = c\.id_ambiente/);
    const autorizacao = sql.slice(sql.indexOf('AND EXISTS')); assert.doesNotMatch(autorizacao, /\b(?:r\.id_usuario|criador\.)/i);
    const porLocal = sql.includes('r.id_local = $1'), individual = porLocal || sql.includes('r.id_relatorio = $1');
    assert.deepEqual(params, individual ? [porLocal ? 40 : 50, u.id_ambiente, u.id_usuario] : [u.id_ambiente, u.id_usuario]);
    return { rows: permitido() && estado.registro ? [{ ...estado.registro, usuario_responsavel: estado.criadorAmbiente === estado.ambiente ? 'Criador autorizado' : null }] : [] };
  });
  t.after(() => assert.deepEqual(estado.inesperadas, [])); return { estado, u };
}
const escritas = [
  ['criar', (u, d = {}) => repo.criarNoAmbiente({ id_local: 40, nome_responsavel_tecnico: 'Tecnico', status: 'RASCUNHO', ...d }, u)],
  ['atualizar', (u, d = {}) => repo.atualizarNoAmbiente(50, { crea: 'Novo', ...d }, u)],
  ['excluir', u => repo.excluirNoAmbiente(50, u)],
];
for (const [nome, executar] of escritas) {
  for (const ambiente of [A, B]) for (const engenheiro of [false, true]) test(`${nome}: autorização, locks e COMMIT ${ambiente} engenheiro=${engenheiro}`, async t => {
    const { estado, u } = preparar(t, ambiente, engenheiro, nome === 'criar'); const resultado = await executar(u); assert.ok(resultado);
    if (nome === 'criar') assert.equal(resultado.id_usuario_responsavel, u.id_usuario); if (nome === 'excluir') assert.equal(estado.registro, null);
    assert.equal(estado.consultas[0].sql, 'BEGIN ISOLATION LEVEL READ COMMITTED'); assert.equal(estado.consultas.at(-1).sql, 'COMMIT'); assert.equal(estado.escritas.length, 1); assert.deepEqual(estado.liberacoes, [undefined]);
  });
  for (const [alias, condicao] of [['a', 'ambiente'], ['u', 'usuario'], ['c', 'perfil'], ['c', 'capacidade'], ['l', 'campanha'], ...nome === 'criar' ? [] : [['r', 'local']]]) test(`${nome}: revogação/troca ${condicao} recusa antes da escrita`, async t => {
    const { estado, u } = preparar(t, A, condicao === 'capacidade', nome === 'criar');
    estado.hook = { alias, executar(s) { if (condicao === 'ambiente') s.ambienteAtivo = false; if (condicao === 'usuario') s.ativo = false; if (condicao === 'perfil') s.perfil = 'VISUALIZADOR'; if (condicao === 'capacidade') s.perfil = 'VISUALIZADOR'; if (condicao === 'campanha') s.local.id_campanha = 20; if (condicao === 'local') s.registro.id_local = 90; } };
    assert.equal(await executar(u), null); assert.deepEqual(estado.escritas, []); assert.equal(estado.consultas.at(-1).sql, 'ROLLBACK'); assert.deepEqual(estado.liberacoes, [undefined]);
  });
  for (const prefixo of ['BEGIN', 'SELECT', nome === 'criar' ? 'INSERT' : nome === 'excluir' ? 'DELETE' : 'UPDATE', 'COMMIT']) test(`${nome}: erro técnico em ${prefixo} não vira autorização`, async t => {
    const { estado, u } = preparar(t, A, false, nome === 'criar'); const original = estado.registro && { ...estado.registro }; const erro = new Error('Técnico simulado'); estado.falha = { prefixo, erro };
    await assert.rejects(executar(u), recebido => recebido === erro); assert.equal(estado.liberacoes.length, 1);
    if (prefixo !== 'BEGIN') assert.equal(estado.consultas.at(-1).sql, 'ROLLBACK'); assert.deepEqual(estado.registro, original);
  });
  test(`${nome}: rollback falho descarta conexão preservando erro`, async t => {
    const { estado, u } = preparar(t, A, false, nome === 'criar'); const erro = new Error('Persistência falhou');
    estado.falha = { prefixo: nome === 'criar' ? 'INSERT' : nome === 'excluir' ? 'DELETE' : 'UPDATE', erro }; estado.rollbackFalha = true;
    await assert.rejects(executar(u), recebido => recebido === erro); assert.equal(estado.liberacoes.length, 1); assert.ok(estado.liberacoes[0] instanceof Error); assert.equal(estado.consultas.some(q => q.sql === 'COMMIT'), false);
  });
  test(`${nome}: escrita vazia após bloqueios é falha interna`, async t => {
    const { estado, u } = preparar(t, A, false, nome === 'criar'); estado.vazio = true;
    await assert.rejects(executar(u), { statusCode: 500 }); assert.equal(estado.consultas.at(-1).sql, 'ROLLBACK'); assert.equal(estado.liberacoes.length, 1);
  });
}
for (const tipo of ['listar', 'id', 'local', 'localAutorizado']) for (const ambiente of [A, B]) for (const condicao of ['autorizado', 'externo', 'naoResponsavel', 'inativo', 'ambienteInativo']) test(`Leitura ${tipo} ${ambiente} ${condicao}`, async t => {
  const { estado, u } = preparar(t, ambiente, true);
  if (condicao === 'externo') estado.ambiente = ambiente === A ? B : A; if (condicao === 'naoResponsavel') estado.responsavel = 999; if (condicao === 'inativo') estado.ativo = false; if (condicao === 'ambienteInativo') estado.ambienteAtivo = false;
  const resultado = await ({ listar: () => repo.listarPermitidosNoAmbiente(u), id: () => repo.buscarPorIdNoAmbiente(50, u), local: () => repo.buscarPorLocalNoAmbiente(40, u), localAutorizado: () => repo.buscarLocalAutorizadoNoAmbiente(40, u) })[tipo]();
  if (!['autorizado','naoResponsavel'].includes(condicao)) assert.deepEqual(resultado, tipo === 'listar' ? [] : null); else if (tipo === 'listar') assert.equal(resultado.length, 1); else assert.equal(resultado.id_local, 40);
  assert.equal(estado.liberacoes.length, 0);
});
test('PUT preserva ART concorrente omitida e campos gerenciados, com limpeza por null', async t => {
  const { estado, u } = preparar(t); estado.hook = { alias: 'r', executar(s) { s.registro.numero_art = 'ART_CONCORRENTE'; } };
  const r = await repo.atualizarNoAmbiente(50, { crea: null, id_local: 90, id_usuario_responsavel: 999, caminho_pdf: 'externo.pdf' }, u);
  assert.equal(r.numero_art, 'ART_CONCORRENTE'); assert.equal(r.crea, null); assert.equal(r.id_local, 40); assert.equal(r.id_usuario_responsavel, 99); assert.equal(r.caminho_pdf, 'uploads/relatorios/legado.pdf');
});
test('Criador de outro ambiente não expõe nome nem invalida histórico autorizado', async t => {
  const { estado, u } = preparar(t); estado.criadorAmbiente = B;
  const r = await repo.buscarPorIdNoAmbiente(50, u); assert.equal(r.id_relatorio, 50); assert.equal(r.usuario_responsavel, null);
});
for (const constraint of ['relatorio_id_local_key', 'relatorio_pkey', 'outra_constraint']) test('Duplicidade distingue constraint ' + constraint, async t => {
  const { estado, u } = preparar(t, A, false, true); const erro = Object.assign(new Error('SQL_DETALHE_SENSIVEL'), { code: '23505', constraint }); estado.falha = { prefixo: 'INSERT', erro };
  await assert.rejects(repo.criarNoAmbiente({ id_local: 40 }, u), recebido => constraint === 'relatorio_id_local_key' ? recebido.statusCode === 409 && recebido.message === 'Este local já possui um relatório cadastrado.' : recebido === erro);
  assert.equal(estado.consultas.at(-1).sql, 'ROLLBACK'); assert.equal(estado.liberacoes.length, 1);
});
test('Reenvio de criação autorizada continua conflito 409 por local', async t => {
  const { estado, u } = preparar(t, A, false, true); await repo.criarNoAmbiente({ id_local: 40 }, u);
  await assert.rejects(repo.criarNoAmbiente({ id_local: 40 }, u), { statusCode: 409 }); assert.equal(estado.registro.id_relatorio, 99); assert.equal(estado.consultas.at(-1).sql, 'ROLLBACK');
});
test('Falha ao adquirir cliente não executa SQL ou release fictício', async t => {
  const { estado, u } = preparar(t); const erro = new Error('Pool indisponível'); t.mock.method(pool, 'connect', async () => { throw erro; });
  await assert.rejects(repo.excluirNoAmbiente(50, u), recebido => recebido === erro); assert.deepEqual(estado.consultas, []); assert.deepEqual(estado.liberacoes, []);
});
for (const tipo of ['gerar', 'baixar']) for (const condicao of ['autorizado', 'revogado', 'falhaCallback', 'falhaCommit']) test(tipo + ': autorização protegida durante callback ' + condicao, async t => {
  const { estado, u } = preparar(t); let chamadas = 0;
  if (condicao === 'revogado') estado.hook = { alias: 'r', executar(s) { s.ativo = false; } };
  const erro = new Error('Falha física simulada');
  if (condicao === 'falhaCommit') estado.falha = { prefixo: 'COMMIT', erro };
  const callback = async dados => {
    chamadas++;
    assert.equal(estado.aberta, true);
    assert.equal(estado.consultas.filter(q => /FOR (?:UPDATE|SHARE) OF/.test(q.sql)).length, 5);
    if (condicao === 'falhaCallback') throw erro;
    if (tipo === 'gerar') { assert.equal(dados.criterio_a, 'SIM'); assert.equal(dados.oxigenio, 0); assert.deepEqual(dados.evidencias.map(e => e.id_local), [40]); return { idGeracao: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', idioma: 'en', caminhoRelativo: 'uploads/relatorios/novo.pdf', hash: 'b'.repeat(64) }; }
    return { buffer: Buffer.from('%PDF-1.7 TESTE %%EOF') };
  };
  const executar = () => tipo === 'gerar' ? repo.gerarNoAmbiente(50, u, callback) : repo.comRelatorioAutorizado(50, u, callback);
  if (condicao.startsWith('falha')) await assert.rejects(executar, recebido => recebido === erro);
  else if (condicao === 'revogado') assert.equal(await executar(), null);
  else {
    const resultado = await executar();
    if (tipo === 'gerar') { assert.equal(resultado.relatorio.status, 'GERADO'); assert.equal(resultado.relatorio.numero_art, 'ART'); }
    else assert.ok(Buffer.isBuffer(resultado.buffer));
  }
  assert.equal(chamadas, condicao === 'revogado' ? 0 : 1);
  assert.equal(estado.consultas.at(-1).sql, ['autorizado','naoResponsavel'].includes(condicao) ? 'COMMIT' : 'ROLLBACK');
  assert.equal(estado.liberacoes.length, 1);
});
test('Consulta completa recusa antes de coletar agregados e revalida todos os vínculos', async t => {
  const { estado, u } = preparar(t);
  estado.ativo = false;
  assert.equal(await repo.buscarCompletoNoAmbiente(50, u), null);
  assert.equal(estado.consultas.length, 1);
  estado.ativo = true;
  const completo = await repo.buscarCompletoNoAmbiente(50, u);
  assert.deepEqual(completo.evidencias, [{ id_local: 40 }]);
});
for(const ambiente of [A,B])test('Caracterizacao completa e geracao usam somente o ambiente '+ambiente,async t=>{
  const {u}=preparar(t,ambiente);
  const completo=await repo.buscarCompletoNoAmbiente(50,u);
  for(const campo of camposCaracterizacao)assert.equal(completo[campo],caracterizacao(ambiente)[campo]);
  let chamadas=0;
  await repo.gerarNoAmbiente(50,u,async d=>{
    chamadas++;for(const campo of camposCaracterizacao)assert.equal(d[campo],caracterizacao(ambiente)[campo]);
    assert.equal(d.quantidade_aberturas,0);return {caminhoRelativo:'uploads/relatorios/sintetico.pdf',hash:'b'.repeat(64)};
  });
  assert.equal(chamadas,1);
  u.id_ambiente=ambiente===A?B:A;
  assert.equal(await repo.gerarNoAmbiente(50,u,async()=>{throw Error('Nao deve renderizar outro ambiente');}),null);
});

const geracaoFixture = { idGeracao: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', idioma: 'en', caminhoRelativo: 'uploads/relatorios/sintetico.pdf', hash: 'b'.repeat(64) };
test('migration ausente recusa antes de renderizar/persistir arquivos', async t => {
  const { estado, u } = preparar(t); estado.semMigration = true;
  let renderizou = false;
  await assert.rejects(repo.gerarNoAmbiente(50, u, async () => { renderizou = true }), { statusCode: 503 });
  assert.equal(renderizou, false); assert.deepEqual(estado.geracoes, []);
  assert.equal(estado.consultas.at(-1).sql, 'ROLLBACK');
});
test('histórico e arquivo legado preservados, rollback mantém geração invisível', async t => {
  const { estado, u } = preparar(t), antes = { ...estado.registro };
  const g = await repo.gerarNoAmbiente(50, u, async () => geracaoFixture);
  assert.equal(estado.registro.caminho_pdf, antes.caminho_pdf); assert.equal(estado.registro.hash_pdf, antes.hash_pdf);
  assert.equal(g.geracao.id_solicitante, u.id_usuario); assert.equal(g.geracao.id_ambiente, u.id_ambiente);
  assert.equal(estado.geracoes.length, 1);
  estado.falha = { prefixo: 'COMMIT', erro: Error('Falha simulada') };
  await assert.rejects(repo.gerarNoAmbiente(50, u, async () => ({ ...geracaoFixture, idGeracao: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })));
  assert.equal(estado.geracoes.length, 1);
});
test('consultas de gerações exigem UUID/relatório/ambiente após locks de autorização', async t => {
  const { estado, u } = preparar(t);
  await repo.gerarNoAmbiente(50, u, async () => geracaoFixture);
  let r = await repo.listarGeracoesNoAmbiente(50, u, 'en');
  assert.equal(r.geracoes.length, 1); assert.equal(r.legado.idioma, null);
  r = await repo.listarGeracoesNoAmbiente(50, u, 'pt-BR'); assert.equal(r.geracoes.length, 0);
  assert.equal((await repo.comGeracaoAutorizada(50, u, geracaoFixture.idGeracao, async g => g)).idioma, 'en');
  await assert.rejects(repo.comGeracaoAutorizada(50, u, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', async () => { throw Error('Não deve ler arquivo') }), { statusCode: 404 });
  estado.ativo = false;
  assert.equal(await repo.listarGeracoesNoAmbiente(50, u, 'en'), null);
  assert.equal(await repo.comGeracaoAutorizada(50, u, geracaoFixture.idGeracao, async () => { throw Error('Não deve ler arquivo') }), null);
});
