const { readFileSync } = require('node:fs');
const { createHash, timingSafeEqual } = require('node:crypto');
const { Registry, Counter, Histogram, Gauge } = require('prom-client');

// Registro exclusivo por app: nenhum label deriva de URL, identidade ou ambiente.
function instalarMetricas(app, env = process.env) {
  const registry = new Registry();
  let token;
  if (env.NR33_METRICS_ENABLED === 'true') {
    try { token = readFileSync(env.NR33_METRICS_TOKEN_FILE, 'utf8').trim(); }
    catch { throw new Error('Arquivo de credencial de monitoramento indisponivel.'); }
    if (!/^[a-fA-F0-9]{64,}$/.test(token)) throw new Error('Credencial de monitoramento invalida.');
  }
  const digest = value => createHash('sha256').update(value).digest();
  const expected = token ? digest(`Bearer ${token}`) : null;
  const addresses = (env.NR33_METRICS_ALLOWED_ADDRESSES || '127.0.0.1,::1')
    .split(',').map(value => value.trim());
  const options = { registers: [registry], labelNames: ['method', 'status_code'] };
  const total = new Counter({ ...options, name: 'nr33_http_requests_total', help: 'Completed HTTP requests.' });
  const errors = new Counter({ ...options, name: 'nr33_http_errors_total', help: 'HTTP responses with status 400 or higher.' });
  const latency = new Histogram({ ...options, name: 'nr33_http_request_duration_seconds', help: 'HTTP response duration.',
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] });
  const active = new Gauge({ registers: [registry], name: 'nr33_http_requests_in_flight', help: 'Active HTTP requests.' });
  new Gauge({ registers: [registry], name: 'nr33_process_resident_memory_bytes', help: 'Node process RSS.',
    collect() { this.set(process.memoryUsage().rss); } });
  new Gauge({ registers: [registry], name: 'nr33_process_heap_used_bytes', help: 'Node heap used.',
    collect() { this.set(process.memoryUsage().heapUsed); } });
  new Counter({ registers: [registry], name: 'nr33_process_cpu_seconds_total', help: 'Cumulative Node CPU seconds.',
    collect() { const cpu = process.cpuUsage(); this.reset(); this.inc((cpu.user + cpu.system) / 1e6); } });

  app.use((req, res, next) => {
    // Exclui a coleta e tentativas de acesso a ela dos indicadores da API.
    if (req.path === '/internal/metrics') {
      res.set('Cache-Control', 'no-store');
      if (!expected) return res.sendStatus(404);
      const address = req.socket.remoteAddress?.replace(/^::ffff:/, '');
      if (!addresses.includes(address)) return res.sendStatus(403);
      if (!timingSafeEqual(expected, digest(req.headers.authorization || ''))) {
        return res.sendStatus(401);
      }
      if (req.method !== 'GET') return res.sendStatus(405);
      return registry.metrics().then(body => res.type(registry.contentType).send(body), next);
    }
    const start = process.hrtime.bigint();
    active.inc();
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      active.dec();
      const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER';
      const labels = { method, status_code: String(res.writableFinished ? res.statusCode : 499) };
      total.inc(labels);
      if (Number(labels.status_code) >= 400) errors.inc(labels);
      latency.observe(labels, Number(process.hrtime.bigint() - start) / 1e9);
    };
    res.once('finish', finish);
    res.once('close', finish);
    next();
  });
  return registry;
}

module.exports = { instalarMetricas };
