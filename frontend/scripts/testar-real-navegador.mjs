// Navegador real: loopback e dados sinteticos no banco novo.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
const base='http://127.0.0.1:5174'
const perfil=await fs.mkdtemp(path.join(os.tmpdir(),'nr33-browser-real-'))
const evidencias=await fs.mkdtemp(path.join(os.tmpdir(),'nr33-evidencias-716-'))
const chamadasAPI=[],externas=[],excecoes=[]
let browser, ws, sessionId, contador = 0
const pendentes = new Map()
const pausa = ms => new Promise(resolve => setTimeout(resolve, ms))
async function esperar(fn, descricao) {
  for (let i = 0; i < 150; i++) { if (await fn()) return; await pausa(100) }
  throw new Error('Timeout: ' + descricao)
}
function enviar(method, params = {}, session = sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++contador
    const timer = setTimeout(() => { pendentes.delete(id); reject(new Error('CDP timeout: ' + method)) }, method === 'Page.captureScreenshot' ? 30000 : 10000)
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
async function clicar(seletor) {
  await esperar(()=>avaliar(`!!document.querySelector(${JSON.stringify(seletor)})`),'elemento disponivel: '+seletor)
  return avaliar(`document.querySelector(${JSON.stringify(seletor)}).click()`)
}
async function botao(nome) {
  await esperar(()=>avaliar(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === ${JSON.stringify(nome)} && !b.disabled)`),'botao disponivel: '+nome)
  return avaliar(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(nome)}).click()`)
}
async function preencher(id, valor) {
  await esperar(()=>avaliar(`!!document.getElementById(${JSON.stringify(id)})`),'campo disponivel: '+id)
  await avaliar(`(() => { const e = document.getElementById(${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(valor)}); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`)
}
try {
  const health=await(await fetch(base+'/api/health')).json();assert.equal(health.banco,'inventario_nr33_multitenant_dev');assert.equal(health.laboratorio,true)
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
  await enviar('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  await enviar('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})

  const marcador='ui716_'+crypto.randomBytes(5).toString('hex')
  console.log('INICIO_NAVEGADOR_716: '+marcador)
  const senha=crypto.randomBytes(24).toString('hex')
  const emailA=`a_${marcador}@lab.invalid`,emailB=`b_${marcador}@lab.invalid`,emailEng=`eng_${marcador}@lab.invalid`
  const nomeCampA=`Campanha A ${marcador}`,nomeCampB=`Campanha B ${marcador}`
  const api=async(endpoint,method='GET',body)=>avaliar(`(async()=>{const token=localStorage.getItem('token');const r=await fetch('/api'+${JSON.stringify(endpoint)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(${JSON.stringify(body??null)}?{body:JSON.stringify(${JSON.stringify(body??null)})}:{})});return {status:r.status,body:await r.json()}})()`)
  async function login(email){await preencher('email',email);await preencher('senha',senha);await clicar('.login-form button[type="submit"]');await esperar(()=>avaliar('location.pathname==="/dashboard" && !!document.querySelector(".sidebar")'),'dashboard autenticado')}
  async function cadastro(empresa,email){
    await clicar('a[href="/cadastro"]');await texto('Cadastre sua empresa')
    for(const [campo,valor] of [['nome',`Administrador ${empresa} ${marcador}`],['nome_ambiente',`Empresa ${empresa} ${marcador}`],['email',email],['senha',senha],['confirmacao',senha]])await preencher(campo,valor)
    if(empresa==='A'){await preencher('confirmacao','diferente');await clicar('.login-form button[type="submit"]');await texto('A confirmação da senha não confere.');await preencher('confirmacao',senha)}
    await clicar('.login-form button[type="submit"]');await texto('Conta criada. Entre com seu e-mail e senha.')
  }
  async function campanha(nome){
    await clicar('a[href="/campanhas"]');await texto('Campanhas');await botao('+ Nova campanha')
    for(const [id,v] of [['nome_campanha',nome],['empresa','Empresa sintetica716'],['responsavel','Equipe sintetica'],['data_inicio','2026-10-18']])await preencher(id,v)
    await clicar('.campanha-form button[type="submit"]');await texto(nome)
  }
  await enviar('Page.navigate',{url:base+'/login'});await texto('Criar conta')
  assert.equal(await avaliar('document.body.innerText.includes("DEMONSTRAÇÃO")'),false)
  await cadastro('A',emailA);await login(emailA)
  assert.equal(await avaliar(`!!document.querySelector(${JSON.stringify('a[href="/usuarios"]')})`),true)
  assert.equal(await avaliar(`!!document.querySelector(${JSON.stringify('a[href="/convites"]')})`),true)
  console.log('OK: cadastro A pela interface, confirmacao de senha, login real e menus administrativos')
  await campanha(nomeCampA)
  const listaA=await api('/campanhas');const campA=listaA.body.data.find(c=>c.nome_campanha===nomeCampA);assert.ok(campA)
  await enviar('Page.navigate',{url:base+`/campanhas/${campA.id_campanha}/locais`});await texto('Novo local');await botao('+ Novo local')
  await preencher('nome_local',`Local A ${marcador}`)
  await clicar('.local-form button[type="submit"]');await texto(`Local A ${marcador}`)
  const locaisA=(await api('/locais')).body.data;const localA=locaisA.find(l=>l.nome_local===`Local A ${marcador}`);assert.ok(localA)
  await enviar('Page.reload');await texto(`Local A ${marcador}`)
  await clicar('a[href="/dashboard"]');await texto('Dashboard')
  await enviar('Page.bringToFront')
  await fs.writeFile(path.join(evidencias,'desktop-administrador.png'),Buffer.from((await enviar('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip:{x:0,y:0,width:1440,height:1000,scale:1}})).data,'base64'))
  console.log('OK: campanha e local criados pela interface e preservados apos recarregar')
  await botao('Sair');await texto('Criar conta');await cadastro('B',emailB);await login(emailB)
  await clicar('a[href="/campanhas"]');await texto('Campanhas')
  assert.equal(await avaliar(`document.body.innerText.includes(${JSON.stringify(nomeCampA)})`),false)
  await campanha(nomeCampB)
  const campB=(await api('/campanhas')).body.data.find(c=>c.nome_campanha===nomeCampB);assert.ok(campB);assert.notEqual(campA.id_ambiente,campB.id_ambiente)
  assert.equal((await api(`/campanhas/${campA.id_campanha}`)).status,404)
  assert.equal((await api(`/locais/${localA.id_local}`)).status,404)
  assert.equal((await api('/locais','POST',{id_campanha:campA.id_campanha,nome_local:'Recusado',id_ambiente:campA.id_ambiente})).status,404)
  await clicar('a[href="/usuarios"]');await texto(emailB);assert.equal(await avaliar(`document.body.innerText.includes(${JSON.stringify(emailA)})`),false)
  console.log('OK: cadastro/login B, UUID distinto, usuarios e recursos A/B isolados no backend real')
  await botao('Sair');await texto('Criar conta');await login(emailA)
  await clicar('a[href="/convites"]');await texto('E-mail do convidado');await preencher('convite-email',emailEng);await botao('Criar convite');await texto('Convite criado')
  const conviteLink=await avaliar('document.getElementById("convite-link").value');assert.ok(new URL(conviteLink).hash.startsWith('#token='))
  await botao('Sair');await texto('Criar conta');await enviar('Page.navigate',{url:conviteLink});await texto('Aceitar convite')
  for(const [id,v] of [['nome',`Engenheiro ${marcador}`],['senha',senha],['confirmacao',senha]])await preencher(id,v)
  await clicar('.login-form button[type="submit"]');await texto('Convite aceito. Entre com o e-mail do convite.');await login(emailEng)
  assert.equal(await avaliar(`!!document.querySelector(${JSON.stringify('a[href="/usuarios"]')})`),false)
  assert.equal(await avaliar(`!!document.querySelector(${JSON.stringify('a[href="/convites"]')})`),false)
  assert.equal((await api('/usuarios')).status,403)
  assert.equal((await api('/convites','POST',{email:`forjado_${marcador}@lab.invalid`,perfilAcesso:'ADMINISTRADOR',id_ambiente:campB.id_ambiente,perfil_acesso:'ADMINISTRADOR'})).status,403)
  assert.equal((await api(`/campanhas/${campA.id_campanha}`)).status,404)
  await enviar('Page.navigate',{url:base+'/usuarios'});await esperar(()=>avaliar('location.pathname==="/dashboard"'),'rota administrativa recusada')
  console.log('OK: convite aceito pela interface; engenheiro sem menus, endpoints ou acesso administrativo')
  await enviar('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  await clicar('.header-menu-button');await esperar(()=>avaliar('document.querySelector(".sidebar").classList.contains("sidebar-open")'),'menu mobile aberto')
  await clicar('a[href="/campanhas"]');await esperar(()=>avaliar('!document.querySelector(".sidebar").classList.contains("sidebar-open")'),'menu mobile fechado')
  assert.equal(await avaliar('document.documentElement.scrollWidth<=390'),true)
  await enviar('Page.navigate',{url:base+'/dashboard'});await texto('Dashboard');await enviar('Page.reload');await esperar(()=>avaliar('!!document.querySelector(".sidebar-user")'),'sessao revalidada')
  await esperar(()=>avaliar('document.readyState==="complete" && document.fonts.status==="loaded"'),'layout mobile pronto')
  await enviar('Page.bringToFront')
  await fs.writeFile(path.join(evidencias,'mobile-engenheiro.png'),Buffer.from((await enviar('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip:{x:0,y:0,width:390,height:844,scale:1}})).data,'base64'))
  assert.equal(await avaliar('document.documentElement.scrollWidth<=390'),true)
  await botao('Sair');await texto('Criar conta')
  assert.deepEqual(externas,[]);assert.deepEqual(excecoes,[])
  console.log('OK: navegacao desktop/mobile, menu recolhivel, sessao revalidada e logout')
  console.log(JSON.stringify({resultado:'NAVEGADOR_REAL_716_OK',marcador,evidencias,chamadas_api_reais:chamadasAPI.length,externas:externas.length,excecoes:excecoes.length,dados_sinteticos:'preservados'}))

} finally {
  if(ws?.readyState===WebSocket.OPEN){try{await enviar('Browser.close',{},null)}catch{/* navegador ja encerrado */}ws.close()}
  if(browser && browser.exitCode===null && !browser.killed)browser.kill()
  for(const p of pendentes.values())p.reject(new Error('Teste encerrado'))
  pendentes.clear()
  if(path.dirname(perfil)===path.resolve(os.tmpdir()) && path.basename(perfil).startsWith('nr33-browser-real-'))await fs.rm(perfil,{recursive:true,force:true,maxRetries:8,retryDelay:200})
}
