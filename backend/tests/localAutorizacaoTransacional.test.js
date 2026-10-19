const { conferir: conferirCapacidadeSql } = require('./helpers/rbacSqlSimulado.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
const repo = require('../src/repositories/localMultiTenantRepository');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const opcoes = { bloquearAutorizacao: true };
function preparar(t, ambiente = A, engenheiro = false) {
  const u = { id_usuario: ambiente === A ? 11 : 21, id_ambiente: ambiente };
  const estado = { ativo: true, ambienteAtivo: true, perfil: engenheiro ? 'ENGENHEIRO_SEGURANCA' : 'ADMINISTRADOR', responsavel: u.id_usuario, ambiente, campanha: 10, local: { id_local: 40, id_campanha: 10, nome_local: 'Antigo', setor: 'Preservar', latitude: 0, longitude: 0, status: 'ATIVO' }, consultas: [], escritas: [], liberacoes: [], inesperadas: [], falha: null, revogar: null, vazio: false, rollbackFalha: false, aberta: false, antes: null };
  const permitido = () => estado.ativo && estado.ambienteAtivo && estado.ambiente === u.id_ambiente && ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR'].includes(estado.perfil);
  function verificarContexto(sql, params, leitura = false) {
    assert.match(sql, /c\.id_ambiente\s*=\s*\$[12]|a\.id_ambiente\s*=\s*\$2/);
    assert.match(sql, /u\.id_usuario\s*=\s*\$[23]/);
    assert.match(sql, /u\.ativo\s*=\s*TRUE/); assert.match(sql, /a\.ativo\s*=\s*TRUE/);
    conferirCapacidadeSql(sql, 'u');
    assert.ok(params.includes(u.id_ambiente)); assert.ok(params.includes(u.id_usuario));
    assert.equal(sql.includes(u.id_ambiente), false);
    if (leitura) assert.match(sql, /c\.id_campanha\s*=\s*l\.id_campanha/);
  }
  const client = {
    async query(texto, params = []) {
      const sql = texto.replace(/\s+/g, ' ').trim();
      estado.consultas.push({ sql, params: [...params] });
      if (estado.falha?.sql === sql || estado.falha?.prefixo && sql.startsWith(estado.falha.prefixo)) throw estado.falha.erro;
      if (sql === 'BEGIN ISOLATION LEVEL READ COMMITTED') { assert.equal(estado.aberta, false); estado.aberta = true; estado.antes = { ...estado.local }; return { rows: [] }; }
      if (sql === 'ROLLBACK') { if (estado.rollbackFalha) throw new Error('Rollback simulado falhou'); estado.local = estado.antes; estado.aberta = false; return { rows: [] }; }
      if (sql === 'COMMIT') { assert.equal(estado.aberta, true); estado.aberta = false; return { rows: [] }; }
      const lock = sql.match(/FOR (?:UPDATE|SHARE) OF ([aucl])$/);
      if (lock && sql.startsWith('SELECT c.id_campanha FROM ambiente AS a')) {
        assert.equal(estado.aberta, true); verificarContexto(sql, params);
        assert.deepEqual(params.slice(0, 3), [sql.includes('l.id_local = $1') ? 40 : 10, u.id_ambiente, u.id_usuario]);
        if (params.length === 4) { assert.equal(params[3], 10); assert.match(sql, /c\.id_campanha = \$4/); }
        if (estado.revogar?.alias === lock[1]) estado.revogar.executar(estado);
        const vinculo = !sql.includes('l.id_local = $1') || estado.local?.id_campanha === estado.campanha;
        return { rows: permitido() && vinculo && (!params[3] || params[3] === estado.campanha) ? [{ id_campanha: estado.campanha }] : [] };
      }
      if (/^(INSERT INTO local AS l|UPDATE local AS l)\b/.test(sql)) {
        assert.equal(estado.aberta, true); verificarContexto(sql, params);
        const aliases = estado.consultas.map(q => q.sql.match(/FOR (?:UPDATE|SHARE) OF ([aucl])$/)?.[1]).filter(Boolean);
        assert.deepEqual(aliases, sql.startsWith('INSERT') ? ['a', 'u', 'c'] : ['a', 'u', 'c', 'l']);
        assert.equal(permitido(), true, 'Nunca tentar escrita após recusa');
        estado.escritas.push({ sql, params });
        if (estado.vazio) return { rows: [] };
        if (sql.startsWith('INSERT')) { assert.match(sql, /SELECT \$4, \$5, \$6, \$7, \$8, \$9, \$10, c.id_campanha FROM campanha AS c/); return { rows: [{ id_local: 99, id_campanha: 10, nome_local: params[3] }] }; }
        assert.match(sql, /c\.id_campanha = l\.id_campanha/);
        if (sql.includes('CASE WHEN')) {
          for (const [i, campo] of ['nome_local', 'setor', 'descricao', 'endereco', 'latitude', 'longitude'].entries()) {
            assert.ok(sql.includes(`${campo} = CASE WHEN $${10 + i}::boolean THEN $${4 + i} ELSE l.${campo} END`));
            if (params[9 + i]) estado.local[campo] = params[3 + i];
          }
          assert.equal(params.length, 15);
        } else { assert.match(sql, /SET status = \$4,/); estado.local.status = params[3]; }
        return { rows: [{ ...estado.local }] };
      }
      estado.inesperadas.push(sql); throw new Error('SQL transacional desconhecido: ' + sql);
    },
    release(erro) { estado.liberacoes.push(erro); },
  };
  t.mock.method(pool, 'connect', async () => client);
  t.mock.method(pool, 'query', async (texto, params) => {
    const sql = texto.replace(/\s+/g, ' ').trim();
    estado.consultas.push({ sql, params });
    if (!sql.startsWith('SELECT l.id_local,') || !sql.includes('INNER JOIN campanha AS c')) { estado.inesperadas.push(sql); throw new Error('Consulta fora da leitura contextual'); }
    verificarContexto(sql, params, true);
    const individual = sql.includes('l.id_local = $1');
    assert.deepEqual(params, individual ? [40, u.id_ambiente, u.id_usuario] : [u.id_ambiente, u.id_usuario]);
    return { rows: permitido() ? [{ ...estado.local }] : [] };
  });
  t.after(() => assert.deepEqual(estado.inesperadas, []));
  return { estado, u };
}
const escritas = [
  ['criar', (u, d = {}) => repo.criarNoAmbiente({ nomeLocal: 'Novo', idCampanha: 10, latitude: 0, longitude: 0, ...d }, u, opcoes)],
  ['atualizar', (u, d = {}) => repo.atualizarNoAmbiente(40, { nomeLocal: 'Novo', ...d }, u, opcoes)],
  ['status', u => repo.atualizarStatusNoAmbiente(40, 'INATIVO', u, opcoes)],
];
for (const [nome, executar] of escritas) {
  for (const ambiente of [A, B]) for (const engenheiro of [false, true]) test(`${nome}: locks e COMMIT ${ambiente} engenheiro=${engenheiro}`, async t => {
    const { estado, u } = preparar(t, ambiente, engenheiro);
    const resultado = await executar(u); assert.ok(resultado);
    assert.equal(estado.consultas[0].sql, 'BEGIN ISOLATION LEVEL READ COMMITTED');
    assert.equal(estado.consultas.at(-1).sql, 'COMMIT'); assert.equal(estado.escritas.length, 1); assert.deepEqual(estado.liberacoes, [undefined]);
  });
  for (const [alias, condicao] of [['a', 'ambiente'], ['u', 'usuario'], ['c', 'perfil'], ['c', 'capacidade'], ...nome === 'criar' ? [] : [['l', 'vinculo']]]) test(`${nome}: revogação ${condicao} antes do lock recusa sem escrita`, async t => {
    const { estado, u } = preparar(t, A, condicao === 'capacidade');
    estado.revogar = { alias, executar(s) { if (condicao === 'ambiente') s.ambienteAtivo = false; if (condicao === 'usuario') s.ativo = false; if (condicao === 'perfil') s.perfil = 'VISUALIZADOR'; if (condicao === 'capacidade') s.perfil = 'VISUALIZADOR'; if (condicao === 'vinculo') s.local.id_campanha = 20; } };
    assert.equal(await executar(u), null); assert.deepEqual(estado.escritas, []); assert.equal(estado.consultas.at(-1).sql, 'ROLLBACK'); assert.deepEqual(estado.liberacoes, [undefined]);
  });
  for (const prefixo of ['BEGIN', 'SELECT', nome === 'criar' ? 'INSERT' : 'UPDATE', 'COMMIT']) test(`${nome}: falha ${prefixo} preserva erro e libera`, async t => {
    const { estado, u } = preparar(t);
    const erro = new Error('Técnico simulado'); estado.falha = { prefixo, erro };
    await assert.rejects(executar(u), recebido => recebido === erro);
    assert.equal(estado.liberacoes.length, 1);
    if (prefixo !== 'BEGIN') assert.equal(estado.consultas.at(-1).sql, 'ROLLBACK');
  });
  test(`${nome}: rollback falho descarta conexão sem esconder erro`, async t => {
    const { estado, u } = preparar(t); const erro = new Error('Persistência falhou');
    estado.falha = { prefixo: nome === 'criar' ? 'INSERT' : 'UPDATE', erro }; estado.rollbackFalha = true;
    await assert.rejects(executar(u), recebido => recebido === erro); assert.equal(estado.liberacoes.length, 1); assert.ok(estado.liberacoes[0] instanceof Error); assert.equal(estado.consultas.some(q => q.sql === 'COMMIT'), false);
  });
  test(`${nome}: escrita inesperadamente vazia é falha interna`, async t => {
    const { estado, u } = preparar(t); estado.vazio = true;
    await assert.rejects(executar(u), { statusCode: 500 }); assert.equal(estado.consultas.at(-1).sql, 'ROLLBACK'); assert.equal(estado.liberacoes.length, 1);
  });
}
for (const individual of [false, true]) for (const ambiente of [A, B]) for (const condicao of ['autorizado', 'externo', 'naoResponsavel', 'inativo', 'ambienteInativo']) test(`Leitura SQL individual=${individual} ${ambiente} ${condicao}`, async t => {
  const { estado, u } = preparar(t, ambiente, true);
  if (condicao === 'externo') estado.ambiente = ambiente === A ? B : A;
  if (condicao === 'naoResponsavel') estado.responsavel = 999;
  if (condicao === 'inativo') estado.ativo = false;
  if (condicao === 'ambienteInativo') estado.ambienteAtivo = false;
  const resultado = individual ? await repo.buscarPermitidoPorIdNoAmbiente(40, u) : await repo.listarPermitidosNoAmbiente(u);
  if (['autorizado','naoResponsavel'].includes(condicao)) assert.deepEqual(resultado, individual ? estado.local : [estado.local]); else assert.deepEqual(resultado, individual ? null : []);
  assert.equal(estado.liberacoes.length, 0);
});
test('UPDATE usa flags do pedido, preserva omitidos e limpa null explícito', async t => {
  const { estado, u } = preparar(t);
  const resultado = await repo.atualizarNoAmbiente(40, { nomeLocal: 'Atualizado', setor: null, longitude: 0, idCampanha: 20, id_usuario: 999, id_ambiente: B }, u, opcoes);
  assert.equal(resultado.setor, null); assert.equal(resultado.latitude, 0); assert.equal(resultado.longitude, 0); assert.equal(resultado.id_campanha, 10);
  assert.deepEqual(estado.escritas[0].params.slice(9), [true, true, false, false, false, true]);
  const set = estado.escritas[0].sql.split(' SET ')[1].split(' FROM ')[0]; assert.doesNotMatch(set, /id_campanha|id_usuario|id_ambiente/);
});
test('Falha de aquisição de conexão não executa SQL nem release fictício', async t => {
  const { estado, u } = preparar(t); const erro = new Error('Pool indisponível');
  t.mock.method(pool, 'connect', async () => { throw erro; });
  await assert.rejects(repo.atualizarStatusNoAmbiente(40, 'ATIVO', u, opcoes), recebido => recebido === erro); assert.deepEqual(estado.consultas, []); assert.deepEqual(estado.liberacoes, []);
});
test('Alteração concorrente de coordenada omitida não é restaurada pelo SET', async t => {
  const { estado, u } = preparar(t);
  estado.revogar = { alias: 'l', executar(s) { s.local.latitude = 77; } };
  const resultado = await repo.atualizarNoAmbiente(40, { nomeLocal: 'Novo' }, u, opcoes);
  assert.equal(resultado.latitude, 77);
  assert.equal(estado.escritas[0].params[13], false);
  assert.equal(estado.consultas.at(-1).sql, 'COMMIT');
});
for (const exportador of [repo, require('../src/repositories/localRepository')]) {
  test('Exportação SQL exige identidade, atividade e responsabilidade: ' + (exportador === repo ? 'multi-tenant' : 'montada'), async t => {
    const chamadas = [];
    t.mock.method(pool, 'connect', async () => { throw new Error('Conexão proibida'); });
    t.mock.method(pool, 'query', async (sql, params) => { chamadas.push({ sql, params }); return { rows: [] }; });
    await assert.rejects(exportador.listarParaExportacaoPorAmbiente(A), { statusCode: 401 });
    await assert.rejects(exportador.listarParaExportacaoPorAmbiente(A, { id_usuario: 11, id_ambiente: B }), { statusCode: 401 });
    assert.deepEqual(chamadas, []);
    assert.deepEqual(await exportador.listarParaExportacaoPorAmbiente(A, { id_usuario: 11, id_ambiente: A }), []);
    assert.equal(chamadas.length, 1);
    assert.deepEqual(chamadas[0].params, [A, 11]);
    assert.match(chamadas[0].sql, /c\.id_ambiente = \$1/);
    assert.match(chamadas[0].sql, /u\.id_usuario = \$2/);
    assert.match(chamadas[0].sql, /u\.ativo = TRUE/);
    assert.match(chamadas[0].sql, /a\.ativo = TRUE/);
    assert.deepEqual(conferirCapacidadeSql(chamadas[0].sql,'u'), ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR','SUPERVISOR','AUDITOR']);
    assert.match(chamadas[0].sql, /LEFT JOIN evidencia/);
  });
}
