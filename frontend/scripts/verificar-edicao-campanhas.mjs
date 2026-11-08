import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { abrirNavegador, pausa } from './navegador-isolado.mjs'

// API sintética; nenhuma escrita ou leitura no backend/banco real.
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'test', '--host', '127.0.0.1', '--port', '5187', '--strictPort'],
  { cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true, stdio: 'ignore' })
let browser
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch('http://127.0.0.1:5187')).ok) break } catch { /* aguardar Vite */ }
    await pausa(100)
  }
  browser = await abrirNavegador('nr33-campanhas-edicao-')
  const { enviar, avaliar, esperar } = browser
  await enviar('Network.setBlockedURLs', { urls: ['*/api/*', 'https://*'] })
  const mudar = (id, valor) => avaliar(`(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(valor)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`)
  for (const perfil of ['ADMINISTRADOR', 'ENGENHEIRO_SEGURANCA', 'TECNICO_SEGURANCA', 'COORDENADOR', 'SUPERVISOR', 'AUDITOR', 'VISUALIZADOR']) {
    const edita = !['SUPERVISOR', 'AUDITOR', 'VISUALIZADOR'].includes(perfil)
    const { identifier } = await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `
      const u={id_usuario:11,nome:'Teste',perfil_acesso:${JSON.stringify(perfil)},eh_fundador:${perfil === 'ADMINISTRADOR'}};
      localStorage.setItem('token','sintetico');localStorage.setItem('usuario',JSON.stringify(u));
      window.row={id_campanha:30,nome_campanha:'Campanha teste',empresa:'Empresa',responsavel:'Responsavel',data_inicio:'2026-11-08',status:'EM ANDAMENTO'};
      window.envios=[];window.falhar=false;
      window.fetch=async(input,init={})=>{const p=new URL(input,location.origin).pathname,m=init.method||'GET';const ok=data=>Response.json({status:'success',data});
        if(p==='/api/auth/perfil')return ok(u);
        if(p==='/api/campanhas'&&m==='GET')return ok([window.row,...(window.extras||[])]);
        if(p==='/api/campanhas/30'&&m==='PUT'){window.envios.push(JSON.parse(init.body));if(window.falhar)return Response.json({message:'Falha simulada'},{status:500});window.row={...window.row,...JSON.parse(init.body)};return ok(window.row);}
        throw Error('API inesperada');};
    ` })
    await enviar('Page.navigate', { url: 'http://127.0.0.1:5187/campanhas' })
    await esperar('!!document.querySelector(".campanhas-table tbody tr")')
    assert.equal(await avaliar('!!document.querySelector(".campanha-editar-icone")'), edita)
    assert.deepEqual(await avaliar('Array.from(document.querySelector(".campanha-actions").children).map(e=>e.textContent.trim())'), ['Ver locais'])
    assert.equal(await avaliar('document.querySelectorAll(".campanhas-table select").length'), 0)
    if (edita) {
      assert.equal(await avaliar('document.querySelector(".campanha-editar-icone").title'), 'Editar campanha')
      assert.equal(await avaliar('document.querySelector(".campanha-editar-icone").getAttribute("aria-label")'), 'Editar campanha Campanha teste')
      assert.equal(await avaliar('document.querySelector(".campanha-editar-icone").textContent.trim()'), '')
      assert.equal(await avaliar('document.querySelector(".campanha-nome strong").textContent'), 'Campanha teste')
      assert.equal(await avaliar('document.querySelector(".campanha-nome strong").closest("button")'), null)
      assert.ok(await avaliar('!!document.querySelector(".campanha-editar-icone svg[aria-hidden=true]")'))
      // Ativação por teclado do botão com nome acessível.
      await enviar('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
      await avaliar('document.querySelector(".campanha-editar-icone").focus()')
      assert.equal(await avaliar('document.activeElement.classList.contains("campanha-editar-icone")'), true)
      await enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 })
      await enviar('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
      await esperar('!!document.getElementById("status-campanha")')
      assert.equal(await avaliar('document.getElementById("status-campanha").value'), 'EM ANDAMENTO')
      await mudar('status-campanha', 'CANCELADA'); await mudar('empresa', 'Descartar')
      await avaliar('document.querySelector(".campanha-form .campanha-button-secondary").click()')
      assert.equal(await avaliar('window.envios.length'), 0)
      await mudar('busca-campanha', 'Campanha')
      for (const status of ['CONCLUIDO', 'CANCELADA', 'EM ANDAMENTO']) {
        await avaliar('document.querySelector(".campanha-editar-icone").click()')
        await esperar('!!document.getElementById("status-campanha")')
        assert.equal(await avaliar('document.getElementById("empresa").value'), 'Empresa')
        await mudar('status-campanha', status)
        await mudar('responsavel', 'Responsavel novo')
        await avaliar('document.querySelector(".campanha-form").requestSubmit()')
        await esperar(`!document.querySelector('.campanha-form')&&window.row.status===${JSON.stringify(status)}`)
        assert.equal(await avaliar('window.envios.at(-1).responsavel'), 'Responsavel novo')
        assert.equal(await avaliar('window.envios.at(-1).status'), status)
        assert.equal(await avaliar('document.getElementById("busca-campanha").value'), 'Campanha')
        assert.match(await avaliar('document.querySelector(".campanhas-feedback").textContent'), /sucesso/)
        await mudar('filtro-status', status)
        assert.equal(await avaliar('document.querySelectorAll(".campanhas-table tbody tr").length'), 1)
        for (const tema of ['light', 'dark']) {
          await avaliar(`document.documentElement.setAttribute('data-theme',${JSON.stringify(tema)})`)
          const cores = await avaliar('(()=>{const s=getComputedStyle(document.querySelector(".campanhas-status"));return [s.color,s.backgroundColor]})()')
          const paleta = tema === 'light'
            ? { 'EM ANDAMENTO': ['rgb(181, 71, 8)', 'rgb(255, 250, 235)'], CONCLUIDO: ['rgb(2, 122, 72)', 'rgb(236, 253, 243)'], CANCELADA: ['rgb(180, 35, 24)', 'rgb(254, 243, 242)'] }
            : { 'EM ANDAMENTO': ['rgb(250, 204, 21)', 'rgb(73, 56, 18)'], CONCLUIDO: ['rgb(110, 231, 183)', 'rgb(18, 59, 43)'], CANCELADA: ['rgb(253, 164, 175)', 'rgb(76, 29, 36)'] }
          assert.deepEqual(cores, paleta[status])
        }
        await mudar('filtro-status', '')
      }
      const { identifier: nomesLongos } = await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `window.extras=[{...window.row,id_campanha:31,nome_campanha:'Curta'},{...window.row,id_campanha:32,nome_campanha:'Campanha 2026 - Cobresul - Inspeção dos espaços confinados com acesso limitado e áreas de armazenamento industrial'}];` })
      await enviar('Page.reload')
      await esperar('document.querySelectorAll(".campanhas-table tbody tr").length===3')
      for (const width of [1440, 900, 390]) {
        await enviar('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 })
        assert.ok(await avaliar('document.documentElement.scrollWidth<=innerWidth'))
        for (const tema of ['light', 'dark']) {
          await avaliar(`document.documentElement.setAttribute('data-theme',${JSON.stringify(tema)})`)
          await avaliar('document.activeElement.blur()')
          const tipografia = await avaliar('(()=>{const linha=document.querySelector(".campanhas-table tbody tr"),nome=getComputedStyle(linha.querySelector(".campanha-nome strong")),empresa=getComputedStyle(linha.children[1]),responsavel=getComputedStyle(linha.children[2]),referencia=document.createElement("span");referencia.style.color="var(--color-text-heading)";document.body.append(referencia);const corTitulo=getComputedStyle(referencia).color;referencia.remove();return {nome:[nome.fontWeight,nome.fontSize,nome.color],empresa:[empresa.fontSize,empresa.color],responsavel:[responsavel.fontSize,responsavel.color],cabecalhos:Array.from(document.querySelectorAll(".campanhas-table th")).map(e=>{const s=getComputedStyle(e);return [s.fontWeight,s.color]}),corTitulo};})()')
          assert.equal(tipografia.nome[0], '400')
          assert.deepEqual(tipografia.nome.slice(1), tipografia.empresa)
          assert.deepEqual(tipografia.nome.slice(1), tipografia.responsavel)
          assert.equal(tipografia.cabecalhos.length, 6)
          assert.ok(tipografia.cabecalhos.every(([peso, cor]) => peso === '600' && cor === tipografia.corTitulo))
          await enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })
          await pausa(180)
          const medidas = await avaliar('(()=>{const b=document.querySelector(".campanha-editar-icone"),n=document.querySelector(".campanha-nome strong"),r=b.getBoundingClientRect(),t=n.getBoundingClientRect(),s=getComputedStyle(b);return {w:r.width,h:r.height,direita:r.left>=t.right,centralizado:Math.abs((r.top+r.bottom)/2-(t.top+t.bottom)/2)<1,raio:s.borderRadius,fundo:s.backgroundColor,borda:s.borderTopWidth};})()')
          assert.equal(medidas.w, 44); assert.equal(medidas.h, 44)
          assert.equal(medidas.direita, true); assert.equal(medidas.centralizado, true)
          assert.equal(medidas.raio, '9px'); assert.equal(medidas.borda, '0px')
          assert.equal(medidas.fundo, 'rgba(0, 0, 0, 0)')
          const linhas = await avaliar('Array.from(document.querySelectorAll(".campanha-nome")).map(e=>{const b=e.querySelector("button").getBoundingClientRect(),n=e.querySelector("strong").getBoundingClientRect(),c=e.closest("td").getBoundingClientRect(),i=e.querySelector("svg").getBoundingClientRect();return {x:b.x,seguro:n.right<=b.left,naCelula:b.right<=c.right,iconeCentral:Math.abs((b.left+b.right-i.left-i.right)/2)<1&&Math.abs((b.top+b.bottom-i.top-i.bottom)/2)<1};})')
          assert.ok(linhas.every(l => Math.abs(l.x - linhas[0].x) < 1 && l.seguro && l.naCelula && l.iconeCentral))
          if (perfil === 'ADMINISTRADOR') {
            await avaliar('document.querySelector(".campanha-nome").scrollIntoView({block:"center"})')
            await browser.captura(`campanha-icone-${width}-${tema}`)
          }
        }
      }
      await enviar('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
      await avaliar('document.querySelector(".campanha-button-locais").focus()')
      await enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
      await pausa(180)
      const foco = await avaliar('(()=>{const s=getComputedStyle(document.activeElement);return {classe:document.activeElement.className,outline:s.outlineStyle,fundo:s.backgroundColor}})()')
      assert.equal(foco.classe, 'campanha-editar-icone'); assert.equal(foco.outline, 'solid')
      assert.notEqual(foco.fundo, 'rgba(0, 0, 0, 0)')
      await avaliar('document.activeElement.blur();document.querySelectorAll(".campanha-editar-icone")[1].scrollIntoView({block:"center"})')
      const alvo = await avaliar('(()=>{const r=document.querySelectorAll(".campanha-editar-icone")[1].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
      await enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', ...alvo })
      await pausa(180)
      assert.notEqual(await avaliar('getComputedStyle(document.querySelectorAll(".campanha-editar-icone")[1]).backgroundColor'), 'rgba(0, 0, 0, 0)')
      await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier: nomesLongos })
      // Erro de uma única chamada mantém os dados/status do formulário, sem segundo salvamento.
      await avaliar('document.querySelector(".campanha-editar-icone").click();window.falhar=true')
      await mudar('status-campanha', 'CANCELADA'); await mudar('empresa', 'Nao salvar')
      await avaliar('document.querySelector(".campanha-form").requestSubmit()')
      await esperar('!!document.querySelector(".campanha-form [role=alert]")')
      assert.equal(await avaliar('window.row.status'), 'EM ANDAMENTO')
      assert.equal(await avaliar('window.row.empresa'), 'Empresa')
      assert.equal(await avaliar('document.getElementById("status-campanha").value'), 'CANCELADA')
    }
    await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier })
  }
  console.log(JSON.stringify({ resultado: 'APROVADO', perfis: 7, cadastroRealAlterado: false, capturas: browser.pasta, cenarios: ['ícone independente alinhado de 44px', 'tooltip e aria-label', 'teclado', 'status carregado', 'salvamento conjunto', 'cancelamento', 'erro sem perda', 'permissoes', 'cores e temas', 'filtros', 'desktop/tablet/celular', 'acoes somente Ver locais'] }))
} finally { await browser?.fechar(); vite.kill() }
