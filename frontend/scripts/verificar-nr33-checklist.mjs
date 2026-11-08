import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { abrirNavegador, pausa } from './navegador-isolado.mjs'

// UI real, fetch sintetico e rede de API bloqueada. Nunca usa o backend/banco.
const raiz = fileURLToPath(new URL('..', import.meta.url))
const base = 'http://127.0.0.1:5186'
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'test', '--host', '127.0.0.1', '--port', '5186', '--strictPort'],
  { cwd: raiz, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let iniciado = false, falha, browser, scriptAnterior, cenario = 0
vite.stdout.on('data', c => { if (c.toString().includes('127.0.0.1:5186')) iniciado = true })
vite.stderr.on('data', c => { if (c.toString().includes('already in use')) falha = Error('Porta exclusiva 5186 ocupada') })
vite.on('error', e => { falha = e })
const gerais = Object.fromEntries(['criterio_a', 'criterio_b', 'criterio_c', 'acesso_controlado', 'ventilacao_adequada', 'monitoramento_atmosferico', 'procedimento_emergencia'].map(c => [c, 'SIM']))
const novos = { atmosfera_oxigenio: true, atmosfera_contaminantes: null, atmosfera_explosiva: false,
  possui_placa_identificacao: false, avaliacao_especifica_iniciada: true, nao_destinado_ocupacao_humana: null,
  meios_limitados_entrada_saida: null, utilizado_armazenagem: 'NAO', potencial_engolfamento: null, potencial_afogamento: null }
const avaliacao = { classificacao: { resultado: 'CARACTERIZADO', origem: 'REGRA_GERAL', hipoteseEspecifica: 'NAO_ATENDIDA' },
  aplicabilidade: { atmosfera: true, placa: true }, validacao_conclusao: { pode_concluir: true, erros: [], avisos: ['AUSENCIA_SINALIZACAO'] } }
const registro = { id_checklist: 50, id_local: 40, ...gerais, ...novos, status: 'PENDENTE', observacoes: 'Histórico', avaliacao_nr33: avaliacao }
const resultados = []
const ocultos = Object.keys(novos).filter(c => !c.startsWith('atmosfera_') && c !== 'possui_placa_identificacao')
try {
  for (let i = 0; i < 100 && !iniciado && !falha; i++) await pausa(100)
  if (falha) throw falha
  assert.ok(iniciado, 'Vite não iniciou')
  browser = await abrirNavegador('nr33-ui-4b-')
  const { enviar, avaliar, esperar } = browser
  await enviar('Network.setBlockedURLs', { urls: ['*/api/*', 'https://*'] })
  async function abrir(row = registro, perfil = 'ADMINISTRADOR') {
    cenario++
    if (scriptAnterior) await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptAnterior })
    const script = await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.cenarioNr33=${cenario};
      const u={id_usuario:10,nome:'Usuário sintético',email:'teste@example.invalid',id_ambiente:'11111111-1111-4111-8111-111111111111',nome_ambiente:'Ambiente sintético',perfil_acesso:${JSON.stringify(perfil)},eh_fundador:${perfil === 'ADMINISTRADOR'},ativo:true};
      localStorage.setItem('token','token-sintetico');localStorage.setItem('usuario',JSON.stringify(u));
      window.registroNr33=${JSON.stringify(row)};window.enviosNr33=[];window.inesperadasNr33=[];window.erroNr33=null;window.avaliacaoRetornoNr33=null;
      window.fetch=async(input,init={})=>{
        const p=new URL(input,location.origin).pathname,m=init.method||'GET';
        const ok=data=>Response.json({status:'success',data});
        if(m==='GET'&&p==='/api/auth/perfil')return ok(u);
        if(m==='GET'&&p==='/api/locais/40')return ok({id_local:40,nome_local:'Tanque de teste NR-33',nome_campanha:'Campanha sintética'});
        if(m==='GET'&&p==='/api/checklists')return ok(window.registroNr33?[window.registroNr33]:[]);
        if((m==='PUT'&&p==='/api/checklists/50')||(m==='POST'&&p==='/api/checklists')||(m==='PATCH'&&p==='/api/checklists/50/status')){
          const dados=JSON.parse(init.body);window.enviosNr33.push({m,dados});
          if(window.erroNr33)return Response.json({status:'error',message:'Operação rejeitada.',code:window.erroNr33.code,details:window.erroNr33.details||{}},{status:window.erroNr33.status});
          window.registroNr33={id_checklist:50,id_local:40,...window.registroNr33,...dados,avaliacao_nr33:window.avaliacaoRetornoNr33||window.registroNr33?.avaliacao_nr33||${JSON.stringify(avaliacao)}};
          return Response.json({status:'success',message:'Operação concluída.',data:window.registroNr33});
        }
        window.inesperadasNr33.push(m+' '+p);throw Error('API não autorizada no teste');
      };
    ` })
    scriptAnterior = script.identifier
    await enviar('Page.navigate', { url: base + '/locais/40/checklist' })
    await esperar(`window.cenarioNr33===${cenario}&&!!document.querySelector(${JSON.stringify(row ? '.checklist-existing' : '.checklist-form')})`)
  }
  async function editar() { await avaliar('document.querySelector(".checklist-edit-button").click()'); await esperar('!!document.querySelector(".checklist-form")') }
  async function alterar(id, valor) {
    await avaliar(`(()=>{const e=document.getElementById(${JSON.stringify(id)});const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(valor)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`)
  }
  async function salvar() { await avaliar('document.querySelector(".checklist-form").requestSubmit()') }
  async function semChamadasExtras() { assert.deepEqual(await avaliar('window.inesperadasNr33'), []) }
  async function semHipoteseVisual() {
    assert.ok(await avaliar(`${JSON.stringify(ocultos)}.every(c=>!document.getElementById(c))`))
    assert.equal(await avaliar('document.body.textContent.includes("Hipótese específica — engolfamento ou afogamento")'), false)
    assert.equal(await avaliar('document.body.textContent.includes("Encerrar uma avaliação iniciada")'), false)
  }
  async function alturasDescricoes() {
    assert.ok(await avaliar(`['dimensoes_aberturas','formas_acesso','geometria','utilizacao_produto','perigos_antes_liberacao'].every(id=>{
      const e=document.getElementById(id),s=getComputedStyle(e);
      return e.tagName==='TEXTAREA'&&e.getBoundingClientRect().height===60&&s.resize==='vertical'&&s.overflowY==='auto';
    })`))
  }

  await abrir()
  await semHipoteseVisual()
  assert.equal(await avaliar('document.querySelector(".checklist-avaliacao h4").textContent'), 'Avaliação NR-33')
  assert.equal(await avaliar('document.querySelector(".checklist-avaliacao dd").textContent'), 'Pendente')
  assert.deepEqual(await avaliar('Array.from(document.querySelectorAll(".checklist-avaliacao dt")).map(e=>e.textContent)'), ['Situação do Checklist'])
  assert.match(await avaliar('document.querySelector(".checklist-avaliacao").textContent'), /Ausência de sinalização/)
  await editar()
  await semHipoteseVisual()
  await alturasDescricoes()
  assert.equal(await avaliar('document.querySelectorAll(".checklist-nr33 select").length'), 4)
  assert.equal(await avaliar('document.getElementById("atmosfera_contaminantes").value'), '')
  assert.equal(await avaliar('document.getElementById("atmosfera_explosiva").value'), 'NAO')
  assert.equal(await avaliar('document.getElementById("possui_placa_identificacao").disabled'), false)
  for (const criterio of ['criterio_a', 'criterio_b', 'criterio_c']) {
    await avaliar(`document.querySelector('input[name=${criterio}][value=NAO]').click()`)
    assert.equal(await avaliar('document.getElementById("possui_placa_identificacao").disabled'), true)
    assert.equal(await avaliar('document.getElementById("possui_placa_identificacao").value'), 'NAO')
    assert.equal(await avaliar('document.getElementById("atmosfera_oxigenio").disabled'), criterio === 'criterio_c')
    assert.match(await avaliar('document.getElementById("nr33-sinalizacao-disponibilidade").textContent'), /Disponível quando os Critérios A, B e C forem SIM/)
    await avaliar(`document.querySelector('input[name=${criterio}][value=SIM]').click()`)
    assert.equal(await avaliar('document.getElementById("possui_placa_identificacao").disabled'), false)
  }
  assert.ok(await avaliar(`${JSON.stringify(Object.keys(novos).filter(c => c.startsWith('atmosfera_')))}.every(c=>!document.getElementById(c).disabled)`))
  await alterar('atmosfera_contaminantes', 'SIM')
  await alterar('observacoes', 'Edição parcial')
  assert.match(await avaliar('document.querySelector(".checklist-avaliacao").textContent'), /não salvas/)
  await salvar()
  await esperar('window.enviosNr33.length===1&&!document.querySelector(".checklist-form")')
  assert.deepEqual(await avaliar('window.enviosNr33[0]'), { m: 'PUT', dados: { atmosfera_contaminantes: true, observacoes: 'Edição parcial' } })
  assert.deepEqual(await avaliar(`Object.fromEntries(${JSON.stringify(ocultos)}.map(c=>[c,window.registroNr33[c]]))`), Object.fromEntries(ocultos.map(c => [c, registro[c]])))
  resultados.push('quatro campos visíveis, dados ocultos preservados, avaliação, aviso e PUT parcial')

  for (const criterio of ['criterio_a', 'criterio_b', 'criterio_c']) {
    const dependentes = await avaliar(`Object.fromEntries(${JSON.stringify(Object.keys(novos))}.map(c=>[c,window.registroNr33[c]]))`)
    for (const valor of ['NAO', 'SIM']) {
      await editar()
      await avaliar(`document.querySelector('input[name=${criterio}][value=${valor}]').click()`)
      await salvar()
      await esperar('!document.querySelector(".checklist-form")')
      assert.deepEqual(await avaliar('window.enviosNr33.at(-1).dados'), { [criterio]: valor })
      assert.deepEqual(await avaliar(`Object.fromEntries(${JSON.stringify(Object.keys(novos))}.map(c=>[c,window.registroNr33[c]]))`), dependentes)
    }
  }
  resultados.push('A/B/C SIM → NÃO → SIM salvos sem enviar limpeza ou perder respostas dependentes')

  await editar()
  await avaliar(`window.erroNr33={status:409,code:'NR33_CONFIRMACAO_LIMPEZA_NECESSARIA'};document.querySelector('input[name=criterio_c][value=NAO]').click()`)
  assert.ok(await avaliar(`${JSON.stringify(Object.keys(novos).filter(c => c.startsWith('atmosfera_')))}.every(c=>document.getElementById(c).disabled)`))
  assert.match(await avaliar('document.getElementById("nr33-atmosfera-disponibilidade").textContent'), /Disponível quando o Critério C for SIM/)
  await salvar()
  await esperar('!!document.querySelector(".checklist-error")')
  assert.match(await avaliar('document.querySelector(".checklist-error").textContent'), /ainda não está disponível/)
  assert.equal(await avaliar('document.querySelector("input[name=criterio_c]:checked").value'), 'NAO')
  assert.equal(await avaliar('document.getElementById("atmosfera_oxigenio").value'), 'SIM')
  assert.equal(await avaliar('Object.hasOwn(window.enviosNr33.at(-1).dados,"confirmacao_limpeza")'), false)
  assert.equal(await avaliar('window.registroNr33.criterio_c'), 'SIM')
  assert.deepEqual(await avaliar('window.enviosNr33.at(-1).dados'), { criterio_c: 'NAO' })
  assert.equal(await avaliar('document.getElementById("possui_placa_identificacao").value'), 'NAO')
  assert.equal(await avaliar('document.getElementById("possui_placa_identificacao").disabled'), true)
  await avaliar(`document.querySelector('input[name=criterio_c][value=SIM]').click()`)
  assert.ok(await avaliar(`${JSON.stringify(Object.keys(novos).filter(c => c.startsWith('atmosfera_')))}.every(c=>!document.getElementById(c).disabled)`))
  assert.deepEqual(await avaliar(`[...document.querySelectorAll('select[name^="atmosfera_"]')].map(e=>e.value)`), ['SIM', 'SIM', 'NAO'])
  resultados.push('409 mantém formulário, respostas e aplicabilidade sem confirmação implícita')
  await avaliar('window.erroNr33=null;document.querySelector(".checklist-cancel-button").click()')

  await avaliar(`window.erroNr33={status:400,code:'NR33_CONCLUSAO_INVALIDA',details:{erros:[{codigo:'CONDICAO_ATMOSFERICA_OBRIGATORIA',campos:['atmosfera_oxigenio']}]}};document.querySelector('.checklist-finish-button').click()`)
  await esperar('!!document.querySelector(".checklist-error")')
  assert.match(await avaliar('document.querySelector(".checklist-error").textContent'), /condição atmosférica/)
  assert.equal(await avaliar('window.registroNr33.status'), 'PENDENTE')
  await avaliar('window.erroNr33=null;document.querySelector(".checklist-finish-button").click()')
  await esperar('!!document.querySelector(".checklist-reopen-button")')
  assert.equal(await avaliar('document.querySelector(".checklist-avaliacao dd").textContent'), 'Concluído')
  await editar()
  await alterar('observacoes', 'Histórico editado')
  await salvar()
  await esperar('!document.querySelector(".checklist-form")')
  assert.deepEqual(await avaliar('window.enviosNr33.at(-1).dados'), { observacoes: 'Histórico editado' })
  assert.equal(await avaliar('window.registroNr33.status'), 'CONCLUIDO')
  await avaliar('document.querySelector(".checklist-reopen-button").click()')
  await esperar('!!document.querySelector(".checklist-finish-button")')
  assert.equal(await avaliar('window.registroNr33.atmosfera_explosiva'), false)
  resultados.push('conclusão rejeitada/aceita, histórico sem troca automática de status e reabertura')
  await semChamadasExtras()

  const historico = { ...registro, ...Object.fromEntries(Object.keys(novos).map(c => [c, null])), status: 'CONCLUIDO',
    avaliacao_nr33: { ...avaliacao, classificacao: { resultado: 'PENDENTE', origem: 'AVALIACAO_PENDENTE', hipoteseEspecifica: 'NAO_AVALIADA' },
      aplicabilidade: { atmosfera: false, placa: false }, validacao_conclusao: { pode_concluir: false, erros: [{ codigo: 'CARACTERIZACAO_PENDENTE', campos: [] }], avisos: [] } } }
  await abrir(historico)
  assert.equal(await avaliar('document.querySelector(".checklist-avaliacao dd").textContent'), 'Concluído')
  assert.match(await avaliar('document.querySelector(".checklist-avaliacao").textContent'), /Caracterização ainda pendente/)
  assert.match(await avaliar('document.body.textContent'), /CONCLUIDO/)
  await editar()
  assert.equal(await avaliar('document.getElementById("atmosfera_oxigenio").disabled'), false)
  assert.equal(await avaliar('document.getElementById("possui_placa_identificacao").value'), '')
  assert.equal(await avaliar('document.getElementById("possui_placa_identificacao").disabled'), false)
  await semHipoteseVisual()
  await avaliar('Object.defineProperty(navigator,"onLine",{configurable:true,get:()=>false})')
  await alterar('observacoes', 'Edição offline preservada')
  await salvar()
  await esperar('!!document.querySelector(".checklist-error")')
  assert.equal(await avaliar('window.enviosNr33.length'), 0)
  assert.equal(await avaliar('document.getElementById("observacoes").value'), 'Edição offline preservada')
  assert.match(await avaliar('document.querySelector(".checklist-error").textContent'), /nenhuma operação foi colocada em fila offline/)
  resultados.push('histórico preservado e bloqueio offline sem perda')
  await semChamadasExtras()

  for (const criterio of ['criterio_a', 'criterio_b', 'criterio_c']) {
    for (const resposta of [true, false, null]) {
      await abrir({ ...registro, [criterio]: '', possui_placa_identificacao: resposta })
      await editar()
      assert.equal(await avaliar('document.getElementById("possui_placa_identificacao").disabled'), true)
      assert.equal(await avaliar('document.getElementById("possui_placa_identificacao").value'), resposta === null ? '' : resposta ? 'SIM' : 'NAO')
      await avaliar(`document.querySelector('input[name=${criterio}][value=SIM]').click()`)
      assert.equal(await avaliar('document.getElementById("possui_placa_identificacao").disabled'), false)
      await salvar()
      await esperar('window.enviosNr33.length===1&&!document.querySelector(".checklist-form")')
      assert.deepEqual(await avaliar('window.enviosNr33[0].dados'), { [criterio]: 'SIM' })
    }
  }
  resultados.push('sinalização acompanha A/B/C imediatamente, preserva true/false/null e não envia alterações artificiais')
  await abrir({ ...registro, criterio_a: 'NAO', avaliacao_nr33: { ...avaliacao, classificacao: { resultado: 'CARACTERIZADO', origem: 'HIPOTESE_ESPECIFICA', hipoteseEspecifica: 'ATENDIDA' } } })
  assert.match(await avaliar('document.querySelector(".checklist-avaliacao").textContent'), /depende exclusivamente de respostas históricas da hipótese específica/)
  await editar()
  await avaliar(`document.querySelector('input[name=criterio_a][value=NAO]').click()`)
  for (const width of [1440, 390]) {
    await enviar('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 })
    for (const tema of ['light', 'dark']) {
      await avaliar(`document.documentElement.setAttribute('data-theme',${JSON.stringify(tema)})`)
      assert.equal(await avaliar('document.documentElement.scrollWidth>innerWidth'), false)
      await alturasDescricoes()
    }
  }
  await browser.captura('nr33-mobile')
  resultados.push('classificação específica e layout sem overflow em desktop/mobile e temas claro/escuro')

  await abrir(registro, 'VISUALIZADOR')
  assert.equal(await avaliar('document.querySelector(".checklist-edit-button").disabled'), true)
  assert.equal(await avaliar('document.querySelector(".checklist-finish-button").disabled'), true)
  await avaliar('document.querySelector(".checklist-edit-button").click()')
  assert.equal(await avaliar('document.querySelector(".checklist-form")'), null)
  assert.equal(await avaliar('window.enviosNr33.length'), 0)
  await semChamadasExtras()
  resultados.push('perfil somente leitura não altera respostas nem status')

  await abrir(null)
  assert.equal(await avaliar('document.querySelector(".checklist-avaliacao dd").textContent'), 'Pendente')
  assert.match(await avaliar('document.querySelector(".checklist-avaliacao").textContent'), /não autoriza a entrada/)
  await semHipoteseVisual()
  await alturasDescricoes()
  assert.equal(await avaliar('document.getElementById("status").value'), 'PENDENTE')
  assert.ok(await avaliar(`${JSON.stringify(Object.keys(novos).filter(c => c.startsWith('atmosfera_')))}.every(c=>document.getElementById(c).disabled&&document.getElementById(c).value==='')`))
  await avaliar(`document.querySelectorAll('.checklist-criterio-respostas input[value=SIM]').forEach(e=>e.click());document.querySelectorAll('.checklist-questions select').forEach(e=>{e.value='SIM';e.dispatchEvent(new Event('change',{bubbles:true}))})`)
  await salvar()
  await esperar('window.enviosNr33.length===1&&!!document.querySelector(".checklist-existing")')
  assert.equal(await avaliar('window.enviosNr33[0].m'), 'POST')
  assert.equal(await avaliar('window.enviosNr33[0].dados.status'), 'PENDENTE')
  assert.ok(await avaliar(`${JSON.stringify(['atmosfera_oxigenio', 'atmosfera_contaminantes', 'atmosfera_explosiva', 'possui_placa_identificacao'])}.every(c=>window.enviosNr33[0].dados[c]===null)`))
  assert.ok(await avaliar(`${JSON.stringify(ocultos)}.every(c=>!Object.hasOwn(window.enviosNr33[0].dados,c))`))
  assert.equal(await avaliar('Object.hasOwn(window.enviosNr33[0].dados,"avaliacao_nr33")'), false)
  await semChamadasExtras()
  resultados.push('cadastro pendente sem enviar campos ocultos ou avaliação calculada')

  await abrir()
  await editar()
  await alterar('observacoes', 'Não gravar')
  await avaliar('window.erroNr33={status:403}')
  await salvar()
  await esperar('!!document.querySelector(".checklist-error")')
  assert.match(await avaliar('document.querySelector(".checklist-error").textContent'), /permissão/)
  assert.equal(await avaliar('document.getElementById("observacoes").value'), 'Não gravar')
  await avaliar('window.erroNr33={status:503,code:"NR33_ESQUEMA_INCOMPATIVEL"}')
  await salvar()
  await esperar('document.querySelector(".checklist-error")?.textContent.includes("esquema")')
  await avaliar('window.erroNr33={status:401}')
  await salvar()
  await esperar('location.pathname==="/login"')
  assert.equal(await avaliar('localStorage.getItem("token")'), null)
  resultados.push('403/503 públicos e 401 encerra sessão pelo cliente existente')
  await abrir({ ...registro, avaliacao_nr33: { ...avaliacao,
    classificacao: { ...avaliacao.classificacao, origem: 'AMBAS' },
    validacao_conclusao: { ...avaliacao.validacao_conclusao, avisos: ['RESPOSTAS_INAPLICAVEIS_PRESERVADAS'] } } })
  const resumo = await avaliar('document.querySelector(".checklist-avaliacao").textContent')
  assert.doesNotMatch(resumo, /depende exclusivamente|preservadas|Classificação|Origem|Hipótese específica|Conclusão das respostas|último salvamento/)
  assert.match(resumo, /Situação do Checklist/)
  assert.match(resumo, /não autoriza a entrada/)
  resultados.push('quadro simplificado sem mensagens técnicas; aviso histórico exclusivo não aparece para AMBAS')
  console.log(JSON.stringify({ resultado: 'APROVADO', cenarios: resultados, backendRealAcessado: false, capturas: browser.pasta }))
} finally {
  await browser?.fechar()
  vite.kill()
}
