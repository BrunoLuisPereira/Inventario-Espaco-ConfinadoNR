import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
export const pausa = ms => new Promise(r => setTimeout(r, ms))
export async function abrirNavegador(prefixo) {
  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), prefixo))
  const ambienteNavegador = { ...process.env }
  delete ambienteNavegador.NR33_SENHA_ADMIN_A_722
  delete ambienteNavegador.NR33_SENHA_ADMIN_B_722
  const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${path.join(pasta, 'perfil')}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore', env: ambienteNavegador })
  let ws, session, seq = 0, erroProcesso
  const pendentes = new Map()
  browser.on('error', e => { erroProcesso = e })
  function enviar(method, params = {}, s = session) {
    return new Promise((resolve, reject) => {
      const id = ++seq
      const timer = setTimeout(() => { pendentes.delete(id); reject(Error(method + ': timeout')) }, 15000)
      pendentes.set(id, { resolve: v => { clearTimeout(timer); resolve(v) }, reject: e => { clearTimeout(timer); reject(e) } })
      ws.send(JSON.stringify({ id, method, params, ...(s ? { sessionId: s } : {}) }))
    })
  }
  async function avaliar(expression) {
    const r = await enviar('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    assert.ok(!r.exceptionDetails, 'Falha na interacao do navegador; detalhes omitidos')
    return r.result.value
  }
  async function esperar(expression) {
    for (let i = 0; i < 100; i++) { if (await avaliar(expression)) return; await pausa(100) }
    throw Error('Timeout na verificacao de interface')
  }
  async function fechar() {
    if (ws?.readyState === WebSocket.OPEN) { await enviar('Browser.close', {}, null).catch(() => {}); ws.close() }
    browser.kill()
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
      const r = JSON.parse(e.data), p = pendentes.get(r.id)
      if (p) { pendentes.delete(r.id); if (r.error) p.reject(Error(r.error.message)); else p.resolve(r.result) }
    })
    const alvo = await enviar('Target.createTarget', { url: 'about:blank' }, null)
    session = (await enviar('Target.attachToTarget', { targetId: alvo.targetId, flatten: true }, null)).sessionId
    await enviar('Page.enable'); await enviar('Runtime.enable'); await enviar('Network.enable')
    async function captura(nome) {
      await pausa(200)
      const imagem = await enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      await fs.writeFile(path.join(pasta, nome + '.png'), Buffer.from(imagem.data, 'base64'))
    }
    return { enviar, avaliar, esperar, fechar, captura, pasta }
  } catch (e) { await fechar(); throw e }
}
