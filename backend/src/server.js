require("dotenv").config();

const app = require("./app");

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Servidor iniciado na porta ${PORT}`);
  console.log(`API disponível em http://localhost:${PORT}`);
});
const pararRecuperacao = ['local-smtp', 'external-smtp'].includes(process.env.EMAIL_TRANSPORT)
  ? require('./services/recuperacaoSenhaWorker').iniciarWorker() : null;
if (pararRecuperacao) for (const sinal of ['SIGINT', 'SIGTERM']) process.once(sinal, async () => {
  await pararRecuperacao();
  server.close();
  await require('./config/database').end();
});
