import assert from 'node:assert/strict'
import { abrirNavegador } from './navegador-isolado.mjs'
const real = process.argv.includes('--real')
const base = 'http://127.0.0.1:5174'
if (real) {
  for (const sufixo of ['A', 'B']) {
    assert.ok(process.env[`NR33_SENHA_ADMIN_${sufixo}_722`], 'Entrada privada das duas senhas necessaria')
    assert.match(process.env[`NR33_EMAIL_ADMIN_${sufixo}_722`] || '', /^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    const id = process.env[`NR33_ID_ADMIN_${sufixo}_722`]
    assert.ok(/^[1-9]\d*$/.test(id || '') && Number.isSafeInteger(Number(id)), 'ID esperado invalido')
  }
  assert.notEqual(process.env.NR33_ID_ADMIN_A_722, process.env.NR33_ID_ADMIN_B_722)
  const saude = await (await fetch(base + '/api/health')).json()
  assert.equal(saude.banco, 'inventario_nr33_multitenant_dev'); assert.equal(saude.laboratorio, true)
}
const b = await abrirNavegador('nr33-usuarios-722-')
const { enviar, avaliar, esperar, captura } = b
const resultados = []
async function pesquisar(termo) {
  await avaliar(`(()=>{const e=document.getElementById('usuarios-busca');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(termo)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`)
}
async function conferirTela(qtd, admins, engs) {
  await esperar('!!document.querySelector(".usuarios-tabela")')
  assert.deepEqual(await avaliar('Array.from(document.querySelectorAll(".usuarios-indicador dd")).map(e=>Number(e.textContent))'), [qtd, admins, engs])
  assert.equal(await avaliar('document.querySelectorAll(".usuarios-tabela tbody tr").length'), qtd)
  assert.equal(await avaliar('document.querySelector(".header-title h1").textContent'), 'Usuários')
  assert.equal(await avaliar('document.querySelector(".header-title p").textContent'), 'Gerencie os integrantes do seu ambiente')
  assert.equal(await avaliar('document.querySelector(".usuarios-convidar").getAttribute("href")'), '/convites')
  for (const width of [1440, 390, 320]) {
    await enviar('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 })
    assert.equal(await avaliar('document.documentElement.scrollWidth<=innerWidth'), true)
    await captura(`${real ? 'real' : 'simulado'}-${resultados.length}-${width}`)
  }
  await pesquisar('nao-existe-722'); await esperar('!document.querySelector(".usuarios-tabela")')
  assert.equal(await avaliar('document.querySelector(".usuarios-mensagem").textContent'), 'Nenhum usuário encontrado para esta busca.')
  assert.deepEqual(await avaliar('Array.from(document.querySelectorAll(".usuarios-indicador dd")).map(e=>Number(e.textContent))'), [qtd, admins, engs])
  await pesquisar(''); await esperar('!!document.querySelector(".usuarios-tabela")')
}
try {
  if (real) {
    // Nenhuma simulacao no modo real; somente login e GETs sao permitidos.
    await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `
      const original=window.fetch.bind(window);window.usuariosRetornados=null;
      window.fetch=async(input,init={})=>{const u=new URL(input,location.origin),method=init.method||'GET';
        if(u.origin!==location.origin || !u.pathname.startsWith('/api/') || (method!=='GET' && !(method==='POST' && u.pathname==='/api/auth/login'))) throw Error('Operacao nao autorizada no teste');
        const r=await original(input,init);if(u.pathname==='/api/usuarios' && r.ok)window.usuariosRetornados=await r.clone().json();return r;};
    ` })
    for (const conta of [
      { id: Number(process.env.NR33_ID_ADMIN_A_722), email: process.env.NR33_EMAIL_ADMIN_A_722, senha: process.env.NR33_SENHA_ADMIN_A_722, externo: Number(process.env.NR33_ID_ADMIN_B_722) },
      { id: Number(process.env.NR33_ID_ADMIN_B_722), email: process.env.NR33_EMAIL_ADMIN_B_722, senha: process.env.NR33_SENHA_ADMIN_B_722, externo: Number(process.env.NR33_ID_ADMIN_A_722) },
    ]) {
      await enviar('Page.navigate', { url: base + '/login' }); await esperar('!!document.getElementById("email")')
      for (const [id, valor] of [['email', conta.email], ['senha', conta.senha]]) {
        await avaliar(`(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(valor)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`)
      }
      await avaliar('document.querySelector(".login-form button[type=submit]").click()')
      await esperar('location.pathname==="/dashboard" && !!document.querySelector(".sidebar")')
      await enviar('Page.navigate', { url: base + '/usuarios' }); await esperar('Array.isArray(window.usuariosRetornados?.data)')
      const ids = await avaliar('window.usuariosRetornados.data.map(u=>Number(u.id_usuario))')
      assert.deepEqual(ids, [conta.id])
      await conferirTela(1, 1, 0)
      await pesquisar(conta.email.toUpperCase()); await esperar('document.querySelectorAll(".usuarios-tabela tbody tr").length===1')
      const codigo = await avaliar(`(async()=>{const r=await fetch('/api/usuarios/${conta.externo}',{headers:{Authorization:'Bearer '+localStorage.getItem('token')}});return r.status})()`)
      assert.equal(codigo, 404)
      resultados.push({ usuario: conta.id, usuarios_visiveis: ids, indicadores: [1, 1, 0], externo: 404 })
      await avaliar('document.querySelector(".usuarios-convidar").click()'); await esperar('location.pathname==="/convites"')
      await avaliar('document.querySelector(".sidebar-logout").click()'); await esperar('location.pathname==="/login"')
    }
  } else {
    await enviar('Network.setBlockedURLs', { urls: [base + '/api/*'] })
    const { identifier } = await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `
      const u={id_usuario:9001,nome:'Administrador sintetico',email:'admin@example.invalid',perfil_acesso:'ADMINISTRADOR',ativo:true};
      localStorage.setItem('token','ficticio');localStorage.setItem('usuario',JSON.stringify(u));
      window.modoLista='carregando';window.consultasUsuarios=0;window.apiInesperada=[];
      window.dadosTeste=[u,{id_usuario:9002,nome:'João Engenharia',email:'joao@example.invalid',perfil_acesso:'ENGENHEIRO_SEGURANCA',ativo:false},{id_usuario:9003,nome:'Ana',email:'ana@example.invalid',perfil_acesso:'ENGENHEIRO_SEGURANCA',ativo:true}];
      window.fetch=async(input,init={})=>{
        const p=new URL(input,location.origin).pathname;
        if((init.method||'GET')!=='GET')throw Error('Escrita proibida');
        if(p==='/api/auth/perfil')return Response.json({status:'success',data:u});
        if(p==='/api/usuarios'){
          window.consultasUsuarios++;if(window.modoLista==='carregando')await new Promise(r=>window.liberarLista=r);
          if(window.modoLista==='erro')return Response.json({message:'SQL segredo interno'},{status:500});
          return Response.json({status:'success',data:window.modoLista==='vazio'?[]:window.dadosTeste});
        }
        window.apiInesperada.push(p);throw Error('API desconhecida');
      };
    ` })
    await enviar('Page.navigate', { url: base + '/usuarios' })
    await esperar('!!window.liberarLista && !!document.querySelector(".usuarios-card")')
    assert.equal(await avaliar('document.querySelector(".usuarios-card").getAttribute("aria-busy")'), 'true')
    assert.deepEqual(await avaliar('Array.from(document.querySelectorAll(".usuarios-indicador dd")).map(e=>e.textContent)'), ['—', '—', '—'])
    await avaliar('window.modoLista="ok";window.liberarLista()')
    await conferirTela(3, 1, 2)
    await pesquisar('JOAO'); await esperar('document.querySelectorAll(".usuarios-tabela tbody tr").length===1')
    assert.equal(await avaliar('document.querySelector(".usuarios-email").textContent'), 'joao@example.invalid')
    await pesquisar('ANA@'); await esperar('document.querySelector(".usuarios-email").textContent==="ana@example.invalid"')
    await pesquisar('')
    assert.ok(await avaliar('document.querySelector(".usuarios-tabela").textContent.includes("Inativo")'))
    resultados.push({ estado: 'sucesso_busca_status_indicadores', indicadores: [3, 1, 2] })
    // Cada remount usa a tela real com outro resultado de API, sem mudar producao.
    for (const estado of ['vazio', 'erro']) {
      await avaliar(`window.modoLista=${JSON.stringify(estado)};history.pushState({},'', '/usuarios?teste=${estado}');window.dispatchEvent(new PopStateEvent('popstate'));`)
      // Navega fora e retorna por links reais para executar nova consulta.
      await avaliar(`document.querySelector('.sidebar-nav a[href="/configuracoes"]').click()`)
      await esperar('location.pathname==="/configuracoes"')
      await avaliar(`document.querySelector('.sidebar-nav a[href="/usuarios"]').click()`)
      await esperar(estado === 'erro' ? '!!document.querySelector(".usuarios-erro")' : 'document.querySelector(".usuarios-mensagem")?.textContent.includes("Nenhum usuário cadastrado")')
      if (estado === 'erro') {
        assert.equal(await avaliar('document.body.textContent.includes("SQL segredo interno")'), false)
        await avaliar('window.modoLista="ok";document.querySelector(".usuarios-erro button").click()')
        await esperar('document.querySelectorAll(".usuarios-tabela tbody tr").length===3')
      } else assert.deepEqual(await avaliar('Array.from(document.querySelectorAll(".usuarios-indicador dd")).map(e=>Number(e.textContent))'), [0, 0, 0])
      resultados.push({ estado, aprovado: true })
    }
    assert.deepEqual(await avaliar('window.apiInesperada'), [])
    await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier })
    const engenheiro = { id_usuario: 9002, nome: 'Engenheiro', perfil_acesso: 'ENGENHEIRO_SEGURANCA' }
    await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('token','ficticio');localStorage.setItem('usuario',JSON.stringify(${JSON.stringify(engenheiro)}));window.consultasUsuarios=0;window.fetch=async(p)=>{if(p==='/api/usuarios')window.consultasUsuarios++;return Response.json({status:'success',total:0,data:p==='/api/auth/perfil'?${JSON.stringify(engenheiro)}:[]})};` })
    await enviar('Page.navigate', { url: base + '/usuarios' }); await esperar('location.pathname==="/dashboard" && !!document.querySelector(".sidebar")')
    assert.equal(await avaliar('window.consultasUsuarios'), 0)
    resultados.push({ estado: 'engenheiro_bloqueado_sem_consulta', aprovado: true })
  }
  console.log(JSON.stringify({ resultado: 'APROVADO', modo: real ? 'API_POSTGRESQL_REAL' : 'API_SIMULADA_SOMENTE_TESTE', resultados, pasta: b.pasta }))
} finally { await b.fechar() }
