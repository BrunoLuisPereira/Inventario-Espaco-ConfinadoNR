import test from 'node:test'
import assert from 'node:assert/strict'
import { camposCaracterizacao, preencherCaracterizacao, prepararCaracterizacao, validarCaracterizacao } from '../src/services/caracterizacaoChecklist.js'

test('checklist antigo preenche os oito campos vazios e pode ser salvo', () => {
  const dados = preencherCaracterizacao({ criterio_a: 'SIM' })
  assert.equal(Object.keys(dados).length, 8)
  assert.ok(Object.values(dados).every(v => v === ''))
  assert.equal(validarCaracterizacao(dados), '')
  assert.ok(Object.values(prepararCaracterizacao(dados)).every(v => v === null))
})
test('edição preserva zero e precisão decimal; limpeza é enviada explicitamente', () => {
  const dados = preencherCaracterizacao({ codigo_identificacao: ' TG-01 ', volume_m3: '999999999999.999999', quantidade_aberturas: 0 })
  assert.equal(dados.quantidade_aberturas, 0)
  assert.equal(validarCaracterizacao(dados), '')
  const payload = prepararCaracterizacao(dados)
  assert.equal(payload.codigo_identificacao, 'TG-01')
  assert.equal(payload.volume_m3, '999999999999.999999')
  assert.equal(payload.quantidade_aberturas, 0)
  assert.equal(prepararCaracterizacao({ ...dados, volume_m3: '' }).volume_m3, null)
})
for (const valor of ['0', '-1', 'abc', 'Infinity', '1,5', '1e2', '1000000000000', '0.0000001']) {
  test(`volume inválido: ${valor}`, () => assert.match(validarCaracterizacao({ volume_m3: valor }), /volume/))
}
for (const valor of ['-1', '0.1', 'abc', '2147483648']) {
  test(`quantidade inválida: ${valor}`, () => assert.match(validarCaracterizacao({ quantidade_aberturas: valor }), /quantidade/))
}
for (const { nome, limite } of camposCaracterizacao.filter(c => c.limite)) {
  test(`limite descritivo de ${nome}`, () => {
    assert.equal(validarCaracterizacao({ [nome]: 'x'.repeat(limite) }), '')
    assert.match(validarCaracterizacao({ [nome]: 'x'.repeat(limite + 1) }), /máximo/)
  })
}
