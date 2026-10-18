// Entrada HTTP exclusiva de laboratorio. Nao importa src/app.js ou dotenv.
function criarApp(banco) {
  const { destino } = require('./config.cjs');
  destino(banco);
  const express = require('express');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'success', laboratorio: true, banco }));
  for (const [url, modulo] of [
    ['/api/cadastro', '../src/routes/cadastroRoutes'],
    ['/api/convites', '../src/routes/conviteRoutes'],
    ['/api/auth', '../src/routes/authRoutes'],
    ['/api/usuarios', '../src/routes/usuarioRoutes'],
    ['/api/campanhas', '../src/routes/campanhaRoutes'],
    ['/api/locais', '../src/routes/localRoutes'],
  ]) app.use(url, require(modulo));
  app.use((_req, res) => res.status(404).json({ status: 'error', message: 'Rota nao encontrada.' }));
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error?.type === 'entity.parse.failed' ? 400 : error?.type === 'entity.too.large' ? 413 : 500;
    return res.status(status).json({ status: 'error', message: status === 400 ? 'JSON invalido.' : status === 413 ? 'Corpo da requisicao excede o limite.' : 'Erro interno do servidor.' });
  });
  return app;
}
module.exports = { criarApp };
