import test from 'node:test'
import assert from 'node:assert/strict'
import { selecionarGeracaoPdf } from '../src/services/documentoPdf.js'
import { consultarPdfLocal } from '../src/services/pdfLocal.js'

const en = { id_geracao: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id_relatorio: 91, idioma: 'en' }
const pt = { ...en, id_geracao: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', idioma: 'pt-BR' }
test('seleção exige UUID, relatório e idioma, sem presumir idioma do legado', () => {
  const resposta = { data: { geracoes: [pt, { ...en, id_relatorio: 92 }, en], legado: { idioma: null } } }
  assert.equal(selecionarGeracaoPdf(resposta, '91', 'en'), en)
  assert.equal(selecionarGeracaoPdf(resposta, 91, 'pt-BR'), pt)
  assert.equal(selecionarGeracaoPdf({ data: { geracoes: [{ ...en, id_geracao: '../arquivo' }] } }, 91, 'en'), null)
  assert.equal(selecionarGeracaoPdf({ data: { legado: true } }, 91, 'en'), null)
})
test('disponibilidade HEAD e download referenciam geração exata no idioma ativo', async () => {
  const chamadas = []
  const api = {
    async buscarRelatorioPorLocal() { return { data: { id_local: 12, id_relatorio: 91 } } },
    async listarGeracoesPdf(id, idioma) { chamadas.push(['lista', id, idioma]); return { data: { geracoes: [pt, en] } } },
    async verificarPdfRelatorio(id, documento) { chamadas.push(['HEAD', id, documento]) },
  }
  assert.deepEqual(await consultarPdfLocal(12, api, () => true, 'en'), { estado: 'disponivel', idRelatorio: 91, documento: en })
  assert.deepEqual(chamadas, [['lista', 91, 'en'], ['HEAD', 91, en]])
  api.listarGeracoesPdf = async () => ({ data: { geracoes: [pt], legado: true } })
  assert.deepEqual(await consultarPdfLocal(12, api, () => true, 'en'), { estado: 'ausente' })
  assert.equal(chamadas.length, 2)
})
test('resposta pendente após troca de conta/idioma não confirma nem dispara HEAD', async () => {
  let atual = true, liberar, heads = 0
  const api = {
    async buscarRelatorioPorLocal() { return { data: { id_local: 12, id_relatorio: 91 } } },
    async listarGeracoesPdf() { return new Promise(resolve => { liberar = resolve }) },
    async verificarPdfRelatorio() { heads++ },
  }
  const consulta = consultarPdfLocal(12, api, () => atual, 'en')
  while (!liberar) await new Promise(resolve => setImmediate(resolve))
  atual = false; liberar({ data: { geracoes: [en] } })
  assert.equal(await consulta, null); assert.equal(heads, 0)
})
