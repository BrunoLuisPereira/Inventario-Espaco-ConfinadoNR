import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { abrirNavegador, pausa } from './navegador-isolado.mjs'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const base = 'http://127.0.0.1:5183'
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'test', '--host', '127.0.0.1', '--port', '5183', '--strictPort'], { cwd: raiz, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let iniciou = false, erro, navegador
vite.stdout.on('data', c => { if (c.toString().includes('127.0.0.1:5183')) iniciou = true })
vite.stderr.on('data', c => { if (c.toString().includes('already in use')) erro = Error('Porta de teste indisponível') })
vite.on('error', e => { erro = e })
const cenarios = ['um-A', 'multiplos-B', 'vazio', 'erro', 'revogado', 'semPermissao', 'limite200', 'acimaLimite', 'muitos', 'interrompida', 'novaConsulta', 'duplicada', 'trocaSessao']
try {
  for (let i = 0; i < 100 && !iniciou && !erro; i++) await pausa(100)
  if (erro) throw erro
  assert.ok(iniciou, 'Vite não iniciou')
  navegador = await abrirNavegador('nr33-auditoria-csv-')
  const { enviar, avaliar, esperar, captura } = navegador
  await enviar('Network.setBlockedURLs', { urls: ['*/api/*', 'https://*'] })
  await enviar('Emulation.setTimezoneOverride', { timezoneId: 'America/Sao_Paulo' })
  for (const cenario of cenarios) {
    const { identifier } = await enviar('Page.addScriptToEvaluateOnNewDocument', { source: String.raw`
      const cenario=${JSON.stringify(cenario)},ambiente=cenario==='multiplos-B'?'B':'A';
      const u={id_usuario:1,nome:'Responsável '+ambiente,perfil_acesso:cenario==='semPermissao'?'ENGENHEIRO_SEGURANCA':'ADMINISTRADOR',eh_fundador:cenario!=='semPermissao'};
      const alvo={id_usuario:2,nome:'Pessoa '+ambiente,perfil_acesso:'SUPERVISOR',ativo:true};
      localStorage.setItem('token','FIXTURE_'+ambiente);localStorage.setItem('usuario',JSON.stringify(u));
      window.auditoriaChamadas=[];window.downloads=[];window.urlsRevogadas=[];window.inesperadas=[];window.csvs=[];
      URL.createObjectURL=blob=>{blob.text().then(csv=>window.csvs.push(csv));return 'blob:teste-csv'};
      URL.revokeObjectURL=url=>window.urlsRevogadas.push(url);
      HTMLAnchorElement.prototype.click=function(){window.downloads.push(this.download)};
      const h={id_auditoria:1,id_usuario_afetado:2,id_usuario_responsavel:1,perfil_anterior:'COORDENADOR',perfil_novo:'SUPERVISOR',data_hora:'2026-10-20T23:57:53Z'};
      window.fetch=async(input,init={})=>{
        const p=new URL(input,location.origin),m=init.method||'GET';const ok=data=>Response.json({status:'success',data,total:Array.isArray(data)?data.length:undefined});
        if(p.pathname==='/api/auth/perfil')return ok(u);
        if(p.pathname==='/api/usuarios')return ok([u,alvo]);
        if(p.pathname==='/api/campanhas'||p.pathname==='/api/locais')return ok([]);
        if(p.pathname==='/api/usuarios/auditoria/perfis'||p.pathname==='/api/usuarios/auditoria/perfis/exportar'){
          const completo=p.pathname.endsWith('/exportar');
          window.auditoriaChamadas.push([m,p.search]);
          if(cenario==='erro')return Response.json({message:'SQL_CREDENCIAL_NAO_PUBLICAR'},{status:500});
          if(cenario==='revogado')return Response.json({message:'Acesso não autorizado.'},{status:403});
          const n=cenario==='vazio'?0:cenario==='limite200'?200:cenario==='acimaLimite'?201:cenario==='muitos'?5007:cenario==='multiplos-B'||cenario==='novaConsulta'&&window.auditoriaChamadas.length>1?2:1;
          const dados=Array.from({length:n},(_,i)=>({...h,id_auditoria:i+1,nome_usuario:alvo.nome,nome_responsavel:u.nome}));
          const responder=()=>{
            if(!completo)return ok(dados.slice(0,200));
            const frames=[];for(let i=0;i<dados.length;i+=500)frames.push(JSON.stringify({tipo:'lote',registros:dados.slice(i,i+500)}));
            if(cenario!=='interrompida')frames.push(JSON.stringify({tipo:'fim',total:String(n)}));
            return new Response(frames.join('\n')+'\n',{headers:{'Content-Type':'application/x-ndjson'}});
          };
          if(cenario==='duplicada'||cenario==='trocaSessao')return new Promise(resolve=>window.liberarCsv=()=>resolve(responder()));
          return responder();
        }
        window.inesperadas.push([m,p.pathname]);throw Error('API proibida');
      };
    ` })
    await enviar('Page.navigate', { url: base + '/usuarios' })
    if (cenario === 'semPermissao') {
      await esperar('location.pathname==="/dashboard"&&!!document.querySelector(".sidebar")')
      assert.equal(await avaliar('!!document.querySelector(".auditoria-exportar")'), false)
      assert.deepEqual(await avaliar('window.auditoriaChamadas'), [])
    } else {
      await esperar('!!document.querySelector(".auditoria-exportar")')
      assert.deepEqual(await avaliar('window.auditoriaChamadas'), [])
      assert.ok(await avaliar('document.querySelector(".auditoria-exportacao-nota").textContent.includes("todas as alterações armazenadas")'))
      if (['novaConsulta', 'limite200'].includes(cenario)) {
        await avaliar('document.querySelector(".auditoria-acoes button").click()')
        await esperar(`document.querySelectorAll('.auditoria-registro').length===${cenario === 'limite200' ? 10 : 1}`)
      }
      await avaliar('document.querySelector(".auditoria-exportar").click();document.querySelector(".auditoria-exportar").click()')
      if (['duplicada', 'trocaSessao'].includes(cenario)) {
        await esperar('!!window.liberarCsv')
        assert.equal(await avaliar('window.auditoriaChamadas.length'), 1)
        assert.equal(await avaliar('document.querySelector(".auditoria-exportar").textContent.trim()'), 'Exportando...')
        assert.equal(await avaliar('document.querySelector(".auditoria-acoes button").disabled'), true)
        if (cenario === 'trocaSessao') await avaliar('localStorage.setItem("token","OUTRA_SESSAO")')
        await avaliar('window.liberarCsv()')
      }
      if (['erro', 'revogado', 'interrompida'].includes(cenario)) {
        await esperar('!!document.querySelector(".usuarios-auditoria [role=alert]")')
        assert.deepEqual(await avaliar('window.downloads'), [])
        assert.equal(await avaliar('document.body.textContent.includes("SQL_CREDENCIAL_NAO_PUBLICAR")'), false)
      } else if (cenario === 'vazio') {
        await esperar('document.querySelector(".usuarios-auditoria").textContent.includes("Nenhum registro disponível para exportação")')
        assert.deepEqual(await avaliar('window.downloads'), [])
      } else if (cenario === 'trocaSessao') {
        await esperar('!document.querySelector(".auditoria-exportar").disabled')
        assert.deepEqual(await avaliar('window.downloads'), [])
      } else {
        await esperar('window.csvs.length===1&&window.downloads.length===1')
        const csv = await avaliar('window.csvs[0]')
        const ambiente = cenario === 'multiplos-B' ? 'B' : 'A'
        assert.ok(csv.includes('Pessoa ' + ambiente)); assert.equal(csv.includes('Pessoa ' + (ambiente === 'A' ? 'B' : 'A')), false)
        assert.ok(csv.includes('"20/10/2026";"20:57:53"'))
        const n = cenario === 'limite200' ? 200 : cenario === 'acimaLimite' ? 201 : cenario === 'muitos' ? 5007 : ['multiplos-B', 'novaConsulta'].includes(cenario) ? 2 : 1
        assert.equal(csv.split('\r\n').length, n + 2)
        if (cenario === 'limite200') assert.equal(await avaliar('document.querySelectorAll(".auditoria-registro").length'), 10, 'Consulta visual de 10 não limita o CSV de 200')
        assert.match(await avaliar('window.downloads[0]'), /^auditoria_permissoes_\d{4}-\d{2}-\d{2}\.csv$/)
        assert.deepEqual(await avaliar('window.urlsRevogadas'), ['blob:teste-csv'])
      }
      assert.equal(await avaliar('window.auditoriaChamadas.length'), ['novaConsulta', 'limite200'].includes(cenario) ? 2 : 1)
      assert.ok(await avaliar('window.auditoriaChamadas.every(c=>c[0]==="GET"&&c[1]==="")'))
      if (cenario === 'um-A') {
        await enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
        assert.ok(await avaliar('document.documentElement.scrollWidth<=innerWidth'))
        await avaliar('document.querySelector(".usuarios-auditoria").scrollIntoView()')
        await captura('auditoria-exportacao-mobile')
      }
    }
    assert.deepEqual(await avaliar('window.inesperadas'), [])
    await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier })
  }
  console.log(JSON.stringify({ resultado: 'APROVADO', cenarios: cenarios.length, api: 'SIMULADA_COM_REDE_BLOQUEADA', capturas: navegador.pasta }))
} finally {
  if (navegador) await navegador.fechar()
  vite.kill()
}
