import test from 'node:test'
import assert from 'node:assert/strict'
import { tokenDoFragmento, validarNovaSenha } from '../src/services/recuperacaoSenha.js'
import { criarHttp } from '../src/services/http.js'

test('recebe token somente do fragmento e rejeita duplicatas e entradas malformadas', () => {
  const token = 'a'.repeat(64)
  assert.equal(tokenDoFragmento('#token=' + token), token)
  for (const f of ['', '?token=' + token, '#token=x', '#token=' + token + '&token=' + token]) assert.equal(tokenDoFragmento(f), '')
})
test('senha exige mínimo, confirmação e máximo de bytes compatível com bcrypt', () => {
  assert.equal(validarNovaSenha('Senha123!', 'Senha123!'), '')
  assert.notEqual(validarNovaSenha('curta', 'curta'), '')
  assert.notEqual(validarNovaSenha('Senha123!', 'Outra123!'), '')
  assert.notEqual(validarNovaSenha('á'.repeat(37), 'á'.repeat(37)), '')
  assert.equal(validarNovaSenha('á'.repeat(36), 'á'.repeat(36)), '')
})
test('solicitação mantém resposta genérica e redefinição envia token somente no body', async () => {
  const chamadas = []
  const request = criarHttp({ obterToken: () => null, expirar: () => assert.fail(), fetchImpl: async (url, options) => {
    chamadas.push({ url, options })
    return new Response(JSON.stringify({ status: 'success', message: 'Resposta genérica.' }), { status: 202 })
  } })
  const r = await request('/auth/recuperacao-senha', { method: 'POST', body: JSON.stringify({ email: 'a@example.invalid' }) })
  assert.equal(r.message, 'Resposta genérica.')
  const token = 'a'.repeat(64)
  await request('/auth/redefinir-senha', { method: 'POST', body: JSON.stringify({ token, novaSenha: 'Senha123!', confirmarSenha: 'Senha123!' }) })
  assert.ok(!chamadas[1].url.includes(token))
  assert.equal(JSON.parse(chamadas[1].options.body).token, token)
})
