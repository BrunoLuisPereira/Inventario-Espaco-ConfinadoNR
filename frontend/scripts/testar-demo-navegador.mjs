// Teste real de interface, exclusivamente sobre build demo e perfil temporário.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist-demo')
const perfil = await fs.mkdtemp(path.join(os.tmpdir(), 'nr33-browser-demo-'))
const chamadasAPI = [], externas = [], excecoes = []
let browser, ws, server, sessionId, contador = 0
const pendentes = new Map()
const pausa = ms => new Promise(resolve => setTimeout(resolve, ms))
async function esperar(fn, descricao) {
  for (let i = 0; i < 150; i++) { if (await fn()) return; await pausa(100) }
  throw new Error('Timeout: ' + descricao)
}
function enviar(method, params = {}, session = sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++contador
    const timer = setTimeout(() => { pendentes.delete(id); reject(new Error('CDP timeout: ' + method)) }, 10000)
    pendentes.set(id, { resolve: r => { clearTimeout(timer); resolve(r) }, reject: e => { clearTimeout(timer); reject(e) } })
    ws.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }))
  })
}
async function avaliar(expression) {
  const r = await enviar('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('Falha na interação de teste: ' + r.exceptionDetails.text)
  return r.result.value
}
const texto = t => esperar(() => avaliar(`document.body.innerText.includes(${JSON.stringify(t)})`), t)
const clicar = seletor => avaliar(`document.querySelector(${JSON.stringify(seletor)}).click()`)
const botao = nome => avaliar(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(nome)}).click()`)
async function preencher(id, valor) {
  await avaliar(`(() => { const e = document.getElementById(${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(valor)}); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`)
}
try {
  await fs.access(path.join(root, 'index.html'))
  server = http.createServer(async (req, res) => {
    const nome = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)
    if (nome.startsWith('/api')) { chamadasAPI.push(nome); res.writeHead(503); res.end('API desativada no teste demo'); return }
    const arquivo = path.resolve(root, '.' + nome)
    if (arquivo !== root && !arquivo.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return }
    try {
      let conteudo, ext
      try { conteudo = await fs.readFile(arquivo); ext = path.extname(arquivo) }
      catch { conteudo = await fs.readFile(path.join(root, 'index.html')); ext = '.html' }
      res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' })[ext] || 'application/octet-stream')
      res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'")
      res.end(conteudo)
    } catch { res.writeHead(500); res.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const executaveis = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  let exe
  for (const candidato of executaveis) { try { await fs.access(candidato); exe = candidato; break } catch { /* Tenta navegador instalado seguinte. */ } }
  if (!exe) throw new Error('Chrome/Edge não encontrado; execute o roteiro manual.')
  let falhaProcesso
  browser = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  browser.on('error', e => { falhaProcesso = e })
  await esperar(async () => { if (falhaProcesso) throw falhaProcesso; try { await fs.access(path.join(perfil, 'DevToolsActivePort')); return true } catch { return false } }, 'Chrome DevTools')
  const [porta, caminho] = (await fs.readFile(path.join(perfil, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/)
  ws = new WebSocket(`ws://127.0.0.1:${porta}${caminho}`)
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
  ws.addEventListener('message', evento => {
    const r = JSON.parse(evento.data)
    if (r.id) {
      const p = pendentes.get(r.id); pendentes.delete(r.id)
      if (r.error) p?.reject(new Error(r.error.message)); else p?.resolve(r.result)
    }
    if (r.method === 'Network.requestWillBeSent') {
      const url = r.params.request.url
      if (url.startsWith('http') && !url.startsWith(base + '/')) externas.push(url)
      if (url.startsWith(base + '/api')) chamadasAPI.push(url)
    }
    if (r.method === 'Runtime.exceptionThrown') excecoes.push(r.params.exceptionDetails.text)
  })
  const target = await enviar('Target.createTarget', { url: 'about:blank' }, null)
  sessionId = (await enviar('Target.attachToTarget', { targetId: target.targetId, flatten: true }, null)).sessionId
  await enviar('Runtime.enable'); await enviar('Page.enable'); await enviar('Network.enable')
  await enviar('Page.navigate', { url: base + '/login' })
  await texto('DEMONSTRAÇÃO'); await texto('Contas fictícias para teste')
  console.log('OK: aviso explícito e login renderizados')
  await botao('admin.a@demo.invalid')
  await preencher('senha', 'errada')
  await clicar('.login-form button[type="submit"]')
  await texto('E-mail ou senha inválidos na demonstração.')
  console.log('OK: login inválido recusado na interface')
  await botao('admin.a@demo.invalid'); await clicar('.login-form button[type="submit"]')
  await texto('Dashboard'); await esperar(() => avaliar('document.querySelectorAll(".dashboard-card-value").length > 0'), 'indicadores')
  console.log('OK: login A e dashboard carregados')
  await clicar('a[href="/configuracoes"]'); await texto('Meu Perfil')
  await esperar(() => avaliar('document.getElementById("perfil-nome") !== null'), 'perfil carregado')
  assert.equal(await avaliar('document.documentElement.lang'), 'pt-BR')
  await preencher('perfil-nome', 'Nome editado sem salvar')
  await preencher('perfil-email', 'edicao@example.invalid')
  await botao('Editar nome')
  await preencher('empresa-ambiente', 'Ambiente editado sem salvar')
  for (const id of ['senha-atual', 'nova-senha', 'confirmar-senha']) await preencher(id, 'senha-sintetica')
  await avaliar(`void (window.estadoI18nTeste = {
    campos: [...document.querySelectorAll('.configuracoes-main input')].filter(e => !e.readOnly),
    valores: [...document.querySelectorAll('.configuracoes-main input')].filter(e => !e.readOnly).map(e => e.value),
    sessao: sessionStorage.getItem('nr33-demo:usuario'),
    token: sessionStorage.getItem('nr33-demo:token'),
    tema: document.documentElement.getAttribute('data-theme')
  })`)
  async function trocarIdioma(idioma) {
    await avaliar(`(() => { const e = document.getElementById('idioma-interface'); e.value = ${JSON.stringify(idioma)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`)
    await esperar(() => avaliar(`document.documentElement.lang === ${JSON.stringify(idioma)}`), 'lang ' + idioma)
    assert.equal(await avaliar(`(() => { const antes = window.estadoI18nTeste;
      const campos = [...document.querySelectorAll('.configuracoes-main input')].filter(e => !e.readOnly);
      return campos.length === antes.campos.length && campos.every((e, i) => e === antes.campos[i] && e.value === antes.valores[i])
        && sessionStorage.getItem('nr33-demo:usuario') === antes.sessao
        && sessionStorage.getItem('nr33-demo:token') === antes.token
        && document.documentElement.getAttribute('data-theme') === antes.tema;
    })()`), true)
  }
  await trocarIdioma('en'); await texto('My Profile'); await texto('Company / Environment')
  assert.equal(await avaliar('document.querySelector("a[href=\'/campanhas\']").textContent.trim()'), 'Campaigns')
  assert.equal(await avaliar('document.getElementById("idioma-interface").value'), 'en')
  await trocarIdioma('pt-BR'); await texto('Meu Perfil')
  assert.equal(await avaliar('document.querySelector("a[href=\'/campanhas\']").textContent.trim()'), 'Campanhas')
  await trocarIdioma('en')
  await texto('Your preference is saved per user and environment.')
  await enviar('Page.reload'); await texto('My Profile')
  assert.equal(await avaliar('document.documentElement.lang'), 'en')
  console.log('OK: troca preserva campos, sessão e tema; recarga restaura preferência individual')
  await avaliar(`(() => { const e = document.getElementById('idioma-interface'); e.value = 'pt-BR'; e.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  await texto('Meu Perfil')
  if (process.argv.includes('--i18n-only')) {
    await avaliar(`(() => { const e = document.getElementById('idioma-interface'); e.value = 'en'; e.dispatchEvent(new Event('change', { bubbles: true })); })()`)
    await texto('My Profile')
    await enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    assert.equal(await avaliar('document.documentElement.scrollWidth <= 390'), true)
    console.log('OK: Configurações em inglês sem transbordamento horizontal no viewport móvel')
    await texto('Your preference is saved per user and environment.')
    await enviar('Emulation.clearDeviceMetricsOverride')
    await botao('Sign out'); await texto('Contas fictícias para teste')
    await botao('admin.b@demo.invalid'); await clicar('.login-form button[type="submit"]'); await texto('Dashboard')
    await clicar('a[href="/configuracoes"]'); await texto('Meu Perfil')
    assert.equal(await avaliar('document.documentElement.lang'), 'pt-BR')
    await botao('Sair'); await texto('Contas fictícias para teste')
    await botao('admin.a@demo.invalid'); await clicar('.login-form button[type="submit"]'); await texto('Dashboard')
    await clicar('a[href="/configuracoes"]'); await texto('My Profile')
    assert.equal(await avaliar('document.documentElement.lang'), 'en')
    console.log('OK: contas A/B independentes e novo login restaura preferência de A')
    await enviar('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    await esperar(() => avaliar('navigator.onLine === false'), 'navegador offline')
    await avaliar(`(() => { const e = document.getElementById('idioma-interface'); e.value = 'pt-BR'; e.dispatchEvent(new Event('change', { bubbles: true })); })()`)
    await texto('Aguardando sincronização com sua conta.')
    assert.equal(await avaliar('document.documentElement.lang'), 'pt-BR')
    await enviar('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    await texto('Sua preferência é salva por usuário e ambiente.')
    await enviar('Page.reload'); await texto('Meu Perfil')
    assert.equal(await avaliar('document.documentElement.lang'), 'pt-BR')
    console.log('OK: alteração offline muda idioma imediatamente; reconexão sincroniza e recarga preserva')
  } else {
  await clicar('a[href="/campanhas"]'); await texto('Inspeção sintética A')
  assert.equal(await avaliar('document.body.innerText.includes("Inspeção sintética B")'), false)
  await botao('+ Nova campanha')
  for (const [id, valor] of [['nome_campanha', 'Campanha navegador A'], ['empresa', 'Empresa fictícia'], ['responsavel', 'Equipe teste'], ['data_inicio', '2026-10-18']]) await preencher(id, valor)
  await clicar('.campanha-form button[type="submit"]'); await texto('Campanha navegador A')
  console.log('OK: cadastro de campanha na interface')
  await avaliar(`Array.from(document.querySelectorAll('tr')).find(r => r.textContent.includes('Campanha navegador A')).querySelector('.campanha-button-locais').click()`)
  await texto('Nenhum local cadastrado'); await botao('+ Novo local')
  await preencher('nome_local', 'Local navegador A'); await preencher('latitude', '0'); await preencher('longitude', '0')
  await clicar('.local-form button[type="submit"]'); await texto('Local navegador A')
  await clicar('a.local-button-open'); await texto('Inventário do Local'); await texto('Local navegador A')
  console.log('OK: cadastro de local e navegação ao inventário')
  await enviar('Page.reload'); await texto('Inventário do Local'); await texto('Local navegador A')
  console.log('OK: recarga revalida sessão e preserva dados da aba')
  await botao('Sair'); await texto('Contas fictícias para teste')
  await botao('admin.b@demo.invalid'); await clicar('.login-form button[type="submit"]'); await texto('Dashboard')
  await clicar('a[href="/campanhas"]'); await texto('Inspeção sintética B')
  assert.equal(await avaliar('document.body.innerText.includes("Campanha navegador A")'), false)
  await enviar('Page.navigate', { url: base + '/campanhas/1/locais' }); await texto('Campanha não encontrada.')
  assert.equal(await avaliar('document.querySelector(".local-form") !== null'), false)
  console.log('OK: B não lista A e recebe 404 ao abrir campanha externa')
  await enviar('Page.navigate', { url: base + '/locais/1/inventario' }); await texto('Local não encontrado.')
  assert.equal(await avaliar('document.body.innerText.includes("Tanque demonstrativo A")'), false)
  console.log('OK: inventário externo não revela o local de A')
  await botao('Sair'); await texto('Contas fictícias para teste')
  await enviar('Page.navigate', { url: base + '/dashboard' }); await texto('Contas fictícias para teste')
  assert.equal(await avaliar('location.pathname'), '/login')
  console.log('OK: logout impede acesso à rota protegida')
  await botao('engenheiro.a@demo.invalid'); await clicar('.login-form button[type="submit"]'); await texto('Dashboard')
  await clicar('a[href="/campanhas"]'); await texto('Inspeção sintética A')
  assert.equal(await avaliar('document.body.innerText.includes("Campanha navegador A")'), true)
  await enviar('Page.navigate', { url: base + '/campanhas/3/locais' }); await texto('Local navegador A')
  await enviar('Page.navigate', { url: base + '/campanhas/2/locais' }); await texto('Campanha não encontrada.')
  console.log('OK: engenheiro consulta campanhas do próprio ambiente; outro ambiente continua bloqueado')
  await avaliar('sessionStorage.removeItem("nr33-demo:dados-v1")')
  await enviar('Page.reload'); await texto('Sessão expirada. Entre novamente.'); await texto('Contas fictícias para teste')
  console.log('OK: sessão sintética inválida é encerrada após revalidação')
  await enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  assert.equal(await avaliar('document.documentElement.scrollWidth <= 390'), true)
  console.log('OK: viewport móvel sem transbordamento horizontal')
  }
  assert.deepEqual(chamadasAPI, []); assert.deepEqual(externas, []); assert.deepEqual(excecoes, [])
  console.log('OK: zero chamadas à API real, zero requisições externas e zero exceções JavaScript')
} finally {
  if (ws?.readyState === WebSocket.OPEN) { try { await enviar('Browser.close', {}, null) } catch { /* Processo pode encerrar antes da resposta. */ } ws.close() }
  if (browser && browser.exitCode === null && !browser.killed) browser.kill()
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  for (const p of pendentes.values()) p.reject(new Error('Teste encerrado'))
  pendentes.clear()
  // Somente o diretório temporário exclusivo recém-criado; nunca perfil pessoal.
  if (path.dirname(perfil) === path.resolve(os.tmpdir()) && path.basename(perfil).startsWith('nr33-browser-demo-')) {
    await fs.rm(perfil, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 })
  }
}
