const { conferir: conferirCapacidadeSql } = require('./helpers/rbacSqlSimulado.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
const repo = require('../src/repositories/dadosTecnicosMultiTenantRepository');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const campos = ['pressao_atmosferica', 'ventilacao', 'oxigenio', 'gas_inflamavel', 'monoxido_carbono', 'sulfeto_hidrogenio', 'temperatura', 'umidade', 'observacoes', 'status'];
function preparar(t, ambiente = A, engenheiro = false, criacao = false) {
  const u = { id_usuario: ambiente === A ? 11 : 21, id_ambiente: ambiente };
  const estado = { ativo: true, ambienteAtivo: true, ambiente, criadorAmbiente: ambiente, perfil: engenheiro ? 'ENGENHEIRO_SEGURANCA' : 'ADMINISTRADOR', responsavel: u.id_usuario,
    campanha: 10, local: { id_local: 40, id_campanha: 10 }, registro: criacao ? null : { id_dados: 50, id_local: 40, id_usuario: 99, pressao_atmosferica: 0, oxigenio: '20.90', temperatura: 0, ventilacao: 'NATURAL', observacoes: 'Historico', status: 'PENDENTE' },
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
  const client = {
    async query(texto, params = []) {
      const sql = texto.replace(/\s+/g, ' ').trim(); estado.consultas.push({ sql, params: [...params] });
      if (estado.falha?.prefixo && sql.startsWith(estado.falha.prefixo)) throw estado.falha.erro;
      if (sql === 'BEGIN ISOLATION LEVEL READ COMMITTED') { assert.equal(estado.aberta, false); estado.aberta = true; estado.trabalho = undefined; return { rows: [] }; }
      if (sql === 'ROLLBACK') { if (estado.rollbackFalha) throw new Error('Rollback falhou'); estado.trabalho = undefined; estado.aberta = false; return { rows: [] }; }
      if (sql === 'COMMIT') { assert.equal(estado.aberta, true); if (estado.trabalho !== undefined) estado.registro = estado.trabalho; estado.aberta = false; return { rows: [] }; }
      const lock = sql.match(/FOR (?:UPDATE|SHARE) OF (a|u|c|l|d)$/);
      if (lock && sql.startsWith('SELECT c.id_campanha, l.id_local FROM ambiente AS a')) {
        assert.equal(estado.aberta, true); contexto(sql, params);
        const criar = !sql.includes('INNER JOIN dados_tecnicos AS d');
        assert.deepEqual(params.slice(0, 3), [criar ? 40 : 50, u.id_ambiente, u.id_usuario]);
        if (params.length === 5) { assert.deepEqual(params.slice(3), [10, 40]); assert.match(sql, /c\.id_campanha = \$4 AND l\.id_local = \$5/); }
        if (estado.hook?.alias === lock[1]) estado.hook.executar(estado);
        const vinculo = estado.local.id_campanha === estado.campanha && (criar || estado.registro?.id_local === estado.local.id_local);
        const pais = params.length === 3 || params[3] === estado.campanha && params[4] === estado.local.id_local;
        return { rows: permitido() && vinculo && pais ? [{ id_campanha: estado.campanha, id_local: estado.local.id_local }] : [] };
      }
      if (/^(INSERT INTO dados_tecnicos AS d|UPDATE dados_tecnicos AS d|DELETE FROM dados_tecnicos AS d)\b/.test(sql)) {
        estado.escritas.push({ sql, params }); // Registra a tentativa mesmo se uma asserção falhar.
        assert.equal(estado.aberta, true); contexto(sql, params);
        const criar = sql.startsWith('INSERT');
        const inicio = estado.consultas.findLastIndex(q => q.sql === 'BEGIN ISOLATION LEVEL READ COMMITTED');
        const locks = estado.consultas.slice(inicio).map(q => q.sql.match(/FOR (?:UPDATE|SHARE) OF (a|u|c|l|d)$/)?.[1]).filter(Boolean);
        assert.deepEqual(locks, criar ? ['a', 'u', 'c', 'l'] : ['a', 'u', 'c', 'l', 'd']);
        assert.equal(permitido(), true, 'Nunca tentar escrita depois de recusar autorização');
        if (estado.vazio) return { rows: [] };
        if (criar) {
          assert.match(sql, /SELECT l\.id_local, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11, \$12, \$13, \$3 FROM local AS l/);
          assert.equal(params.length, 13);
          if (estado.registro?.id_local === 40) throw Object.assign(new Error('Duplicidade simulada'), { code: '23505', constraint: 'dados_tecnicos_id_local_key' });
          estado.trabalho = { id_dados: 99, id_local: 40, id_usuario: params[2], ...Object.fromEntries(campos.map((c,i) => [c, params[i+3]])) };
          return { rows: [{ ...estado.trabalho }] };
        }
        assert.match(sql, /l\.id_local = d\.id_local/); assert.match(sql, /c\.id_campanha = l\.id_campanha/);
        if (sql.startsWith('DELETE')) {
          assert.match(sql, /USING local AS l, campanha AS c/); assert.match(sql, /RETURNING d\.\*/); assert.deepEqual(params, [50, u.id_ambiente, u.id_usuario]);
          estado.trabalho = null; return { rows: [{ ...estado.registro }] };
        }
        assert.equal(params.length, 13);
        const set = sql.split(' SET ')[1].split(' FROM ')[0]; assert.doesNotMatch(set, /id_local|id_usuario|id_ambiente/);
        estado.trabalho = { ...estado.registro };
        for (const [i, campo] of campos.entries()) {
          assert.ok(sql.includes(`${campo} = COALESCE($${4+i}, d.${campo})`));
          if (params[i+3] != null) estado.trabalho[campo] = params[i+3];
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
    const local = sql.startsWith('SELECT l.id_local FROM local AS l');
    if (!local && !sql.startsWith('SELECT d.*,')) { estado.inesperadas.push(sql); throw new Error('Leitura desconhecida'); }
    contexto(sql, params); assert.match(sql, /c\.id_campanha = l\.id_campanha/);
    if (local) { assert.deepEqual(params, [40, u.id_ambiente, u.id_usuario]); return { rows: permitido() ? [{ id_local: 40 }] : [] }; }
    assert.match(sql, /l\.id_local = d\.id_local/); assert.match(sql, /LEFT JOIN usuario AS criador/); assert.match(sql, /criador\.id_ambiente = c\.id_ambiente/);
    const autorizacao = sql.slice(sql.indexOf('AND EXISTS')); assert.doesNotMatch(autorizacao, /\b(?:d\.id_usuario|criador\.)/i);
    const porLocal = sql.includes('d.id_local = $1'), individual = porLocal || sql.includes('d.id_dados = $1');
    assert.deepEqual(params, individual ? [porLocal ? 40 : 50, u.id_ambiente, u.id_usuario] : [u.id_ambiente, u.id_usuario]);
    return { rows: permitido() && estado.registro ? [{ ...estado.registro, usuario_responsavel: estado.criadorAmbiente === estado.ambiente ? 'Criador autorizado' : null }] : [] };
  });
  t.after(() => assert.deepEqual(estado.inesperadas, [])); return { estado, u };
}
const escritas = [
  ['criar', (u, d = {}) => repo.criarNoAmbiente({ id_local: 40, pressao_atmosferica: 0, oxigenio: '20.90', ...d }, u)],
  ['atualizar', (u, d = {}) => repo.atualizarNoAmbiente(50, { oxigenio: 0, ...d }, u)],
  ['excluir', u => repo.excluirNoAmbiente(50, u)],
];
for (const [nome, executar] of escritas) {
  for (const ambiente of [A, B]) for (const engenheiro of [false, true]) test(`${nome}: autorização, locks e COMMIT ${ambiente} engenheiro=${engenheiro}`, async t => {
    const { estado, u } = preparar(t, ambiente, engenheiro, nome === 'criar'); const resultado = await executar(u); assert.ok(resultado);
    if (nome === 'criar') assert.equal(resultado.id_usuario, u.id_usuario); if (nome === 'excluir') assert.equal(estado.registro, null);
    assert.equal(estado.consultas[0].sql, 'BEGIN ISOLATION LEVEL READ COMMITTED'); assert.equal(estado.consultas.at(-1).sql, 'COMMIT'); assert.equal(estado.escritas.length, 1); assert.deepEqual(estado.liberacoes, [undefined]);
  });
  for (const [alias, condicao] of [['a', 'ambiente'], ['u', 'usuario'], ['c', 'perfil'], ['c', 'capacidade'], ['l', 'campanha'], ...nome === 'criar' ? [] : [['d', 'local']]]) test(`${nome}: revogação/troca ${condicao} recusa antes da escrita`, async t => {
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
test('PUT não restaura medição concorrente omitida, mantém zero e precisão textual', async t => {
  const { estado, u } = preparar(t); estado.hook = { alias: 'd', executar(s) { s.registro.temperatura = '18.01'; } };
  const r = await repo.atualizarNoAmbiente(50, { oxigenio: 0, gas_inflamavel: '0.000000000000000001', id_local: 90, id_usuario: 999, id_ambiente: B }, u);
  assert.equal(r.temperatura, '18.01'); assert.equal(r.pressao_atmosferica, 0); assert.equal(r.oxigenio, 0); assert.equal(r.gas_inflamavel, '0.000000000000000001'); assert.equal(r.id_local, 40); assert.equal(r.id_usuario, 99);
});
test('Criador de outro ambiente não expõe nome nem invalida histórico autorizado', async t => {
  const { estado, u } = preparar(t); estado.criadorAmbiente = B;
  const r = await repo.buscarPorIdNoAmbiente(50, u); assert.equal(r.id_dados, 50); assert.equal(r.usuario_responsavel, null);
});
for (const constraint of ['dados_tecnicos_id_local_key', 'dados_tecnicos_pkey', 'outra_constraint']) test('Duplicidade distingue constraint ' + constraint, async t => {
  const { estado, u } = preparar(t, A, false, true); const erro = Object.assign(new Error('SQL_DETALHE_SENSIVEL'), { code: '23505', constraint }); estado.falha = { prefixo: 'INSERT', erro };
  await assert.rejects(repo.criarNoAmbiente({ id_local: 40 }, u), recebido => constraint === 'dados_tecnicos_id_local_key' ? recebido.statusCode === 409 && recebido.message === 'Este local já possui dados técnicos cadastrados.' : recebido === erro);
  assert.equal(estado.consultas.at(-1).sql, 'ROLLBACK'); assert.equal(estado.liberacoes.length, 1);
});
test('Reenvio de criação autorizada continua conflito 409 por local', async t => {
  const { estado, u } = preparar(t, A, false, true); await repo.criarNoAmbiente({ id_local: 40 }, u);
  await assert.rejects(repo.criarNoAmbiente({ id_local: 40 }, u), { statusCode: 409 }); assert.equal(estado.registro.id_dados, 99); assert.equal(estado.consultas.at(-1).sql, 'ROLLBACK');
});
test('Falha ao adquirir cliente não executa SQL ou release fictício', async t => {
  const { estado, u } = preparar(t); const erro = new Error('Pool indisponível'); t.mock.method(pool, 'connect', async () => { throw erro; });
  await assert.rejects(repo.excluirNoAmbiente(50, u), recebido => recebido === erro); assert.deepEqual(estado.consultas, []); assert.deepEqual(estado.liberacoes, []);
});
