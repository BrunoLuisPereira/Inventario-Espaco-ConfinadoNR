import test from 'node:test'
import assert from 'node:assert/strict'
import { prepararLocais, consultarLocais } from '../src/services/locaisTabela.js'

const campanhas = [{ id_campanha: 1, nome_campanha: 'Inspeção anual' }, { id_campanha: '2', nome_campanha: 'Manutenção' }]
const originais = [
  { id_local: 1, id_campanha: '1', nome_local: 'Tanque 10', setor: 'Produção', status: 'ATIVO' },
  { id_local: 2, id_campanha: 1, nome_local: 'Tanque 2', setor: 'Oficina', status: 'INATIVO' },
  { id_local: 3, id_campanha: 2, nome_local: 'Poço', setor: null, status: 'ATIVO' },
]
const dados = prepararLocais(originais, campanhas)
test('associa campanhas retornadas e preserva IDs, GPS e originais', () => {
  assert.equal(dados[0].nome_campanha, 'Inspeção anual')
  assert.equal(dados[2].nome_campanha, 'Manutenção')
  assert.equal(dados[0].id_campanha, '1'); assert.equal(originais[0].nome_campanha, undefined)
  assert.equal(prepararLocais([{ latitude: 0, longitude: 0 }], [])[0].latitude, 0)
})
test('dados inválidos não se tornam lista vazia', () => {
  for (const invalido of [null, {}, undefined]) {
    assert.throws(() => prepararLocais(invalido, campanhas))
    assert.throws(() => prepararLocais(originais, invalido))
  }
})
test('lista vazia tem contagens corretas', () => {
  assert.deepEqual(consultarLocais([]), { registros: [], total: 0, pagina: 1, paginas: 1, inicio: 0, fim: 0 })
})
for (const [busca, esperado] of [['tanque', 2], ['producao', 1], ['INSPECAO', 2], ['manutenção', 1], ['ausente', 0]]) {
  test('pesquisa nome, setor e campanha: ' + busca, () => assert.equal(consultarLocais(dados, { busca }).total, esperado))
}
test('filtros e pesquisa se combinam', () => {
  assert.deepEqual(consultarLocais(dados, { busca: 'tanque', campanha: 1, situacao: 'INATIVO' }).registros.map(l => l.id_local), [2])
  assert.equal(consultarLocais(dados, { campanha: 2, situacao: 'INATIVO' }).total, 0)
})
test('ordena nome numericamente, campanha e setor nas duas direções sem mutação', () => {
  const ids = dados.map(l => l.id_local)
  assert.deepEqual(consultarLocais(dados).registros.map(l => l.id_local), [3, 2, 1])
  for (const campo of ['nome_local', 'nome_campanha', 'setor']) {
    const asc = consultarLocais(dados, { campo }).registros.map(l => l[campo])
    const desc = consultarLocais(dados, { campo, direcao: 'desc' }).registros.map(l => l[campo])
    assert.deepEqual(desc, asc.reverse())
  }
  assert.deepEqual(dados.map(l => l.id_local), ids)
})
test('paginação 10/25/50 e última página preservam total completo', () => {
  const lista = Array.from({ length: 57 }, (_, i) => ({ id_local: i + 1, nome_local: 'Local ' + (i + 1) }))
  for (const tamanho of [10, 25, 50]) {
    const r = consultarLocais(lista, { tamanho, pagina: 2 })
    assert.equal(r.total, 57); assert.equal(r.inicio, tamanho + 1)
    assert.equal(r.registros.length, Math.min(tamanho, 57 - tamanho))
  }
  const fim = consultarLocais(lista, { pagina: 99 })
  assert.equal(fim.pagina, 6); assert.equal(fim.fim, 57); assert.equal(fim.registros.length, 7)
})
test('não fabrica andamento de inventário', () => {
  assert.equal(Object.hasOwn(dados[0], 'progresso'), false)
  assert.equal(Object.hasOwn(dados[0], 'inventario'), false)
})
