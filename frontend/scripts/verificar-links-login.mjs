// Inspecao visual isolada: nao faz login nem permite chamadas de API.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'nr33-login-720-'))
const base = 'http://127.0.0.1:5174'
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
  `--user-data-dir=${path.join(pasta, 'perfil')}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
let ws, session, seq = 0, erroProcesso
browser.on('error', e => { erroProcesso = e })
const pendentes = new Map()
const pausa = ms => new Promise(r => setTimeout(r, ms))
function enviar(method, params = {}, s = session) {
  return new Promise((resolve, reject) => {
    const id = ++seq
    const timer = setTimeout(() => { pendentes.delete(id); reject(Error(method + ': timeout')) }, 15000)
    pendentes.set(id, { resolve: v => { clearTimeout(timer); resolve(v) }, reject: e => { clearTimeout(timer); reject(e) } })
    ws.send(JSON.stringify({ id, method, params, ...(s ? { sessionId: s } : {}) }))
  })
}
async function avaliar(expression) {
  const r = await enviar('Runtime.evaluate', { expression, returnByValue: true })
  assert.ok(!r.exceptionDetails)
  return r.result.value
}
try {
  let ativo
  for (let i = 0; i < 100; i++) {
    if (erroProcesso) throw erroProcesso
    try { ativo = await fs.readFile(path.join(pasta, 'perfil', 'DevToolsActivePort'), 'utf8'); break } catch { await pausa(100) }
  }
  assert.ok(ativo, 'Chrome indisponivel')
  const [porta, endpoint] = ativo.trim().split(/\r?\n/)
  ws = new WebSocket(`ws://127.0.0.1:${porta}${endpoint}`)
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
  ws.addEventListener('message', e => {
    const r = JSON.parse(e.data)
    const p = pendentes.get(r.id)
    if (p) { pendentes.delete(r.id); if (r.error) p.reject(Error(r.error.message)); else p.resolve(r.result) }
  })
  const alvo = await enviar('Target.createTarget', { url: 'about:blank' }, null)
  session = (await enviar('Target.attachToTarget', { targetId: alvo.targetId, flatten: true }, null)).sessionId
  await enviar('Page.enable'); await enviar('Runtime.enable'); await enviar('Network.enable')
  await enviar('Network.setBlockedURLs', { urls: [base + '/api/*'] })
  await enviar('Page.navigate', { url: base + '/login' })
  let pronto = false
  for (let i = 0; i < 100; i++) {
    pronto = await avaliar('document.querySelectorAll(".login-options > *").length === 3 && [...document.images].every(i => i.complete)')
    if (pronto) break
    await pausa(100)
  }
  assert.ok(pronto, 'Tela de login indisponivel')
  const resultados = []
  for (const width of [1440, 390, 320]) {
    await enviar('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 })
    await pausa(250)
    const obter = () => avaliar(`Array.from(document.querySelectorAll('.login-options > *')).map(e => {const s=getComputedStyle(e),r=e.getBoundingClientRect(); return {texto:e.textContent.trim(),cor:s.color,fonte:s.fontSize,peso:s.fontWeight,familia:s.fontFamily,sublinhado:s.textDecorationLine,top:r.top,left:r.left,right:r.right}})`)
    const normal = await obter()
    assert.deepEqual(normal.map(x => x.texto), ['Criar conta', 'Tenho um convite', 'Esqueci minha senha'])
    for (const x of normal) {
      for (const campo of ['cor', 'fonte', 'peso', 'familia', 'sublinhado']) assert.equal(x[campo], normal[2][campo])
      assert.equal(x.sublinhado, 'none'); assert.ok(x.left >= 0 && x.right <= width)
    }
    assert.equal(await avaliar('document.documentElement.scrollWidth <= innerWidth'), true)
    if (width === 1440) assert.ok(normal.every(x => Math.abs(x.top - normal[0].top) < 2), 'Desktop deve manter os tres links na mesma linha')
    await enviar('DOM.enable'); await enviar('CSS.enable')
    const { root } = await enviar('DOM.getDocument')
    const { nodeIds } = await enviar('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '.login-options > *' })
    for (const estado of ['hover', 'focus-visible']) {
      for (const nodeId of nodeIds) await enviar('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [estado] })
      await pausa(250)
      const estilos = await obter()
      assert.ok(estilos.every(x => x.cor === estilos[2].cor && x.sublinhado === estilos[2].sublinhado))
      for (const nodeId of nodeIds) await enviar('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
      await pausa(250)
    }
    const captura = await enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await fs.writeFile(path.join(pasta, `login-${width}.png`), Buffer.from(captura.data, 'base64'))
    resultados.push({ largura: width, links: normal })
  }
  assert.deepEqual(await avaliar('Array.from(document.querySelectorAll(".login-options a")).map(e=>e.getAttribute("href"))'), ['/cadastro', '/convites/aceitar'])
  assert.equal(await avaliar('document.querySelector(".login-options button").disabled'), true)
  console.log(JSON.stringify({ resultado: 'APROVADO', pasta, resultados }))
} finally {
  if (ws?.readyState === WebSocket.OPEN) { await enviar('Browser.close', {}, null).catch(() => {}); ws.close() }
  browser.kill()
}
