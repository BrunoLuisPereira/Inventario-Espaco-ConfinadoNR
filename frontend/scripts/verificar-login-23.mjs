import assert from 'node:assert/strict'
import { abrirNavegador } from './navegador-isolado.mjs'
const b = await abrirNavegador('nr33-login-23-')
const { enviar, avaliar, esperar } = b
try {
  await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `window.chamadas=[];window.fetch=async(url,opcoes)=>{window.chamadas.push({url,body:opcoes?.body});await new Promise(r=>setTimeout(r,350));return new Response(JSON.stringify({message:'Falha controlada no login.'}),{status:401,headers:{'Content-Type':'application/json'}})}` })
  await enviar('Page.navigate', { url: 'http://127.0.0.1:5174/login' })
  await esperar('!!document.getElementById("senha")')
  async function preencher(id, valor) {
    await avaliar(`(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(valor)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`)
  }
  await preencher('senha', 'senha-sintetica-23')
  await esperar('document.getElementById("senha").type === "password"')
  await avaliar('document.querySelector(".login-olho").click()')
  assert.deepEqual(await avaliar('[document.getElementById("senha").type, document.getElementById("senha").value,document.querySelector(".login-olho").getAttribute("aria-pressed")]'), ['text','senha-sintetica-23','true'])
  await avaliar('document.querySelector(".login-olho").focus()')
  await enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 })
  await enviar('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 })
  await esperar('document.getElementById("senha").type === "password"')
  for (const fechar of ['cancelar', 'fechar', 'escape']) {
    await avaliar('document.querySelector(".login-options button").focus();document.querySelector(".login-options button").click()')
    await esperar('!!document.querySelector("dialog[open]")')
    assert.equal(await avaliar('document.activeElement.id'), 'email-recuperacao')
    assert.equal(await avaliar('document.querySelector("dialog").getAttribute("aria-labelledby")'), 'recuperacao-titulo')
    assert.equal(await avaliar('document.querySelector("dialog button[type=submit]").disabled'), true)
    await preencher('email-recuperacao','invalido')
    await avaliar('document.querySelector(".recuperacao-fechar").focus()')
    await esperar('!!document.getElementById("recuperacao-erro")')
    assert.equal(await avaliar('document.getElementById("email-recuperacao").getAttribute("aria-invalid")'), 'true')
    await preencher('email-recuperacao','teste@example.invalid')
    await avaliar('document.getElementById("email-recuperacao").focus();document.querySelector(".recuperacao-fechar").focus()')
    await esperar('!document.getElementById("recuperacao-erro")')
    // Tab pelo último controle ativo retorna ao início do modal.
    await avaliar('document.querySelector(".recuperacao-acoes button").focus()')
    await enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    await enviar('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    assert.equal(await avaliar('document.querySelector("dialog").contains(document.activeElement)'), true)
    for (const width of [1440,390,320]) {
      await enviar('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:width<600})
      assert.equal(await avaliar('(()=>{const r=document.querySelector("dialog").getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && document.documentElement.scrollWidth<=innerWidth})()'),true)
    }
    if (fechar === 'escape') {
      await enviar('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
      await enviar('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
    } else await avaliar(fechar === 'cancelar' ? 'document.querySelector(".recuperacao-acoes button").click()' : 'document.querySelector(".recuperacao-fechar").click()')
    await esperar('!document.querySelector("dialog")')
    assert.equal(await avaliar('document.activeElement===document.querySelector(".login-options button")'),true)
  }
  assert.equal(await avaliar('window.chamadas.length'),0)
  assert.equal(await avaliar('document.getElementById("senha").value'),'senha-sintetica-23')
  await preencher('email','teste@example.invalid')
  await avaliar('document.querySelector(".login-form button[type=submit]").click()')
  await esperar('document.querySelector(".login-form button[type=submit]").disabled')
  assert.equal(await avaliar('document.querySelector(".login-form button[type=submit]").textContent'),'Entrando...')
  await esperar('!!document.querySelector(".login-error")')
  assert.equal(await avaliar('document.querySelector(".login-error").textContent.trim()'),'Falha controlada no login.')
  assert.deepEqual(await avaliar('JSON.parse(window.chamadas[0].body)'),{email:'teste@example.invalid',senha:'senha-sintetica-23'})
  assert.equal(await avaliar('document.querySelector(".login-form button[type=submit]").disabled'),false)
  await avaliar(`window.fetch=async()=>new Response(JSON.stringify({status:'error',message:'Muitas tentativas de login. Aguarde antes de tentar novamente.'}),{status:429,headers:{'Content-Type':'application/json'}})`)
  await avaliar('document.querySelector(".login-form button[type=submit]").click()')
  await esperar('document.querySelector(".login-error")?.textContent.trim()==="Muitas tentativas de login. Aguarde antes de tentar novamente."')
  assert.equal(await avaliar('document.querySelector(".login-error").getAttribute("role")'),'alert')
  assert.equal(await avaliar('document.querySelector(".login-form button[type=submit]").disabled'),false)
  console.log('APROVADO: olho, teclado, preservação da senha, modal, foco, Escape, validação, responsividade, indisponibilidade sem requisição, loading/erro/429 do login e payload original. Recuperação: loading não aplicável sem envio real.')
} finally { await b.fechar() }
