const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { CAMPOS_NR33, MARCADOR } = require('../src/utils/adaptadorCamposNr33');
const { CONDICOES_ESPECIFICAS, DEPENDENTES } = require('../src/utils/regrasCaracterizacaoNr33');
const { CAMPOS: CAMPOS025 } = require('../src/utils/caracterizacaoChecklist');
const { conferir: conferirCapacidadeSql } = require('./helpers/rbacSqlSimulado.cjs');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const respostas = { criterio_a: 'SIM', criterio_b: 'NAO', criterio_c: 'SIM', acesso_controlado: 'SIM',
  ventilacao_adequada: 'NAO', monitoramento_atmosferico: 'SIM', procedimento_emergencia: 'NAO' };
const nulos = Object.fromEntries(CAMPOS_NR33.map(c => [c, null]));
const novos = { atmosfera_oxigenio: false, atmosfera_contaminantes: true, atmosfera_explosiva: false,
  possui_placa_identificacao: false, nao_destinado_ocupacao_humana: 'SIM', meios_limitados_entrada_saida: 'NAO',
  utilizado_armazenagem: 'SIM', potencial_engolfamento: 'NAO', potencial_afogamento: 'SIM', [MARCADOR]: true };

function preparar({ schema026 = true, salvo = {} } = {}) {
  const usuario = { id_usuario: 11, id_ambiente: A };
  const estado = { schema026, ambiente: A, usuarioAtivo: true, ambienteAtivo: true, localExiste: true,
    perfil: 'ENGENHEIRO_SEGURANCA', existe: true, consultas: [], escritas: [], globais: [], locks: [],
    releases: [], aberta: false, conexoes: 0, hook: null, falhaEscrita: null,
    row: { id_checklist: 50, id_local: 40, id_usuario: 99, ...respostas, status: 'CONCLUIDO',
      observacoes: 'Historico', ...Object.fromEntries(CAMPOS025.map(c => [c, null])),
      ...(schema026 ? nulos : {}), ...salvo } };
  const permitido = () => estado.ambiente === usuario.id_ambiente && estado.usuarioAtivo && estado.ambienteAtivo &&
    estado.localExiste && ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR'].includes(estado.perfil);
  function conferir(sql, params) {
    assert.match(sql, /(?:a|c)\.id_ambiente = \$2/); assert.match(sql, /u\.id_usuario = \$3/);
    assert.match(sql, /u\.ativo = TRUE/); assert.match(sql, /a\.ativo = TRUE/);
    assert.match(sql, /u\.id_ambiente = (?:a|c)\.id_ambiente/);
    assert.match(sql, /l\.id_local = ch\.id_local|ch\.id_local = l\.id_local|l\.id_local = \$1/);
    assert.match(sql, /c\.id_campanha = l\.id_campanha|l\.id_campanha = c\.id_campanha/); conferirCapacidadeSql(sql, 'u');
    assert.equal(params[1], usuario.id_ambiente); assert.equal(params[2], usuario.id_usuario);
    assert.ok(!sql.includes(usuario.id_ambiente));
  }
  async function executar(texto, params = [], transacional = true) {
    const sql = texto.replace(/\s+/g, ' ').trim(); estado.consultas.push({ sql, params: structuredClone(params) });
    if (sql === 'BEGIN ISOLATION LEVEL READ COMMITTED') { assert.equal(estado.aberta, false); estado.aberta = true; estado.antes = structuredClone(estado.row); return { rows: [] }; }
    if (sql === 'ROLLBACK') { estado.row = structuredClone(estado.antes); estado.aberta = false; return { rows: [] }; }
    if (sql === 'COMMIT') { assert.equal(estado.aberta, true); estado.aberta = false; return { rows: [] }; }
    if (transacional) assert.equal(estado.aberta, true);
    conferir(sql, params);
    const lock = /FOR (SHARE|UPDATE) OF (a|u|c|l|ch)$/.exec(sql);
    if (lock) {
      estado.locks.push(lock[2]); assert.equal(lock[1], ['a','u'].includes(lock[2]) ? 'SHARE' : 'UPDATE');
      if (params.length === 5) assert.deepEqual(params.slice(3), [10, 40]);
      if (estado.hook) estado.hook(lock[2], estado);
      const criar = !sql.includes('INNER JOIN checklist_nr33 AS ch');
      return { rows: permitido() && (criar || estado.existe) ? [{ id_campanha: 10, id_local: 40 }] : [] };
    }
    if (sql.startsWith('SELECT ch.* FROM checklist_nr33 AS ch')) {
      assert.deepEqual(estado.locks, ['a','u','c','l','ch']);
      assert.deepEqual(params, [50, A, 11, 10, 40]);
      assert.match(sql, /c\.id_campanha = \$4 AND l\.id_local = \$5/);
      return { rows: permitido() && estado.existe ? [estado.row] : [] };
    }
    assert.match(sql, /^(INSERT INTO|UPDATE) checklist_nr33 AS ch/);
    if (!permitido()) return { rows: [] };
    const criar = sql.startsWith('INSERT');
    if (transacional) assert.deepEqual(estado.locks, criar ? ['a','u','c','l'] : ['a','u','c','l','ch']);
    const lista = criar ? /INSERT INTO checklist_nr33 AS ch \((.*?)\) SELECT/.exec(sql)[1].split(',').map(c => c.trim()) : [];
    const atribuicoes = [...sql.matchAll(/\b(\w+) = \$(\d+)(?=,|\s)/g)].filter(([, c]) => CAMPOS_NR33.includes(c));
    const camposNovos = criar ? lista.filter(c => CAMPOS_NR33.includes(c)) : atribuicoes.map(([, c]) => c);
    if (camposNovos.length && !schema026) throw Object.assign(new Error('Coluna ausente no mock pre-026'), { code: '42703' });
    if (estado.falhaEscrita) throw estado.falhaEscrita;
    estado.escritas.push({ sql, params: structuredClone(params) });
    if (criar) {
      assert.equal(params.length, 20 + camposNovos.length);
      estado.row = { id_checklist: 60, id_local: params[0], id_usuario: params[2],
        ...Object.fromEntries(Object.keys(respostas).map((c, i) => [c, params[3 + i]])),
        observacoes: params[10] || null, status: params[11],
        ...Object.fromEntries(CAMPOS025.map((c, i) => [c, params[12 + i]])), ...(schema026 ? nulos : {}) };
      for (const [i, campo] of camposNovos.entries()) {
        assert.equal(lista[19 + i], campo); assert.ok(sql.includes('$' + (21 + i)));
        estado.row[campo] = params[20 + i];
      }
    } else if (sql.includes('criterio_a = COALESCE')) {
      assert.equal(params.length, 27 + camposNovos.length);
      for (const [i, c] of Object.keys(respostas).entries()) if (params[3 + i] != null) estado.row[c] = params[3 + i];
      if (params[10] != null) estado.row.observacoes = params[10] || null;
      for (const [i, c] of CAMPOS025.entries()) if (params[11 + i * 2]) estado.row[c] = params[12 + i * 2];
      for (const [, c, indice] of atribuicoes) estado.row[c] = params[Number(indice) - 1];
    } else { assert.equal(params.length, 4); estado.row.status = params[3]; }
    return { rows: [structuredClone(estado.row)] };
  }
  const client = { query: (sql, params) => executar(sql, params), release: erro => estado.releases.push(erro) };
  const pool = { async connect() { estado.conexoes++; return client; },
    async query(sql, params) { estado.globais.push(sql); return executar(sql, params, false); } };
  const bancoPath = require.resolve('../src/config/database'), repoPath = require.resolve('../src/repositories/checklistMultiTenantRepository');
  const bancoAntes = require.cache[bancoPath], repoAntes = require.cache[repoPath];
  const fake = new Module(bancoPath); fake.filename = bancoPath; fake.loaded = true; fake.exports = pool;
  require.cache[bancoPath] = fake; delete require.cache[repoPath];
  let repo;
  try { repo = require(repoPath); }
  finally {
    if (bancoAntes) require.cache[bancoPath] = bancoAntes; else delete require.cache[bancoPath];
    if (repoAntes) require.cache[repoPath] = repoAntes; else delete require.cache[repoPath];
  }
  return { repo, estado, usuario };
}
const atualiza = (ctx, patch, opcoes) => ctx.repo.atualizarNoAmbiente(50, patch, ctx.usuario, opcoes);
const cria = (ctx, patch, opcoes) => ctx.repo.criarNoAmbiente({ id_local: 40, ...respostas, ...patch }, ctx.usuario, opcoes);
const terminou = ctx => { assert.equal(ctx.estado.aberta, false); assert.deepEqual(ctx.estado.releases, [undefined]); assert.equal(ctx.estado.globais.length, 0); };

test('criacao grava os dez campos na ordem permitida e preserva autoria autenticada', async () => {
  const ctx = preparar(); const r = await cria(ctx, { ...novos, id_usuario: 999, id_ambiente: B, avaliacao_nr33: 'forjado' });
  for (const c of CAMPOS_NR33) assert.equal(r[c], novos[c]);
  assert.equal(r.id_local, 40); assert.equal(r.id_usuario, 11);
  assert.deepEqual(ctx.estado.escritas[0].params.slice(20), CAMPOS_NR33.map(c => novos[c]));
  assert.ok(!ctx.estado.escritas[0].sql.includes('avaliacao_nr33')); terminou(ctx);
});

test('criacao com dez NULLs explicitos mantem avaliacao nao iniciada', async () => {
  const ctx = preparar(); const r = await cria(ctx, nulos);
  for (const c of CAMPOS_NR33) assert.equal(r[c], null);
  assert.deepEqual(ctx.estado.escritas[0].params.slice(20), Array(10).fill(null)); terminou(ctx);
});

test('edicao antiga de observacoes preserva todas as respostas 026 ja salvas', async () => {
  const ctx = preparar({ salvo: novos });
  const r = await atualiza(ctx, { observacoes: 'Edicao antiga' }, { bloquearAutorizacao: true });
  for (const c of CAMPOS_NR33) assert.equal(r[c], novos[c]);
  assert.equal(ctx.estado.escritas[0].params.length, 27);
  assert.equal(ctx.estado.consultas.some(q => q.sql.startsWith('SELECT ch.*')), false); terminou(ctx);
});

test('atualizacao grava os dez campos sem COALESCE e mantem status e IDs', async () => {
  const ctx = preparar(); const r = await atualiza(ctx, { ...novos, status: 'PENDENTE', id_local: 90, id_usuario: 90 });
  for (const c of CAMPOS_NR33) {
    assert.equal(r[c], novos[c]); assert.ok(!ctx.estado.escritas[0].sql.includes(c + ' = COALESCE'));
  }
  assert.equal(r.status, 'CONCLUIDO'); assert.equal(r.id_local, 40); assert.equal(r.id_usuario, 99);
  assert.deepEqual(ctx.estado.escritas[0].params.slice(27), CAMPOS_NR33.map(c => novos[c])); terminou(ctx);
});

for (const campo of DEPENDENTES) for (const valor of [true, false, null]) test(`booleano ${campo}=${valor} e omitidos preservados`, async () => {
  const ctx = preparar({ salvo: novos }); const r = await atualiza(ctx, { [campo]: valor });
  for (const c of CAMPOS_NR33) assert.equal(r[c], c === campo ? valor : novos[c]);
  assert.equal(ctx.estado.escritas[0].params.length, 28); assert.equal(ctx.estado.escritas[0].params[27], valor); terminou(ctx);
});

for (const campo of CONDICOES_ESPECIFICAS) for (const valor of ['SIM','NAO',null]) test(`condicao ${campo}=${valor} com marcador persistido`, async () => {
  const ctx = preparar({ salvo: novos }); const r = await atualiza(ctx, { [campo]: valor });
  assert.equal(r[campo], valor); assert.equal(r[MARCADOR], true);
  for (const c of CAMPOS_NR33.filter(c => c !== campo)) assert.equal(r[c], novos[c]); terminou(ctx);
});

test('marcador true aceita condicoes nulas; limpeza conjunta explicita e atomica', async () => {
  const vazio = preparar(); const r = await atualiza(vazio, { [MARCADOR]: true });
  assert.equal(r[MARCADOR], true); for (const c of CONDICOES_ESPECIFICAS) assert.equal(r[c], null); terminou(vazio);
  const ctx = preparar({ salvo: novos }); const limpos = Object.fromEntries([...CONDICOES_ESPECIFICAS, MARCADOR].map(c => [c, null]));
  const limpo = await atualiza(ctx, limpos);
  for (const c of Object.keys(limpos)) assert.equal(limpo[c], null);
  for (const c of DEPENDENTES) assert.equal(limpo[c], novos[c]); assert.equal(ctx.estado.escritas.length, 1); terminou(ctx);
});

test('limpeza isolada do marcador ou condicao sem marcador rejeita antes de qualquer escrita', async () => {
  for (const [salvo, patch] of [[novos, { [MARCADOR]: null }], [{}, { potencial_afogamento: 'SIM' }]]) {
    const ctx = preparar({ salvo }); const antes = structuredClone(ctx.estado.row);
    await assert.rejects(atualiza(ctx, { observacoes: 'Nao gravar', ...patch }), TypeError);
    assert.deepEqual(ctx.estado.row, antes); assert.equal(ctx.estado.escritas.length, 0);
    assert.equal(ctx.estado.consultas.at(-1).sql, 'ROLLBACK'); terminou(ctx);
  }
});

test('criacao com marcador ausente/nulo e condicoes preenchidas e recusada', async () => {
  for (const marcador of [undefined, null]) {
    const ctx = preparar(); await assert.rejects(cria(ctx, { potencial_afogamento: 'NAO', [MARCADOR]: marcador }), TypeError);
    assert.equal(ctx.estado.escritas.length, 0); assert.equal(ctx.estado.conexoes, 0);
  }
});

for (const campo of CAMPOS_NR33) test(`dominios do adaptador reutilizados sem coercao: ${campo}`, async () => {
  const invalidos = campo === MARCADOR ? [false, 'true', 1] : CONDICOES_ESPECIFICAS.includes(campo) ? [true, false, 'sim', 1, ''] : ['false', 'true', 0, 1, 'SIM'];
  for (const valor of invalidos) {
    const ctx = preparar(); await assert.rejects(cria(ctx, { ...novos, [campo]: valor }), TypeError);
    await assert.rejects(atualiza(ctx, { [campo]: valor }), TypeError);
    assert.equal(ctx.estado.escritas.length, 0); assert.equal(ctx.estado.conexoes, 0);
  }
});

test('callback introduz dez campos sem proposta inicial; SQL usa somente dados aprovados', async () => {
  for (const executar of [cria, atualiza]) {
    const ctx = preparar(); const r = await executar(ctx, { observacoes: 'Original' }, {
      validarEstado: ({ dadosPropostos }) => ({ ...dadosPropostos, observacoes: 'Aprovado', ...novos }),
    });
    for (const c of CAMPOS_NR33) assert.equal(r[c], novos[c]); assert.equal(r.observacoes, 'Aprovado'); terminou(ctx);
  }
});

test('callback pode remover campos da proposta e nao persiste os descartados', async () => {
  const ctx = preparar({ salvo: novos });
  const r = await atualiza(ctx, { atmosfera_oxigenio: true, observacoes: 'Original' }, { validarEstado: () => ({ observacoes: 'Somente isso' }) });
  assert.equal(r.atmosfera_oxigenio, false);
  assert.equal(ctx.estado.escritas[0].params.length, 27);
  for (const c of CAMPOS_NR33) assert.ok(!ctx.estado.escritas[0].sql.includes(c)); terminou(ctx);
});

test('retorno do callback passa por validacao de dominio e coerencia estrutural', async () => {
  for (const aprovado of [{ [MARCADOR]: false }, { atmosfera_explosiva: 'true' }, { [MARCADOR]: null, potencial_afogamento: 'SIM' }]) {
    const ctx = preparar();
    await assert.rejects(atualiza(ctx, { observacoes: 'Nao gravar' }, { validarEstado: () => aprovado }), TypeError);
    assert.equal(ctx.estado.escritas.length, 0); assert.equal(ctx.estado.consultas.at(-1).sql, 'ROLLBACK'); terminou(ctx);
  }
  const ctx = preparar();
  await assert.rejects(cria(ctx, {}, { validarEstado: ({ dadosPropostos }) => ({ ...dadosPropostos, potencial_afogamento: 'NAO' }) }), TypeError);
  assert.equal(ctx.estado.escritas.length, 0); terminou(ctx);
});

test('novos campos nao ampliam permissao do callback para IDs, autoria, status ou classificacao', async () => {
  for (const campo of ['id_ambiente','id_campanha','id_local','id_checklist','id_usuario','status','avaliacao_nr33','coluna_injetada']) {
    const ctx = preparar();
    await assert.rejects(atualiza(ctx, novos, { validarEstado: ({ dadosPropostos }) => ({ ...dadosPropostos, [campo]: 'forjado' }) }), { statusCode: 400 });
    assert.equal(ctx.estado.escritas.length, 0); terminou(ctx);
  }
  for (const campo of CAMPOS_NR33) {
    const ctx = preparar();
    await assert.rejects(ctx.repo.atualizarStatusNoAmbiente(50, 'PENDENTE', ctx.usuario, { validarEstado: () => ({ status: 'PENDENTE', [campo]: null }) }), { statusCode: 400 });
    assert.equal(ctx.estado.escritas.length, 0); terminou(ctx);
  }
});

test('isolamento, inatividade, inexistencia e RBAC impedem snapshot e callback', async () => {
  for (const configurar of [s => { s.ambiente = B; }, s => { s.usuarioAtivo = false; }, s => { s.ambienteAtivo = false; },
    s => { s.localExiste = false; }, s => { s.existe = false; },
    ...['SUPERVISOR','AUDITOR','VISUALIZADOR'].map(p => s => { s.perfil = p; })]) {
    const ctx = preparar(); configurar(ctx.estado); let chamadas = 0;
    assert.equal(await atualiza(ctx, novos, { validarEstado: () => { chamadas++; return novos; } }), null);
    assert.equal(chamadas, 0); assert.equal(ctx.estado.escritas.length, 0);
    assert.equal(ctx.estado.consultas.some(q => q.sql.startsWith('SELECT ch.*')), false); terminou(ctx);
  }
});

test('estado lido sob bloqueio governa validacao, nao um snapshot anterior', async () => {
  const ctx = preparar(); ctx.estado.hook = (alias, s) => { if (alias === 'ch') s.row[MARCADOR] = true; };
  const r = await atualiza(ctx, { potencial_afogamento: 'NAO' }, { bloquearAutorizacao: false });
  assert.equal(r[MARCADOR], true); assert.equal(r.potencial_afogamento, 'NAO'); terminou(ctx);
});

test('operacoes antigas mantem parametros, ausencia de referencias 026 e dispensa de snapshot extra', async () => {
  for (const executar of [cria, atualiza]) {
    const ctx = preparar({ schema026: false }); await executar(ctx, { observacoes: 'Antigo' }, { bloquearAutorizacao: true });
    assert.equal(ctx.estado.consultas.some(q => q.sql.startsWith('SELECT ch.*')), false);
    for (const c of CAMPOS_NR33) assert.ok(!ctx.estado.escritas[0].sql.includes(c));
    assert.equal(ctx.estado.escritas[0].params.length, executar === cria ? 20 : 27); terminou(ctx);
    const direto = preparar({ schema026: false }); await executar(direto, { atmosfera_oxigenio: undefined });
    assert.equal(direto.estado.conexoes, 0); assert.equal(direto.estado.globais.length, 1);
  }
});

test('schema anterior rejeita novos campos sem fallback, migration ou escrita parcial', async () => {
  for (const executar of [cria, atualiza]) {
    const ctx = preparar({ schema026: false }); const antes = structuredClone(ctx.estado.row);
    await assert.rejects(executar(ctx, { atmosfera_oxigenio: null, observacoes: 'Nao gravar' }), { code: '42703' });
    assert.deepEqual(ctx.estado.row, antes); assert.equal(ctx.estado.escritas.length, 0);
    assert.equal(ctx.estado.consultas.at(-1).sql, 'ROLLBACK'); terminou(ctx);
    assert.ok(ctx.estado.consultas.every(q => !/ALTER TABLE|information_schema|pg_attribute/.test(q.sql)));
  }
});

test('erro tecnico de escrita reverte toda a operacao e libera conexao', async () => {
  const ctx = preparar(); const antes = structuredClone(ctx.estado.row), erro = new Error('Falha simulada');
  ctx.estado.falhaEscrita = erro;
  await assert.rejects(atualiza(ctx, { ...novos, observacoes: 'Nao gravar' }), recebido => recebido === erro);
  assert.deepEqual(ctx.estado.row, antes); assert.equal(ctx.estado.consultas.at(-1).sql, 'ROLLBACK'); terminou(ctx);
});

test('nomes adicionais nao entram no SQL; textos continuam parametrizados', async () => {
  const ctx = preparar(); const texto = "Texto'; DROP TABLE checklist_nr33; --";
  const r = await atualiza(ctx, { atmosfera_oxigenio: false, observacoes: texto, 'x = NULL; DROP TABLE x': true, avaliacao_nr33: 'CARACTERIZADO' });
  assert.equal(r.observacoes, texto); assert.ok(ctx.estado.escritas[0].params.includes(texto));
  assert.ok(!ctx.estado.escritas[0].sql.includes('DROP TABLE')); assert.ok(!ctx.estado.escritas[0].sql.includes('avaliacao_nr33')); terminou(ctx);
});
