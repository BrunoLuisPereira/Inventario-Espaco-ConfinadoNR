// Dados exclusivamente ficticios. Nunca conecta a API ou PostgreSQL reais.
const http=require('node:http');
const assert=require('node:assert/strict');
const casos=[
  ['letras_numeros','Abc12345'],
  ['especiais','!@#%^&*()_+-=[]{};:,.?/|\\'],
  ['acentos','Senha\u00c1\u00e9\u00e7\u00e3123'],
  ['espacos','  senha com  espacos  '],
  ['powershell','$(Marcar-ExecucaoProibida); ${env:PATH} & | > < ` " \' \\'],
  ['unicode','Senha-\u6f22\u{1f4a1}e\u0301'],
];
async function principal(){
  let texto='';process.stdin.setEncoding('utf8');
  for await(const parte of process.stdin){texto+=parte;if(texto.length>16384)throw Error();}
  const entrada=JSON.parse(texto);
  assert.equal(entrada.length,casos.length);
  let recebidas=0;
  const server=http.createServer(async(req,res)=>{
    let body='';req.setEncoding('utf8');for await(const p of req)body+=p;
    let ok=false;
    try{
      const atual=JSON.parse(body),esperado=casos[recebidas];
      assert.equal(req.url,'/destino-simulado');
      assert.deepEqual(Object.keys(atual).sort(),['email','senha']);
      assert.equal(atual.email,'Testeacesso@inventario.com');
      assert.equal(atual.senha,esperado[1]);
      recebidas++;ok=true;
    }catch{ /* Nunca imprimir corpo, senha, assert ou excecao completos. */ }
    res.writeHead(ok?200:422,{'Content-Type':'application/json'});res.end(JSON.stringify({ok}));
  });
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const porta=server.address().port;assert.ok(porta!==3000&&porta!==3001);
    for(let i=0;i<casos.length;i++){
      assert.equal(entrada[i].categoria,casos[i][0]);
      assert.equal(entrada[i].senha,casos[i][1]);
      // Mesmo formato JSON e mesmos campos do roteiro real; destino sempre mock efemero.
      const senha=entrada[i].senha;
      const r=await fetch('http://127.0.0.1:'+porta+'/destino-simulado',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:'Testeacesso@inventario.com',senha}),signal:AbortSignal.timeout(5000),
      });
      assert.equal(r.status,200);assert.equal((await r.json()).ok,true);
    }
    assert.equal(recebidas,casos.length);
    process.stdout.write(JSON.stringify({aprovado:true,casos:casos.length,integridadeUtf8:true,espacosPreservados:true,semApiReal:true})+'\n');
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    for(const c of entrada)c.senha=null;
  }
}
if(require.main===module)principal().catch(()=>{process.stderr.write('TESTE_SINTETICO_CANAL_FALHOU\n');process.exitCode=1;});
module.exports={casos};
