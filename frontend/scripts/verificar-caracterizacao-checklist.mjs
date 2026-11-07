import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { abrirNavegador, pausa } from './navegador-isolado.mjs'
import { camposCaracterizacao } from '../src/services/caracterizacaoChecklist.js'

// Interface real com API sintética e rede de API bloqueada; nenhum banco é usado.
const raiz = fileURLToPath(new URL('..', import.meta.url))
const base = 'http://127.0.0.1:5181'
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'test', '--host', '127.0.0.1', '--port', '5181', '--strictPort'],
  { cwd: raiz, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let iniciado = false, falha, b
vite.stdout.on('data', c => { if (c.toString().includes('127.0.0.1:5181')) iniciado = true })
vite.stderr.on('data', c => { if (c.toString().includes('already in use')) falha = Error('Porta exclusiva 5181 indisponível') })
vite.on('error', e => { falha = e })
try {
  for (let i = 0; i < 100 && !iniciado && !falha; i++) await pausa(100)
  if (falha) throw falha
  assert.ok(iniciado, 'Vite não iniciou')
  b = await abrirNavegador('nr33-caracterizacao-')
  const { enviar, avaliar, esperar, captura } = b
  const titulos = ['Código de identificação / rastreio', 'Volume do espaço (m³)',
    'Quantidade de aberturas e bocas de visita', 'Dimensões das aberturas e bocas de visita',
    'Formas de acesso e respectivas dimensões', 'Geometria do espaço confinado',
    'Utilização do espaço / produto armazenado', 'Possíveis perigos antes da liberação de entrada']
  function contraste(frente, fundo) {
    const luminancia = cor => cor.match(/[\d.]+/g).slice(0, 3).map(Number)
      .map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
    const a = luminancia(frente), c = luminancia(fundo)
    return (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)
  }
  let menorContraste = Infinity
  async function conferirTitulos(consulta) {
    assert.deepEqual(await avaliar(`Array.from(document.querySelectorAll(${JSON.stringify(consulta ? '.checklist-caracterizacao-rotulo' : '.checklist-caracterizacao label')})).map(e=>e.textContent)`), titulos)
  }
  async function recarregarConsulta() {
    await avaliar('window.__recarregandoVisual025=true')
    await enviar('Page.reload')
    await esperar('!window.__recarregandoVisual025&&document.querySelectorAll(".checklist-caracterizacao-card").length===8')
  }
  await enviar('Network.setBlockedURLs', { urls: ['*/api/*', 'https://*'] })
  const perfis = ['ADMINISTRADOR', 'ENGENHEIRO_SEGURANCA', 'TECNICO_SEGURANCA', 'COORDENADOR', 'SUPERVISOR', 'AUDITOR', 'VISUALIZADOR']
  const gravaveis = perfis.slice(0, 4)
  for (const perfil of perfis) {
    const { identifier } = await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `
      const u={id_usuario:10,nome:'Teste sintético',email:'teste@example.invalid',perfil_acesso:${JSON.stringify(perfil)},eh_fundador:${perfil === 'ADMINISTRADOR'},ativo:true};
      localStorage.setItem('token','token-sintetico');localStorage.setItem('usuario',JSON.stringify(u));
      const respostas={criterio_a:'SIM',criterio_b:'NAO',criterio_c:'SIM',acesso_controlado:'SIM',ventilacao_adequada:'NAO',monitoramento_atmosferico:'SIM',procedimento_emergencia:'NAO',observacoes:'Histórico',status:'PENDENTE'};
      window.checklist={id_checklist:50,id_local:40,...respostas};window.envios=[];window.inesperadas=[];
      window.fetch=async (input,init={})=>{
        const p=new URL(input,location.origin).pathname,m=init.method||'GET';
        const ok=data=>Response.json({status:'success',data});
        if(m==='GET'&&p==='/api/auth/perfil')return ok(u);
        if(m==='GET'&&['/api/locais/40','/api/locais/41'].includes(p))return ok({id_local:Number(p.split('/').pop()),nome_local:'Tanque sintético',nome_campanha:'Campanha sintética',status:'ATIVO'});
        if(m==='GET'&&p==='/api/checklists')return ok(window.checklist?[window.checklist]:[]);
        if((m==='PUT'&&p==='/api/checklists/50')||(m==='POST'&&p==='/api/checklists')){
          const dados=JSON.parse(init.body);window.envios.push({m,dados});window.checklist={id_checklist:50,id_local:40,...respostas,...window.checklist,...dados};return ok(window.checklist);
        }
        window.inesperadas.push(m+' '+p);throw Error('API fora do simulador');
      };
    ` })
    await enviar('Page.navigate', { url: base + '/locais/40/checklist' })
    await esperar('!!document.querySelector(".checklist-edit-button")')
    assert.equal(await avaliar('document.querySelector(".checklist-edit-button").disabled'), !gravaveis.includes(perfil))
    assert.equal(await avaliar('document.querySelectorAll(".checklist-caracterizacao-valor").length'), 8)
    await conferirTitulos(true)
    if (perfil === 'ADMINISTRADOR') {
      const longos = { codigo_identificacao: 'IDENTIFICACAO'.repeat(11), volume_m3: '12.345678', quantidade_aberturas: 0,
        dimensoes_aberturas: 'Abertura 1: 600 mm\nAbertura 2: 800 x 600 mm\n' + 'X'.repeat(1400),
        formas_acesso: 'Escada superior: 3 m\n' + 'Descrição técnica de acesso. '.repeat(35),
        geometria: 'Geometria do espaço. '.repeat(25), utilizacao_produto: 'Utilização técnica. '.repeat(60),
        perigos_antes_liberacao: 'Perigo potencial. '.repeat(60) }
      for (const [cenario, dados] of [['vazio', {}], ['extenso', longos]]) {
        const fixture = await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `Object.assign(window.checklist,${JSON.stringify(dados)});` })
        await recarregarConsulta()
        await conferirTitulos(true)
        for (const tema of ['light', 'dark']) {
          await avaliar(`document.documentElement.setAttribute('data-theme',${JSON.stringify(tema)})`)
          for (const width of [1440, 390, 320]) {
            await enviar('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 })
            const medidas = await avaliar(`(()=>{
              const s=document.querySelector('.checklist-caracterizacao'),g=s.querySelector('.checklist-caracterizacao-grid');
              return {overflow:document.documentElement.scrollWidth>innerWidth,
                colunas:getComputedStyle(g).gridTemplateColumns.split(' ').length,
                espacamento:parseFloat(getComputedStyle(g).rowGap),
                cards:Array.from(s.querySelectorAll('.checklist-caracterizacao-card')).map(c=>{
                  const r=c.getBoundingClientRect(),gr=g.getBoundingClientRect(),v=c.querySelector('.checklist-caracterizacao-valor');
                  return {top:r.top,bottom:r.bottom,dentro:r.left>=gr.left-1&&r.right<=gr.right+1,textoDentro:v.scrollWidth<=v.clientWidth,
                    multiline:getComputedStyle(v).whiteSpace,fundo:getComputedStyle(c).backgroundColor,
                    rotulo:getComputedStyle(c.querySelector('span')).color,valor:getComputedStyle(v).color};
                }),titulo:getComputedStyle(s.querySelector('h4')).color,fundo:getComputedStyle(s).backgroundColor};
            })()`)
            assert.equal(medidas.overflow, false)
            assert.equal(medidas.colunas, width > 650 ? 2 : 1)
            assert.ok(contraste(medidas.titulo, medidas.fundo) >= 4.5)
            for (const card of medidas.cards) {
              assert.equal(card.dentro, true); assert.equal(card.textoDentro, true); assert.equal(card.multiline, 'pre-wrap')
              for (const cor of [card.rotulo, card.valor]) {
                const taxa = contraste(cor, card.fundo); menorContraste = Math.min(menorContraste, taxa)
                assert.ok(taxa >= 4.5, 'Rótulos e valores devem atingir contraste de 4.5:1')
              }
            }
            for (let i = 0; i + medidas.colunas < medidas.cards.length; i += medidas.colunas) {
              const fimLinha = Math.max(...medidas.cards.slice(i, i + medidas.colunas).map(c => c.bottom))
              assert.ok(Math.abs(medidas.cards[i + medidas.colunas].top - fimLinha - medidas.espacamento) <= 1,
                'Os cartões devem usar somente o espaçamento do grid, sem margens herdadas')
            }
          }
          if (cenario === 'vazio') {
            await enviar('Emulation.setDeviceMetricsOverride', { width: tema === 'light' ? 1440 : 390, height: 1000, deviceScaleFactor: 1, mobile: tema === 'dark' })
            await avaliar('document.querySelector(".checklist-caracterizacao").scrollIntoView({block:"start"})')
            await captura('consulta-visual-' + tema)
          }
        }
        if (cenario === 'extenso') {
          assert.equal(await avaliar('document.querySelectorAll(".checklist-caracterizacao-valor")[3].textContent'), longos.dimensoes_aberturas)
          assert.equal(await avaliar('document.querySelectorAll(".checklist-caracterizacao-valor")[2].textContent'), '0')
        } else assert.equal(await avaliar('Array.from(document.querySelectorAll(".checklist-caracterizacao-valor")).every(e=>e.textContent==="Não informado")'), true)
        await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier: fixture.identifier })
      }
      await recarregarConsulta()
    }
    if (gravaveis.includes(perfil)) {
      await avaliar('document.querySelector(".checklist-edit-button").click()')
      await esperar('!!document.getElementById("volume_m3")')
      await conferirTitulos(false)
      const alterar = async (nome, valor) => {
        await avaliar(`(() => {const e=document.getElementById(${JSON.stringify(nome)});const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(valor)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`)
      }
      assert.equal(await avaliar('document.getElementById("volume_m3").value'), '')
      const dados = { codigo_identificacao: 'TG-01', volume_m3: '12.345678', quantidade_aberturas: '0',
        dimensoes_aberturas: 'BM-01: Ø 600 mm\nBM-02: 800 × 600 mm', formas_acesso: 'Escada: 3 m', geometria: 'Cilíndrico',
        utilizacao_produto: 'Água', perigos_antes_liberacao: 'Atmosfera perigosa' }
      for (const { nome } of camposCaracterizacao) await alterar(nome, dados[nome])
      for (const width of [1440, 390, 320]) {
        await enviar('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 })
        assert.equal(await avaliar('document.documentElement.scrollWidth<=innerWidth'), true)
      }
      for (const tema of ['light', 'dark']) {
        await avaliar(`document.documentElement.setAttribute('data-theme',${JSON.stringify(tema)})`)
        assert.equal(await avaliar('getComputedStyle(document.getElementById("codigo_identificacao")).color!==getComputedStyle(document.getElementById("codigo_identificacao")).backgroundColor'), true)
      }
      // requestSubmit executa validação nativa; submit direto exercita a validação React.
      await alterar('volume_m3', '0')
      await avaliar('document.querySelector(".checklist-form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))')
      await esperar('document.querySelector("[role=alert]")?.textContent.includes("volume")')
      assert.equal(await avaliar('window.envios.length'), 0)
      await alterar('volume_m3', dados.volume_m3)
      await avaliar('document.querySelector(".checklist-form").requestSubmit()')
      await esperar('!!document.querySelector(".checklist-edit-button")')
      await conferirTitulos(true)
      assert.equal(await avaliar('window.envios[0].dados.volume_m3'), dados.volume_m3)
      assert.equal(await avaliar('window.envios[0].dados.quantidade_aberturas'), 0)
      assert.equal(await avaliar('window.envios[0].dados.observacoes'), 'Histórico')
      assert.equal(await avaliar('document.querySelector(".checklist-caracterizacao").textContent.includes("TG-01")'), true)
      await avaliar('document.querySelector(".checklist-edit-button").click()')
      await esperar('!!document.getElementById("volume_m3")')
      assert.equal(await avaliar('document.getElementById("dimensoes_aberturas").value'), dados.dimensoes_aberturas)
      await alterar('volume_m3', '')
      await alterar('codigo_identificacao', '')
      await avaliar('document.querySelector(".checklist-form").requestSubmit()')
      await esperar('window.envios.length===2&&!!document.querySelector(".checklist-edit-button")')
      assert.equal(await avaliar('window.envios[1].dados.volume_m3'), null)
      assert.equal(await avaliar('window.envios[1].dados.codigo_identificacao'), null)
      assert.equal(await avaliar('window.checklist.geometria'), dados.geometria)
      // Cadastro pelo mesmo formulário, após um checklist antigo e sua edição.
      await avaliar('window.checklist=null')
      await avaliar('history.pushState({},"","/locais/41/checklist");window.dispatchEvent(new PopStateEvent("popstate"))')
      await esperar('!!document.querySelector(".checklist-form")')
      await conferirTitulos(false)
      await alterar('codigo_identificacao', 'NOVO-01')
      await avaliar('document.querySelectorAll(".checklist-criterio-respostas input[value=SIM]").forEach(e=>e.click());document.querySelectorAll(".checklist-questions select").forEach(e=>{e.value="SIM";e.dispatchEvent(new Event("change",{bubbles:true}))})')
      await avaliar('document.querySelector(".checklist-form").requestSubmit()')
      await esperar('window.envios.length===3')
      assert.equal(await avaliar('window.envios[2].m'), 'POST')
      assert.equal(await avaliar('window.envios[2].dados.codigo_identificacao'), 'NOVO-01')
    }
    assert.deepEqual(await avaliar('window.inesperadas'), [])
    await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier })
  }
  console.log(JSON.stringify({resultado:'APROVADO',perfis:7,modos:['consulta','edicao','cadastro'],temas:['light','dark'],larguras:[1440,390,320],cenarios:['vazio','extenso'],contrasteMinimo:menorContraste,evidencias:b.pasta,api:'sintetica, rede de API bloqueada, sem banco'}))
} finally {
  if (b) await b.fechar()
  vite.kill()
}
