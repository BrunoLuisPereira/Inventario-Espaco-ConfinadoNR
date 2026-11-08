const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// Substituicao anterior aos imports: nao carrega pg, dotenv nem credenciais.
const dbPath = require.resolve('../src/config/database');
const estado = { rows: [], consultas: [] };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  async connect() { throw new Error('Conexao PostgreSQL proibida'); },
  async query(sql, params) {
    assert.match(sql, /SELECT ch\.\*/);
    assert.match(sql, /c.id_ambiente = \$/);
    estado.consultas.push({ sql, params });
    const porId = /WHERE ch.id_checklist/.test(sql);
    const ambiente = params[porId ? 1 : 0];
    assert.equal(params[porId ? 2 : 1], ambiente === A ? 10 : 20);
    return { rows: structuredClone(estado.rows.filter(r => r.ambiente === ambiente && (!porId || r.id_checklist === params[0]))) };
  },
} };
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const { CAMPOS_NR33 } = require('../src/utils/adaptadorCamposNr33');
const service = require('../src/services/checklistMultiTenantService');
const campos = () => Object.fromEntries(CAMPOS_NR33.map(c => [c, null]));
function registro(patch = {}) {
  return { id_checklist: 1, id_local: 2, id_usuario: 10, ambiente: A, status: 'PENDENTE',
    criterio_a: 'SIM', criterio_b: 'SIM', criterio_c: 'SIM', acesso_controlado: 'SIM',
    ventilacao_adequada: 'SIM', monitoramento_atmosferico: 'SIM', procedimento_emergencia: 'SIM',
    ...campos(), atmosfera_oxigenio: true, possui_placa_identificacao: false, ...patch };
}

// app, router, controller, service e repository reais. Somente autenticacao e
// modulos de outros dominios ficam isolados; RBAC e filtro SQL sao reais.
const appPath = require.resolve('../src/app');
const load = Module._load;
let app;
try {
  Module._load = function(request, parent, ...resto) {
    if (parent?.filename === appPath && request.startsWith('./routes/') && request !== './routes/checklistRoutes') {
      return (_req, _res, next) => next();
    }
    if (request === '../middlewares/autenticacaoMiddleware' && parent?.filename.endsWith('checklistRoutes.js')) {
      return { autenticarMultiTenant(req, res, next) {
        if (!req.headers['x-lab-ambiente']) return res.status(401).json({ status: 'error', message: 'Usuário não autenticado.' });
        req.usuario = { id_usuario: req.headers['x-lab-ambiente'] === A ? 10 : 20,
          id_ambiente: req.headers['x-lab-ambiente'], perfil_acesso: 'ADMINISTRADOR', eh_fundador: true };
        next();
      } };
    }
    return load.call(this, request, parent, ...resto);
  };
  app = require(appPath);
} finally { Module._load = load; }

let servidor;
let base;
test.before(async () => {
  servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  base = `http://127.0.0.1:${servidor.address().port}/api/checklists`;
});
test.after(async () => {
  servidor.closeAllConnections();
  await new Promise(resolve => servidor.close(resolve));
});
test.beforeEach(() => { estado.rows = [registro()]; estado.consultas = []; });
async function pedir(path = '/1', method = 'GET', body, ambiente = A) {
  const res = await fetch(base + path, { method,
    headers: { 'content-type': 'application/json', ...(ambiente ? { 'x-lab-ambiente': ambiente } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: res.status, body: await res.json() };
}

test('GET ativo preserva envelope/IDs, calcula regra geral e aviso sem mutacao ou escrita', async () => {
  const antes = structuredClone(estado.rows);
  const r = await pedir();
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'success');
  assert.equal(r.body.data.id_checklist, 1);
  const a = r.body.data.avaliacao_nr33;
  assert.deepEqual(Object.keys(a), ['classificacao', 'aplicabilidade', 'validacao_conclusao']);
  assert.equal(a.classificacao.resultado, 'CARACTERIZADO');
  assert.equal(a.classificacao.origem, 'REGRA_GERAL');
  assert.equal(a.validacao_conclusao.pode_concluir, true);
  assert.deepEqual(a.validacao_conclusao.avisos, ['AUSENCIA_SINALIZACAO']);
  assert.deepEqual(estado.rows, antes);
  assert.equal(estado.consultas.length, 1);
});
test('dez propriedades presentes e nulas sao respostas desconhecidas, nao falha de esquema', async () => {
  estado.rows = [registro(campos())];
  const r = await pedir();
  assert.equal(r.status, 200);
  assert.equal(r.body.data.avaliacao_nr33.validacao_conclusao.pode_concluir, false);
});
test('hipotese especifica caracteriza sem inferir A/B', async () => {
  estado.rows = [registro({ criterio_a: 'NAO', criterio_b: 'NAO', criterio_c: 'NAO', atmosfera_oxigenio: null,
    avaliacao_especifica_iniciada: true, nao_destinado_ocupacao_humana: 'SIM', meios_limitados_entrada_saida: 'SIM',
    utilizado_armazenagem: 'SIM', potencial_engolfamento: 'SIM', potencial_afogamento: 'NAO' })];
  const r = await pedir();
  assert.equal(r.body.data.avaliacao_nr33.classificacao.origem, 'HIPOTESE_ESPECIFICA');
  assert.equal(r.body.data.avaliacao_nr33.validacao_conclusao.pode_concluir, true);
});
test('historico concluido permanece concluido com avaliacao atual incompleta, sem inventar evidencia', async () => {
  estado.rows = [registro({ ...campos(), criterio_a: null, status: 'CONCLUIDO' })];
  const r = await pedir();
  assert.equal(r.body.data.status, 'CONCLUIDO');
  assert.equal(r.body.data.avaliacao_nr33.classificacao.resultado, 'PENDENTE');
  assert.equal(r.body.data.avaliacao_nr33.validacao_conclusao.pode_concluir, false);
});
test('avaliacao especifica nao iniciada difere de iniciada sem respostas', async () => {
  estado.rows = [registro({ ...campos(), criterio_a: 'NAO' })];
  const naoIniciada = await pedir();
  assert.equal(naoIniciada.body.data.avaliacao_nr33.classificacao.hipoteseEspecifica, 'NAO_AVALIADA');
  estado.rows[0].avaliacao_especifica_iniciada = true;
  const iniciada = await pedir();
  assert.equal(iniciada.body.data.avaliacao_nr33.classificacao.hipoteseEspecifica, 'INFORMACOES_INSUFICIENTES');
  assert.equal(iniciada.body.data.avaliacao_nr33.classificacao.resultado, 'PENDENTE');
});
for (const removidos of [[CAMPOS_NR33[0]], CAMPOS_NR33.slice(2, 6)]) {
  test(`ausencia estrutural de ${removidos.length} propriedades retorna 503 controlado`, async () => {
    removidos.forEach(c => delete estado.rows[0][c]);
    const r = await pedir();
    assert.equal(r.status, 503);
    assert.deepEqual(r.body, { status: 'error', message: 'Avaliação NR-33 temporariamente indisponível.',
      code: 'NR33_ESQUEMA_INCOMPATIVEL', details: {} });
  });
}
test('lista compativel calcula cada registro e preserva total', async () => {
  estado.rows.push(registro({ id_checklist: 2 }));
  const r = await pedir('');
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 2);
  assert.ok(r.body.data.every(item => item.avaliacao_nr33));
  assert.equal(estado.consultas.length, 1);
});
test('lista com registro incompativel nao retorna avaliacao parcial nem altera entradas', async () => {
  const segundo = registro({ id_checklist: 2 });
  delete segundo.potencial_afogamento;
  estado.rows.push(segundo);
  const antes = structuredClone(estado.rows);
  const r = await pedir('');
  assert.equal(r.status, 503);
  assert.equal(Object.hasOwn(r.body, 'data'), false);
  assert.deepEqual(estado.rows, antes);
});
test('lista vazia preserva envelope sem afirmar compatibilidade de esquema', async () => {
  estado.rows = [];
  assert.deepEqual((await pedir('')).body, { status: 'success', total: 0, data: [] });
});
test('isolamento: checklist externo incompativel nao e avaliado nem exposto', async () => {
  estado.rows.push({ id_checklist: 99, ambiente: B, segredo: 'NAO_PUBLICAR' });
  assert.equal((await pedir('')).body.total, 1);
  assert.equal((await pedir('/99')).status, 404);
  assert.equal((await pedir('/99', 'GET', undefined, B)).status, 503);
});
test('autenticacao mantida antes de leitura', async () => {
  assert.equal((await pedir('/1', 'GET', undefined, null)).status, 401);
  assert.equal(estado.consultas.length, 0);
});
test('tipo invalido persistido nao se torna HTTP 400', async t => {
  t.mock.method(console, 'error', () => {});
  estado.rows[0].atmosfera_oxigenio = 'true';
  const r = await pedir();
  assert.equal(r.status, 500);
  assert.deepEqual(r.body, { status: 'error', message: 'Erro interno do servidor.' });
});
test('validacao de entrada NR33 conhecida tem erro estruturado sem acesso ao banco', async () => {
  const r = await pedir('/1', 'PUT', { atmosfera_oxigenio: 'true' });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { status: 'error', message: 'Dados NR-33 inválidos.', code: 'NR33_DADOS_INVALIDOS', details: {} });
  assert.equal(estado.consultas.length, 0);
});
for (const [method, path] of [['POST', ''], ['PUT', '/1'], ['PATCH', '/1/status']]) {
  test(`${method} rejeita campo calculado antes de consultar ou escrever`, async () => {
    const r = await pedir(path, method, { avaliacao_nr33: null });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'NR33_CAMPO_SOMENTE_LEITURA');
    assert.deepEqual(r.body.details, { campos: ['avaliacao_nr33'] });
    assert.equal(estado.consultas.length, 0);
  });
}
for (const [code, status, metadata] of [
  ['NR33_CONCLUSAO_INVALIDA', 400, { validacaoNr33: [{ codigo: 'RESPOSTA_OBRIGATORIA', campos: ['criterio_a', 'SEGREDO'] }, { codigo: 'SEGREDO', campos: [] }] }],
  ['NR33_CONFIRMACAO_LIMPEZA_NECESSARIA', 409, { camposLimpeza: ['atmosfera_oxigenio', 'SEGREDO'] }],
]) {
  test(`controller ativo publica somente detalhes permitidos de ${code}`, async t => {
    t.mock.method(service, 'buscarChecklistPorId', async () => { throw Object.assign(new Error('SEGREDO'),
      { code, statusCode: status, ...metadata, details: { sql: 'SEGREDO' } }); });
    const r = await pedir();
    assert.equal(r.status, status);
    assert.equal(r.body.code, code);
    assert.ok(r.body.details);
    assert.equal(JSON.stringify(r.body).includes('SEGREDO'), false);
  });
}
for (const erro of [new TypeError('SEGREDO'), Object.assign(new Error('SEGREDO'), { code: '23542' }),
  Object.assign(new Error('SEGREDO'), { code: 'NR33_CONCLUSAO_INVALIDA', statusCode: 500 })]) {
  test(`falha interna ${erro.code || erro.name} segue handler global sem detalhes`, async t => {
    t.mock.method(console, 'error', () => {});
    t.mock.method(service, 'buscarChecklistPorId', async () => { throw erro; });
    const r = await pedir();
    assert.equal(r.status, 500);
    assert.deepEqual(r.body, { status: 'error', message: 'Erro interno do servidor.' });
  });
}
