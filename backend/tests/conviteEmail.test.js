const test = require('node:test');
const assert = require('node:assert/strict');
const { criarServicoEmail, criarEmailConfigurado } = require('../src/services/emailService');
const token = 'a'.repeat(64);
const env = { EMAIL_TRANSPORT: 'local-smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025',
  EMAIL_FROM: 'nr33@example.invalid', APP_PUBLIC_URL: 'http://127.0.0.1:5174' };

test('convite SMTP usa destinatário, template e origem pública configurada', async () => {
  let recebido;
  const email = criarEmailConfigurado(env, () => ({ async sendMail(m) {
    recebido = m; return { accepted: [m.to], rejected: [] };
  } }));
  await email.enviarConvite('convidado@example.invalid', token);
  assert.equal(recebido.to, 'convidado@example.invalid');
  assert.equal(recebido.from, env.EMAIL_FROM);
  assert.match(recebido.subject, /Inventário de Espaços Confinados NR-33/);
  for (const conteudo of [recebido.text, recebido.html]) {
    assert.ok(conteudo.includes(`${env.APP_PUBLIC_URL}/convites/aceitar#token=${token}`));
    assert.match(conteudo, /48 horas/);
    assert.match(conteudo, /ignore esta mensagem/);
    assert.match(conteudo, /Aceitar convite e criar conta/);
  }
  assert.ok(!recebido.html.includes('/redefinir-senha'));
});

for (const resposta of [{ accepted: [], rejected: [] }, { accepted: [], rejected: ['a@example.invalid'] }]) {
  test('SMTP sem confirmação não informa envio concluído', async () => {
    const email = criarEmailConfigurado(env, () => ({ sendMail: async () => resposta }));
    await assert.rejects(email.enviarConvite('a@example.invalid', token), /não confirmada/);
  });
}
test('SMTP rejeitado propaga falha ao serviço de convites', async () => {
  const email = criarEmailConfigurado(env, () => ({ sendMail: async () => { throw Error('falha-sintetica'); } }));
  await assert.rejects(email.enviarConvite('a@example.invalid', token));
});
test('transporte desabilitado não cria cliente', () => {
  const email = criarEmailConfigurado({ ...env, EMAIL_TRANSPORT: 'disabled' }, () => assert.fail());
  assert.equal(email.disponivel(), false);
  assert.equal(email.criarLinkConvite(token), `${env.APP_PUBLIC_URL}/convites/aceitar#token=${token}`);
});
for (const urlPublica of ['https://user:pass@example.invalid', 'https://example.invalid/path',
  'https://example.invalid/?url=outra', 'https://example.invalid/#fragmento', 'http://externo.invalid', 'javascript:alert(1)']) {
  test('origem inválida não gera link nem envia', async () => {
    const email = criarServicoEmail({ urlPublica, transporte: { enviar: () => assert.fail() } });
    assert.equal(email.disponivel(), false);
    await assert.rejects(email.enviarConvite('a@example.invalid', token));
  });
}
test('token e destinatário inválidos são recusados antes do transporte', async () => {
  const email = criarServicoEmail({ urlPublica: env.APP_PUBLIC_URL, transporte: { enviar: () => assert.fail() } });
  await assert.rejects(email.enviarConvite('a@example.invalid', 'invalido'));
  await assert.rejects(email.enviarConvite('a@example.invalid\r\nBcc:outro@example.invalid', token));
});
