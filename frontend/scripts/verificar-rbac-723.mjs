import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { abrirNavegador, pausa } from './navegador-isolado.mjs'

// Vite exclusivo, envDir:false, API integralmente interceptada antes do React.
// Mesmo uma chamada que escape do mock é bloqueada pelo protocolo do navegador.
const raiz = fileURLToPath(new URL('..', import.meta.url))
const base = 'http://127.0.0.1:5178'
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--mode','test','--host','127.0.0.1','--port','5178','--strictPort'], { cwd:raiz, windowsHide:true, stdio:['ignore','pipe','pipe'], env:{...process.env} })
let iniciado = false, falha
vite.stdout.on('data', chunk => { if (chunk.toString().includes('127.0.0.1:5178')) iniciado = true })
vite.stderr.on('data', chunk => { if (chunk.toString().includes('already in use')) falha = Error('Porta exclusiva 5178 indisponível') })
vite.on('error', e => { falha=e })
let b
try {
  for(let i=0;i<100&&!iniciado&&!falha;i++) await pausa(100)
  if(falha) throw falha
  assert.ok(iniciado,'Servidor de testes frontend não iniciou')
  b=await abrirNavegador('nr33-rbac-723-')
  const {enviar,avaliar,esperar}=b
  await enviar('Network.setBlockedURLs',{urls:['*/api/*','https://*']})
  const perfis=['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR','SUPERVISOR','AUDITOR','VISUALIZADOR']
  const resultados=[]
  for(const perfil of perfis) {
    const {identifier}=await enviar('Page.addScriptToEvaluateOnNewDocument',{source:`
      const u={id_usuario:10,nome:'Pessoa sintética',email:'pessoa@example.invalid',perfil_acesso:${JSON.stringify(perfil)},eh_fundador:${perfil==='ADMINISTRADOR'},ativo:true};
      localStorage.setItem('token','token-exclusivamente-simulado');localStorage.setItem('usuario',JSON.stringify(u));
      window.patches=[];window.inesperadas=[];window.auditoria=[];window.falharPatch=false;
      window.usuarios=[u,{id_usuario:20,nome:'Convidado A',email:'convidado@example.invalid',perfil_acesso:'ENGENHEIRO_SEGURANCA',eh_fundador:false,id_convite_origem:'33333333-3333-4333-8333-333333333333',ativo:true}];
      window.fetch=async (input,init={})=>{
        const p=new URL(input,location.origin).pathname,method=init.method||'GET';
        if(method==='GET'&&p==='/api/auth/perfil')return Response.json({status:'success',data:u});
        if(method==='GET'&&p==='/api/usuarios')return Response.json({status:'success',total:window.usuarios.length,data:window.usuarios});
        if(method==='GET'&&p==='/api/usuarios/auditoria/perfis')return Response.json({status:'success',data:window.auditoria});
        if(method==='PATCH'&&p==='/api/usuarios/20/permissoes'){
          const body=JSON.parse(init.body);window.patches.push(body);
          if(window.falharPatch)return Response.json({message:'SQL_INTERNO_NAO_PUBLICAR'},{status:500});
          const antigo=window.usuarios[1].perfil_acesso;window.usuarios[1].perfil_acesso=body.perfil_acesso;
          window.auditoria.push({id_auditoria:1,id_usuario_responsavel:10,id_usuario_afetado:20,perfil_anterior:antigo,perfil_novo:body.perfil_acesso,data_hora:'2026-10-19T00:00:00Z'});
          return Response.json({status:'success',data:window.usuarios[1]});
        }
        if(method==='GET'&&p==='/api/campanhas')return Response.json({status:'success',data:[{id_campanha:30,nome_campanha:'Campanha do ambiente',empresa:'Empresa A',responsavel:'Outro integrante',status:'EM ANDAMENTO',data_inicio:'2026-10-19'}]});
        if(method==='GET'&&p==='/api/campanhas/30')return Response.json({status:'success',data:{id_campanha:30,nome_campanha:'Campanha do ambiente',status:'EM ANDAMENTO'}});
        if(method==='GET'&&p==='/api/locais')return Response.json({status:'success',data:[{id_local:40,id_campanha:30,nome_local:'Tanque do ambiente',status:'ATIVO'}]});
        if(method==='GET'&&p==='/api/relatorios')return Response.json({status:'success',data:[]});
        window.inesperadas.push(method+' '+p);throw Error('API fora do simulador; rede bloqueada');
      };
    `})
    await enviar('Page.navigate',{url:base+'/usuarios'})
    if(perfil==='ADMINISTRADOR') {
      await esperar('document.querySelectorAll(".usuarios-tabela tbody tr").length===2')
      assert.equal(await avaliar('document.querySelectorAll(".usuarios-editar").length'),1)
      assert.equal(await avaliar('document.querySelector(".usuarios-tabela tbody tr:first-child").textContent.includes("Fundador")'),true)
      await avaliar('document.querySelector(".usuarios-editar").click()')
      await esperar('document.querySelector("dialog")?.open')
      assert.deepEqual(await avaliar('Array.from(document.querySelectorAll("#novo-perfil option")).map(o=>o.value)'),perfis.slice(1))
      for(const width of [1440,390,320]) {
        await enviar('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<600})
        assert.equal(await avaliar('document.documentElement.scrollWidth<=innerWidth'),true)
        assert.equal(await avaliar('(()=>{const r=document.querySelector("dialog").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()'),true)
      }
      await avaliar('document.querySelector("#novo-perfil").value="COORDENADOR";document.querySelector("#novo-perfil").dispatchEvent(new Event("change",{bubbles:true}))')
      assert.equal(await avaliar('document.querySelector("dialog button[type=submit]").disabled'),true)
      await avaliar('document.querySelector(".permissoes-confirmacao input").click()')
      await esperar('!document.querySelector("dialog button[type=submit]").disabled')
      await avaliar('document.querySelector("dialog button[type=submit]").click()')
      await esperar('!document.querySelector("dialog")')
      assert.deepEqual(await avaliar('window.patches'),[{perfil_acesso:'COORDENADOR'}])
      assert.equal(await avaliar('document.querySelector(".usuarios-tabela").textContent.includes("Coordenador")'),true)
      await avaliar('document.querySelector(".usuarios-auditoria button").click()')
      await esperar('document.querySelectorAll(".usuarios-auditoria li").length===1')
      assert.equal(await avaliar('document.querySelector(".usuarios-auditoria").textContent.includes("Convidado A")'),true)
      await avaliar('window.falharPatch=true;document.querySelector(".usuarios-editar").click()')
      await esperar('document.querySelector("dialog")?.open')
      await avaliar('document.querySelector("#novo-perfil").value="AUDITOR";document.querySelector("#novo-perfil").dispatchEvent(new Event("change",{bubbles:true}))')
      await avaliar('document.querySelector(".permissoes-confirmacao input").click()')
      await avaliar('document.querySelector("dialog button[type=submit]").click()')
      await esperar('!!document.querySelector("dialog [role=alert]")')
      assert.equal(await avaliar('document.body.textContent.includes("SQL_INTERNO_NAO_PUBLICAR")'),false)
      assert.equal(await avaliar('window.usuarios[1].perfil_acesso'),'COORDENADOR')
      await avaliar('document.querySelector("dialog button[type=button]").click()')
      await enviar('Page.navigate',{url:base+'/convites'})
      await esperar('!!document.querySelector("#convite-perfil")')
      assert.deepEqual(await avaliar('Array.from(document.querySelectorAll("#convite-perfil option")).map(o=>o.value)'),perfis.slice(1))
      assert.ok(await avaliar('document.querySelector("#convite-permissoes").textContent.length>30'))
    } else {
      await esperar('location.pathname==="/dashboard"&&!!document.querySelector(".sidebar")')
      assert.equal(await avaliar(`!!document.querySelector('.sidebar a[href="/usuarios"]')`),false)
      assert.equal(await avaliar(`!!document.querySelector('.sidebar a[href="/convites"]')`),false)
    }
    await enviar('Page.navigate',{url:base+'/campanhas'})
    await esperar('!!document.querySelector(".campanha-button-edit")')
    assert.equal(await avaliar('!!document.querySelector(".sidebar-nav-action")'),perfil!=='VISUALIZADOR')
    assert.equal(await avaliar('document.querySelector(".campanha-button-edit").disabled'),['SUPERVISOR','AUDITOR','VISUALIZADOR'].includes(perfil))
    await enviar('Page.navigate',{url:base+'/campanhas/30/locais'})
    await esperar('!!document.querySelector(".locais-table tbody tr")')
    assert.equal(await avaliar('!!document.querySelector(".local-button-edit")'),!['SUPERVISOR','AUDITOR','VISUALIZADOR'].includes(perfil))
    assert.deepEqual(await avaliar('window.inesperadas'),[])
    resultados.push({perfil,resultado:'APROVADO'})
    await enviar('Page.removeScriptToEvaluateOnNewDocument',{identifier})
  }
  console.log(JSON.stringify({modo:'API_SINTETICA_EXPLICITA_REDE_API_BLOQUEADA',resultados,desktop_mobile:true}))
} finally {
  if(b) await b.fechar()
  vite.kill()
}
