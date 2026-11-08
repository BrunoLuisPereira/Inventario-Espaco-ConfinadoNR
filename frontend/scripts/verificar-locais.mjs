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
  async function conferirVisual(edita) {
    for (const tema of ['light', 'dark']) {
      await avaliar(`document.documentElement.setAttribute('data-theme',${JSON.stringify(tema)})`)
      await enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })
      const visual = await avaliar(`(()=>{const r=document.querySelector('.locais-table tbody tr'),n=getComputedStyle(r.querySelector('strong')),c=getComputedStyle(r.children[1]),s=getComputedStyle(r.children[2]),referencia=document.createElement('span');referencia.style.color='var(--color-text-heading)';document.body.append(referencia);const cor=getComputedStyle(referencia).color;referencia.remove();const b=r.querySelector('.local-button-edit');return {nome:[n.fontWeight,n.fontSize,n.color],campanha:[c.fontSize,c.color],setor:[s.fontSize,s.color],titulos:Array.from(document.querySelectorAll('.locais-table th')).map(e=>{const s=getComputedStyle(e);return [s.fontWeight,s.fontSize,s.color]}),cor,botao:b&&{titulo:b.title,aria:b.getAttribute('aria-label'),texto:b.textContent.trim(),w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height,borda:getComputedStyle(b).borderTopWidth},semSobreposicao:!b||(()=>{const a=r.querySelector('.local-button-open').getBoundingClientRect(),i=b.getBoundingClientRect();return a.right<=i.left||i.right<=a.left||a.bottom<=i.top||i.bottom<=a.top;})()};})()`)
      assert.equal(visual.nome[0], '400')
      assert.deepEqual(visual.nome.slice(1), visual.campanha)
      assert.deepEqual(visual.nome.slice(1), visual.setor)
      assert.ok(visual.titulos.every(([peso, tamanho, cor]) => peso === '600' && tamanho === '12.8px' && cor === visual.cor))
      assert.equal(visual.semSobreposicao, true)
      assert.ok(await avaliar(`Array.from(document.querySelectorAll('.locais-table tbody tr')).every(r=>{const a=r.querySelector('.local-actions');return a.children.length===1&&a.firstElementChild.classList.contains('local-button-open')})`))
      if (edita) {
        const posicoes = await avaliar(`Array.from(document.querySelectorAll('.locais-table tbody tr')).map(r=>{const b=r.querySelector('.local-button-edit'),i=b.getBoundingClientRect(),g=b.parentElement.getBoundingClientRect(),n=r.querySelector('strong').getBoundingClientRect();return {x:i.x,noLocal:b.closest('td')===r.firstElementChild,direita:Math.abs(i.right-g.right)<1,semSobreposicao:n.right<=i.left}})`)
        assert.ok(posicoes.every(p => p.noLocal && p.direita && p.semSobreposicao && Math.abs(p.x-posicoes[0].x)<1))
      }
      if (edita) {
        assert.equal(visual.botao.titulo, 'Editar local')
        assert.match(visual.botao.aria, /^Editar local /)
        assert.equal(visual.botao.texto, '')
        assert.equal(visual.botao.w, 44); assert.equal(visual.botao.h, 44)
        assert.equal(visual.botao.borda, '0px')
      } else assert.equal(visual.botao, null)
    }
    await avaliar("document.documentElement.setAttribute('data-theme','light')")
  }
  for (const perfil of ['ADMINISTRADOR', 'ENGENHEIRO_SEGURANCA', 'TECNICO_SEGURANCA', 'COORDENADOR', 'SUPERVISOR', 'AUDITOR', 'VISUALIZADOR']) {
    const { identifier } = await enviar('Page.addScriptToEvaluateOnNewDocument', { source: String.raw`
      const usuario={id_usuario:1,nome:'Pessoa de teste',perfil_acesso:${JSON.stringify(perfil)},eh_fundador:${perfil === 'ADMINISTRADOR'}};
      localStorage.setItem('token','SOMENTE_FIXTURE');localStorage.setItem('usuario',JSON.stringify(usuario));
      window.campanhas=[{id_campanha:1,nome_campanha:'Inspeção anual'},{id_campanha:2,nome_campanha:'Manutenção'}];
      window.locais=Array.from({length:27},(_,i)=>({id_local:i+1,id_campanha:i<20?1:2,nome_local:'Tanque '+String(i+1).padStart(2,'0'),setor:i%2?'Oficina':'Produção',status:i%2?'INATIVO':'ATIVO'}));
      window.modo='normal';window.chamadas=[];window.inesperadas=[];
      window.pdfModo='aguardar';window.downloads=[];window.revogadas=[];window.pdfAutenticado=false;
      window.botaoPdf=()=>Array.from(document.querySelectorAll('.locais-table tbody tr')).find(r=>r.querySelector('strong')?.textContent==='Tanque 01')?.querySelector('.local-button-pdf');
      URL.createObjectURL=()=> 'blob:fixture-pdf';URL.revokeObjectURL=url=>window.revogadas.push(url);
      const clickOriginal=HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click=function(){if(this.download&&this.href==='blob:fixture-pdf'){window.downloads.push(this.download);return}return clickOriginal.call(this)};
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
        if(m==='GET'&&/^\/api\/relatorios\/local\/\d+$/.test(p)){
          const id=Number(p.split('/').pop());
          if(id===4)return Response.json({message:'Falha'},{status:503});
          if(id<=3)return ok({id_local:id,id_relatorio:100+id,status:'GERADO',caminho_pdf:id===2?null:'uploads/relatorios/fixture.pdf'});
          return Response.json({message:'Ainda não cadastrado.'},{status:404});
        }
        if(m==='HEAD'&&/^\/api\/relatorios\/\d+\/pdf$/.test(p))return new Response(null,{status:p.includes('/101/')?200:404,headers:{'Content-Type':'application/pdf'}});
        if(m==='GET'&&p==='/api/relatorios/101/pdf'){
          window.pdfAutenticado=init.headers.Authorization==='Bearer SOMENTE_FIXTURE';
          const resposta=()=>window.pdfModo==='ausente'?Response.json({message:'Arquivo indisponível'},{status:404}):window.pdfModo==='proibido'?Response.json({message:'Sem permissão'},{status:403}):new Response('%PDF-1.7 fixture',{headers:{'Content-Type':'application/pdf'}});
          if(window.pdfModo==='aguardar')return new Promise(resolve=>{window.resolverPdf=()=>resolve(resposta())});
          return resposta();
        }
        if(m==='GET'&&/^\/api\/dados-tecnicos\/local\/\d+$/.test(p))return Response.json({message:'Ainda não cadastrado.'},{status:404});
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
    assert.equal(await avaliar('document.querySelectorAll(".locais-table th").length'), 7)
    assert.equal(await avaliar('document.querySelector(".locais-classificacao").textContent'), 'Não avaliado')
    for (const [respostas, esperado] of [
      [['SIM', 'SIM', 'SIM'], 'Sim'],
      [['SIM', 'NAO', 'SIM'], 'Não'],
      [['NAO', 'SIM', 'SIM'], 'Não'],
      [['SIM', 'SIM', 'NAO'], 'Não'],
      [['SIM', null, 'SIM'], 'Não avaliado'],
      [[null, null, null], 'Não avaliado'],
    ]) {
      // Somente fixtures desta página isolada; nenhuma chamada ao backend real.
      await avaliar(`Object.assign(window.locais[0],${JSON.stringify(Object.fromEntries(['criterio_a', 'criterio_b', 'criterio_c'].map((k, i) => [k, respostas[i]])))});window.dispatchEvent(new Event('focus'))`)
      await esperar(`document.querySelector('.locais-classificacao')?.textContent===${JSON.stringify(esperado)}`)
      for (const tema of ['light', 'dark']) {
        await avaliar(`document.documentElement.setAttribute('data-theme',${JSON.stringify(tema)})`)
        const visual = await avaliar(`(()=>{const e=document.querySelector('.locais-classificacao'),s=getComputedStyle(e);return {tag:e.tagName,cor:s.color,fundo:s.backgroundColor,raio:s.borderRadius,padding:s.padding};})()`)
        const paleta = tema === 'light'
          ? { Sim: ['rgb(2, 122, 72)', 'rgb(236, 253, 243)'], Não: ['rgb(180, 35, 24)', 'rgb(254, 228, 226)'], 'Não avaliado': ['rgb(71, 84, 103)', 'rgb(242, 244, 247)'] }
          : { Sim: ['rgb(110, 231, 183)', 'rgb(18, 59, 43)'], Não: ['rgb(253, 164, 175)', 'rgb(76, 29, 36)'], 'Não avaliado': ['rgb(203, 213, 225)', 'rgb(51, 65, 85)'] }
        assert.deepEqual([visual.cor, visual.fundo], paleta[esperado])
        assert.equal(visual.tag, 'SPAN'); assert.equal(visual.raio, '999px'); assert.equal(visual.padding, '6px 10px')
        for (const [classe, estado] of [['ativo', 'Sim'], ['inativo', 'Não']]) {
          assert.deepEqual(await avaliar(`(()=>{const s=getComputedStyle(document.querySelector('.locais-status-${classe}'));return [s.color,s.backgroundColor];})()`), paleta[estado])
        }
      }
      await avaliar("document.documentElement.setAttribute('data-theme','light')")
    }
    const edita = !['SUPERVISOR', 'AUDITOR', 'VISUALIZADOR'].includes(perfil)
    assert.equal(await avaliar('!!document.querySelector(".locais-heading .local-button-primary")'), edita)
    assert.equal(await avaliar('!!document.querySelector(".local-button-edit")'), edita)
    assert.equal(await avaliar('!!document.querySelector("select.locais-status")'), edita)
    if (edita) {
      for (const status of ['INATIVO', 'ATIVO']) {
        await mudar('select.locais-status', status)
        await esperar(`document.querySelector('select.locais-status')?.value===${JSON.stringify(status)}&&!document.querySelector('select.locais-status').disabled`)
        assert.ok(await avaliar(`window.chamadas.some(c=>c[0]==='PATCH'&&c[1]==='/api/locais/1/status'&&JSON.parse(c[2]).status===${JSON.stringify(status)})`))
      }
    }
    assert.equal(await avaliar('document.querySelector(".local-button-open").getAttribute("href")'), '/locais/1/inventario')
    await avaliar(`window.locaisAntesFiltro=window.locais;window.locais=window.locais.map((l,i)=>({...l,criterio_a:'SIM',criterio_b:i%3===1?'NAO':'SIM',criterio_c:i%3===2?null:'SIM'}));window.dispatchEvent(new Event('focus'))`)
    await esperar('document.querySelectorAll(".locais-table tbody tr").length===10')
    await click('.locais-paginacao nav button:last-child')
    await esperar('document.querySelector(".locais-paginacao nav span").textContent.includes("Página 2")')
    for (const [valor, texto] of [['sim', 'Sim'], ['nao', 'Não'], ['nao-avaliado', 'Não avaliado']]) {
      await mudar('#locais-espaco', valor)
      await esperar(`document.querySelectorAll('.locais-table tbody tr').length===9&&Array.from(document.querySelectorAll('.locais-classificacao')).every(e=>e.textContent===${JSON.stringify(texto)})`)
      assert.match(await avaliar('document.querySelector(".locais-paginacao p").textContent'), /de 9 locais/)
      assert.match(await avaliar('document.querySelector(".locais-paginacao nav span").textContent'), /Página 1 de 1/)
    }
    await mudar('#locais-espaco', 'sim'); await mudar('#locais-busca', 'producao'); await mudar('#locais-campanha', '1'); await mudar('#locais-situacao', 'ATIVO')
    await esperar('document.querySelectorAll(".locais-table tbody tr").length===4')
    for (const tema of ['light', 'dark']) {
      await avaliar(`document.documentElement.setAttribute('data-theme',${JSON.stringify(tema)})`)
      assert.equal(await avaliar('getComputedStyle(document.querySelector("th.locais-col-espaco")).textAlign'), 'center')
      assert.equal(await avaliar('getComputedStyle(document.querySelector("td.locais-col-espaco")).textAlign'), 'center')
      assert.notEqual(await avaliar('getComputedStyle(document.querySelector("td:first-child")).textAlign'), 'center')
    }
    await avaliar("document.documentElement.setAttribute('data-theme','light');window.locais=window.locaisAntesFiltro;window.dispatchEvent(new Event('focus'))")
    await mudar('#locais-espaco', ''); await mudar('#locais-busca', ''); await mudar('#locais-campanha', ''); await mudar('#locais-situacao', '')
    await esperar('document.querySelectorAll(".locais-table tbody tr").length===10')
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
      await avaliar('document.querySelector(".local-button-edit").focus()')
      await enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 })
      await enviar('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
      await esperar('!!document.querySelector("#nome_local")')
      await mudar('#nome_local', 'Tanque revisado')
      await avaliar('document.querySelector(".local-form-container form").requestSubmit()')
      await esperar('!document.querySelector(".local-form-container")')
      assert.ok(await avaliar('window.chamadas.some(c=>c[0]==="PUT"&&c[1]==="/api/locais/1")'))
      await mudar('#locais-busca', '')
    }
    await conferirVisual(edita)
    await captura('locais-desktop-' + perfil)
    await enviar('Emulation.setDeviceMetricsOverride', { width: 900, height: 1100, deviceScaleFactor: 1, mobile: false })
    assert.ok(await avaliar('document.documentElement.scrollWidth<=innerWidth'), 'Página tablet sem overflow horizontal')
    assert.equal(await avaliar('document.querySelector("#locais-busca").disabled'), false)
    await conferirVisual(edita)
    await captura('locais-tablet-' + perfil)
    await enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await esperar('getComputedStyle(document.querySelector(".locais-table thead")).display==="none"')
    assert.ok(await avaliar('document.documentElement.scrollWidth<=innerWidth'), 'Página mobile sem overflow horizontal')
    assert.equal(await avaliar('getComputedStyle(document.querySelector(".locais-ordem-mobile")).display'), 'flex')
    assert.equal(await avaliar('getComputedStyle(document.querySelector(".locais-col-espaco .locais-classificacao")).justifySelf'), 'center')
    await conferirVisual(edita)
    await captura('locais-mobile-' + perfil)
    // Navegação real até o inventário, com todas as leituras interceptadas.
    const destino = await avaliar('new URL(document.querySelector(".local-button-open").href).pathname')
    await click('.local-button-open')
    await esperar(`location.pathname===${JSON.stringify(destino)}&&document.querySelector('h1')?.textContent==='Inventário do Local'`)
    await avaliar('history.back()')
    await esperar('!!document.querySelector(".locais-table tbody tr")')
    if (edita) {
      await mudar('#locais-espaco', 'nao')
      await click('.locais-exportar')
      await esperar('document.body.textContent.includes("Exportação dos locais autorizados concluída")')
      assert.equal(await avaliar('window.chamadas.filter(c=>c[1]==="/api/locais/exportar").length'), 1)
      await mudar('#locais-espaco', '')
    }
    // O mesmo contrato de disponibilidade/download nas duas entradas da listagem.
    for (const rota of ['/locais', '/campanhas/1/locais']) {
      const outraRota = rota === '/locais' ? '/campanhas/1/locais' : '/locais'
      await enviar('Page.navigate', { url: base + rota })
      await esperar('document.querySelectorAll(".locais-table th").length===7')
      await esperar('!!document.querySelector(".local-button-pdf:not(:disabled)") && document.querySelectorAll(".local-pdf-indisponivel[title*=Verificando]").length===0')
      assert.deepEqual(await avaliar('Array.from(document.querySelectorAll(".locais-table th")).slice(-3).map(e=>e.textContent)'), ['Situação','Relatório','Ações'])
      assert.equal(await avaliar('document.querySelector(".local-button-pdf:not(:disabled)").getAttribute("aria-label")'), 'Baixar PDF de Tanque 01')
      assert.equal(await avaliar('document.querySelectorAll(".local-button-pdf:not(:disabled)").length'), 1)
      assert.equal(await avaliar('window.chamadas.some(c=>c[0]==="GET"&&c[1].startsWith("/api/relatorios/")&&c[1].endsWith("/pdf"))'), false)
      assert.ok(await avaliar('window.chamadas.some(c=>c[0]==="HEAD"&&c[1]==="/api/relatorios/103/pdf")'))
      assert.ok(await avaliar('Array.from(document.querySelectorAll(".local-pdf-indisponivel")).some(e=>e.title==="Gere primeiro o relatório no inventário"&&e.tabIndex===0&&e.querySelector("button").disabled)'))
      assert.ok(await avaliar('Array.from(document.querySelectorAll(".local-pdf-indisponivel")).some(e=>e.title.includes("Não foi possível verificar"))'))
      assert.equal(await avaliar('window.chamadas.some(c=>c[0]==="HEAD"&&c[1]==="/api/relatorios/102/pdf")'), false)
      assert.ok(await avaliar('document.documentElement.scrollWidth<=innerWidth'), 'Campanha mobile sem overflow')
      assert.ok(await avaliar('!!document.querySelector(".local-button-open")'))
      assert.equal(await avaliar('!!document.querySelector(".local-button-edit")'), edita)
      for (const width of [1440, 900, 390]) {
        await enviar('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 })
        await conferirVisual(edita)
        assert.ok(await avaliar('document.documentElement.scrollWidth<=innerWidth'))
      }
      await avaliar('(()=>{const b=document.querySelector(".local-button-pdf:not(:disabled)");b.click();b.click()})()')
      await esperar('!!window.resolverPdf && window.botaoPdf().disabled')
      assert.equal(await avaliar('window.chamadas.filter(c=>c[0]==="GET"&&c[1]==="/api/relatorios/101/pdf").length'), 1)
      await avaliar('window.pdfModo="normal";window.resolverPdf()')
      await esperar('window.downloads.length===1&&!window.botaoPdf().disabled')
      assert.equal(await avaliar('window.pdfAutenticado'), true)
      assert.deepEqual(await avaliar('window.downloads'), ['relatorio-101.pdf'])
      assert.equal(await avaliar('location.pathname'), rota)
      await avaliar('window.pdfModo="ausente"')
      await click('.local-button-pdf:not(:disabled)')
      await esperar('document.querySelector(".local-pdf-erro")?.textContent.includes("não está mais disponível")')
      assert.equal(await avaliar('window.botaoPdf().disabled'), true)
      assert.equal(await avaliar('window.downloads.length'), 1)
      assert.equal(await avaliar('window.chamadas.some(c=>c[1].includes("gerar-pdf")||c[0]==="POST"&&c[1]==="/api/relatorios")'), false)
      await avaliar('history.pushState({},"","/relatorios");window.dispatchEvent(new PopStateEvent("popstate"))')
      await esperar('!document.querySelector(".locais-table")')
      assert.deepEqual(await avaliar('window.revogadas'), ['blob:fixture-pdf'])
      await avaliar(`history.pushState({},"",${JSON.stringify(rota)});window.dispatchEvent(new PopStateEvent("popstate"))`)
      await esperar('!!document.querySelector(".local-button-pdf:not(:disabled)")')
      await avaliar('window.pdfModo="proibido"')
      await click('.local-button-pdf:not(:disabled)')
      await esperar('document.querySelector(".local-pdf-erro")?.textContent.includes("Sem permissão")')
      assert.equal(await avaliar('window.botaoPdf().disabled'), true)
      await avaliar(`history.pushState({},"",${JSON.stringify(outraRota)});window.dispatchEvent(new PopStateEvent("popstate"))`)
      await esperar('document.querySelectorAll(".locais-table th").length===7')
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
    resultados.push({ perfil, tabela: true, filtros: true, paginacao: true, rbac: true, mobile: true, pdf: true, semGeracaoAutomatica: true })
    await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier })
  }
  console.log(JSON.stringify({ resultado: 'APROVADO', resultados, capturas: navegador.pasta }))
} finally {
  if (navegador) await navegador.fechar()
  vite.kill()
}
