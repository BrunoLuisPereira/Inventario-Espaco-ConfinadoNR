import test from 'node:test'
import assert from 'node:assert/strict'
import { indicadoresCampanhas } from '../src/services/dashboardIndicadores.js'

test('sem canceladas retorna zero', () => {
  assert.deepEqual(indicadoresCampanhas([{ status: 'EM ANDAMENTO' }, { status: 'CONCLUIDO' }]), {
    totalCampanhas: 2, campanhasEmAndamento: 1, campanhasConcluidas: 1, campanhasCanceladas: 0,
  })
})
for (const quantidade of [1, 3]) test('conta ' + quantidade + ' campanhas canceladas', () => {
  assert.equal(indicadoresCampanhas(Array.from({ length: quantidade }, () => ({ status: 'CANCELADA' }))).campanhasCanceladas, quantidade)
})
test('contagens independentes e total incluem outros status sem reclassificar', () => {
  const dados = ['EM ANDAMENTO', 'EM ANDAMENTO', 'CONCLUIDO', 'CANCELADA', 'CANCELADA', 'OUTRO', null].map(status => ({ status }))
  const antes = structuredClone(dados)
  assert.deepEqual(indicadoresCampanhas(dados), {
    totalCampanhas: 7, campanhasEmAndamento: 2, campanhasConcluidas: 1, campanhasCanceladas: 2,
  })
  assert.deepEqual(dados, antes)
})
test('lista vazia mantém todos os indicadores zerados', () => {
  assert.deepEqual(indicadoresCampanhas([]), { totalCampanhas: 0, campanhasEmAndamento: 0, campanhasConcluidas: 0, campanhasCanceladas: 0 })
})
test('resposta ausente ou inválida lança erro em vez de fabricar zeros', () => {
  for (const dados of [null, undefined, {}, 'erro']) assert.throws(() => indicadoresCampanhas(dados))
})
