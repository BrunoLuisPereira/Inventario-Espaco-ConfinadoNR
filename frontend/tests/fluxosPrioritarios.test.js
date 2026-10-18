import test from 'node:test'
import assert from 'node:assert/strict'
import { criarDemo, contasDemo, senhaDemo } from '../src/services/demoApi.js'
import { criarHttp } from '../src/services/http.js'
import { criarSessao } from '../src/services/sessao.js'

function storage() {
  const dados = new Map()
  return { getItem: k => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, String(v)), removeItem: k => dados.delete(k) }
}
function contexto() {
  const memoria = storage(), demo = criarDemo(memoria)
  const login = async (i = 0) => (await demo.request('/auth/login', { method: 'POST', body: JSON.stringify({ email: contasDemo[i], senha: senhaDemo }) })).data
  const chamar = (endpoint, token, dados, method = 'POST') => demo.request(endpoint, { method, body: JSON.stringify(dados) }, token)
  return { memoria, demo, login, chamar }
}
test('Fluxo A: login, dashboard, campanha, local com zero e inventário', async () => {
  const c = contexto(), { token } = await c.login()
  assert.equal((await c.demo.request('/auth/perfil', {}, token)).data.nome, 'Administrador Demo A')
  const campanhas = await c.demo.request('/campanhas', {}, token)
  const locais = await c.demo.request('/locais', {}, token)
  assert.equal(campanhas.total, 1); assert.equal(locais.total, 1)
  const campanha = (await c.chamar('/campanhas', token, { nome_campanha: 'Nova campanha', empresa: 'Demo A', responsavel: 'Equipe', data_inicio: '2026-10-18' })).data
  assert.equal(campanha.status, 'EM ANDAMENTO'); assert.equal(typeof campanha.id_campanha, 'string')
  const local = (await c.chamar('/locais', token, { id_campanha: campanha.id_campanha, nome_local: 'Novo tanque', latitude: 0, longitude: 0 })).data
  assert.equal(local.latitude, 0); assert.equal(local.longitude, 0)
  assert.equal((await c.demo.request(`/locais/${local.id_local}`, {}, token)).data.nome_campanha, 'Nova campanha')
  assert.deepEqual((await c.demo.request(`/evidencias/local/${local.id_local}`, {}, token)).data, [])
  assert.equal((await c.demo.request('/locais', {}, token)).total, 2)
})
for (const indice of [0, 1]) {
  test(`Tenant ${indice === 0 ? 'A' : 'B'}: listas não contêm registros externos`, async () => {
    const c = contexto(), { token, usuario } = await c.login(indice)
    const cs = (await c.demo.request('/campanhas?id_ambiente=FORJADO', {}, token)).data
    assert.equal(cs.length, 1); assert.ok(cs.every(x => x.id_ambiente === usuario.id_ambiente))
    const ls = (await c.demo.request('/locais', {}, token)).data
    assert.equal(ls.length, 1); assert.ok(ls.every(x => cs.some(y => y.id_campanha === x.id_campanha)))
  })
  for (const tipo of ['campanhas', 'locais']) test(`${tipo}: externo e inexistente são 404 para ator ${indice}`, async () => {
    const c = contexto(), { token } = await c.login(indice)
    const mensagens = []
    for (const id of [indice === 0 ? '2' : '1', '999']) {
      await assert.rejects(c.demo.request(`/${tipo}/${id}`, {}, token), e => { assert.equal(e.status, 404); mensagens.push(e.message); return true })
    }
    assert.equal(mensagens[0], mensagens[1])
  })
  test(`Tenant ${indice}: campos forjados não escolhem identidade ou ambiente`, async () => {
    const c = contexto(), { token, usuario } = await c.login(indice)
    const x = (await c.chamar('/campanhas', token, { nome_campanha: 'Teste', empresa: 'Fictícia', responsavel: 'Equipe', data_inicio: '2026-10-18', id_usuario: '999', id_ambiente: 'FORJADO', perfil_acesso: 'MASTER' })).data
    assert.equal(x.id_usuario, usuario.id_usuario); assert.equal(x.id_ambiente, usuario.id_ambiente)
    await assert.rejects(c.chamar('/locais', token, { id_campanha: indice === 0 ? '2' : '1', nome_local: 'Inválido' }), { status: 404 })
  })
}
for (const valor of ['0', '-1', '1e0', '9007199254740993', 'abc']) test(`ID inválido ${valor} não alcança local`, async () => {
  const c = contexto(), { token } = await c.login()
  await assert.rejects(c.demo.request('/locais/' + valor, {}, token), { status: 400 })
})
test('Engenheiro vê sua campanha e não ganha permissão pelo perfil do corpo', async () => {
  const c = contexto(), { token } = await c.login(2)
  assert.equal((await c.demo.request('/campanhas', {}, token)).total, 1)
  await assert.rejects(c.chamar('/campanhas/2/status', token, { status: 'CONCLUIDO', perfil_acesso: 'ADMINISTRADOR' }, 'PATCH'), { status: 404 })
})
test('Status legítimo é mantido e status desconhecido não modifica o local', async () => {
  const c = contexto(), { token } = await c.login()
  await c.chamar('/locais/1/status', token, { status: 'INATIVO' }, 'PATCH')
  await assert.rejects(c.chamar('/locais/1/status', token, { status: 'EXCLUIDO' }, 'PATCH'), { status: 400 })
  assert.equal((await c.demo.request('/locais/1', {}, token)).data.status, 'INATIVO')
})
test('Senha incorreta e token sintético inválido são recusados', async () => {
  const c = contexto()
  await assert.rejects(c.chamar('/auth/login', null, { email: contasDemo[0], senha: 'errada' }), { status: 401 })
  await assert.rejects(c.demo.request('/campanhas', {}, 'forjado'), { status: 401 })
})
test('Recarregar preserva demo da aba; reiniciar invalida sessão sem mexer em dados reais', async () => {
  const c = contexto(), { token } = await c.login()
  c.memoria.setItem('token', 'REAL_NAO_UTILIZADO')
  const outra = criarDemo(c.memoria)
  assert.equal((await outra.request('/campanhas', {}, token)).total, 1)
  outra.reiniciar()
  await assert.rejects(outra.request('/campanhas', {}, token), { status: 401 })
  assert.equal(c.memoria.getItem('token'), 'REAL_NAO_UTILIZADO')
})
test('Listas são cópias e não permitem alterar o estado pela resposta', async () => {
  const c = contexto(), { token } = await c.login()
  const r = await c.demo.request('/campanhas', {}, token)
  r.data[0].id_ambiente = 'FORJADO'
  assert.notEqual((await c.demo.request('/campanhas', {}, token)).data[0].id_ambiente, 'FORJADO')
})
test('GPS parcial não cria local; coordenadas zero são preservadas', async () => {
  const c = contexto(), { token } = await c.login()
  await assert.rejects(c.chamar('/locais', token, { id_campanha: '1', nome_local: 'Teste', latitude: 0 }), { status: 400 })
  assert.equal((await c.demo.request('/locais', {}, token)).total, 1)
})
test('Nenhuma operação de demo cai em fetch, inclusive módulos não simulados', async () => {
  const c = contexto(), { token } = await c.login()
  let rede = 0
  const http = criarHttp({ obterToken: () => token, expirar() {}, fetchImpl() { rede++; throw Error('REDE PROIBIDA') }, demonstracao: c.demo.request })
  await http('/campanhas')
  await assert.rejects(http('/relatorios/1/gerar-pdf', { method: 'POST' }), { status: 501 })
  await assert.rejects(http('/evidencias/1/arquivo', {}, true), { status: 501 })
  assert.equal(rede, 0)
})
for (const status of [401, 403, 404, 500]) test(`Transporte real: HTTP ${status} mantém contrato e sessão apropriados`, async () => {
  let expirou = 0
  const http = criarHttp({ obterToken: () => 'token-simulado', expirar() { expirou++ }, fetchImpl: async (url, options) => {
    assert.equal(url, '/api/campanhas'); assert.equal(options.headers.Authorization, 'Bearer token-simulado')
    return { ok: false, status, json: async () => ({ message: status >= 500 ? 'SQL_SENSIVEL' : 'Mensagem pública' }) }
  } })
  await assert.rejects(http('/campanhas'), e => { assert.equal(e.status, status); assert.ok(!e.message.includes('SQL_SENSIVEL')); return true })
  assert.equal(expirou, status === 401 ? 1 : 0)
})
test('401 de login inválido não encerra outra sessão', async () => {
  let expirou = false
  const http = criarHttp({ obterToken: () => 'token', expirar() { expirou = true }, fetchImpl: async () => ({ status: 401, ok: false, json: async () => ({ message: 'Credenciais inválidas' }) }) })
  await assert.rejects(http('/auth/login'), { status: 401 }); assert.equal(expirou, false)
})
test('Resposta antiga 401 não encerra login novo', async () => {
  let token = 'antigo', expirou = false
  const http = criarHttp({ obterToken: () => token, expirar() { expirou = true }, fetchImpl: async () => {
    token = 'novo'; return { status: 401, ok: false, json: async () => ({}) }
  } })
  await assert.rejects(http('/campanhas'), { status: 401 }); assert.equal(expirou, false)
})
test('Falha de rede e JSON inválido possuem mensagens públicas', async () => {
  for (const fetchImpl of [async () => { throw Error('URL_TOKEN_INTERNO') }, async () => ({ ok: true, status: 200, json: async () => { throw Error('PARSE_INTERNO') } })]) {
    const http = criarHttp({ obterToken: () => null, expirar() {}, fetchImpl })
    await assert.rejects(http('/campanhas'), e => !/INTERNO/.test(e.message))
  }
})
test('Download real preserva Blob e FormData preserva boundary', async () => {
  const blob = new Blob(['sintético']), form = new FormData()
  const http = criarHttp({ obterToken: () => 'token', expirar() {}, fetchImpl: async (_url, options) => {
    assert.equal(options.headers['Content-Type'], undefined)
    return { ok: true, status: 200, blob: async () => blob }
  } })
  assert.strictEqual(await http('/arquivo', { body: form }, true), blob)
})
test('Armazenamento de sessão tolera JSON inválido, isola demo e limpa logout', () => {
  const memoria = storage(), real = criarSessao(memoria), demo = criarSessao(memoria, 'nr33-demo:')
  memoria.setItem('usuario', '{invalido'); memoria.setItem('token', 'real')
  assert.equal(real.ler().token, null)
  demo.salvar({ token: 'demo', usuario: { id_usuario: '10' } })
  assert.equal(demo.ler().token, 'demo'); assert.equal(memoria.getItem('token'), 'real')
  demo.limpar(); assert.equal(demo.ler().token, null); assert.equal(memoria.getItem('token'), 'real')
  assert.throws(() => demo.salvar({ token: null, usuario: {} }))
})
