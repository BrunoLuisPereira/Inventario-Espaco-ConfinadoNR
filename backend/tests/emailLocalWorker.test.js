require('./helpers/evidenciaIsolamentoPreload.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarEmailConfigurado } = require('../src/services/emailService');
const { iniciarWorker } = require('../src/services/recuperacaoSenhaWorker');
const env = { EMAIL_TRANSPORT: 'local-smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025',
  EMAIL_FROM: 'nr33@example.invalid', APP_PUBLIC_URL: 'http://127.0.0.1:5173' };
test('SMTP local configura transporte sem conectar e exige aceite do destinatário', async () => {
  let configuracao, mensagem;
  const email = criarEmailConfigurado(env, c => {
    configuracao = c;
    return { async sendMail(m) { mensagem = m; return { accepted: [m.to], rejected: [] }; } };
  });
  assert.equal(email.disponivel(), true); assert.equal(mensagem, undefined);
  assert.equal(configuracao.host, '127.0.0.1'); assert.equal(configuracao.port, 1025);
  assert.equal(configuracao.logger, false); assert.equal(configuracao.debug, false);
  assert.equal(configuracao.disableFileAccess, true); assert.equal(configuracao.disableUrlAccess, true);
  await email.enviarRecuperacao('a@example.invalid', 'a'.repeat(64));
  assert.equal(mensagem.from, env.EMAIL_FROM); assert.match(mensagem.text, /#token=/);
  const recusado = criarEmailConfigurado(env, () => ({ sendMail: async () => ({ accepted: [], rejected: ['a@example.invalid'] }) }));
  await assert.rejects(recusado.enviarRecuperacao('a@example.invalid', 'a'.repeat(64)));
});
for (const alterar of [{ SMTP_HOST: 'smtp.example.com' }, { SMTP_HOST: 'localhost' }, { SMTP_PORT: '0' },
  { EMAIL_FROM: 'invalido' }, { SMTP_USER: 'usuario' }, { SMTP_PASSWORD: 'senha-sintetica' },
  { EMAIL_TRANSPORT: 'console' }, { APP_PUBLIC_URL: 'http://example.com' }]) {
  test('SMTP recusa configuração antes de conectar: ' + Object.keys(alterar)[0], () => {
    assert.throws(() => criarEmailConfigurado({ ...env, ...alterar }, () => ({ sendMail: () => assert.fail() })));
  });
}
test('padrão desabilitado não cria cliente SMTP', () => {
  assert.equal(criarEmailConfigurado({}, () => assert.fail()).disponivel(), false);
});
test('worker não sobrepõe ciclos e aguarda trabalho antes de parar', async () => {
  let liberar, ativos = 0, maximo = 0, limpezas = 0;
  const parar = iniciarWorker({ intervalo: 5, service: { async processarProximo() {
    ativos++; maximo = Math.max(maximo, ativos);
    await new Promise(resolve => { liberar = resolve; }); ativos--;
  } }, repo: { async limpar() { limpezas++; } } });
  const encerrando = parar(); liberar(); await encerrando;
  assert.equal(maximo, 1); assert.equal(limpezas, 1);
});
