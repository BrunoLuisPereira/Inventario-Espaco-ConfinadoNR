const test = require('node:test');
const assert = require('node:assert/strict');
const normalizar = require('../src/utils/normalizarIdDominio');
const { preparar, A } = require('./helpers/idsBigintSimulados.cjs');

for (const valor of [1, 10, Number.MAX_SAFE_INTEGER, '1', '10', '9007199254740991']) {
  test(`ID canônico seguro: ${JSON.stringify(valor)}`, () => {
    assert.strictEqual(normalizar(valor), Number(valor));
  });
}
const invalidos = [undefined, null, true, false, {}, [], [10], 10n,
  0, -0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1,
  '', '0', '-0', '-1', '+10', '010', ' 10', '10 ', '10\n', '10\r\n',
  '10\t', '1e1', '0xA', '0b10', '10.0', '1.5', 'NaN', 'Infinity',
  '9007199254740992', '9007199254740993', '999999999999999999999999999',
  A, '\u0661\u0660'];
invalidos.forEach((valor, i) => {
  test(`Representação inválida ${i + 1} é rejeitada sem arredondamento`, () => {
    assert.throws(() => normalizar(valor), /Identificador/);
  });
});
test('Não invoca coerção de objetos', () => {
  let chamadas = 0;
  const objeto = { valueOf() { chamadas++; return 10; }, toString() { chamadas++; return '10'; } };
  assert.throws(() => normalizar(objeto));
  assert.equal(chamadas, 0);
});

for (const id of [10, '10']) {
  test(`Login preserva o tipo público ${typeof id} e JWT sub textual`, async t => {
    const c = preparar(t, { loginIds: [id, id] });
    const r = await c.authService.loginMultiTenant({ email: 'a@example.invalid', senha: 'antiga123' });
    assert.strictEqual(r.usuario.id_usuario, id);
    assert.equal(r.usuario.id_ambiente, A);
    assert.strictEqual(c.usuarios[0].id_usuario, '10', 'não muta a origem');
    const claims = require('jsonwebtoken').decode(r.token);
    assert.strictEqual(claims.sub, '10');
  });
}
test('Download preserva referência e tipo dos IDs do registro autorizado', async t => {
  const c = preparar(t);
  Object.freeze(c.relatorios[0]);
  const service = c.carregar('services/relatorioMultiTenantService', {
    '../repositories/relatorioMultiTenantRepository': { async comRelatorioAutorizado(id, usuario, executar) {
      assert.equal(id, 7); assert.deepEqual(usuario, { id_usuario: 10, id_ambiente: A });
      return executar(c.relatorios[0]);
    } },
    './pdfService': {}, '../utils/relatorioArquivoUtils': c.utils,
  });
  const r = await service.obterPdfParaDownload('7', { id_usuario: 10, id_ambiente: A });
  assert.strictEqual(r.relatorio, c.relatorios[0]);
  assert.strictEqual(r.relatorio.id_relatorio, '7');
  assert.strictEqual(r.relatorio.id_local, '40');
});
