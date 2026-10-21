import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { abrirNavegador, pausa } from './navegador-isolado.mjs'

// Teste de apresentação: APIs interceptadas antes do React e bloqueadas na rede.
const raiz = fileURLToPath(new URL('..', import.meta.url))
const base = 'http://127.0.0.1:5182'
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'test', '--host', '127.0.0.1', '--port', '5182', '--strictPort'], { cwd: raiz, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let iniciou = false, erro, navegador
vite.stdout.on('data', c => { if (c.toString().includes('127.0.0.1:5182')) iniciou = true })
vite.stderr.on('data', c => { if (c.toString().includes('already in use')) erro = Error('Porta de teste indisponível') })
vite.on('error', e => { erro = e })
const registro = { id_auditoria: 9, id_usuario_afetado: 2, id_usuario_responsavel: 1, perfil_anterior: 'COORDENADOR', perfil_novo: 'SUPERVISOR', data_hora: '2026-10-20T23:57:53Z' }
const cenarios = [
  ['um', [registro]],
  ['multiplos', [registro, { ...registro, id_auditoria: 2, perfil_anterior: 'ENGENHEIRO_SEGURANCA', perfil_novo: 'AUDITOR' }, { ...registro, id_auditoria: 7, perfil_anterior: 'AUDITOR', perfil_novo: 'VISUALIZADOR' }]],
  ['vazio', []], ['erro', null], ['carregando', null],
  ['10', Array.from({ length: 10 }, (_, i) => ({ ...registro, id_auditoria: 20 - i, data_hora: new Date(Date.parse(registro.data_hora) - i * 1000).toISOString() }))],
  ['11', Array.from({ length: 11 }, (_, i) => ({ ...registro, id_auditoria: 30 - i, data_hora: new Date(Date.parse(registro.data_hora) - i * 1000).toISOString() }))],
  ['200', Array.from({ length: 200 }, (_, i) => ({ ...registro, id_auditoria: 200 - i }))],
]
try {
  for (let i = 0; i < 100 && !iniciou && !erro; i++) await pausa(100)
  if (erro) throw erro
  assert.ok(iniciou, 'Vite de teste não iniciou')
  navegador = await abrirNavegador('nr33-auditoria-passo9-')
  const { enviar, avaliar, esperar, captura } = navegador
  await enviar('Network.setBlockedURLs', { urls: ['*/api/*', 'https://*'] })
  await enviar('Emulation.setTimezoneOverride', { timezoneId: 'America/Sao_Paulo' })
  for (const [cenario, dados] of cenarios) {
    const { identifier } = await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `
      const u={id_usuario:1,nome:'Responsável sintético',email:'responsavel@example.invalid',perfil_acesso:'ADMINISTRADOR',eh_fundador:true,ativo:true};
      const convidado={id_usuario:2,nome:'Pessoa convidada',email:'pessoa@example.invalid',perfil_acesso:'SUPERVISOR',ativo:true};
      localStorage.setItem('token','SOMENTE_FIXTURE');localStorage.setItem('usuario',JSON.stringify(u));
      window.consultasAuditoria=[];window.inesperadas=[];
      window.fetch=async(input,init={})=>{
        const p=new URL(input,location.origin),method=init.method||'GET';
        const ok=data=>Response.json({status:'success',data,total:Array.isArray(data)?data.length:undefined});
        if(p.pathname==='/api/auth/perfil')return ok(u);
        if(p.pathname==='/api/usuarios')return ok([u,convidado]);
        if(p.pathname==='/api/usuarios/auditoria/perfis'){
          window.consultasAuditoria.push([method,p.pathname,p.search]);
          if(${JSON.stringify(cenario)}==='erro')return Response.json({message:'SQL_NAO_PUBLICAR'},{status:500});
          if(${JSON.stringify(cenario)}==='carregando')return new Promise(()=>{});
          return ok(${JSON.stringify(dados)});
        }
        window.inesperadas.push(p.pathname);throw Error('API proibida');
      };
    ` })
    await enviar('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    await enviar('Page.navigate', { url: base + '/usuarios' })
    await esperar('!!document.querySelector(".usuarios-auditoria button")')
    assert.equal(await avaliar('window.consultasAuditoria.length'), 0, 'Consulta continua manual')
    assert.equal(await avaliar('document.querySelector(".usuarios-auditoria button").textContent'), 'Consultar auditoria')
    assert.equal(await avaliar('document.querySelector(".usuarios-auditoria > p").textContent'), 'Consulte as 10 alterações de perfil mais recentes do seu ambiente.')
    await avaliar('document.querySelector(".usuarios-auditoria button").click()')
    if (dados?.length) {
      await esperar(`document.querySelectorAll('.auditoria-registro').length===${Math.min(10, dados.length)}`)
      assert.deepEqual(await avaliar('Array.from(document.querySelectorAll(".auditoria-registro time"),e=>e.dateTime)'), dados.slice(0, 10).map(h => h.data_hora), 'Mantém os primeiros registros na ordem recebida')
      assert.equal(await avaliar('document.querySelector(".auditoria-usuario").textContent'), 'Pessoa convidada')
      assert.equal(await avaliar('document.querySelector(".auditoria-responsavel strong").textContent'), 'Responsável sintético')
      assert.equal(await avaliar('document.querySelector(".auditoria-descricao").textContent'), 'Alteração de perfil de acesso')
      assert.equal(await avaliar('document.querySelector(".auditoria-data time").textContent'), '20/10/2026, 20:57:53')
      assert.equal(await avaliar('document.querySelector(".auditoria-data time").dateTime'), dados[0].data_hora)
      const perfis = await avaliar('Array.from(document.querySelectorAll(".auditoria-transicao"),e=>Array.from(e.querySelectorAll(".auditoria-perfil"),p=>p.textContent))')
      assert.deepEqual(perfis[0], ['Coordenador', 'Supervisor'])
      if (cenario === 'multiplos') assert.deepEqual(perfis, [['Coordenador', 'Supervisor'], ['Engenheiro de Segurança', 'Auditor'], ['Auditor', 'Visualizador']])
      if (cenario === 'um') {
        await avaliar('document.querySelector(".usuarios-auditoria").scrollIntoView()')
        await captura('auditoria-desktop')
      }
    } else if (cenario === 'erro') {
      await esperar('!!document.querySelector(".usuarios-auditoria [role=alert]")')
      assert.equal(await avaliar('document.querySelectorAll(".auditoria-registro").length'), 0)
      assert.equal(await avaliar('document.body.textContent.includes("SQL_NAO_PUBLICAR")'), false)
    } else if (cenario === 'carregando') {
      await esperar('document.querySelector(".usuarios-auditoria button").disabled')
      assert.equal(await avaliar('document.querySelector(".usuarios-auditoria button").textContent'), 'Consultando...')
    } else {
      await esperar('document.querySelector(".usuarios-auditoria").textContent.includes("Nenhuma alteração de perfil registrada.")')
      assert.equal(await avaliar('document.querySelectorAll(".auditoria-registro").length'), 0)
    }
    await enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    assert.ok(await avaliar('document.documentElement.scrollWidth<=innerWidth'), 'PWA sem rolagem horizontal')
    if (cenario === 'um') {
      await avaliar('document.querySelector(".usuarios-auditoria").scrollIntoView()')
      await captura('auditoria-mobile')
    }
    assert.deepEqual(await avaliar('window.consultasAuditoria'), [['GET', '/api/usuarios/auditoria/perfis', '']])
    assert.deepEqual(await avaliar('window.inesperadas'), [])
    await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier })
  }
  console.log(JSON.stringify({ resultado: 'APROVADO', cenarios: cenarios.length, desktopMobile: true, capturas: navegador.pasta }))
} finally {
  if (navegador) await navegador.fechar()
  vite.kill()
}
