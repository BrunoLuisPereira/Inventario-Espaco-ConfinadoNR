import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { abrirNavegador, pausa } from './navegador-isolado.mjs'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const base = 'http://127.0.0.1:5181'
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'test', '--host', '127.0.0.1', '--port', '5181', '--strictPort'], { cwd: raiz, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let iniciou = false, erro, navegador
vite.stdout.on('data', c => { if (c.toString().includes('127.0.0.1:5181')) iniciou = true })
vite.stderr.on('data', c => { if (c.toString().includes('already in use')) erro = Error('Porta de teste indisponível') })
vite.on('error', e => { erro = e })
const cenarios = [
  ['A', ['EM ANDAMENTO', 'CONCLUIDO'], [2, 1, 1, 0]],
  ['A', ['EM ANDAMENTO', 'CONCLUIDO', 'CANCELADA', 'CANCELADA', 'OUTRO'], [5, 1, 1, 2]],
  ['B', ['CANCELADA'], [1, 0, 0, 1]],
  ['B', [], [0, 0, 0, 0]],
  ['A', 'erro', null],
  ['A', 'carregando', null],
]
try {
  for (let i = 0; i < 100 && !iniciou && !erro; i++) await pausa(100)
  if (erro) throw erro
  assert.ok(iniciou, 'Vite efêmero não iniciou')
  navegador = await abrirNavegador('nr33-dashboard-passo8-')
  const { enviar, avaliar, esperar, captura } = navegador
  // Mesmo que o fetch simulado falhe, nenhuma API pode atingir o proxy/backend.
  await enviar('Network.setBlockedURLs', { urls: ['*/api/*', 'https://*'] })
  for (const [ambiente, status, esperado] of cenarios) {
    const { identifier } = await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `
      const usuario={id_usuario:1,nome:'Pessoa sintética ${ambiente}',id_ambiente:${JSON.stringify(ambiente)},perfil_acesso:'ADMINISTRADOR',eh_fundador:true};
      localStorage.setItem('token','FIXTURE_SEM_VALIDADE');localStorage.setItem('usuario',JSON.stringify(usuario));
      window.consultas=[];window.inesperadas=[];
      const estados=${JSON.stringify(status)};
      window.fetch=async(input,init={})=>{
        const p=new URL(input,location.origin);window.consultas.push([p.pathname,p.search,init.method||'GET']);
        const ok=data=>Response.json({status:'success',total:Array.isArray(data)?data.length:undefined,data});
        if(p.pathname==='/api/auth/perfil')return ok(usuario);
        if(p.pathname==='/api/locais')return ok([]);
        if(p.pathname==='/api/campanhas'){
          if(estados==='erro')return Response.json({message:'SQL_INTERNO_SIMULADO'},{status:500});
          if(estados==='carregando')return new Promise(()=>{});
          return ok(estados.map((status,i)=>({id_campanha:i+1,id_ambiente:usuario.id_ambiente,status})));
        }
        window.inesperadas.push(p.pathname);throw Error('API não autorizada no teste');
      };
    ` })
    await enviar('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    await enviar('Page.navigate', { url: base + '/dashboard' })
    if (esperado) {
      await esperar('document.querySelectorAll(".dashboard-card-status-campanhas strong").length===3')
      assert.deepEqual(await avaliar('[Number(document.querySelector(".dashboard-card-value").textContent),...Array.from(document.querySelectorAll(".dashboard-card-status-campanhas strong"),e=>Number(e.textContent))]'), esperado)
      assert.deepEqual(await avaliar('Array.from(document.querySelectorAll(".dashboard-card-status-campanhas span"),e=>e.childNodes[0].textContent.trim())'), ['Em andamento', 'Concluídas', 'Canceladas'])
      await captura('dashboard-desktop-' + ambiente + '-' + esperado[0])
      await enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
      assert.ok(await avaliar('document.documentElement.scrollWidth<=innerWidth'), 'Sem overflow mobile')
      const alturas = await avaliar('Array.from(document.querySelectorAll(".dashboard-card-status-campanhas strong"),e=>e.getBoundingClientRect().top)')
      assert.ok(alturas.every(y => Math.abs(y - alturas[0]) < 2), 'Três números alinhados no celular')
      await captura('dashboard-mobile-' + ambiente + '-' + esperado[0])
    } else {
      await esperar(status === 'erro' ? '!!document.querySelector(".dashboard-error")' : '!!document.querySelector(".dashboard-message")')
      assert.equal(await avaliar('document.querySelectorAll(".dashboard-card-value").length'), 0)
      assert.equal(await avaliar('document.body.textContent.includes("SQL_INTERNO_SIMULADO")'), false)
    }
    assert.deepEqual(await avaliar('window.inesperadas'), [])
    assert.ok(await avaliar('window.consultas.every(c=>c[1]===""&&c[2]==="GET")'), 'Somente GETs existentes, sem ambiente informado pelo cliente')
    await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier })
  }
  console.log(JSON.stringify({ resultado: 'APROVADO', cenarios: cenarios.length, desktopMobile: true, api: 'SIMULADA_E_BLOQUEADA_NA_REDE', capturas: navegador.pasta }))
} finally {
  if (navegador) await navegador.fechar()
  vite.kill()
}
