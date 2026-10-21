import test from 'node:test'
import assert from 'node:assert/strict'
import { receberAuditoriaCompleta } from '../src/services/auditoriaExportacao.js'

const registro = i => ({ id_auditoria: String(i), id_usuario_afetado: 2, id_usuario_responsavel: 1, nome_usuario: 'Márcia; "A"', nome_responsavel: '=1+1', perfil_anterior: 'COORDENADOR', perfil_novo: 'SUPERVISOR', data_hora: '2026-10-20T23:57:53Z' })
function frames(n) {
  const linhas = []
  for (let i = 0; i < n; i += 500) linhas.push({ tipo: 'lote', registros: Array.from({ length: Math.min(500, n - i) }, (_, j) => registro(n - i - j)) })
  linhas.push({ tipo: 'fim', total: String(n) })
  return linhas
}
function resposta(linhas, { truncado = false, erroRede = false, pedaço = 71 } = {}) {
  const bytes = new TextEncoder().encode(linhas.map(l => JSON.stringify(l)).join('\n') + (truncado ? '' : '\n'))
  let i = 0
  return new Response(new ReadableStream({ pull(c) {
    if (i === bytes.length) { if (erroRede) c.error(Error('SQL_NAO_PUBLICAR')); else c.close(); return }
    c.enqueue(bytes.slice(i, i + pedaço)); i = Math.min(bytes.length, i + pedaço)
  } }), { headers: { 'Content-Type': 'application/x-ndjson' } })
}
for (const n of [0, 1, 9, 200, 201, 501, 5007]) test('exporta todos os ' + n + ' registros em lotes e somente após conclusão', async () => {
  let chamadas = 0
  const r = await receberAuditoriaCompleta({ obterToken: () => 'FIXTURE', fetchImpl: async (url, options) => {
    chamadas++; assert.equal(url, '/api/usuarios/auditoria/perfis/exportar'); assert.equal(options.headers.Authorization, 'Bearer FIXTURE');
    return resposta(frames(n))
  } })
  assert.equal(chamadas, 1); assert.equal(r.total, String(n))
  const csv = await r.blob.text()
  assert.equal(csv.split('\r\n').length, n + 2)
  assert.deepEqual([...new Uint8Array(await r.blob.arrayBuffer()).slice(0, 3)], [239, 187, 191])
  if (n) { assert.ok(csv.includes('"Márcia; ""A"""')); assert.ok(csv.includes('"\'=1+1"')) }
})
for (const [nome, linhas, opcoes] of [
  ['sem confirmação final', frames(501).slice(0, -1)],
  ['total divergente', [...frames(1).slice(0, -1), { tipo: 'fim', total: '2' }]],
  ['total coercível', [{ tipo: 'fim', total: 0 }]],
  ['confirmação duplicada', [...frames(0), ...frames(0)]],
  ['lote após confirmação', [...frames(0), frames(1)[0]]],
  ['lote maior que contrato', [{ tipo: 'lote', registros: Array(501).fill(registro(1)) }, { tipo: 'fim', total: '501' }]],
  ['frame final truncado', frames(1), { truncado: true }],
  ['erro de transporte mesmo após fim', frames(1), { erroRede: true }],
  ['erro de servidor no meio', [frames(1)[0], { tipo: 'erro', message: 'SQL_SECRETO' }]],
]) test('nunca retorna Blob parcial: ' + nome, async () => {
  await assert.rejects(receberAuditoriaCompleta({ obterToken: () => 'FIXTURE', fetchImpl: async () => resposta(linhas, opcoes) }), e => {
    assert.equal(e.message.includes('SQL'), false); assert.match(e.message, /incompleta/); return true
  })
})
for (const status of [401, 403, 500]) test('nega HTTP ' + status + ' sem refletir mensagens técnicas', async () => {
  await assert.rejects(receberAuditoriaCompleta({ obterToken: () => 'FIXTURE', fetchImpl: async () => new Response('SQL_SEGREDO', { status }) }), e => {
    assert.equal(e.message.includes('SEGREDO'), false); return true
  })
})
test('troca de sessão e cancelamento impedem a entrega de um Blob', async () => {
  let token = 'A'
  await assert.rejects(receberAuditoriaCompleta({ obterToken: () => token, fetchImpl: async () => { token = 'B'; return resposta(frames(1)) } }))
  const abortar = new AbortController(); abortar.abort()
  let rede = false
  await assert.rejects(receberAuditoriaCompleta({ obterToken: () => 'A', signal: abortar.signal, fetchImpl: async () => { rede = true } }))
  assert.equal(rede, false)
})
