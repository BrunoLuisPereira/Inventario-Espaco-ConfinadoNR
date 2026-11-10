const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { preparar, A } = require('./helpers/idsBigintSimulados.cjs');

test('cada preparação usa chave aleatória e restaura ambiente presente ou ausente', async t => {
  const original = process.env.JWT_SECRET;
  t.after(() => { if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original; });
  let chaveAnterior, tokenAnterior;
  for (const presente of [false, true]) {
    const anterior = presente ? crypto.randomBytes(32).toString('hex') : undefined;
    if (presente) process.env.JWT_SECRET = anterior; else delete process.env.JWT_SECRET;
    await t.test(`preparação com ambiente ${presente ? 'presente' : 'ausente'}`, async filho => {
      const c = preparar(filho);
      const atual = process.env.JWT_SECRET;
      assert.ok(typeof atual === 'string' && /^[0-9a-f]{64}$/.test(atual));
      assert.ok(atual !== anterior && atual !== chaveAnterior, 'Chave deve ser nova a cada preparação');
      if (tokenAnterior) assert.throws(() => c.verificarToken(tokenAnterior), { name: 'JsonWebTokenError' });
      const login = await c.authService.loginMultiTenant({ email: 'a@example.invalid', senha: 'antiga123' });
      assert.equal(c.verificarToken(login.token).sub, '10');
      assert.equal((await c.autenticar(A)).avancou, true);
      chaveAnterior = atual;
      tokenAnterior = login.token;
    });
    assert.ok(process.env.JWT_SECRET === anterior, 'JWT_SECRET deve ser restaurado exatamente');
    assert.equal(Object.hasOwn(process.env, 'JWT_SECRET'), presente);
  }
});

test('preparações sobrepostas são recusadas sem mudar chave, cache ou mocks', async t => {
  const original = process.env.JWT_SECRET;
  await t.test('primeira preparação permanece funcional após recusa', async filho => {
    const c = preparar(filho);
    const chave = process.env.JWT_SECRET;
    const cache = require.cache[require.resolve('../src/middlewares/autenticacaoMiddleware')];
    const load = require('node:module')._load;
    assert.throws(() => preparar(filho), /Preparações BIGINT sobrepostas/);
    assert.ok(process.env.JWT_SECRET === chave);
    assert.strictEqual(require.cache[require.resolve('../src/middlewares/autenticacaoMiddleware')], cache);
    assert.strictEqual(require('node:module')._load, load);
    assert.equal((await c.autenticar(A)).avancou, true);
  });
  assert.ok(process.env.JWT_SECRET === original, 'Ambiente original deve ser restaurado');
  await t.test('nova preparação é permitida após finalizar a primeira', async filho => {
    assert.equal((await preparar(filho).autenticar(A)).avancou, true);
  });
  assert.ok(process.env.JWT_SECRET === original, 'Ambiente original deve ser restaurado');
});
