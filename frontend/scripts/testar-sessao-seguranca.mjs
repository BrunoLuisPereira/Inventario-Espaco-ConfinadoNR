// React/AuthProvider reais; API exclusivamente sintética e restrita ao loopback.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { abrirNavegador, pausa } from './navegador-isolado.mjs'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222'
const usuario = { id_usuario: '10', id_ambiente: A, nome: 'João 李', email: 'a@example.invalid', perfil_acesso: 'ADMINISTRADOR', eh_fundador: true }
let perfil = { ...usuario, idioma: 'en', nome_ambiente: 'São José', ativo: true, surpresa: 'descartar' }
const pendentes = []
const virt = '\0nr33-sessao-probe.jsx'
let verificacoes = 0, browser, server
const conferir = (a, b) => { assert.deepEqual(a, b); verificacoes++ }
const responder = (res, data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ status: 'success', data })) }
const temPerfil = token => pendentes.some(r => r.tokenTeste === token)
function retirarPerfis(token) {
  const respostas = pendentes.filter(r => r.tokenTeste === token)
  for (const res of respostas) pendentes.splice(pendentes.indexOf(res), 1)
  return respostas
}
async function aguardar(fn) {
  for (let i = 0; i < 100; i++) { if (fn()) return; await pausa(100) }
  throw Error('Timeout da API sintética; respostas pendentes: ' + pendentes.length)
}
const probe = `
import React, { useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '/src/contexts/AuthContext.jsx';
import { AuthContext } from '/src/contexts/AuthContext.js';
import { podeAdministrar } from '/src/services/conta.js';
function Probe() {
  const c = useContext(AuthContext);
  window.__sessaoProbe = c;
  window.__menuAdministrativo = podeAdministrar(c.usuario);
  return React.createElement('output', {id:'estado'}, c.usuario?.nome || 'sem sessão');
}
createRoot(document.getElementById('root')).render(React.createElement(AuthProvider, null, React.createElement(Probe)));
`
try {
  server = await createServer({
    root: raiz, configFile: false, envDir: false, mode: 'test',
    server: { host: '127.0.0.1', port: 0, fs: { allow: [raiz, fileURLToPath(new URL('../../shared', import.meta.url))] } },
    plugins: [react(), {
      name: 'nr33-sessao-teste',
      resolveId(id) { if (id === 'virtual:nr33-sessao-probe.jsx') return virt },
      load(id) { if (id === virt) return probe },
      configureServer(vite) {
        vite.middlewares.use((req, res, next) => {
          if (req.url === '/api/auth/perfil') {
            res.tokenTeste = req.headers.authorization?.replace(/^Bearer /, '')
            pendentes.push(res); return
          }
          if (req.url.startsWith('/api/')) { res.statusCode = 404; res.end('API real proibida'); return }
          if (req.url !== '/__sessao_teste') return next()
          const html = '<html><div id="root"></div><script type="module">import "virtual:nr33-sessao-probe.jsx"</script></html>'
          vite.transformIndexHtml('/__sessao_teste', html).then(texto => {
            res.setHeader('Content-Type', 'text/html'); res.end(texto)
          }).catch(next)
        })
      },
    }],
  })
  await server.listen()
  browser = await abrirNavegador('nr33-sessao-seguranca-')
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await browser.enviar('Page.navigate', { url: base + '/__sessao_teste' })
  await browser.esperar('!!window.__sessaoProbe')
  const estado = () => browser.avaliar('({token:window.__sessaoProbe.token,usuario:window.__sessaoProbe.usuario})')
  const salvo = () => browser.avaliar('({token:localStorage.getItem("token"),usuario:JSON.parse(localStorage.getItem("usuario"))})')
  const entrar = dado => browser.avaliar(`window.__sessaoProbe.autenticar(${JSON.stringify(dado)})`)
  conferir(await browser.avaliar('window.__sessaoProbe.autenticado'), false)
  await entrar({ token: 'token-probe-A', usuario: { ...usuario, ativo: true, surpresa: 'descartar' } })
  await aguardar(() => temPerfil('token-probe-A'))
  await browser.esperar('window.__sessaoProbe.token === "token-probe-A"')
  conferir(await estado(), await salvo())
  conferir(await browser.avaliar('Object.hasOwn(window.__sessaoProbe.usuario,"surpresa")'), false)
  conferir(await browser.avaliar('window.__sessaoProbe.autenticado'), false)
  retirarPerfis('token-probe-A').forEach(res => responder(res, perfil))
  await browser.esperar('window.__sessaoProbe.autenticado && window.__sessaoProbe.usuario.idioma === "en"')
  conferir(await estado(), await salvo())
  conferir(await browser.avaliar('Object.keys(window.__sessaoProbe.usuario).length'), 8)
  conferir(await browser.avaliar('window.__menuAdministrativo'), true)
  conferir(await browser.avaliar('document.querySelector("#estado").textContent'), 'João 李')

  await browser.avaliar('window.__sessaoProbe.atualizarUsuario({nome:"Érica 🧑🏽",email:"atual@example.invalid",perfil_acesso:"MASTER",surpresa:true})')
  await browser.esperar('window.__sessaoProbe.usuario.nome === "Érica 🧑🏽"')
  conferir(await estado(), await salvo())
  conferir(await browser.avaliar('window.__sessaoProbe.usuario.perfil_acesso'), 'ADMINISTRADOR')
  const anterior = await estado()
  conferir(await browser.avaliar('(()=>{try{window.__sessaoProbe.atualizarUsuario({nome:{},email:"x@example.invalid"});return false}catch{return true}})()'), true)
  conferir(await estado(), anterior)

  // Uma resposta de perfil malformada não entra no storage nem no estado React.
  await browser.avaliar('window.__sessaoProbe.tentarNovamente()')
  await aguardar(() => temPerfil('token-probe-A'))
  retirarPerfis('token-probe-A').forEach(res => responder(res, { ...perfil, nome: {} }))
  await browser.esperar('!!window.__sessaoProbe.erroSessao')
  conferir(await estado(), anterior)
  conferir(await salvo(), anterior)

  // Resposta A e callback de perfil A não podem sobrescrever o login B.
  await browser.avaliar('window.__callbackAntigo = window.__sessaoProbe.atualizarUsuario; window.__sessaoProbe.tentarNovamente()')
  await aguardar(() => temPerfil('token-probe-A'))
  const respostasAntigas = retirarPerfis('token-probe-A')
  const outro = { ...usuario, id_usuario: 20, id_ambiente: B, nome: 'Pessoa B', perfil_acesso: 'AUDITOR', eh_fundador: false }
  await entrar({ token: 'token-probe-B', usuario: outro })
  await browser.esperar('window.__sessaoProbe.usuario.id_usuario === 20')
  respostasAntigas.forEach(res => responder(res, perfil))
  await aguardar(() => temPerfil('token-probe-B'))
  retirarPerfis('token-probe-B').forEach(res => responder(res, { ...outro, idioma: 'pt-BR', nome_ambiente: 'Ambiente B' }))
  await browser.esperar('window.__sessaoProbe.autenticado && window.__sessaoProbe.usuario.id_ambiente === ' + JSON.stringify(B))
  await browser.avaliar('window.__callbackAntigo({nome:"Não aplicar",email:"antigo@example.invalid"})')
  conferir(await browser.avaliar('window.__sessaoProbe.usuario.nome'), 'Pessoa B')
  conferir(await estado(), await salvo())
  conferir(await browser.avaliar('window.__menuAdministrativo'), false)

  // Mesmo com falha permanente no rollback, o estado acompanha a sessão vazia.
  await browser.avaliar('window.__setOriginal = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v){if(k === "token")throw new Error("Quota sintética");return window.__setOriginal.call(this,k,v)}')
  conferir(await browser.avaliar(`(()=>{try{window.__sessaoProbe.autenticar(${JSON.stringify({ token: 'novo-token', usuario })});return false}catch{return true}})()`), true)
  await browser.esperar('window.__sessaoProbe.token === null')
  conferir(await browser.avaliar('window.__sessaoProbe.autenticado'), false)
  conferir(await browser.avaliar('localStorage.getItem("token")'), null)
  await browser.avaliar('Storage.prototype.setItem = window.__setOriginal')
  // Recarregar com conteúdo adulterado não libera autenticação.
  await browser.avaliar('localStorage.setItem("token","sintetico");localStorage.setItem("usuario",JSON.stringify({id_usuario:1,perfil_acesso:"MASTER"}))')
  await browser.enviar('Page.reload')
  await pausa(200)
  await browser.esperar('!!window.__sessaoProbe')
  conferir(await browser.avaliar('window.__sessaoProbe.autenticado'), false)
  conferir(await browser.avaliar('window.__sessaoProbe.usuario'), null)
  console.log(JSON.stringify({ verificacoes, reactReal: true, apiReal: false, bancoReal: false }))
} catch (error) {
  if (browser) console.error(await browser.avaliar('({temProbe:!!window.__sessaoProbe,contaB:window.__sessaoProbe?.usuario?.id_usuario === 20,cacheB:localStorage.getItem("token") === "token-probe-B",erro:!!window.__sessaoProbe?.erroSessao,autenticado:window.__sessaoProbe?.autenticado})').catch(() => ({ navegadorIndisponivel: true })))
  throw error
} finally {
  for (const res of pendentes) res.destroy()
  if (browser) await browser.fechar().catch(() => {})
  if (server) {
    server.httpServer.closeAllConnections()
    await server.close()
  }
}
