import test from 'node:test'
import assert from 'node:assert/strict'
import { consultarPdfLocal } from '../src/services/pdfLocal.js'

function apiFixture(relatorio, status) {
  const chamadas = []
  return { chamadas,
    async buscarRelatorioPorLocal(id) { chamadas.push(['consulta', id]); return { data: relatorio } },
    async verificarPdfRelatorio(id) { chamadas.push(['HEAD', id]); if (status) throw Object.assign(Error(), { status }) },
  }
}
test('arquivo confirmado habilita PDF mesmo sem depender do status do inventario', async () => {
  const api = apiFixture({ id_local: '12', id_relatorio: 91, caminho_pdf: 'uploads/relatorios/fixture.pdf', status: 'RASCUNHO' })
  assert.deepEqual(await consultarPdfLocal(12, api), { estado: 'disponivel', idRelatorio: 91 })
  assert.deepEqual(api.chamadas, [['consulta', 12], ['HEAD', 91]])
})
for (const relatorio of [null, { id_local: 12, id_relatorio: 91, status: 'GERADO' },
  { id_local: 12, id_relatorio: 91, caminho_pdf: ' ' }, { id_local: 13, id_relatorio: 91, caminho_pdf: 'fixture.pdf' }]) {
  test('metadados sem PDF ou de outro local nunca habilitam nem consultam arquivo: '+JSON.stringify(relatorio), async () => {
    const api = apiFixture(relatorio)
    assert.deepEqual(await consultarPdfLocal(12, api), { estado: 'ausente' })
    assert.equal(api.chamadas.length, 1)
  })
}
for (const [status, esperado] of [[404, 'ausente'], [403, 'nao-autorizado'], [500, 'erro'], [503, 'erro']]) {
  test('HEAD '+status+' mantem botao indisponivel', async () => {
    const api = apiFixture({ id_local: 12, id_relatorio: 91, caminho_pdf: 'fixture.pdf' }, status)
    assert.deepEqual(await consultarPdfLocal(12, api), { estado: esperado })
  })
}
test('relatorio inexistente (404) nao causa geracao ou consulta do arquivo', async () => {
  const api = { async buscarRelatorioPorLocal() { throw Object.assign(Error(), { status: 404 }) },
    verificarPdfRelatorio() { throw Error('Nao deve consultar arquivo') } }
  assert.deepEqual(await consultarPdfLocal(12, api), { estado: 'ausente' })
})
test('consultas canceladas e linhas desmontadas nao disparam HEAD', async () => {
  const api = apiFixture(null)
  assert.equal(await consultarPdfLocal(12, api, () => false), null)
  assert.equal(api.chamadas.length, 0)
  let atual = true
  api.buscarRelatorioPorLocal = async () => { atual = false; return { data: { id_local: 12, id_relatorio: 91, caminho_pdf: 'fixture.pdf' } } }
  assert.equal(await consultarPdfLocal(12, api, () => atual), null)
  assert.equal(api.chamadas.length, 0)
})
test('no maximo quatro locais em consulta simultanea', async () => {
  let ativos = 0, maximo = 0
  const api = { async buscarRelatorioPorLocal(id) {
    ativos++; maximo = Math.max(maximo, ativos)
    await new Promise(resolve => setTimeout(resolve, 5)); ativos--
    return { data: { id_local: id, id_relatorio: id, caminho_pdf: 'fixture.pdf' } }
  }, async verificarPdfRelatorio() {} }
  assert.ok((await Promise.all(Array.from({ length: 15 }, (_, i) => consultarPdfLocal(i+1, api)))).every(r => r.estado === 'disponivel'))
  assert.equal(maximo, 4)
})
