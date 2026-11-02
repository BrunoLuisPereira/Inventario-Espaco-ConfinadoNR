// Interface real com API substituída em memória; nenhum backend/e-mail é usado.
import assert from 'node:assert/strict'
import { abrirNavegador } from './navegador-isolado.mjs'
const b = await abrirNavegador('nr33-recuperacao-392-')
const { enviar, avaliar, esperar } = b
const base = 'http://127.0.0.1:5174'
const token = 'a'.repeat(64)
async function preencher(id, valor) {
  await avaliar(`(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(valor)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`)
}
try {
  await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.chamadas=[];window.falha=false;
    window.fetch=async(url,options)=>{
      window.chamadas.push({url,body:options?.body});
      await new Promise(r=>setTimeout(r,250));
      const solicitacao=url==='/api/auth/recuperacao-senha';
      return new Response(JSON.stringify({status:window.falha?'error':'success',message:window.falha?
        'Link inválido, expirado ou já utilizado. Solicite uma nova recuperação.':solicitacao?
        'Se houver uma conta habilitada para este e-mail, enviaremos as instruções de recuperação.':'Senha redefinida. Entre novamente.'}),
        {status:window.falha?400:solicitacao?202:200,headers:{'Content-Type':'application/json'}});
    };
  ` })
  await enviar('Page.navigate', { url: base + '/login' })
  await esperar('!!document.querySelector(".login-options")')
  assert.equal(await avaliar('Array.from(document.querySelectorAll("a")).some(a=>a.getAttribute("href")==="/convites/aceitar")'), false)
  await avaliar('document.querySelector(".login-options button").click()')
  await esperar('!!document.querySelector("dialog[open]")')
  await preencher('email-recuperacao', 'invalido')
  await avaliar('document.querySelector("dialog form").requestSubmit()')
  await esperar('!!document.getElementById("recuperacao-erro")')
  assert.equal(await avaliar('window.chamadas.length'), 0)
  await preencher('email-recuperacao', 'a@example.invalid')
  await avaliar('document.querySelector("dialog form").requestSubmit();document.querySelector("dialog form").requestSubmit()')
  assert.equal(await avaliar('document.querySelector("dialog button[type=submit]").disabled'), true)
  await esperar('!!document.querySelector("dialog [role=status]")')
  assert.equal(await avaliar('window.chamadas.length'), 1)
  assert.deepEqual(await avaliar('JSON.parse(window.chamadas[0].body)'), { email: 'a@example.invalid' })
  await enviar('Page.navigate', { url: base + '/redefinir-senha#token=invalido' })
  await esperar('document.querySelector("[role=alert]")?.textContent.includes("Link inválido")')
  assert.equal(await avaliar('location.hash'), '')
  assert.equal(await avaliar('!!document.querySelector("form")'), false)
  await enviar('Page.navigate', { url: base + '/redefinir-senha#token=' + token })
  await esperar('!!document.getElementById("nova-senha") && location.hash === ""')
  assert.equal(await avaliar('localStorage.getItem("token")'), null)
  assert.equal(await avaliar('document.querySelector("meta[name=referrer]").content'), 'no-referrer')
  await preencher('nova-senha', 'NovaSenha123!')
  await preencher('confirmar-senha', 'Diferente123!')
  await avaliar('document.querySelector("form").requestSubmit()')
  await esperar('document.querySelector("[role=alert]")?.textContent.includes("confirmação")')
  assert.equal(await avaliar('window.chamadas.length'), 0)
  await preencher('confirmar-senha', 'NovaSenha123!')
  await avaliar('window.falha=true;document.querySelector("form").requestSubmit()')
  await esperar('document.querySelector("[role=alert]")?.textContent.includes("expirado")')
  for (const width of [1440, 390, 320]) {
    await enviar('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 })
    assert.equal(await avaliar('document.documentElement.scrollWidth <= innerWidth'), true)
  }
  await avaliar('window.falha=false;document.querySelector("form").requestSubmit()')
  await esperar('location.pathname === "/login" && !!document.querySelector("[role=status]")')
  assert.equal(await avaliar('document.querySelector("[role=status]").textContent.includes("sucesso")'), true)
  assert.equal(await avaliar('window.chamadas.filter(c=>c.url.includes("?token=")||c.url.includes("#token=")).length'), 0)
  assert.equal(await avaliar('JSON.parse(window.chamadas.at(-1).body).token.length'), 64)
  await avaliar('localStorage.setItem("token","sessao-sintetica-antiga");localStorage.setItem("usuario",JSON.stringify({id_usuario:1}))')
  await enviar('Page.navigate', { url: base + '/redefinir-senha#token=' + token })
  await esperar('!!document.getElementById("nova-senha") && location.hash === ""')
  assert.equal(await avaliar('localStorage.getItem("token")'), 'sessao-sintetica-antiga')
  await preencher('nova-senha', 'OutraSenha123!')
  await preencher('confirmar-senha', 'OutraSenha123!')
  await avaliar('document.querySelector("form").requestSubmit()')
  await esperar('location.pathname === "/login" && !!document.querySelector("[role=status]")')
  assert.equal(await avaliar('localStorage.getItem("token")'), null)
  assert.equal(await avaliar('localStorage.getItem("usuario")'), null)
  console.log('APROVADO: modal, validação, envio único, resposta genérica, token fora da URL/storage, senha e confirmação, erro de token, responsividade e retorno ao login; sem backend ou e-mail real.')
} finally { await b.fechar() }
