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
    ['/api/checklists', '../src/routes/checklistRoutes'],
    ['/api/evidencias', '../src/routes/evidenciaRoutes'],
    ['/api/dados-tecnicos', '../src/routes/dadosTecnicosRoutes'],
    ['/api/relatorios', '../src/routes/relatorioRoutes'],
    // Alias singular solicitado; conserva o contrato plural do app convencional.
    [['/api/sincronizacao', '/api/sincronizacoes'], '../src/routes/sincronizacaoRoutes'],
  ]) app.use(url, require(modulo));
  app.use((_req, res) => res.status(404).json({ status: 'error', message: 'Rota nao encontrada.' }));
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    // Somente contratos controlados da aplicação; códigos do driver e detalhes
    // técnicos nunca tornam uma mensagem interna pública, mesmo com statusCode.
    let status = 500;
    let message = 'Erro interno do servidor.';
    if (error?.type === 'entity.parse.failed') {
      status = 400; message = 'JSON invalido.';
    } else if (error?.type === 'entity.too.large') {
      status = 413; message = 'Corpo da requisicao excede o limite.';
    } else if (Number.isInteger(error?.statusCode) &&
        [400, 401, 403, 404, 409, 410, 422].includes(error.statusCode) &&
        typeof error.message === 'string' && error.message.trim() &&
        !['code', 'query', 'sql', 'detail', 'severity'].some(campo => error[campo] !== undefined)) {
      status = error.statusCode; message = error.message;
    }
    return res.status(status).json({ status: 'error', message });
  });
  return app;
}
module.exports = { criarApp };
