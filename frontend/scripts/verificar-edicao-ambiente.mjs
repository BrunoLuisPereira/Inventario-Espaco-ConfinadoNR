import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { abrirNavegador } from './navegador-isolado.mjs'

// API sintética interceptada; toda conexão à API real permanece bloqueada.
const server = await createServer({ mode: 'test', server: { host: '127.0.0.1', port: 5181, strictPort: true } })
let b
const clicar = texto => `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(texto)}).click()`
const preencher = nome => `(() => { const i=document.querySelector('#empresa-ambiente'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(nome)}); i.dispatchEvent(new Event('input',{bubbles:true})); })()`
try {
  await server.listen()
  b = await abrirNavegador('nr33-edicao-ambiente-')
  const { enviar, avaliar, esperar } = b
  await enviar('Network.setBlockedURLs', { urls: ['*/api/*', 'https://*'] })
  for (const [perfil, fundador] of [['ADMINISTRADOR', true], ['ADMINISTRADOR', false], ['ENGENHEIRO_SEGURANCA', false]]) {
    const { identifier } = await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.perfilTeste={id_usuario:7,nome:'Pessoa de teste',email:'pessoa@example.invalid',perfil_acesso:${JSON.stringify(perfil)},eh_fundador:${fundador},nome_ambiente:'Empresa original',ativo:true};
      localStorage.setItem('token','token-sintetico');
      localStorage.setItem('usuario',JSON.stringify({...window.perfilTeste,eh_fundador:true,nome_ambiente:'Snapshot incorreto'}));
      window.puts=[];window.inesperadas=[];window.falhar=false;window.aguardar=false;
      window.fetch=async(input,init={})=>{
        const p=new URL(input,location.origin).pathname,m=init.method||'GET';
        if(p==='/api/auth/perfil'&&m==='GET')return Response.json({data:window.perfilTeste});
        if(p==='/api/auth/ambiente'&&m==='PUT'){
          const body=JSON.parse(init.body);window.puts.push(body);
          if(window.falhar)throw Error('Rede indisponível');
          if(window.aguardar)await new Promise(r=>window.concluir=r);
          window.perfilTeste.nome_ambiente=body.nome_ambiente.trim();
          return Response.json({data:{nome_ambiente:window.perfilTeste.nome_ambiente}});
        }
        window.inesperadas.push(m+' '+p);throw Error('Chamada fora do simulador');
      };
    ` })
    await enviar('Page.navigate', { url: 'http://127.0.0.1:5181/configuracoes' })
    await esperar(`document.querySelector('#empresa-ambiente')?.value==='Empresa original'`)
    assert.equal(await avaliar(`document.querySelector('.sidebar-ambiente strong').textContent`), 'Empresa original')
    assert.equal(await avaliar(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Editar nome')`), fundador)
    assert.equal(await avaliar(`document.querySelector('#empresa-ambiente').readOnly`), true)
    if (fundador) {
      await avaliar(clicar('Editar nome'))
      assert.equal(await avaliar(`document.querySelector('#empresa-ambiente').readOnly`), false)
      await avaliar(preencher('Rascunho'))
      await avaliar(clicar('Cancelar'))
      assert.equal(await avaliar(`document.querySelector('#empresa-ambiente').value`), 'Empresa original')
      await avaliar(clicar('Editar nome'))
      await avaliar(preencher('   '))
      await avaliar(clicar('Salvar nome'))
      await esperar(`document.querySelector('.configuracoes-mensagem[role=alert]')!==null`)
      assert.equal(await avaliar('window.puts.length'), 0)
      await avaliar(preencher('Falha de rede'))
      await avaliar('window.falhar=true')
      await avaliar(clicar('Salvar nome'))
      await esperar(`document.querySelector('.configuracoes-mensagem[role=alert]')!==null`)
      assert.equal(await avaliar(`document.querySelector('.sidebar-ambiente strong').textContent`), 'Empresa original')
      await avaliar(clicar('Cancelar'))
      assert.equal(await avaliar(`document.querySelector('#empresa-ambiente').value`), 'Empresa original')
      const nome = 'Empresa com nome longo ' + 'Á'.repeat(150)
      await avaliar(clicar('Editar nome'))
      await avaliar(preencher('  ' + nome + '  '))
      await avaliar('window.falhar=false;window.aguardar=true')
      await avaliar(clicar('Salvar nome'))
      await esperar(`!!window.concluir`)
      assert.equal(await avaliar(`document.querySelector('#empresa-ambiente').disabled`), true)
      assert.equal(await avaliar(`document.querySelector('.sidebar-ambiente strong').textContent`), 'Empresa original')
      await avaliar('window.concluir()')
      await esperar(`document.querySelector('#empresa-ambiente')?.value===${JSON.stringify(nome)}`)
      await esperar(`document.querySelector('.sidebar-ambiente strong')?.textContent===${JSON.stringify(nome)}`)
      assert.deepEqual(await avaliar('window.puts.at(-1)'), { nome_ambiente: nome })
      assert.equal(await avaliar(`document.querySelector('#empresa-ambiente').readOnly`), true)
      assert.equal(await avaliar(`document.querySelector('.configuracoes-mensagem[role=status]').textContent`), 'Nome do ambiente atualizado com sucesso.')
      for (const tema of ['light', 'dark']) for (const width of [1440, 390, 320]) {
        await avaliar(`document.documentElement.setAttribute('data-theme',${JSON.stringify(tema)})`)
        await enviar('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 })
        assert.equal(await avaliar('document.documentElement.scrollWidth<=innerWidth'), true)
      }
    }
    assert.deepEqual(await avaliar('window.inesperadas'), [])
    await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier })
  }
  console.log('APROVADO: fundador, administrador convidado, colaborador, validação, cancelar, rede, carregamento, nome sincronizado, temas e responsividade.')
} finally {
  if (b) await b.fechar()
  await server.close()
}
