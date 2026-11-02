// Navegador real com respostas de API sintéticas; não usa banco nem SMTP real.
import assert from 'node:assert/strict'
import { abrirNavegador } from './navegador-isolado.mjs'
const b = await abrirNavegador('nr33-convite-envio-')
const { enviar, avaliar, esperar } = b
const base = process.env.NR33_TEST_FRONTEND_URL || 'http://127.0.0.1:5174'
const token = 'a'.repeat(64)
try {
  await enviar('Network.setBlockedURLs', { urls: ['*/api/*', 'https://*'] })
  await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `
    const usuario={id_usuario:10,nome:'Administrador de teste',email:'admin@example.invalid',perfil_acesso:'ADMINISTRADOR',eh_fundador:true,ativo:true};
    localStorage.setItem('token','sessao-sintetica');localStorage.setItem('usuario',JSON.stringify(usuario));
    window.emissoes=[];window.estadoEnvio='enviado';
    window.fetch=async(url,options={})=>{
      if(url==='/api/auth/perfil')return Response.json({status:'success',data:usuario});
      if(url==='/api/convites'){
        window.emissoes.push(JSON.parse(options.body));
        await new Promise(r=>setTimeout(r,200));
        return Response.json({status:'success',data:{token:'${token}',link:'http://127.0.0.1:5174/convites/aceitar#token=${token}',envio:{status:window.estadoEnvio}}},{status:201});
      }
      throw Error('API inesperada');
    };
  ` })
  await enviar('Page.navigate', { url: base + '/convites' })
  await esperar('!!document.getElementById("convite-email")')
  for (const [status, mensagem] of [['enviado', 'e-mail enviado'], ['falhou', 'Não foi possível confirmar'], ['indisponivel', 'indisponível']]) {
    await avaliar(`window.estadoEnvio=${JSON.stringify(status)};
      (()=>{const e=document.getElementById('convite-email');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'convidado@example.invalid');e.dispatchEvent(new Event('input',{bubbles:true}));})()`)
    await avaliar('document.querySelector(".conta-form").requestSubmit()')
    assert.equal(await avaliar('document.querySelector(".conta-form button").disabled'), true)
    await esperar('!document.querySelector(".conta-form button").disabled && !!document.querySelector("[role=status]")')
    const texto = await avaliar('document.querySelector("[role=status]").textContent')
    assert.ok(texto.includes(mensagem))
    if (status === 'enviado') {
      assert.equal(await avaliar('!!document.getElementById("convite-link")'), false)
      assert.ok(!(await avaliar('document.body.textContent')).includes(token))
    } else {
      assert.ok(texto.includes('pendente por 48 horas'))
      assert.equal(await avaliar('document.getElementById("convite-link").value'), `http://127.0.0.1:5174/convites/aceitar#token=${token}`)
      await avaliar('document.getElementById("convite-link").parentElement.querySelector("button").click()')
      assert.equal(await avaliar('!!document.getElementById("convite-link")'), false)
    }
  }
  const emissoes = await avaliar('window.emissoes')
  assert.equal(emissoes.length, 3)
  for (const emissao of emissoes) assert.deepEqual(emissao, { email: 'convidado@example.invalid', perfilAcesso: 'ENGENHEIRO_SEGURANCA' })
  console.log('APROVADO: envio confirmado, falha SMTP, transporte indisponível e compartilhamento manual.')
} finally {
  await b.fechar()
}
