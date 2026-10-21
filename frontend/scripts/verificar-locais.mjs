import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { abrirNavegador, pausa } from './navegador-isolado.mjs'

// Vite efêmero exclusivo; nenhuma API alcança o backend. Fixtures só no teste.
const raiz = fileURLToPath(new URL('..', import.meta.url))
const base = 'http://127.0.0.1:5180'
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'test', '--host', '127.0.0.1', '--port', '5180', '--strictPort'], { cwd: raiz, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let iniciou = false, falha, navegador
vite.stdout.on('data', c => { if (c.toString().includes('127.0.0.1:5180')) iniciou = true })
vite.stderr.on('data', c => { if (c.toString().includes('already in use')) falha = Error('Porta de teste indisponível') })
vite.on('error', e => { falha = e })
const resultados = []
try {
  for (let i = 0; i < 100 && !iniciou && !falha; i++) await pausa(100)
  if (falha) throw falha
  assert.ok(iniciou, 'Vite de teste não iniciou')
  navegador = await abrirNavegador('nr33-locais-passo7-')
  const { enviar, avaliar, esperar, captura } = navegador
  await enviar('Network.setBlockedURLs', { urls: ['*/api/*', 'https://*'] })
  const click = seletor => avaliar(`document.querySelector(${JSON.stringify(seletor)}).click()`)
  const mudar = (seletor, valor) => avaliar(`(()=>{const e=document.querySelector(${JSON.stringify(seletor)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(valor)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`)
  for (const perfil of ['ADMINISTRADOR', 'VISUALIZADOR', 'ENGENHEIRO_SEGURANCA']) {
    const { identifier } = await enviar('Page.addScriptToEvaluateOnNewDocument', { source: String.raw`
      const usuario={id_usuario:1,nome:'Pessoa de teste',perfil_acesso:${JSON.stringify(perfil)},eh_fundador:${perfil === 'ADMINISTRADOR'}};
      localStorage.setItem('token','SOMENTE_FIXTURE');localStorage.setItem('usuario',JSON.stringify(usuario));
      window.campanhas=[{id_campanha:1,nome_campanha:'Inspeção anual'},{id_campanha:2,nome_campanha:'Manutenção'}];
      window.locais=Array.from({length:27},(_,i)=>({id_local:i+1,id_campanha:i<20?1:2,nome_local:'Tanque '+String(i+1).padStart(2,'0'),setor:i%2?'Oficina':'Produção',status:i%2?'INATIVO':'ATIVO'}));
      window.modo='normal';window.chamadas=[];window.inesperadas=[];
      window.fetch=async(input,init={})=>{
        const p=new URL(input,location.origin).pathname,m=init.method||'GET';window.chamadas.push([m,p,init.body]);
        const ok=data=>Response.json({status:'success',data,total:Array.isArray(data)?data.length:undefined});
        if(p==='/api/auth/perfil')return ok(usuario);
        if(m==='GET'&&p==='/api/campanhas')return ok(window.campanhas);
        if(m==='GET'&&p==='/api/locais'){
          if(window.modo==='carregando')return new Promise(()=>{});
          if(window.modo==='erro')return Response.json({message:'SQL_INTERNO_NAO_PUBLICAR'},{status:500});
          if(window.modo==='proibido')return Response.json({message:'Bloqueado'},{status:403});
          return ok(window.modo==='vazio'?[]:window.locais);
        }
        if(m==='GET'&&p==='/api/locais/exportar')return new Response(new Blob(['XLSX_SINTETICO']),{status:200});
        if(m==='GET'&&/^\/api\/locais\/\d+$/.test(p))return ok(window.locais.find(l=>l.id_local===Number(p.split('/').pop())));
        if(m==='GET'&&(p==='/api/checklists'||/^\/api\/evidencias\/local\/\d+$/.test(p)))return ok([]);
        if(m==='GET'&&/^\/api\/(dados-tecnicos|relatorios)\/local\/\d+$/.test(p))return Response.json({message:'Ainda não cadastrado.'},{status:404});
        if(m==='POST'&&p==='/api/locais'){const d=JSON.parse(init.body);const l={...d,id_local:99};window.locais.push(l);return ok(l)}
        if(m==='PUT'&&p==='/api/locais/1'){const d=JSON.parse(init.body);Object.assign(window.locais[0],d);return ok(window.locais[0])}
        if(m==='PATCH'&&p==='/api/locais/1/status'){Object.assign(window.locais[0],JSON.parse(init.body));return ok(window.locais[0])}
        window.inesperadas.push([m,p]);return Response.json({message:'Recurso não encontrado.'},{status:404});
      };
    ` })
    await enviar('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    await enviar('Page.navigate', { url: base + '/locais' })
    await esperar('document.querySelectorAll(".locais-table tbody tr").length===10')
    assert.equal(await avaliar('document.querySelector("h1").textContent'), 'Locais')
    assert.equal(await avaliar('document.querySelectorAll(".locais-table th").length'), 6)
    assert.equal(await avaliar('document.querySelector(".locais-inventario").textContent'), 'Não informado')
    const edita = perfil !== 'VISUALIZADOR'
    assert.equal(await avaliar('!!document.querySelector(".locais-heading .local-button-primary")'), edita)
    assert.equal(await avaliar('!!document.querySelector(".local-button-edit")'), edita)
    assert.equal(await avaliar('document.querySelector(".local-button-open").getAttribute("href")'), '/locais/1/inventario')
    await click('.locais-paginacao nav button:last-child')
    await esperar('document.querySelector(".locais-paginacao nav span").textContent.includes("Página 2")')
    await mudar('#locais-busca', 'producao'); await mudar('#locais-campanha', '2'); await mudar('#locais-situacao', 'ATIVO')
    await esperar('document.querySelectorAll(".locais-table tbody tr").length===4')
    await mudar('#locais-busca', 'ausente'); await esperar('document.body.textContent.includes("Nenhum resultado encontrado")')
    await mudar('#locais-busca', ''); await mudar('#locais-campanha', ''); await mudar('#locais-situacao', '')
    await esperar('document.querySelectorAll(".locais-table tbody tr").length===10')
    await click('.locais-sort'); await esperar('document.querySelector(".locais-table tbody strong").textContent==="Tanque 27"')
    await mudar('[aria-label="Registros por página"]', '50'); await esperar('document.querySelectorAll(".locais-table tbody tr").length===27')
    if (edita) {
      await click('.locais-heading .local-button-primary')
      await esperar('!!document.querySelector("#campanha-cadastro")')
      assert.equal(await avaliar('document.querySelectorAll("#campanha-cadastro option").length'), 3)
      await mudar('#campanha-cadastro', '1'); await esperar('!!document.querySelector("#nome_local")')
      await mudar('#nome_local', 'Local criado no teste')
      await avaliar('document.querySelector(".local-form-container form").requestSubmit()')
      await esperar('!document.querySelector(".local-form-container")')
      assert.equal(await avaliar('JSON.parse(window.chamadas.find(c=>c[0]==="POST")[2]).id_campanha'), '1')
      await mudar('#locais-busca', 'Tanque 01'); await esperar('document.querySelectorAll(".locais-table tbody tr").length===1')
      await click('.local-button-edit'); await esperar('!!document.querySelector("#nome_local")')
      await mudar('#nome_local', 'Tanque revisado')
      await avaliar('document.querySelector(".local-form-container form").requestSubmit()')
      await esperar('!document.querySelector(".local-form-container")')
      assert.ok(await avaliar('window.chamadas.some(c=>c[0]==="PUT"&&c[1]==="/api/locais/1")'))
      await mudar('#locais-busca', '')
    }
    await captura('locais-desktop-' + perfil)
    await enviar('Emulation.setDeviceMetricsOverride', { width: 900, height: 1100, deviceScaleFactor: 1, mobile: false })
    assert.ok(await avaliar('document.documentElement.scrollWidth<=innerWidth'), 'Página tablet sem overflow horizontal')
    assert.equal(await avaliar('document.querySelector("#locais-busca").disabled'), false)
    await captura('locais-tablet-' + perfil)
    await enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await esperar('getComputedStyle(document.querySelector(".locais-table thead")).display==="none"')
    assert.ok(await avaliar('document.documentElement.scrollWidth<=innerWidth'), 'Página mobile sem overflow horizontal')
    assert.equal(await avaliar('getComputedStyle(document.querySelector(".locais-ordem-mobile")).display'), 'flex')
    await captura('locais-mobile-' + perfil)
    // Navegação real até o inventário, com todas as leituras interceptadas.
    const destino = await avaliar('new URL(document.querySelector(".local-button-open").href).pathname')
    await click('.local-button-open')
    await esperar(`location.pathname===${JSON.stringify(destino)}&&document.querySelector('h1')?.textContent==='Inventário do Local'`)
    await avaliar('history.back()')
    await esperar('!!document.querySelector(".locais-table tbody tr")')
    if (edita) {
      await click('.locais-exportar')
      await esperar('document.body.textContent.includes("Exportação dos locais autorizados concluída")')
      assert.equal(await avaliar('window.chamadas.filter(c=>c[1]==="/api/locais/exportar").length'), 1)
    }
    if (perfil === 'ADMINISTRADOR') {
      for (const [modo, texto] of [['vazio', 'Nenhum local cadastrado'], ['erro', 'Não foi possível concluir'], ['proibido', 'Acesso não autorizado'], ['carregando', 'Carregando locais']]) {
        await avaliar(`window.modo=${JSON.stringify(modo)}`)
        // Remonta sem recarregar as fixtures do documento.
        await avaliar('history.pushState({},"","/relatorios");window.dispatchEvent(new PopStateEvent("popstate"))')
        await pausa(80)
        await avaliar('history.pushState({},"","/locais");window.dispatchEvent(new PopStateEvent("popstate"))')
        await esperar(`document.querySelector('.locais-main')?.textContent.includes(${JSON.stringify(texto)})`)
        if (modo === 'erro') assert.equal(await avaliar('document.body.textContent.includes("SQL_INTERNO_NAO_PUBLICAR")'), false)
      }
    }
    // /relatorios é um desvio do teste, sem API correspondente deliberadamente.
    assert.deepEqual(await avaliar('window.inesperadas.filter(c=>c[1]!=="/api/relatorios")'), [])
    resultados.push({ perfil, tabela: true, filtros: true, paginacao: true, rbac: true, mobile: true })
    await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier })
  }
  console.log(JSON.stringify({ resultado: 'APROVADO', resultados, capturas: navegador.pasta }))
} finally {
  if (navegador) await navegador.fechar()
  vite.kill()
}
