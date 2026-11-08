import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { abrirNavegador, pausa } from './navegador-isolado.mjs'

// Aplicação real com API sintética e rede de API bloqueada; nenhum banco é usado.
const base = 'http://127.0.0.1:5188'
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'test', '--host', '127.0.0.1', '--port', '5188', '--strictPort'],
  { cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true, stdio: 'ignore' })
let browser
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base)).ok) break } catch { /* Vite iniciando */ }
    await pausa(100)
  }
  browser = await abrirNavegador('nr33-inventario-local-')
  const { enviar, avaliar, esperar } = browser
  await enviar('Network.setBlockedURLs', { urls: ['*/api/*', 'https://*'] })
  for (const perfil of ['ADMINISTRADOR', 'ENGENHEIRO_SEGURANCA', 'TECNICO_SEGURANCA', 'COORDENADOR', 'SUPERVISOR', 'AUDITOR', 'VISUALIZADOR']) {
    for (const concluido of [false, true]) {
      const { identifier } = await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `
        const u={id_usuario:11,nome:'Pessoa de teste',perfil_acesso:${JSON.stringify(perfil)},eh_fundador:${perfil === 'ADMINISTRADOR'}};
        localStorage.setItem('token','sintetico');localStorage.setItem('usuario',JSON.stringify(u));
        const local={id_local:40,id_campanha:15,nome_local:'Silo de grão de areia',nome_campanha:'Campanha 2026 - Cobresul',status:${JSON.stringify(concluido ? 'INATIVO' : 'ATIVO')},setor:'SETOR_CADASTRAL',endereco:'ENDERECO_CADASTRAL',latitude:-26.12345,longitude:-49.98765,descricao:'DESCRICAO_CADASTRAL'};
        const status=${JSON.stringify(concluido ? 'CONCLUIDO' : 'PENDENTE')};
        window.fetch=async(input,init={})=>{const p=new URL(input,location.origin).pathname;if((init.method||'GET')!=='GET')throw Error('Escrita proibida');const ok=data=>Response.json({status:'success',data});
          if(p==='/api/auth/perfil')return ok(u);
          if(p==='/api/locais/40')return ok(local);
          if(p==='/api/checklists')return ok([{id_checklist:13,id_local:40,status}]);
          if(p==='/api/dados-tecnicos/local/40')return ok({id_local:40,status});
          if(p==='/api/evidencias/local/40')return ok(${concluido ? '[{id_evidencia:1}]' : '[]'});
          if(p==='/api/relatorios/local/40')return ok(${concluido ? "{nome_responsavel_tecnico:'Pessoa',crea:'123',numero_art:'456',data_art:'2026-11-08'}" : '{}'});
          return Response.json({message:'Não disponível na fixture'},{status:404});};
      ` })
      await enviar('Page.navigate', { url: base + '/locais/40/inventario' })
      await esperar('document.querySelectorAll(".inventario-module").length===5')
      assert.equal(await avaliar('document.querySelector(".inventario-title h2").textContent.trim()'), 'Silo de grão de areia')
      assert.equal(await avaliar('document.querySelector(".inventario-title p").textContent.trim()'), 'Campanha 2026 - Cobresul')
      assert.equal(await avaliar('document.querySelector(".inventario-status").textContent.trim()'), concluido ? 'INATIVO' : 'ATIVO')
      assert.equal(await avaliar('document.querySelector(".inventario-title").nextElementSibling.className'), 'inventario-section-title')
      assert.equal(await avaliar('!!document.querySelector(".inventario-info-card,.inventario-info-grid,.inventario-description,.inventario-label")'), false)
      assert.doesNotMatch(await avaliar('document.querySelector(".inventario-main").textContent'), /SETOR_CADASTRAL|ENDERECO_CADASTRAL|DESCRICAO_CADASTRAL|-26\.12345|-49\.98765/)
      assert.deepEqual(await avaliar('Array.from(document.querySelectorAll(".inventario-module strong")).map(e=>e.textContent.trim())'),
        ['Checklist NR-33', 'Dados Técnicos', 'Evidências / Fotos', 'Responsáveis pelo Relatório', 'Relatório'])
      assert.deepEqual(await avaliar('Array.from(document.querySelectorAll(".inventario-module-status")).map(e=>e.textContent.trim())'), Array(4).fill(concluido ? 'CONCLUÍDO' : 'PENDENTE'))
      assert.equal(await avaliar('document.querySelectorAll(".inventario-module:disabled").length'), 0)
      if (perfil === 'ADMINISTRADOR') {
        for (const width of [1440, 900, 390, 320]) for (const tema of ['light', 'dark']) {
          await enviar('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 })
          await avaliar(`document.documentElement.setAttribute('data-theme',${JSON.stringify(tema)})`)
          assert.equal(await avaliar('document.documentElement.scrollWidth>innerWidth'), false)
          assert.equal(await avaliar('(()=>{const t=document.querySelector(".inventario-title"),n=t.querySelector("div").getBoundingClientRect(),s=t.querySelector(".inventario-status").getBoundingClientRect();return s.left>=n.right&&Math.abs(n.top-s.top)<1;})()'), true)
          await browser.captura(`inventario-${width}-${tema}-${concluido}`)
        }
        for (const [i,rota] of ['checklist','dados-tecnicos','evidencias','responsaveis','relatorio'].entries()) {
          await avaliar(`document.querySelectorAll('.inventario-module')[${i}].click()`)
          await esperar(`location.pathname==='/locais/40/${rota}'`)
          await enviar('Page.navigate', { url: base + '/locais/40/inventario' })
          await esperar('document.querySelectorAll(".inventario-module").length===5')
        }
      }
      assert.equal(await avaliar('new URL(document.querySelector(".inventario-back").href).pathname'), '/campanhas/15/locais')
      await avaliar('document.querySelector(".inventario-back").click()')
      await esperar("location.pathname==='/campanhas/15/locais'")
      await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier })
    }
  }
  console.log(JSON.stringify({ resultado: 'APROVADO', perfis: 7, statusLocal: ['ATIVO','INATIVO'], etapas: ['PENDENTE','CONCLUIDO'], larguras: [1440,900,390,320], temas: ['light','dark'], navegacao: true, dadosCadastrais: 'presentes na API sintética, ausentes na apresentação', capturas: browser.pasta }))
} finally { await browser?.fechar(); vite.kill() }
