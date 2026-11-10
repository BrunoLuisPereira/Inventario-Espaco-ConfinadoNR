const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const express = require('express');
const { Registry, register } = require('prom-client');
const { instalarMetricas } = require('../src/observabilidade/metricas');
const token = 'ab'.repeat(32); // Somente fixture, nunca credencial de uso local.

async function preparar(t, tipo, enabled = true, extra = {}) {
  const file = path.join(os.tmpdir(), `nr33-metrics-${process.pid}-${randomUUID()}.txt`);
  fs.writeFileSync(file, token);
  t.after(() => fs.unlinkSync(file));
  const env = { NR33_METRICS_ENABLED: String(enabled), NR33_METRICS_TOKEN_FILE: file, ...extra };
  const router = express.Router();
  router.get('/falha', (_req, res) => res.sendStatus(503));
  router.get('/lenta', (_req, res) => setTimeout(() => res.sendStatus(200), 60));
  let registry;
  const filename = path.resolve(__dirname, tipo === 'padrao' ? '../src/app.js' : '../laboratorio/app.cjs');
  const modulo = { exports: {} };
  // Require fechado: qualquer acesso a pg, dotenv ou repositories falha o teste.
  const executar = vm.runInThisContext('(function(require,module,exports){\n' + fs.readFileSync(filename, 'utf8') + '\n})', { filename });
  executar(nome => {
    if (nome === 'express') return express;
    if (nome === 'cors') return require('cors');
    if (nome === './config.cjs') return require('../laboratorio/config.cjs');
    if (nome.endsWith('/observabilidade/metricas')) return {
      instalarMetricas(app) { registry = instalarMetricas(app, env); },
    };
    if (/routes\/\w+Routes$/.test(nome)) return router;
    throw new Error('Importacao proibida no teste: ' + nome);
  }, modulo, modulo.exports);
  const app = tipo === 'padrao' ? modulo.exports : modulo.exports.criarApp('inventario_nr33_multitenant_dev');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const request = (url, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method, headers }, res => {
      let body = '';
      res.on('data', part => { body += part; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject); req.end();
  });
  return { request, registry, scrape: () => request('/internal/metrics', { Authorization: `Bearer ${token}` }) };
}

for (const tipo of ['padrao', 'laboratorio']) {
  test(`${tipo}: metricas de processo registradas uma vez e coletadas em formato Prometheus`, async t => {
    const globais = register.getMetricsAsArray();
    const registrar = t.mock.method(Registry.prototype, 'registerMetric');
    const { registry, scrape } = await preparar(t, tipo);
    const metricas = [
      ['nr33_process_resident_memory_bytes', 'gauge'],
      ['nr33_process_heap_used_bytes', 'gauge'],
      ['nr33_process_cpu_seconds_total', 'counter'],
    ];
    assert.equal(registry.getMetricsAsArray().length, 7);
    for (const [nome, type] of metricas) {
      const chamadas = registrar.mock.calls.filter(c => c.this === registry && c.arguments[0].name === nome);
      assert.equal(chamadas.length, 1, nome);
      assert.strictEqual(registry.getSingleMetric(nome), chamadas[0].arguments[0]);
      const json = await registry.getSingleMetric(nome).get();
      assert.equal(json.type, type);
      assert.deepEqual(json.values[0].labels, {});
      assert.ok(Number.isFinite(json.values[0].value));
      assert.ok(json.values[0].value >= 0);
    }
    const response = await scrape();
    assert.equal(response.status, 200);
    for (const [nome, type] of metricas) {
      assert.equal(response.body.split('\n').filter(l => l === `# TYPE ${nome} ${type}`).length, 1);
      assert.equal(response.body.split('\n').filter(l => l.startsWith(nome + ' ')).length, 1);
    }
    assert.deepEqual(register.getMetricsAsArray(), globais);
  });
  test(`${tipo}: registries independentes nao compartilham instancias nem contadores`, async t => {
    const a = await preparar(t, tipo), b = await preparar(t, tipo);
    for (const metrica of a.registry.getMetricsAsArray()) {
      assert.notStrictEqual(metrica, b.registry.getSingleMetric(metrica.name));
    }
    await a.request('/api/health');
    assert.equal((await a.registry.getSingleMetric('nr33_http_requests_total').get()).values[0].value, 1);
    assert.deepEqual((await b.registry.getSingleMetric('nr33_http_requests_total').get()).values, []);
  });
  test(`${tipo}: endpoint desabilitado por padrao`, async t => {
    const { request } = await preparar(t, tipo, false, { NR33_METRICS_ENABLED: undefined });
    assert.equal((await request('/internal/metrics')).status, 404);
  });
  test(`${tipo}: credencial exclusiva, origem e metodo`, async t => {
    const { request, scrape } = await preparar(t, tipo);
    for (const value of ['', 'Bearer incorreto', 'Bearer jwt.da.aplicacao', `Basic ${token}`]) {
      assert.equal((await request('/internal/metrics', { Authorization: value })).status, 401);
    }
    const response = await scrape();
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/plain/);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal((await request('/internal/metrics', { Authorization: `Bearer ${token}` }, 'POST')).status, 405);
  });
  test(`${tipo}: origem nao permitida nao confia no proxy`, async t => {
    const { request } = await preparar(t, tipo, true, { NR33_METRICS_ALLOWED_ADDRESSES: '192.0.2.1' });
    assert.equal((await request('/internal/metrics', { Authorization: `Bearer ${token}`, 'X-Forwarded-For': '192.0.2.1' })).status, 403);
  });
  test(`${tipo}: contagem, latencia, erros, recursos e privacidade`, async t => {
    const { request, scrape } = await preparar(t, tipo);
    await request('/api/health');
    await request('/api/auth/falha');
    await request('/email-pessoa%40example.test/usuario-123/ambiente-secreto?token=segredo', {
      Authorization: 'Bearer token-sensivel', 'X-User-Name': 'Nome Sensivel',
    });
    const response = await scrape();
    await scrape();
    const again = (await scrape()).body;
    for (const status of [200, 404, 503]) {
      assert.match(response.body, new RegExp(`nr33_http_requests_total\\{method="GET",status_code="${status}"\\} 1`));
      assert.match(response.body, new RegExp(`nr33_http_request_duration_seconds_count\\{method="GET",status_code="${status}"\\} 1`));
    }
    assert.match(response.body, /nr33_http_errors_total\{method="GET",status_code="503"\} 1/);
    assert.match(response.body, /nr33_http_errors_total\{method="GET",status_code="404"\} 1/);
    assert.match(response.body, /nr33_http_requests_in_flight 0/);
    assert.match(response.body, /nr33_process_resident_memory_bytes [1-9]/);
    assert.match(response.body, /nr33_process_cpu_seconds_total [\d.]+/);
    assert.equal(again.match(/nr33_http_requests_total\{[^\n]+/g).length, 3);
    const sum = /nr33_http_request_duration_seconds_sum\{method="GET",status_code="200"\} ([\d.e+-]+)/.exec(response.body);
    assert.ok(Number(sum[1]) > 0);
    for (const value of [token, 'example', 'usuario-123', 'ambiente-secreto', 'segredo', 'Nome Sensivel', 'token-sensivel', '/api/health']) {
      assert.ok(!response.body.includes(value), value);
    }
  });
  test(`${tipo}: requisicoes simultaneas retornam a zero`, async t => {
    const { request, registry } = await preparar(t, tipo);
    const pending = [request('/api/auth/lenta'), request('/api/auth/lenta')];
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.match(await registry.metrics(), /nr33_http_requests_in_flight 2/);
    await Promise.all(pending);
    assert.match(await registry.metrics(), /nr33_http_requests_in_flight 0/);
  });
}

test('ativacao sem credencial valida falha sem revelar segredo ou caminho', () => {
  assert.throws(() => instalarMetricas(express(), { NR33_METRICS_ENABLED: 'true', NR33_METRICS_TOKEN_FILE: '/nao-existe/segredo' }),
    { message: 'Arquivo de credencial de monitoramento indisponivel.' });
});
