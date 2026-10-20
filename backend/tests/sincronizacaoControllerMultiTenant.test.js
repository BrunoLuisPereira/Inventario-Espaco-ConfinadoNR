const politicaRbac723 = require('../src/utils/permissoes');
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const arquivo = require.resolve('../src/controllers/sincronizacaoController');
const usuario = Object.freeze({ id_usuario:11, id_ambiente:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', perfil_acesso:'ENGENHEIRO_SEGURANCA' });
const casos = [
  ['criar','criarSincronizacao',req=>[req.body,req.usuario],201,'Registro de sincronização criado com sucesso.'],
  ['listar','listarSincronizacoes',req=>[req.usuario],200,null],
  ['buscarPorId','buscarSincronizacaoPorId',req=>[req.params.id,req.usuario],200,null],
  ['buscarPorEntidade','buscarPorEntidade',req=>[req.params.entidade,req.params.idEntidade,req.usuario],200,null],
  ['buscarPendentes','buscarPendentes',req=>[req.usuario],200,null],
  ['buscarConflitos','buscarConflitos',req=>[req.usuario],200,null],
  ['atualizarStatus','atualizarStatus',req=>[req.params.id,req.body,req.usuario],200,'Status da sincronização atualizado com sucesso.'],
  ['excluir','excluirSincronizacao',req=>[req.params.id,req.usuario],200,'Registro de sincronização excluído com sucesso.'],
  ['resolverConflito','resolverConflito',req=>[req.params.id,req.body,req.usuario],200,'Conflito resolvido com sucesso.'],
  ['processarSincronizacao','processarSincronizacao',req=>[req.params.id,req.usuario],200,'Sincronização processada com sucesso.']
];
function preparar(t,nomeServico) {
  const chamadas=[],encaminhados=[],estado={erro:null,iniciarDurante:false,falhaEnvio:false};
  const dados=['listarSincronizacoes','buscarPorEntidade','buscarPendentes','buscarConflitos'].includes(nomeServico)?[{id_sincronizacao:10}]:{id_sincronizacao:10,status:'PENDENTE'};
  const service=Object.fromEntries(casos.map(([,nome])=>[nome,async(...args)=>{chamadas.push({nome,args});if(estado.iniciarDurante)res.headersSent=true;if(estado.erro)throw estado.erro;return dados;}]));
  const load=Module._load,cache=require.cache[arquivo];let controller;
  try {
    delete require.cache[arquivo];Module._load=function(r,parent,...args){
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (r === '../utils/permissoes') return politicaRbac723;if(parent?.filename===arquivo){assert.equal(r,'../services/sincronizacaoMultiTenantService');return service;}return load.call(this,r,parent,...args);};
    controller=require(arquivo);
  }finally{Module._load=load;if(cache)require.cache[arquivo]=cache;else delete require.cache[arquivo];}
  let envios=0;
  const res={headersSent:false,statusCode:200,status(n){this.statusCode=n;return this;},json(d){envios++;this.body=d;this.headersSent=true;if(estado.falhaEnvio)throw estado.falhaEnvio;return this;}};
  const req={params:{id:'10',entidade:'LOCAL',idEntidade:'10',id_ambiente:'FORJADO'},body:{status:'ERRO',id_usuario:99,id_ambiente:'FORJADO',perfil_acesso:'ADMINISTRADOR'},query:{id_usuario:99,id_ambiente:'FORJADO'},usuario};
  return{controller,req,res,estado,dados,chamadas,encaminhados,next:e=>encaminhados.push(e),envios:()=>envios};
}
for(const[nome,servico,argumentos,status,mensagem]of casos){
  test(nome+': contrato de sucesso, referências e somente serviço multi-tenant',async t=>{
    const s=preparar(t,servico);await s.controller[nome](s.req,s.res,s.next);
    assert.equal(s.res.statusCode,status);assert.equal(s.res.body.status,'success');assert.strictEqual(s.res.body.data,s.dados);
    if(mensagem)assert.equal(s.res.body.message,mensagem);if(Array.isArray(s.dados))assert.equal(s.res.body.total,s.dados.length);
    assert.equal(s.chamadas.length,1);assert.equal(s.chamadas[0].nome,servico);
    const esperados=argumentos(s.req);assert.equal(s.chamadas[0].args.length,esperados.length);for(let i=0;i<esperados.length;i++)assert.strictEqual(s.chamadas[0].args[i],esperados[i]);
    assert.equal(s.envios(),1);assert.deepEqual(s.encaminhados,[]);
  });
  test(nome+': headersSent na entrada impede resposta e serviço',async t=>{
    const s=preparar(t,servico);s.res.headersSent=true;await s.controller[nome](s.req,s.res,s.next);assert.equal(s.envios(),0);assert.deepEqual(s.chamadas,[]);
  });
  test(nome+': resposta iniciada durante await permanece intacta',async t=>{
    const s=preparar(t,servico);s.estado.iniciarDurante=true;await s.controller[nome](s.req,s.res,s.next);assert.equal(s.envios(),0);assert.equal(s.chamadas.length,1);assert.deepEqual(s.encaminhados,[]);
  });
  test(nome+': falha de envio não tenta segundo JSON',async t=>{
    const s=preparar(t,servico),erro=new Error('TRANSPORTE_SIMULADO');s.estado.falhaEnvio=erro;await s.controller[nome](s.req,s.res,s.next);assert.equal(s.envios(),1);assert.strictEqual(s.encaminhados[0],erro);
  });
  for(const statusCode of [400,401,403,404,409,undefined])test(nome+': delega erro ao tratamento global '+statusCode,async t=>{
    const s=preparar(t,servico),erro=Object.assign(new Error('SEGREDO_SQL_TOKEN_CAMINHO'),{statusCode});s.estado.erro=erro;
    await s.controller[nome](s.req,s.res,s.next);assert.equal(s.envios(),0);assert.strictEqual(s.encaminhados[0],erro);assert.equal(s.encaminhados.length,1);
  });
}
for(const[nome,servico]of[['criar','criarSincronizacao'],['processarSincronizacao','processarSincronizacao']])test(nome+': conflito preserva HTTP 409 e envelope conflict',async t=>{
  const s=preparar(t,servico);s.dados.status='CONFLITO';await s.controller[nome](s.req,s.res,s.next);
  assert.equal(s.res.statusCode,409);assert.equal(s.res.body.status,'conflict');assert.strictEqual(s.res.body.data,s.dados);assert.equal(s.envios(),1);
});
