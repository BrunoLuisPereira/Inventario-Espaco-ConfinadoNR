// Frontend de produção + API sintética em memória. Nunca usa PostgreSQL/API real.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { abrirNavegador, pausa } from './navegador-isolado.mjs'

const root = fileURLToPath(new URL('../dist', import.meta.url))
const ambiente = '11111111-1111-4111-8111-111111111111'
const user = { id_usuario: 1, id_ambiente: ambiente, nome: 'Pessoa sintética', email: 'test@example.invalid',
  perfil_acesso: 'ADMINISTRADOR', eh_fundador: true, ativo: true, idioma: 'pt-BR', nome_ambiente: 'Empresa sintética' }
const campanha = { id_campanha: 1, nome_campanha: 'Campanha sintética', empresa: 'Empresa sintética', responsavel: 'Equipe sintética', data_inicio: '2026-01-02', status: 'EM ANDAMENTO' }
const local = { id_local: 1, id_campanha: 1, nome_local: 'Local sintético', setor: 'Setor sintético', nome_campanha: campanha.nome_campanha,
  descricao: 'Descrição livre em português', endereco: 'Endereço livre', status: 'ATIVO', criterio_a: 'SIM', criterio_b: 'SIM', criterio_c: 'SIM' }
const checklist = { id_checklist: 1, id_local: 1, ...Object.fromEntries(['criterio_a','criterio_b','criterio_c','acesso_controlado','ventilacao_adequada','monitoramento_atmosferico','procedimento_emergencia'].map(k => [k, 'SIM'])),
  atmosfera_oxigenio: true, atmosfera_contaminantes: false, atmosfera_explosiva: false, possui_placa_identificacao: false,
  codigo_identificacao: 'EC-01', volume_m3: '1234.123456', quantidade_aberturas: 2, observacoes: 'Não informado', status: 'PENDENTE',
  avaliacao_nr33: { classificacao: { resultado: 'CARACTERIZADO', origem: 'REGRA_GERAL' }, aplicabilidade: { atmosfera: true, placa: true },
    validacao_conclusao: { pode_concluir: true, erros: [], avisos: ['AUSENCIA_SINALIZACAO'] } } }
const tecnicos = { id_dados: 1, id_local: 1, pressao_atmosferica: '1013.123456', ventilacao: 'Mecânica', oxigenio: '20.95', gas_inflamavel: '0.000001',
  monoxido_carbono: '1.25', sulfeto_hidrogenio: '0', temperatura: '22.5', umidade: '50.12', status: 'PENDENTE', observacoes: 'Observação livre' }
const relatorio = { id_relatorio: 1, id_local: 1, status: 'RASCUNHO', usuario_responsavel: user.nome, email_usuario_responsavel: user.email,
  perfil_usuario_responsavel: user.perfil_acesso, nome_responsavel_tecnico: 'Nome livre', crea: 'CREA-01', numero_art: 'ART-01', data_art: '2026-01-02' }
const evidencia = { id_evidencia: 1, id_local: 1, tipo: 'FOTO', descricao: 'Descrição livre', latitude: '-26.3044000', longitude: '-48.8487000',
  origem_coordenadas: 'GPS', precisao_gps: '1.25', usuario_responsavel: user.nome }
const chamadas = []
const geracoesPdf = []
let atrasarPdf = false, liberarPdf = null
let server, browser, verificacoes = 0
const ok = (a, b, msg) => { assert.deepEqual(a, b, msg); verificacoes++ }
try {
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1'), rota = url.pathname, method = req.method
      if (rota.startsWith('/api/')) {
        let raw = ''; for await (const parte of req) raw += parte
        const dados = raw ? JSON.parse(raw) : null
        chamadas.push({ rota, method, dados })
        const responder = (data, status = 200, message) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: status < 400 ? 'success' : 'error', data, message })) }
        if (rota === '/api/auth/login' && method === 'POST') return dados.email === user.email && dados.senha === 'senha-sintetica'
          ? responder({ token: 'token-sintetico-i18n', usuario: { ...user } }) : responder(null, 401, 'E-mail ou senha inválidos.')
        if (rota === '/api/auth/recuperacao-senha') return responder(null, 202, 'Se houver uma conta habilitada para este e-mail, enviaremos as instruções de recuperação.')
        if (req.headers.authorization !== 'Bearer token-sintetico-i18n') return responder(null, 401, 'Sessão expirada. Entre novamente.')
        if (rota === '/api/auth/preferencias/idioma' && method === 'PATCH') {
          assert.deepEqual(Object.keys(dados), ['idioma']); assert.ok(['pt-BR', 'en'].includes(dados.idioma))
          user.idioma = dados.idioma; return responder({ id_usuario: user.id_usuario, id_ambiente: ambiente, idioma: user.idioma })
        }
        if (rota === '/api/checklists/1' && method === 'PUT') { Object.assign(checklist, dados); return responder({ ...checklist }) }
        if (rota === '/api/relatorios/1/gerar-pdf' && method === 'POST') {
          assert.deepEqual(Object.keys(dados), ['idioma'])
          const geracao = { id_geracao: randomUUID(), id_relatorio: 1, idioma: dados.idioma,
            id_solicitante: user.id_usuario, id_ambiente: ambiente }
          if (atrasarPdf) await new Promise(resolve => { liberarPdf = resolve })
          geracoesPdf.unshift(geracao)
          return responder({ relatorio, geracao })
        }
        if (rota === '/api/relatorios/1/geracoes-pdf') return responder({ geracoes: geracoesPdf.filter(g => g.idioma === url.searchParams.get('idioma')), legado: { idioma: null } })
        const arquivoPdf = rota.match(/^\/api\/relatorios\/1\/geracoes-pdf\/([^/]+)\/pdf$/)
        if (arquivoPdf) {
          const g = geracoesPdf.find(g => g.id_geracao === arquivoPdf[1])
          if (!g || g.idioma !== url.searchParams.get('idioma')) return responder(null, 404)
          res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Language': g.idioma, 'Cache-Control': 'private, no-store' })
          return res.end(method === 'HEAD' ? undefined : '%PDF-1.7 SYNTHETIC ' + g.idioma + ' ' + g.id_geracao + ' %%EOF')
        }
        if (method !== 'GET' && method !== 'HEAD') return responder(null, 501, 'Operação não simulada.')
        const registros = { '/api/auth/perfil': user, '/api/campanhas': [campanha], '/api/campanhas/1': campanha,
          '/api/locais': [local], '/api/locais/1': local, '/api/checklists': [checklist], '/api/checklists/1': checklist,
          '/api/dados-tecnicos/local/1': tecnicos, '/api/evidencias/local/1': [evidencia], '/api/relatorios/local/1': relatorio,
          '/api/relatorios': [relatorio], '/api/usuarios': [user, { ...user, id_usuario: 2, nome: 'Outra pessoa', eh_fundador: false, perfil_acesso: 'ENGENHEIRO_SEGURANCA', id_convite_origem: 1 }],
          '/api/usuarios/auditoria/perfis': [{ id_auditoria: 1, id_usuario_afetado: 2, id_usuario_responsavel: 1, perfil_anterior: 'VISUALIZADOR', perfil_novo: 'ENGENHEIRO_SEGURANCA', data_hora: '2026-01-02T12:30:00Z' }] }
        return Object.hasOwn(registros, rota) ? responder(registros[rota]) : responder(null, 404, 'Recurso não encontrado.')
      }
      let destino = path.resolve(root, '.' + decodeURIComponent(rota))
      if (destino !== root && !destino.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return }
      let conteudo
      try { conteudo = await fs.readFile(destino) } catch { destino = path.join(root, 'index.html'); conteudo = await fs.readFile(destino) }
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(destino)] || 'application/octet-stream')
      res.end(conteudo)
    } catch { res.writeHead(500); res.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  browser = await abrirNavegador('nr33-interface-i18n-')
  const { avaliar, esperar, enviar } = browser
  await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.i18nRequisicoesPendentes = 0;
    const fetchOriginalI18n = window.fetch.bind(window);
    window.fetch = (...args) => {
      window.i18nRequisicoesPendentes++;
      return fetchOriginalI18n(...args).finally(() => { window.i18nRequisicoesPendentes--; });
    };
  ` })
  const texto = value => esperar(`document.body.innerText.includes(${JSON.stringify(value)})`)
  async function abrir(rota, textoEsperado) {
    await enviar('Page.navigate', { url: base + rota }); await texto(textoEsperado)
    await esperar(`!document.body.innerText.includes('Loading') && !document.body.innerText.includes('Carregando')`)
    await esperar('window.i18nRequisicoesPendentes === 0')
    // Esperar também o commit React da revalidação pública de sessão/preferência.
    await avaliar('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  }
  async function preencher(id, value) { await avaliar(`void (()=>{const e=document.getElementById(${JSON.stringify(id)});const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`) }
  async function idioma(value, publico = false) {
    await preencher(publico ? 'idioma-publico' : 'idioma-cabecalho', value)
    await esperar(`document.documentElement.lang === ${JSON.stringify(value)}`)
    if (!publico && await avaliar('navigator.onLine')) for (let i = 0; i < 100 && user.idioma !== value; i++) await pausa(20)
  }
  const clicar = seletor => avaliar(`document.querySelector(${JSON.stringify(seletor)}).click()`)
  async function guardar() {
    await avaliar(`void (window.i18nAntes={campos:[...document.querySelectorAll('main input,main textarea,main select')].filter(e=>!e.id.startsWith('idioma-')&&!e.readOnly),valores:[...document.querySelectorAll('main input,main textarea,main select')].filter(e=>!e.id.startsWith('idioma-')&&!e.readOnly).map(e=>[e.value,e.checked]),token:localStorage.getItem('token'),tema:document.documentElement.getAttribute('data-theme'),usuario:JSON.parse(localStorage.getItem('usuario')||'null')?.perfil_acesso})`)
  }
  async function conferir(contexto = '') {
    ok(await avaliar(`(()=>{const a=window.i18nAntes,b=[...document.querySelectorAll('main input,main textarea,main select')].filter(e=>!e.id.startsWith('idioma-')&&!e.readOnly);return b.length===a.campos.length&&b.every((e,i)=>e===a.campos[i]&&e.value===a.valores[i][0]&&e.checked===a.valores[i][1])&&localStorage.getItem('token')===a.token&&document.documentElement.getAttribute('data-theme')===a.tema&&JSON.parse(localStorage.getItem('usuario')||'null')?.perfil_acesso===a.usuario})()`), true, 'Formulário, sessão, tema e permissões devem permanecer intactos ' + contexto)
  }
  await abrir('/login', 'Entrar')
  await preencher('email', user.email); await preencher('senha', 'incorreta'); await guardar()
  await idioma('en', true); await texto('Sign in'); await conferir(); ok(user.idioma, 'pt-BR')
  await clicar('.login-options button'); await esperar('!!document.querySelector(".recuperacao-dialog[open]")')
  await preencher('email-recuperacao', user.email); await guardar()
  await idioma('pt-BR', true); await conferir(); await idioma('en', true); await conferir()
  await clicar('.recuperacao-dialog button[type="submit"]')
  await texto('If there is an enabled account for this email address, we will send recovery instructions.')
  await clicar('.recuperacao-fechar')
  await clicar('.login-form button[type="submit"]'); await texto('Invalid email or password.')
  await idioma('pt-BR', true); await texto('E-mail ou senha inválidos.')
  await preencher('senha', 'senha-sintetica'); await clicar('.login-form button[type="submit"]'); await texto('Visão geral')
  await avaliar("localStorage.setItem('inventario-tema','dark')"); await enviar('Page.reload'); await texto('Visão geral')
  await idioma('en'); await texto('Overview'); ok(await avaliar('document.documentElement.getAttribute("data-theme")'), 'dark')
  const rotas = [
    ['/campanhas', 'Campaigns', 'Campanhas'], ['/locais', 'Locations', 'Locais'], ['/locais/1/inventario', 'Location Inventory', 'Inventário do Local'],
    ['/locais/1/checklist', 'NR-33 Checklist', 'Checklist NR-33'], ['/locais/1/dados-tecnicos', 'Technical Data', 'Dados Técnicos'],
    ['/locais/1/evidencias', 'Evidence / Photos', 'Evidências / Fotos'], ['/locais/1/responsaveis', 'Report Responsibilities', 'Responsáveis pelo Relatório'],
    ['/locais/1/relatorio', 'Location Report', 'Relatório do Local'], ['/relatorios', 'Reports', 'Relatórios'], ['/usuarios', 'Users', 'Usuários'],
    ['/convites', 'Invitations', 'Convites'], ['/configuracoes', 'Settings', 'Configurações'],
  ]
  for (const [rota, en, pt] of rotas) {
    await abrir(rota, en)
    await guardar(); await idioma('pt-BR'); await texto(pt); await conferir(rota)
    await idioma('en'); await texto(en); await conferir(rota)
    await enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    ok(await avaliar('document.documentElement.scrollWidth <= 390'), true, 'Layout móvel: ' + rota)
    await enviar('Emulation.clearDeviceMetricsOverride')
  }
  // PDFs: identidade/idioma explícitos, geração exata e respostas pendentes.
  await abrir('/locais/1/relatorio', 'Location Report')
  await texto('No PDF available in the active language.')
  ok(await avaliar('document.querySelector(".relatorio-actions .relatorio-btn-secondary").disabled'), true)
  await clicar('.relatorio-actions .relatorio-btn-primary'); await texto('PDF generated successfully.')
  ok(geracoesPdf[0].idioma, 'en')
  const primeiroPdf = geracoesPdf[0].id_geracao
  await avaliar(`void (window.pdfAbertos=[],window.pdfBlobs=[],window.open=(url)=>{window.pdfAbertos.push(url)},window.pdfCreate=URL.createObjectURL.bind(URL),URL.createObjectURL=(blob)=>{window.pdfBlobs.push(blob);return window.pdfCreate(blob)})`)
  await clicar('.relatorio-actions .relatorio-btn-secondary'); await esperar('window.pdfAbertos.length===1')
  ok(await avaliar('window.pdfBlobs[0].text()'), '%PDF-1.7 SYNTHETIC en ' + primeiroPdf + ' %%EOF')
  ok(chamadas.filter(x => x.rota.includes(primeiroPdf)).map(x => x.method), ['HEAD', 'GET'])
  await clicar('.relatorio-actions .relatorio-btn-primary'); await texto('PDF generated successfully.')
  await esperar('!document.querySelector(".relatorio-actions .relatorio-btn-primary").disabled')
  ok(geracoesPdf.length, 2); ok(geracoesPdf[0].id_geracao !== primeiroPdf, true)
  await idioma('pt-BR'); await texto('Nenhum PDF disponível no idioma ativo.')
  ok(await avaliar('document.querySelector(".relatorio-actions .relatorio-btn-secondary").disabled'), true)
  await clicar('.relatorio-actions .relatorio-btn-primary'); await texto('PDF gerado com sucesso.')
  ok(geracoesPdf[0].idioma, 'pt-BR')
  await idioma('en'); await texto('PDF language: English')
  atrasarPdf = true
  await clicar('.relatorio-actions .relatorio-btn-primary')
  for (let i=0; !liberarPdf && i<100; i++) await pausa(20)
  assert.ok(liberarPdf)
  await idioma('pt-BR'); await texto('Idioma do PDF: Português (Brasil)')
  liberarPdf(); liberarPdf = null; atrasarPdf = false; await pausa(250)
  ok(await avaliar('!!document.querySelector(".relatorio-success")'), false, 'Resposta antiga não publica sucesso após troca de idioma')
  // Logout e outra conta durante uma nova geração pendente.
  atrasarPdf = true; await clicar('.relatorio-actions .relatorio-btn-primary')
  for (let i=0; !liberarPdf && i<100; i++) await pausa(20)
  assert.ok(liberarPdf)
  await avaliar(`localStorage.removeItem('token');localStorage.removeItem('usuario');window.dispatchEvent(new Event('nr33:sessao-expirada'))`)
  await esperar('!!document.querySelector(".login-form")')
  user.id_usuario = 3; user.idioma = 'en'
  await preencher('email', user.email); await preencher('senha', 'senha-sintetica'); await clicar('.login-form button[type="submit"]')
  await texto('Overview'); await abrir('/locais/1/relatorio', 'Location Report'); await texto('PDF language: English')
  liberarPdf(); liberarPdf = null; atrasarPdf = false; await pausa(250)
  ok(await avaliar('!!document.querySelector(".relatorio-success")'), false, 'Outra conta não recebe resposta da sessão encerrada')
  ok(JSON.parse(await avaliar('localStorage.getItem("usuario")')).id_usuario, 3)
  await abrir('/usuarios', 'Users'); await esperar('!!document.querySelector(".usuarios-editar")'); await clicar('.usuarios-editar')
  await texto('Edit permissions'); await preencher('novo-perfil', 'COORDENADOR'); await guardar()
  await idioma('pt-BR'); await conferir(); await idioma('en'); await conferir()
  ok(await avaliar('document.querySelector("#novo-perfil").value'), 'COORDENADOR')
  await clicar('.permissoes-botoes button[type="button"]')
  await clicar('.auditoria-acoes button'); await texto('Access role change'); await idioma('pt-BR'); await texto('Alteração de perfil de acesso'); await idioma('en'); await texto('Safety Engineer')
  await abrir('/locais/1/checklist', 'NR-33 Checklist')
  ok(await avaliar('document.querySelector(".checklist-observacoes p").textContent.trim()'), 'Não informado', 'Texto livre não deve ser traduzido')
  await clicar('.checklist-edit-button'); await esperar('!!document.querySelector(".checklist-form")')
  await preencher('codigo_identificacao', 'EC-editado'); await guardar()
  await idioma('pt-BR'); await conferir(); await idioma('en'); await conferir()
  ok(await avaliar('document.querySelector("input[name=criterio_a]:checked").value'), 'SIM')
  ok(await avaliar('document.getElementById("atmosfera_oxigenio").value'), 'SIM')
  await clicar('.checklist-form button[type="submit"]'); await texto('Checklist updated successfully.')
  ok(chamadas.filter(x => x.method === 'PUT').at(-1).dados, { codigo_identificacao: 'EC-editado' }, 'Payload NR-33 preservado')
  await abrir('/campanhas', 'Campaigns'); await esperar('!!document.querySelector(".campanha-button-primary")'); await clicar('.campanha-button-primary'); await esperar('!!document.querySelector(".campanha-form")')
  await preencher('nome_campanha', 'Nome preenchido'); await guardar(); await idioma('pt-BR'); await conferir(); await idioma('en'); await conferir()
  await abrir('/locais', 'Locations'); await esperar('!!document.querySelector(".locais-heading .local-button-primary:not(:disabled)")'); await clicar('.locais-heading .local-button-primary'); await esperar('!!document.querySelector("#campanha-cadastro")'); await preencher('campanha-cadastro', '1'); await esperar('!!document.querySelector(".local-form")')
  await preencher('nome_local', 'Local preenchido'); await preencher('latitude', '0'); await preencher('longitude', '0'); await guardar()
  await idioma('pt-BR'); await conferir(); await idioma('en'); await conferir()
  await enviar('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await idioma('pt-BR'); await texto('Nome do local *'); await conferir(); await idioma('en'); await texto('Location name *'); await conferir()
  await enviar('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await abrir('/cadastro', 'Create account'); await preencher('nome', 'Nome sem tradução'); await preencher('email', 'cadastro@example.invalid'); await guardar()
  await avaliar('document.querySelector("#senha").checkValidity()')
  ok(await avaliar('document.querySelector("#senha").validationMessage'), 'Please fill out this field.')
  await idioma('pt-BR', true); await conferir(); await idioma('en', true); await conferir()
  ok(await avaliar('document.querySelector("#senha").validationMessage'), 'Please fill out this field.')
  await abrir('/redefinir-senha#token=' + 'a'.repeat(64), 'Reset password'); await preencher('nova-senha', 'curta'); await preencher('confirmar-senha', 'outra')
  await guardar(); await idioma('pt-BR', true); await conferir(); await idioma('en', true); await conferir()
  console.log(JSON.stringify({ verificacoes, telas: rotas.length + 3, modais: 2, bancoReal: false, apiReal: false, payloadNr33: 'preservado', formularios: 'preservados', offline: 'OK' }))
} finally {
  if (browser) {
    await browser.fechar().catch(() => {})
    const pasta = path.resolve(browser.pasta)
    if (path.dirname(pasta) === path.resolve(os.tmpdir()) && path.basename(pasta).startsWith('nr33-interface-i18n-')) await fs.rm(pasta, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 })
  }
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
}
