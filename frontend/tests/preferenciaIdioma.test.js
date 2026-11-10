import test from 'node:test'
import assert from 'node:assert/strict'
import { criarPreferenciaIdioma, capturarConsultaIdioma } from '../src/services/preferenciaIdioma.js'

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222'
const sessao = (id = 1, ambiente = A, idioma = 'pt-BR', token = `token-${id}`) =>
  ({ token, usuario: { id_usuario: id, id_ambiente: ambiente, idioma } })
function contexto() {
  const itens = new Map(), chamadas = []
  const storage = { getItem: k => itens.get(k) || null, setItem: (k, v) => itens.set(k, v) }
  let atual = sessao(), conectado = false, idioma, revisao = 0
  let transporte = async (valor, s) => ({ data: { id_usuario: s.id_usuario, id_ambiente: s.id_ambiente, idioma: valor } })
  const criar = () => criarPreferenciaIdioma({ storage, obterSessao: () => atual,
    online: () => conectado, aplicar: v => { idioma = v }, novaRevisao: () => String(++revisao),
    enviar: async (valor, s) => { chamadas.push({ valor, ...s }); return transporte(valor, s) },
  })
  return { criar, storage, itens, chamadas, idioma: () => idioma,
    trocar: s => { atual = s }, atual: () => atual, conectar: () => { conectado = true },
    transporte: fn => { transporte = fn },
  }
}
const concluir = () => new Promise(resolve => setImmediate(resolve))

test('preferências independentes por usuário e ambiente, sem chave de e-mail', () => {
  const c = contexto(), p = c.criar()
  p.ativar(c.atual()); p.alterar('en')
  c.trocar(sessao(2)); p.ativar(c.atual()); assert.equal(c.idioma(), 'pt-BR')
  c.trocar(sessao(1, B)); p.ativar(c.atual()); assert.equal(c.idioma(), 'pt-BR')
  c.trocar(sessao()); p.ativar(c.atual()); assert.equal(c.idioma(), 'en')
  assert.equal(c.itens.size, 3)
  assert.ok([...c.itens.keys()].every(k => !k.includes('@')))
})
test('recarga, login novo e revalidação preservam edição offline pendente', async () => {
  const c = contexto(), p = c.criar()
  p.ativar(c.atual()); p.alterar('en')
  const recarga = c.criar()
  recarga.ativar(c.atual(), false)
  assert.equal(c.idioma(), 'en')
  c.conectar(); await recarga.sincronizar()
  assert.equal(c.chamadas.length, 0, 'snapshot não revalida autenticação')
  c.trocar(sessao(1, A, 'pt-BR', 'novo-token'))
  recarga.ativar(c.atual())
  await concluir()
  assert.equal(c.idioma(), 'en'); assert.equal(recarga.estado().pendente, false)
  recarga.ativar({ ...c.atual(), usuario: { ...c.atual().usuario, idioma: 'pt-BR' } })
  assert.equal(c.idioma(), 'en', 'resposta de perfil antiga não sobrescreve escolha')
  c.trocar(sessao(1, A, 'en', 'terceiro-token'))
  const login = c.criar(); login.ativar(c.atual())
  assert.equal(c.idioma(), 'en')
})
test('reconexão envia somente a preferência da conta ativa', async () => {
  const c = contexto(), p = c.criar()
  p.ativar(c.atual()); p.alterar('en')
  c.trocar(sessao(2)); p.ativar(c.atual())
  c.conectar(); await p.sincronizar()
  assert.equal(c.chamadas.length, 0)
  c.trocar(sessao(1, A, 'pt-BR', 'token-novo')); p.ativar(c.atual())
  await concluir()
  assert.equal(c.chamadas.length, 1)
  assert.equal(c.chamadas[0].id_usuario, '1'); assert.equal(c.chamadas[0].token, 'token-novo')
  assert.equal(p.estado().pendente, false)
})
test('logout durante envio e resposta antiga não limpam pendência nem alteram conta nova', async () => {
  const c = contexto(), p = c.criar()
  let resolver
  c.transporte((valor, s) => new Promise(resolve => { resolver = () => resolve({ data: { ...s, idioma: valor } }) }))
  c.conectar(); p.ativar(c.atual()); p.alterar('en')
  c.trocar(null) // Mesmo antes de o React processar o logout.
  resolver(); await concluir()
  assert.ok([...c.itens.values()].some(v => JSON.parse(v).pendente))
  p.ativar(null); assert.equal(c.idioma(), 'pt-BR')
  c.trocar(sessao(2)); p.ativar(c.atual())
  assert.equal(c.idioma(), 'pt-BR'); assert.equal(p.estado().pendente, false)
})
test('troca de conta durante envio descarta confirmação da conta anterior', async () => {
  const c = contexto(), p = c.criar()
  let resolver
  c.transporte((valor, s) => new Promise(resolve => { resolver = () => resolve({ data: { ...s, idioma: valor } }) }))
  c.conectar(); p.ativar(c.atual()); p.alterar('en')
  c.trocar(sessao(2)); p.ativar(c.atual())
  resolver(); await concluir()
  assert.equal(c.idioma(), 'pt-BR')
  assert.equal(p.estado().pendente, false)
})
test('edições rápidas são serializadas e confirmação antiga não apaga edição nova', async () => {
  const c = contexto(), p = c.criar(), pendentes = []
  c.transporte((valor, s) => new Promise(resolve => pendentes.push(() => resolve({ data: { ...s, idioma: valor } }))))
  c.conectar(); p.ativar(c.atual()); p.alterar('en'); p.alterar('pt-BR')
  assert.equal(c.chamadas.length, 1)
  pendentes.shift()(); await concluir()
  assert.equal(c.idioma(), 'pt-BR'); assert.equal(p.estado().pendente, true)
  assert.equal(c.chamadas.length, 2)
  pendentes.shift()(); await concluir()
  assert.equal(p.estado().pendente, false)
})
test('falha de rede mantém pendência; nova tentativa confirma sem recarregar formulário', async () => {
  const c = contexto(), p = c.criar()
  c.conectar(); c.transporte(async () => { throw Error('offline') })
  p.ativar(c.atual()); p.alterar('en'); await concluir()
  assert.equal(c.idioma(), 'en'); assert.equal(p.estado().erro, true)
  c.transporte(async (idioma, s) => ({ data: { ...s, idioma } }))
  await p.sincronizar()
  assert.equal(p.estado().pendente, false)
})
test('resposta inválida ou de outro usuário não confirma gravação', async () => {
  const c = contexto(), p = c.criar()
  c.conectar(); c.transporte(async () => ({ data: { id_usuario: 2, id_ambiente: B, idioma: 'en' } }))
  p.ativar(c.atual()); p.alterar('en'); await concluir()
  assert.equal(p.estado().pendente, true); assert.equal(p.estado().erro, true)
})
test('idioma ausente/inválido e armazenamento corrompido usam português', () => {
  for (const valor of [undefined, null, 'fr', {}, ['en']]) {
    const c = contexto(), p = c.criar()
    c.storage.setItem(`nr33:idioma:v1:${A}:1`, 'INVALIDO')
    c.trocar(sessao(1, A, valor)); p.ativar(c.atual())
    assert.equal(c.idioma(), 'pt-BR')
    p.alterar(valor); assert.equal(c.idioma(), 'pt-BR')
  }
})
test('mudança de sessão em outra aba impede envio até reativação validada', async () => {
  const c = contexto(), p = c.criar()
  p.ativar(c.atual()); p.alterar('en'); c.trocar(sessao(2)); c.conectar()
  await p.sincronizar(); assert.equal(c.chamadas.length, 0)
  p.atualizarLocal(); assert.equal(c.idioma(), 'pt-BR')
})

test('revalidação recente restaura preferência do servidor sem sobrescrever edição posterior', async () => {
  const c = contexto(), p = c.criar()
  p.ativar(c.atual())
  const recente = capturarConsultaIdioma(c.storage, c.atual())
  p.ativar(sessao(1, A, 'en'), true, recente)
  assert.equal(c.idioma(), 'en')
  const antiga = capturarConsultaIdioma(c.storage, c.atual())
  p.alterar('pt-BR')
  c.conectar(); await p.sincronizar()
  p.ativar(sessao(1, A, 'en'), true, antiga)
  assert.equal(c.idioma(), 'pt-BR', 'consulta iniciada antes da edição não desfaz confirmação')
})
