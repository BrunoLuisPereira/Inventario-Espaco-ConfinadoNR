// Navegacao e layout reais no browser; API inteiramente simulada, sem banco.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'nr33-sidebar-721-'))
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
  const r = await enviar('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  assert.ok(!r.exceptionDetails, r.exceptionDetails?.text)
  return r.result.value
}
async function esperar(expression) {
  for (let i = 0; i < 100; i++) { if (await avaliar(expression)) return; await pausa(100) }
  throw Error('Condicao nao atendida: ' + expression)
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
  await enviar('Network.setBlockedURLs', { urls: [base + '/api/*'] })
  await enviar('Browser.setDownloadBehavior', { behavior: 'deny' }, null)
  const resultados = []
  for (const perfil of ['ADMINISTRADOR', 'ENGENHEIRO_SEGURANCA']) {
    const { identifier } = await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.usuarioTeste={id_usuario:9001,nome:'Pessoa sintetica',email:'sidebar@example.invalid',perfil_acesso:${JSON.stringify(perfil)},id_ambiente:'11111111-1111-4111-8111-111111111111',ativo:true};
      localStorage.setItem('token','sessao-ficticia-apenas-browser'); localStorage.setItem('usuario',JSON.stringify(window.usuarioTeste));
      window.chamadasTeste=[];window.falhasTeste=[];
      window.fetch=async(input,init={})=>{
        const u=new URL(typeof input==='string'?input:input.url,location.origin);
        if(u.origin!==location.origin || !u.pathname.startsWith('/api/')) throw Error('Requisicao externa nao permitida');
        window.chamadasTeste.push({url:u.pathname,method:init.method||'GET'});
        if((init.method||'GET')!=='GET') throw Error('Escrita nao permitida');
        if(u.pathname==='/api/locais/exportar') return new Response(new Blob(['arquivo sintetico'],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),{status:200});
        let data;
        if(u.pathname==='/api/auth/perfil') data=window.usuarioTeste;
        else if(['/api/campanhas','/api/locais','/api/usuarios','/api/relatorios'].includes(u.pathname)) data=[];
        else {window.falhasTeste.push(u.pathname);throw Error('API desconhecida no simulador');}
        return new Response(JSON.stringify({status:'success',total:Array.isArray(data)?data.length:undefined,data}),{status:200,headers:{'Content-Type':'application/json'}});
      };
    ` })
    await enviar('Page.navigate', { url: base + '/dashboard' })
    await esperar('!!document.querySelector(".sidebar-nav")')
    const admin = perfil === 'ADMINISTRADOR'
    const nomes = ['Dashboard', 'Campanhas', 'Locais', 'Exportar Locais', ...(admin ? ['Usuários', 'Convite'] : []), '⚙ Configurações']
    for (const width of [1440, 390]) {
      await enviar('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 })
      await pausa(300)
      const mobile = width < 600
      const abrir = async () => {
        if (mobile && !await avaliar('document.querySelector(".sidebar").classList.contains("sidebar-open")')) {
          await avaliar('document.querySelector(".header-menu-button").click()'); await pausa(300)
        }
      }
      await abrir()
      assert.deepEqual(await avaliar('Array.from(document.querySelectorAll(".sidebar-nav a,.sidebar-nav button")).map(e=>e.textContent.trim())'), nomes)
      assert.equal(await avaliar('document.querySelector(".sidebar-divider").previousElementSibling.textContent.trim()'), 'Exportar Locais')
      assert.equal(await avaliar(`document.querySelectorAll('.sidebar-nav a[href="/relatorios"]').length`), 0)
      const destinos = ['/campanhas', '/locais', ...(admin ? ['/usuarios', '/convites'] : []), '/configuracoes', '/dashboard']
      for (const destino of destinos) {
        await abrir()
        await avaliar(`document.querySelector('.sidebar-nav a[href="${destino}"]').click()`)
        await esperar(`location.pathname===${JSON.stringify(destino)} && !!document.querySelector('.sidebar-nav a.active[href="${destino}"]')`)
        assert.equal(await avaliar(`getComputedStyle(document.querySelector('.sidebar-nav a.active[href="${destino}"]')).backgroundColor`), 'rgb(245, 183, 0)')
        if (mobile) assert.equal(await avaliar('document.querySelector(".sidebar").classList.contains("sidebar-open")'), false)
      }
      await abrir()
      await avaliar('document.querySelector(".sidebar-nav-action").click()')
      await esperar('window.chamadasTeste.some(x=>x.url==="/api/locais/exportar") && !document.querySelector(".sidebar-nav-action").disabled')
      if (mobile) {
        await esperar('!document.querySelector(".sidebar").classList.contains("sidebar-open")')
        await abrir(); await enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' })
        await esperar('!document.querySelector(".sidebar").classList.contains("sidebar-open")'); await abrir()
      }
      assert.equal(await avaliar('document.querySelector(".sidebar-user strong").textContent'), 'Pessoa sintetica')
      assert.equal(await avaliar('document.querySelector(".sidebar-user span").textContent'), perfil)
      assert.equal(await avaliar('document.querySelector(".sidebar-logout").textContent.trim()'), 'Sair')
      assert.equal(await avaliar('document.querySelector(".sidebar-footer").getBoundingClientRect().bottom<=innerHeight'), true)
      assert.equal(await avaliar('document.documentElement.scrollWidth<=innerWidth'), true)
      await pausa(300)
      const captura = await enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      await fs.writeFile(path.join(pasta, `${perfil}-${width}.png`), Buffer.from(captura.data, 'base64'))
      assert.deepEqual(await avaliar('window.falhasTeste'), [])
      resultados.push({ perfil, largura: width, itens: nomes, navegacao: destinos, exportacao: 'API simulada, download fisico bloqueado' })
    }
    // A funcionalidade de relatorios continua acessivel pela rota direta.
    await enviar('Page.navigate', { url: base + '/relatorios' })
    await esperar('location.pathname==="/relatorios" && !!document.querySelector(".sidebar")')
    await avaliar('document.querySelector(".sidebar-logout").click()')
    await esperar('location.pathname==="/login"')
    assert.equal(await avaliar('localStorage.getItem("token")'), null)
    await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier })
  }
  console.log(JSON.stringify({ resultado: 'APROVADO', pasta, resultados, backend: 'NAO_ACESSADO' }))
} finally {
  if (ws?.readyState === WebSocket.OPEN) { await enviar('Browser.close', {}, null).catch(() => {}); ws.close() }
  browser.kill()
}
