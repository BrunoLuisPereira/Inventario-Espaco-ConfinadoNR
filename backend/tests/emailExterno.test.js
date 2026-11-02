require('./helpers/evidenciaIsolamentoPreload.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarEmailConfigurado } = require('../src/services/emailService');
const { criarServico } = require('../src/services/recuperacaoSenhaService');
const token = 'a'.repeat(64);
// Configuração exclusivamente sintética, sempre com fábrica injetada. Não abre rede.
const env = { EMAIL_TRANSPORT: 'external-smtp', SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '587',
  SMTP_USER: 'usuario-sintetico', SMTP_PASSWORD: 'senha-sintetica', EMAIL_FROM: 'nr33@example.invalid',
  APP_PUBLIC_URL: 'https://app.example.invalid' };

for (const porta of ['465', '587']) test('SMTP externo autenticado e TLS obrigatório na porta ' + porta, async () => {
  let config;
  const mensagens = [];
  const email = criarEmailConfigurado({ ...env, SMTP_PORT: porta }, c => {
    config = c;
    return { async sendMail(m) { mensagens.push(m); return { accepted: [m.to], rejected: [] }; } };
  });
  assert.equal(email.disponivel(), true);
  assert.equal(mensagens.length, 0, 'configuração não verifica nem abre SMTP');
  assert.deepEqual(config.auth, { user: env.SMTP_USER, pass: env.SMTP_PASSWORD });
  assert.equal(config.secure, porta === '465');
  assert.equal(config.requireTLS, true);
  assert.equal(config.ignoreTLS, false);
  assert.deepEqual(config.tls, { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: env.SMTP_HOST });
  for (const flag of ['logger', 'debug']) assert.equal(config[flag], false);
  for (const flag of ['disableFileAccess', 'disableUrlAccess']) assert.equal(config[flag], true);
  for (const timeout of ['dnsTimeout', 'connectionTimeout', 'greetingTimeout', 'socketTimeout']) assert.ok(config[timeout] > 0 && config[timeout] <= 10000);
  await email.enviarConvite('convidado@example.invalid', token);
  await email.enviarRecuperacao('recuperacao@example.invalid', token);
  assert.equal(mensagens[0].to, 'convidado@example.invalid');
  assert.equal(mensagens[1].to, 'recuperacao@example.invalid');
  assert.ok(mensagens.every(m => m.from === env.EMAIL_FROM));
  assert.ok(mensagens[0].text.includes(`${env.APP_PUBLIC_URL}/convites/aceitar#token=${token}`));
  assert.match(mensagens[0].text, /48 horas/);
  assert.ok(mensagens[1].text.includes(`${env.APP_PUBLIC_URL}/redefinir-senha#token=${token}`));
  assert.match(mensagens[1].text, /30 minutos/);
});

const invalidos = [
  { SMTP_HOST: '' }, { SMTP_HOST: 'localhost' }, { SMTP_HOST: '127.0.0.1' }, { SMTP_HOST: '::1' },
  { SMTP_HOST: 'smtp.localhost' }, { SMTP_HOST: 'smtp.local' }, { SMTP_HOST: 'https://smtp.example.invalid' },
  { SMTP_HOST: 'smtp.example.invalid\r\n' }, { SMTP_PORT: '25' }, { SMTP_PORT: '2525' },
  { SMTP_PORT: '0587' }, { SMTP_PORT: '' }, { SMTP_USER: '' }, { SMTP_USER: undefined },
  { SMTP_USER: 'user\r\n' }, { SMTP_PASSWORD: '' }, { SMTP_PASSWORD: undefined }, { SMTP_PASSWORD: 'x\0x' },
  { EMAIL_FROM: 'Nome <a@example.invalid>' }, { EMAIL_FROM: 'a@example.invalid,b@example.invalid' },
  { APP_PUBLIC_URL: undefined }, { APP_PUBLIC_URL: 'http://app.example.invalid' },
  { APP_PUBLIC_URL: 'https://localhost' }, { APP_PUBLIC_URL: 'https://app.localhost' },
  { APP_PUBLIC_URL: 'https://127.0.0.1' }, { APP_PUBLIC_URL: 'https://[::1]' },
  { APP_PUBLIC_URL: 'https://192.168.1.13' }, { APP_PUBLIC_URL: 'https://intranet' },
  { APP_PUBLIC_URL: 'https://app.local' }, { APP_PUBLIC_URL: 'https://u:p@app.example.invalid' },
  { APP_PUBLIC_URL: 'https://app.example.invalid/path' }, { APP_PUBLIC_URL: 'https://app.example.invalid/?x=y' },
  { APP_PUBLIC_URL: 'https://app.example.invalid/#token=x' },
];
invalidos.forEach((alteracao, i) => test('configuração externa inválida bloqueada antes do cliente: caso ' + i, () => {
  assert.throws(() => criarEmailConfigurado({ ...env, ...alteracao }, () => assert.fail('não deve criar cliente')), {
    message: 'Configuração de e-mail externo inválida.',
  });
}));

test('SMTP não ativa por credenciais presentes: disabled e padrão continuam indisponíveis', () => {
  for (const EMAIL_TRANSPORT of [undefined, 'disabled']) {
    const email = criarEmailConfigurado({ ...env, EMAIL_TRANSPORT }, () => assert.fail());
    assert.equal(email.disponivel(), false);
  }
});

test('opções arbitrárias não enfraquecem TLS; configuração fica capturada', async () => {
  let config, mensagem;
  const configuracao = { ...env, SMTP_SECURE: 'false', SMTP_IGNORE_TLS: 'true', SMTP_REJECT_UNAUTHORIZED: 'false' };
  const email = criarEmailConfigurado(configuracao, c => {
    config = c; return { sendMail: async m => { mensagem = m; return { accepted: [m.to] }; } };
  });
  configuracao.EMAIL_FROM = 'intruso@example.invalid';
  configuracao.APP_PUBLIC_URL = 'https://localhost';
  configuracao.SMTP_PASSWORD = 'alterada';
  await email.enviarConvite('a@example.invalid', token);
  assert.equal(config.tls.rejectUnauthorized, true);
  assert.equal(config.requireTLS, true);
  assert.equal(config.ignoreTLS, false);
  assert.equal(config.auth.pass, env.SMTP_PASSWORD);
  assert.equal(mensagem.from, env.EMAIL_FROM);
  assert.ok(mensagem.text.includes(env.APP_PUBLIC_URL));
});

for (const codigo of ['EAUTH', 'ETIMEDOUT', 'ECONNREFUSED', 'ETLS', 'EDNS']) test('erro externo sanitizado: ' + codigo, async t => {
  const logs = [];
  for (const metodo of ['error', 'log', 'warn', 'info']) t.mock.method(console, metodo, (...args) => logs.push(args));
  const email = criarEmailConfigurado(env, () => ({ async sendMail(m) {
    throw Object.assign(new Error(`${env.SMTP_PASSWORD} ${m.text} ${env.SMTP_USER}`), { code: codigo, response: m.html });
  } }));
  for (const metodo of ['enviarConvite', 'enviarRecuperacao']) {
    await assert.rejects(email[metodo]('a@example.invalid', token), erro => {
      assert.equal(erro.message, 'Não foi possível confirmar o envio do e-mail.');
      assert.equal(erro.cause, undefined);
      assert.deepEqual(Object.keys(erro), []);
      for (const segredo of [token, env.SMTP_PASSWORD, env.SMTP_USER, env.APP_PUBLIC_URL]) assert.ok(!erro.stack.includes(segredo));
      return true;
    });
  }
  assert.deepEqual(logs, []);
});

for (const resultado of [{ accepted: [] }, { accepted: ['outro@example.invalid'] },
  { accepted: ['a@example.invalid'], rejected: ['a@example.invalid'] }]) test('resposta sem aceite do destinatário é falha', async () => {
  const email = criarEmailConfigurado(env, () => ({ sendMail: async () => resultado }));
  await assert.rejects(email.enviarConvite('a@example.invalid', token), /Não foi possível confirmar/);
});

test('inicialização do cliente não propaga segredos', () => {
  assert.throws(() => criarEmailConfigurado(env, () => { throw Error(env.SMTP_PASSWORD); }), {
    message: 'Configuração de e-mail externo inválida.',
  });
});

for (const falhar of [false, true]) test('recuperação usa SMTP externo sem ativar antes da confirmação: ' + falhar, async () => {
  const eventos = [];
  let liberar;
  const email = criarEmailConfigurado(env, () => ({ async sendMail(m) {
    eventos.push('smtp');
    assert.equal(m.to, 'a@example.invalid');
    await new Promise(resolve => { liberar = resolve; });
    if (falhar) throw Error('segredo-do-provedor');
    return { accepted: [m.to] };
  } }));
  const repo = {
    reivindicar: async () => ({ email: 'a@example.invalid', id_envio: 'envio', reserva: 'reserva' }),
    emitir: async (_email, hash) => { assert.match(hash, /^[a-f0-9]{64}$/); eventos.push('emitir'); return { email: 'a@example.invalid' }; },
    ativar: async () => eventos.push('ativar'), invalidar: async () => eventos.push('invalidar'),
    finalizar: async () => eventos.push('finalizar'),
  };
  const service = criarServico({ repo, email });
  const processamento = service.processarProximo();
  for (let i = 0; i < 20 && !liberar; i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(eventos, ['emitir', 'smtp']);
  liberar();
  assert.equal(await processamento, true);
  assert.deepEqual(eventos, ['emitir', 'smtp', falhar ? 'invalidar' : 'ativar', 'finalizar']);
});
