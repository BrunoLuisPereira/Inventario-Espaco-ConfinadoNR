import test from 'node:test'
import assert from 'node:assert/strict'
import { criarHttp } from '../src/services/http.js'

test('429 no login preserva mensagem de espera e sessão válida existente', async () => {
  let expirada = false
  const mensagem = 'Muitas tentativas de login. Aguarde antes de tentar novamente.'
  const request = criarHttp({ obterToken: () => 'token-sintetico', expirar() { expirada = true },
    fetchImpl: async () => new Response(JSON.stringify({ status: 'error', message: mensagem }), { status: 429 }) })
  await assert.rejects(request('/auth/login', { method: 'POST', body: '{}' }), { status: 429, message: mensagem })
  assert.equal(expirada, false)
})
