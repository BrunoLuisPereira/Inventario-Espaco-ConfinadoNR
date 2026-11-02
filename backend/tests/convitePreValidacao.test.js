const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const pool = require('../src/config/database');
const service = require('../src/services/conviteService');
const token = 'a'.repeat(64);
const valido = { id_ambiente: 'ambiente-interno', email: 'privado@example.invalid',
  perfil_acesso: 'ENGENHEIRO_SEGURANCA', data_aceite: null, data_cancelamento: null,
  nao_expirado: true, ambiente_ativo: true };

function banco(t, convite = valido, falha) {
  const query = t.mock.fn(async (sql, parametros) => {
    assert.match(sql.trim(), /^SELECT/);
    assert.doesNotMatch(sql, /FOR UPDATE|FOR SHARE|INSERT|UPDATE convite|DELETE/);
    assert.deepEqual(parametros, [crypto.createHash('sha256').update(token).digest('hex')]);
    if (falha) throw falha;
    return { rows: convite ? [{ ...convite }] : [] };
  });
  const release = t.mock.fn();
  const connect = t.mock.method(pool, 'connect', async () => ({ query, release }));
  return { query, release, connect };
}

test('pré-validação repetida não consome nem retorna metadados do convite', async t => {
  const b = banco(t);
  for (let i = 0; i < 2; i++) assert.deepEqual(await service.preValidarConvite(token), { valido: true });
  assert.equal(b.query.mock.callCount(), 2);
  assert.equal(b.release.mock.callCount(), 2);
});

test('token malformado não acessa banco', async t => {
  const b = banco(t);
  for (const entrada of [undefined, null, {}, 'x', 'A'.repeat(64)]) {
    await assert.rejects(service.preValidarConvite(entrada), { statusCode: 400 });
  }
  assert.equal(b.connect.mock.callCount(), 0);
});

for (const [nome, convite, status, mensagem] of [
  ['desconhecido', null, 404, /inválido/],
  ['expirado', { ...valido, nao_expirado: false }, 410, /expirou/],
  ['cancelado', { ...valido, data_cancelamento: 'data' }, 409, /cancelado/],
  ['utilizado', { ...valido, data_aceite: 'data' }, 409, /utilizado/],
  ['inativo', { ...valido, ambiente_ativo: false }, 403, /inativo/],
  ['administrativo histórico', { ...valido, perfil_acesso: 'ADMINISTRADOR' }, 409, /perfil/],
]) test('pré-validação rejeita ' + nome + ' e libera conexão', async t => {
  const b = banco(t, convite);
  await assert.rejects(service.preValidarConvite(token), e => e.statusCode === status && mensagem.test(e.message));
  assert.equal(b.release.mock.callCount(), 1);
});

for (const entrada of ['padrao', 'laboratorio']) test('HTTP público integrado ao app ' + entrada, async t => {
  const b = banco(t);
  const app = entrada === 'padrao' ? require('../src/app') :
    require('../laboratorio/app.cjs').criarApp('inventario_nr33_multitenant_dev');
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const chamar = async () => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/convites/validar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    });
    return { status: r.status, body: await r.json() };
  };
  assert.deepEqual(await chamar(), { status: 200, body: { status: 'success', data: { valido: true } } });
  for (const [estado, texto, status] of [
    [{ ...valido, nao_expirado: false }, 'expirou', 410],
    [{ ...valido, data_cancelamento: 'data' }, 'cancelado', 409],
    [{ ...valido, data_aceite: 'data' }, 'utilizado', 409],
    [null, 'inválido', 404],
  ]) {
    b.query.mock.mockImplementation(async () => ({ rows: estado ? [estado] : [] }));
    const r = await chamar();
    assert.equal(r.status, status);
    assert.ok(r.body.message.includes(texto));
    assert.deepEqual(Object.keys(r.body).sort(), ['message', 'status']);
  }
  b.query.mock.mockImplementation(async () => { throw Object.assign(new Error('DETALHE_INTERNO'), { code: 'SQL' }); });
  const falha = await chamar();
  assert.equal(falha.status, 500);
  assert.ok(!JSON.stringify(falha).includes('DETALHE_INTERNO'));
  assert.equal(b.release.mock.callCount(), 6);
});
