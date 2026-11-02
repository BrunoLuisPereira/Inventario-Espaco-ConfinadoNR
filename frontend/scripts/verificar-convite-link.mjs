// Interface real, API em memória. Não inicia backend nem acessa PostgreSQL.
import assert from 'node:assert/strict'
import { abrirNavegador } from './navegador-isolado.mjs'
const b = await abrirNavegador('nr33-convite-link-')
const { enviar, avaliar, esperar } = b
const base = process.env.NR33_TEST_FRONTEND_URL || 'http://127.0.0.1:5174'
const token = 'a'.repeat(64)
async function preencher(id, valor) {
  await avaliar(`(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(valor)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`)
}
try {
  await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.chamadas=[];
    window.fetch=async(url,options)=>{
      window.chamadas.push({url,body:options?.body});
      if(url==='/api/convites/validar'){
        await new Promise(r=>setTimeout(r,400));
        const caso=new URLSearchParams(location.search).get('caso');
        if(caso==='offline')throw Error('offline');
        const erros={expirado:[410,'Este convite expirou.'],cancelado:[409,'Este convite foi cancelado.'],
          utilizado:[409,'Este convite já foi utilizado.'],invalido:[404,'Convite não encontrado ou inválido.']};
        const erro=erros[caso];
        return new Response(JSON.stringify(erro?{status:'error',message:erro[1]}:{status:'success',data:{valido:true}}),{status:erro?erro[0]:200});
      }
      if(url==='/api/convites/aceitar')return new Response(JSON.stringify({status:'success'}),{status:201});
      throw Error('API inesperada');
    };
  ` })
  await enviar('Page.navigate', { url: base + '/login' })
  await esperar('!!document.querySelector(".login-options")')
  assert.equal(await avaliar('!!document.querySelector("a[href=\'/convites/aceitar\']")'), false)
  for (const [fragmento, caso, mensagem] of [
    ['', '', 'inválido'], ['#token=x', '', 'inválido'],
    ['#token=' + token + '&token=' + token, '', 'inválido'],
    ['#token=' + token, 'expirado', 'expirou'], ['#token=' + token, 'cancelado', 'cancelado'],
    ['#token=' + token, 'utilizado', 'utilizado'], ['#token=' + token, 'invalido', 'inválido'],
    ['#token=' + token, 'offline', 'conectar'],
  ]) {
    await enviar('Page.navigate', { url: base + '/convites/aceitar?caso=' + caso + fragmento })
    await esperar('location.hash === "" && !!document.querySelector("[role=alert]")')
    assert.ok((await avaliar('document.querySelector("[role=alert]").textContent')).includes(mensagem))
    assert.equal(await avaliar('location.hash'), '')
    assert.equal(await avaliar('!!document.querySelector("form")'), false)
    if (!caso) assert.equal(await avaliar('window.chamadas.length'), 0)
  }
  await enviar('Page.navigate', { url: base + '/convites/aceitar#token=' + token })
  await esperar('!!document.querySelector("[role=status]")')
  assert.equal(await avaliar('!!document.querySelector("form")'), false)
  assert.equal(await avaliar('location.hash'), '')
  await esperar('!!document.getElementById("nome")')
  assert.equal(await avaliar('!!document.getElementById("token")'), false)
  await preencher('nome', 'Pessoa de teste')
  await preencher('senha', 'SenhaTeste123!')
  await preencher('confirmacao', 'SenhaTeste123!')
  await avaliar('document.querySelector("form").requestSubmit()')
  await esperar('location.pathname==="/login"')
  const chamadas = await avaliar('window.chamadas')
  assert.ok(chamadas.every(c => !c.url.includes(token)))
  const aceite = chamadas.filter(c => c.url === '/api/convites/aceitar')
  assert.equal(aceite.length, 1)
  assert.deepEqual(JSON.parse(aceite[0].body), { token, nome: 'Pessoa de teste', senha: 'SenhaTeste123!' })
  await enviar('Page.navigate', { url: base + '/cadastro' })
  await esperar('!!document.getElementById("nome_ambiente")')
  assert.equal(await avaliar('window.chamadas.length'), 0)
  console.log('APROVADO: login, estados inválidos, fragmento removido, pré-validação, aceite e cadastro público.')
} finally {
  await b.fechar()
}
