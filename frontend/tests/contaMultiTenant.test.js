import test from 'node:test'
import assert from 'node:assert/strict'
import { validarCadastro, podeAdministrar, linkConvite } from '../src/services/conta.js'
import { criarHttp } from '../src/services/http.js'
const dados = { nome: 'Pessoa sintética', nome_ambiente: 'Empresa A', email: 'a@example.invalid', senha: 'senha-ficticia', confirmacao: 'senha-ficticia' }
test('cadastro valido e confirmacao de senha', () => {
  assert.equal(validarCadastro(dados), '')
  assert.match(validarCadastro({ ...dados, confirmacao: 'outra' }), /confirmação/)
})
for (const [campo, valor] of [['nome', ''], ['nome', 'x'.repeat(121)], ['nome_ambiente', ' '], ['nome_ambiente', 'x'.repeat(181)], ['email', 'invalido'], ['senha', 'curta']]) {
  test('recusa campo invalido: ' + campo + '/' + String(valor).length, () => assert.notEqual(validarCadastro({ ...dados, [campo]: valor }), ''))
}
test('convite dispensa empresa e email, mas exige token valido', () => {
  const entrada = { ...dados, nome_ambiente: '', email: '', token: 'a'.repeat(64) }
  assert.equal(validarCadastro(entrada, true), '')
  assert.notEqual(validarCadastro({ ...entrada, token: 'invalido' }, true), '')
})
test('menus administrativos exigem perfil administrativo atual', () => {
  assert.equal(podeAdministrar({ perfil_acesso: 'ADMINISTRADOR' }), true)
  for (const u of [null, {}, { perfil_acesso: 'ENGENHEIRO_SEGURANCA' }, { perfil_acesso: 'MASTER' }]) assert.equal(podeAdministrar(u), false)
})
test('token de convite permanece no fragmento, fora do caminho e query HTTP', () => {
  const url = new URL(linkConvite('http://127.0.0.1:5174', 'a'.repeat(64)))
  assert.equal(url.pathname, '/convites/aceitar'); assert.equal(url.search, ''); assert.equal(url.hash, '#token=' + 'a'.repeat(64))
  assert.throws(() => linkConvite(url.origin, 'invalido'))
})
test('API real indisponivel nao cai na demonstracao', async () => {
  const request = criarHttp({ obterToken: () => null, expirar() {}, fetchImpl: async () => { throw Error('offline') } })
  await assert.rejects(request('/cadastro/ambiente'), /Não foi possível conectar/)
})
