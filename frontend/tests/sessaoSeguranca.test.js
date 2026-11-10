import test from 'node:test'
import assert from 'node:assert/strict'
import matriz from '../../shared/permissoes.json' with { type: 'json' }
import { criarSessao, validarSessao } from '../src/services/sessao.js'
import { podeAdministrar } from '../src/services/conta.js'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const entrada = (usuario = {}, token = 'token-sintetico') => ({ token, usuario: {
  id_usuario: '10', id_ambiente: A, nome: 'João 李 🧑🏽', email: 'pessoa@example.invalid',
  perfil_acesso: 'ADMINISTRADOR', eh_fundador: true, ...usuario,
} })
function memoria() {
  const itens = new Map()
  return { itens, getItem: k => itens.get(k) ?? null, setItem: (k, v) => itens.set(k, String(v)), removeItem: k => itens.delete(k) }
}

for (const perfil of matriz.perfis) for (const idioma of ['pt-BR', 'en']) {
  test(`projeta ${perfil}/${idioma} e mantém permissões`, () => {
    const dado = entrada({ perfil_acesso: perfil, eh_fundador: perfil === 'ADMINISTRADOR', idioma, nome_ambiente: 'São José / Company 李' })
    const seguro = validarSessao(dado)
    assert.deepEqual(seguro, dado)
    assert.notStrictEqual(seguro.usuario, dado.usuario)
    assert.equal(podeAdministrar(seguro.usuario), perfil === 'ADMINISTRADOR')
    assert.ok(Object.isFrozen(seguro.usuario))
    const storage = memoria(), sessao = criarSessao(storage)
    assert.deepEqual(sessao.salvar(dado), sessao.ler())
  })
}
for (const id of [1, Number.MAX_SAFE_INTEGER, '1', '9007199254740991']) {
  test(`preserva ID seguro ${typeof id}/${id}`, () => assert.strictEqual(validarSessao(entrada({ id_usuario: id })).usuario.id_usuario, id))
}
for (const id of [null, undefined, true, {}, [], 1n, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1,
  '', '0', '01', '-1', '+1', ' 1', '1 ', '1e1', '0x10', '1.0', '9007199254740992', '1'.repeat(500)]) {
  test(`recusa ID inválido ${typeof id}/${String(id)}`, () => assert.throws(() => validarSessao(entrada({ id_usuario: id }))))
}
for (const [campo, valores] of [
  ['id_ambiente', [null, 1, {}, A + '\n', 'outro', '11111111-1111-4111-8111']],
  ['nome', [null, 1, {}, [], '', ' ', 'a'.repeat(121)]],
  ['email', [null, 1, {}, [], '', ' ', 'a'.repeat(181)]],
  ['perfil_acesso', [null, 1, {}, [], 'MASTER', 'administrador']],
  ['eh_fundador', [null, undefined, 'true', 'false', 0, 1, {}, []]],
  ['idioma', [null, 1, {}, [], 'pt', 'EN', 'en-US']],
  ['nome_ambiente', [null, 1, {}, [], '', ' ', 'a'.repeat(181)]],
]) for (const [i, valor] of valores.entries()) {
  test(`recusa ${campo} malformado ${i}`, () => assert.throws(() => validarSessao(entrada({ [campo]: valor }))))
}
for (const token of [null, undefined, 1, {}, [], '', ' ', 'token com espaço', 'token\n', 'x'.repeat(8193)]) {
  test(`recusa token malformado ${typeof token}/${String(token).length}`, () => {
    assert.throws(() => validarSessao({ ...entrada(), token }))
  })
}
for (const valor of [null, undefined, [], 'texto', new Date(), Object.create({ token: 'sintetico' })]) {
  test(`recusa estrutura de sessão ${Object.prototype.toString.call(valor)}`, () => assert.throws(() => validarSessao(valor)))
}
test('descarta propriedades inesperadas sem executar getters nem copiar protótipos', () => {
  const dado = entrada({ ativo: true, data_criacao: 'não persistir', senha_hash: 'não persistir', privilegio: 'não persistir' })
  Object.defineProperty(dado.usuario, 'surpresa', { enumerable: true, get() { throw new Error('Getter desconhecido executado') } })
  const extra = JSON.parse('{"__proto__":{"administrador":true},"constructor":"descartar","prototype":"descartar"}')
  Object.defineProperties(dado.usuario, Object.getOwnPropertyDescriptors(extra))
  const seguro = validarSessao(dado)
  assert.deepEqual(Object.keys(seguro.usuario).sort(), ['id_usuario', 'id_ambiente', 'nome', 'email', 'perfil_acesso', 'eh_fundador'].sort())
  assert.equal(Object.getPrototypeOf(seguro.usuario), Object.prototype)
  assert.equal({}.administrador, undefined)
  let acessos = 0
  Object.defineProperty(dado.usuario, 'nome', { get() { acessos++; return 'Não executar' } })
  assert.throws(() => validarSessao(dado))
  assert.equal(acessos, 0)
})
test('opcionais ausentes, nomes Unicode e tokens demo preservam contrato', () => {
  const dado = entrada({ nome: 'Á'.repeat(120), email: 'e'.repeat(180) }, 'demo-1234')
  const seguro = validarSessao(dado)
  assert.deepEqual(seguro, dado)
  assert.equal(Object.hasOwn(seguro.usuario, 'idioma'), false)
  assert.equal(Object.hasOwn(seguro.usuario, 'nome_ambiente'), false)
  assert.equal(validarSessao(entrada({ nome_ambiente: '名'.repeat(180) })).usuario.nome_ambiente.length, 180)
})
test('storage inválido ou adulterado falha fechado e não publica campos desconhecidos', () => {
  const storage = memoria(), sessao = criarSessao(storage)
  storage.setItem('token', 'sintetico')
  for (const texto of ['{inválido', 'null', '[]', '{}', 'x'.repeat(8193), JSON.stringify(entrada({ eh_fundador: 'false' }).usuario)]) {
    storage.setItem('usuario', texto)
    assert.deepEqual(sessao.ler(), { token: null, usuario: null })
  }
  storage.setItem('usuario', JSON.stringify(entrada({ ativo: true, surpresa: 'descartar' }).usuario))
  assert.deepEqual(sessao.ler(), { ...entrada(), token: 'sintetico' })
})
for (const [metodo, chamada] of [['getItem', 1], ['getItem', 2], ['removeItem', 1], ['setItem', 1], ['setItem', 2]]) {
  test(`falha de storage em ${metodo}/${chamada} preserva o par anterior`, t => {
    const storage = memoria(), sessao = criarSessao(storage)
    const anterior = sessao.salvar(entrada())
    storage.setItem('tema', 'escuro')
    const foto = new Map(storage.itens)
    const original = storage[metodo]
    let chamadas = 0
    t.mock.method(storage, metodo, (...args) => {
      if (++chamadas === chamada) throw new Error('Falha sintética')
      return original(...args)
    })
    assert.throws(() => sessao.salvar(entrada({ id_usuario: 20, id_ambiente: B }, 'outro-token')), /salvar a sessão/)
    assert.deepEqual(storage.itens, foto)
    assert.deepEqual(sessao.ler(), anterior)
  })
}
test('falha permanente de gravação deixa token ausente se rollback não é possível', t => {
  const storage = memoria(), sessao = criarSessao(storage)
  sessao.salvar(entrada())
  storage.setItem('nr33:idioma:v1:pendente', 'preservar')
  t.mock.method(storage, 'setItem', () => { throw new Error('Quota sintética') })
  assert.throws(() => sessao.salvar(entrada({}, 'novo')), /salvar a sessão/)
  assert.equal(storage.getItem('token'), null)
  assert.deepEqual(sessao.ler(), { token: null, usuario: null })
  assert.equal(storage.getItem('nr33:idioma:v1:pendente'), 'preservar')
})
test('valida antes de escrever; real/demo e preferências de ambientes permanecem isolados', () => {
  const storage = memoria(), real = criarSessao(storage), demo = criarSessao(storage, 'nr33-demo:')
  real.salvar(entrada())
  demo.salvar(entrada({ id_usuario: 20, id_ambiente: B, idioma: 'en' }, 'demo-sintetico'))
  storage.setItem(`nr33:idioma:v1:${A}:10`, 'pendente-A')
  storage.setItem(`nr33-demo:idioma:v1:${B}:20`, 'pendente-B')
  const foto = new Map(storage.itens)
  assert.throws(() => real.salvar(entrada({ perfil_acesso: 'MASTER' })))
  assert.deepEqual(storage.itens, foto)
  assert.equal(real.ler().usuario.id_ambiente, A)
  assert.equal(demo.ler().usuario.id_ambiente, B)
  demo.limpar()
  assert.equal(real.ler().token, 'token-sintetico')
  assert.equal(storage.getItem(`nr33-demo:idioma:v1:${B}:20`), 'pendente-B')
})
