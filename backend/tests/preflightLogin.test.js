const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const {EventEmitter}=require('node:events');
const {fixture,clientSimulado}=require('./helpers/preflightLoginFixture.cjs');
const {validarPreflight,identidade}=require('../laboratorio/preflight-login.cjs');
const {validarAmbienteLocal}=require('../laboratorio/postgresLocal.cjs');
const {hmacValido}=require('../src/utils/loginHmac');
const HMAC=Buffer.alloc(32,7).toString('base64'); // fixture fixa, não é segredo gerado.
const env={DB_NAME:'inventario_nr33_multitenant_dev',DB_HOST:'127.0.0.1',DB_PORT:'5432',DB_USER:'nr33_dev_app',
  DB_PASSWORD:'senha-sintetica-nao-utilizavel-em-banco-real',JWT_SECRET:'s'.repeat(64),
  NR33_LOCAL_AUTORIZADO:'PASSO712',LOGIN_HMAC_SECRET:HMAC};

function inicializador(t,catalogo=fixture(),overrides={}) {
  const nomes=[...Object.keys(env),'NR33_BACKEND_PORT'];
  const anteriores=Object.fromEntries(nomes.map(n=>[n,process.env[n]]));
  for (const [k,v] of Object.entries({...env,...overrides})) {
    if (v===undefined) delete process.env[k]; else process.env[k]=v;
  }
  if (!Object.hasOwn(overrides,'NR33_BACKEND_PORT')) delete process.env.NR33_BACKEND_PORT;
  t.after(()=>{for(const [k,v] of Object.entries(anteriores)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
  const client=clientSimulado(catalogo), eventos=[];
  const pool={on(){return this;},async connect(){eventos.push('connect');return client;},async end(){eventos.push('end');}};
  const server=new EventEmitter(); server.close=cb=>{server.listening=false;eventos.push('close');cb();};
  const app={listen(port,host){eventos.push(['listen',port,host]);server.listening=true;queueMicrotask(()=>server.emit('listening'));return server;}};
  const caminho=require.resolve('../laboratorio/servidor-local.cjs'), anterior=require.cache[caminho], load=Module._load;
  delete require.cache[caminho];
  t.after(()=>{if(anterior)require.cache[caminho]=anterior;else delete require.cache[caminho];});
  t.mock.method(Module,'_load',function(nome,parent,...args){
    if(parent?.filename===caminho && nome==='pg')return {Pool:class{constructor(config){eventos.push('pool');assert.equal(config.database,env.DB_NAME);return pool;}}};
    if(parent?.filename===caminho && nome==='./app.cjs')return {criarApp(){assert.equal(client.queries.at(-1).sql,'COMMIT');eventos.push('app');return app;}};
    return load.call(this,nome,parent,...args);
  });
  t.mock.method(console,'log',()=>{});
  return {iniciar:require(caminho).iniciar,eventos,client,app};
}
for(const [nome,valor,codigo] of [['ausente',undefined,'HMAC_AUSENTE'],['vazio','','HMAC_AUSENTE'],
  ['curto','nao-publicar','HMAC_INVALIDO'],['nao canonico',HMAC.slice(0,42)+'d=','HMAC_INVALIDO'],
  ['quebra de linha',HMAC+'\n','HMAC_INVALIDO']]) {
  test('HMAC '+nome+': recusa antes de carregar pg ou abrir porta',async t=>{
    const c=inicializador(t,fixture(),{LOGIN_HMAC_SECRET:valor});
    await assert.rejects(c.iniciar(),erro=>erro.codigoPreflight===codigo && !erro.message.includes('nao-publicar'));
    assert.deepEqual(c.eventos,[]);
  });
}
test('validação HMAC compartilhada aceita apenas Base64 canônico de 32 bytes',()=>{
  assert.equal(hmacValido(HMAC),true);
  for(const valor of [null,{},HMAC+' ',Buffer.alloc(31,7).toString('base64'),Buffer.alloc(33,7).toString('base64')])assert.equal(hmacValido(valor),false);
});

test('IPv4 local aceito com host extraido sem mascara na consulta compartilhada',async()=>{
  const client=clientSimulado(fixture());
  assert.equal((await identidade(client)).host,'127.0.0.1');
  const sql=client.queries[0].sql;
  assert.match(sql,/\bhost\(inet_server_addr\(\)\) AS host/);
  assert.doesNotMatch(sql,/inet_server_addr\(\)::text/);
  await validarPreflight(client,validarAmbienteLocal(env));
});

const casos=[
  ['tabela ausente',c=>{delete c.tabelas['public.login_tentativa'];},'TABELA_023_AUSENTE'],
  ['banco conectado errado',c=>{c.identidade.banco='postgres';},'DESTINO_POSTGRESQL'],
  ['PostgreSQL 18',c=>{c.identidade.versao=18;},'DESTINO_POSTGRESQL'],
  ['host errado',c=>{c.identidade.host='192.0.2.1';},'DESTINO_POSTGRESQL'],
  ['porta errada',c=>{c.identidade.porta=55432;},'DESTINO_POSTGRESQL'],
  ['host com mascara nao normalizado',c=>{c.identidade.host='127.0.0.1/32';},'DESTINO_POSTGRESQL'],
  ['papel errado',c=>{c.identidade.papel='postgres';},'PAPEL_APLICACAO'],
  ['SET ROLE disfarçado',c=>{c.identidade.sessao='postgres';},'PAPEL_APLICACAO'],
  ['papel privilegiado',c=>{c.identidade.privilegiado=true;},'PAPEL_APLICACAO'],
  ...['selecionar','inserir','atualizar','usuario','ambiente','schema'].map(p=>['privilégio '+p,c=>{c.permissoes[p]=false;},'PERMISSOES_LOGIN']),
  ['tipo de coluna',c=>{c.tabelas['public.login_tentativa'].colunas[2].tipo='text[]';},'COLUNAS_023_INCOMPATIVEIS'],
  ['default incorreto',c=>{c.tabelas['public.login_tentativa'].colunas[3].padrao='now()';},'COLUNAS_023_INCOMPATIVEIS'],
  ['nulabilidade',c=>{c.tabelas['public.login_tentativa'].colunas[0].obrigatoria=false;},'COLUNAS_023_INCOMPATIVEIS'],
  ['CHECK ausente',c=>{c.tabelas['public.login_tentativa'].constraints.pop();},'CONSTRAINTS_023_INCOMPATIVEIS'],
  ['CHECK não validado',c=>{c.tabelas['public.login_tentativa'].constraints[1].validada=false;},'CONSTRAINTS_023_INCOMPATIVEIS'],
  ['CHECK alterado',c=>{c.tabelas['public.login_tentativa'].constraints[4].definicao='CHECK ((cardinality(falhas) <= 6))';},'CONSTRAINTS_023_INCOMPATIVEIS'],
  ['literal de CHECK alterado',c=>{c.tabelas['public.login_tentativa'].constraints[1].definicao=c.tabelas['public.login_tentativa'].constraints[1].definicao.replace("'ip'","'IP'");},'CONSTRAINTS_023_INCOMPATIVEIS'],
  ['índice ausente',c=>{c.tabelas['public.login_tentativa'].indices.pop();},'INDICES_023_INCOMPATIVEIS'],
  ['índice inválido',c=>{c.tabelas['public.login_tentativa'].indices[0].valido=false;},'INDICES_023_INCOMPATIVEIS'],
  ['índice parcial',c=>{c.tabelas['public.login_tentativa'].indices[0].predicado='true';},'INDICES_023_INCOMPATIVEIS'],
  ['tabela unlogged',c=>{c.tabelas['public.login_tentativa'].tabela.relpersistence='u';},'TABELA_023_INCOMPATIVEL'],
  ['RLS inesperado',c=>{c.tabelas['public.login_tentativa'].tabela.relrowsecurity=true;},'TABELA_023_INCOMPATIVEL'],
  ['coluna fundador ausente',c=>{c.tabelas['public.usuario'].colunas=c.tabelas['public.usuario'].colunas.filter(x=>x.nome!=='eh_fundador');},'COLUNAS_AUTENTICACAO'],
  ['RBAC incompleto',c=>{c.tabelas['public.usuario'].constraints[2].definicao=c.tabelas['public.usuario'].constraints[2].definicao.replace(", 'VISUALIZADOR'::text",'');},'RBAC_SETE_PERFIS'],
  ['fundador sem CHECK',c=>{c.tabelas['public.usuario'].constraints.pop();},'RBAC_FUNDADOR'],
  ['sem FK de ambiente',c=>{c.tabelas['public.usuario'].constraints[1].validada=false;},'VINCULO_USUARIO_AMBIENTE'],
  ['email sem unicidade',c=>{c.tabelas['public.usuario'].indices[0].unico=false;},'UNICIDADE_EMAIL'],
  ['fundador sem unicidade',c=>{c.tabelas['public.usuario'].indices.pop();},'UNICIDADE_FUNDADOR'],
  ['base versionamento ausente',c=>{c.permissoes.versionamento=false;},'BASE_MULTI_TENANT'],
  ['tabela da base ausente',c=>{c.permissoes.tabelas=10;},'BASE_MULTI_TENANT'],
];
for(const [nome,alterar,codigo] of casos) test(nome+': nenhuma chamada a listen',async t=>{
  const catalogo=fixture();alterar(catalogo);const c=inicializador(t,catalogo);
  await assert.rejects(c.iniciar(),erro=>erro.codigoPreflight===codigo);
  assert.equal(c.eventos.includes('app'),false);assert.equal(c.eventos.some(e=>Array.isArray(e)),false);
  assert.equal(c.eventos.at(-1),'end');assert.ok(c.client.queries.some(q=>q.sql==='ROLLBACK'));
});
for(const campo of ['DB_NAME','DB_USER']) test(campo+' incorreto: sem driver ou porta',async t=>{
  const c=inicializador(t,fixture(),{[campo]:'postgres'});await assert.rejects(c.iniciar());assert.deepEqual(c.eventos,[]);
});
test('falha SQL é segura e não abre porta',async t=>{
  const c=inicializador(t);c.client.falhar('preflight:colunas');
  await assert.rejects(c.iniciar(),erro=>erro.codigoPreflight==='INICIALIZACAO_INDISPONIVEL' && erro.codigoEtapa==='PREFLIGHT_FALHOU' && !erro.message.includes('CREDENCIAL'));
  assert.equal(c.eventos.includes('app'),false);
});

test('falha HTTP distingue etapa e encerra pool sem divulgar excecao',async t=>{
  const c=inicializador(t);
  t.mock.method(c.app,'listen',()=>{throw Error('CREDENCIAL_SINTETICA_NAO_PUBLICAR');});
  await assert.rejects(c.iniciar(),e=>e.codigoEtapa==='INICIALIZACAO_HTTP_FALHOU' && !e.message.includes('CREDENCIAL'));
  assert.equal(c.eventos.at(-1),'end');
});
test('falha do COMMIT de preflight impede carregar app e abrir porta',async t=>{
  const c=inicializador(t);c.client.falhar('COMMIT');
  await assert.rejects(c.iniciar(),erro=>erro.codigoPreflight==='INICIALIZACAO_INDISPONIVEL');
  assert.equal(c.eventos.includes('app'),false);assert.equal(c.eventos.at(-1),'end');
});
test('inicialização válida chama apenas listen simulado depois do COMMIT e preserva ambiente',async t=>{
  const c=inicializador(t,fixture(),{NR33_BACKEND_PORT:'3000'});
  const antes={...process.env};
  const resultado=await c.iniciar();
  assert.deepEqual(c.eventos.slice(0,4),['pool','connect','app',['listen',3000,'127.0.0.1']]);
  assert.equal(c.client.queries.at(-1).sql,'COMMIT');assert.deepEqual(c.client.releases,[false]);
  assert.deepEqual({...process.env},antes);await resultado.encerrar();
});
test('preflight consulta só catálogos e não lê usuários ou grava registros',async()=>{
  const client=clientSimulado(fixture());await validarPreflight(client,validarAmbienteLocal(env));
  for(const {sql} of client.queries){assert.match(sql,/SELECT/);assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+(?:TABLE|public\.)/i);assert.doesNotMatch(sql,/FROM\s+(?:public\.)?(?:usuario|ambiente)\b/i);}
  const permissoes=client.queries.find(q=>q.sql.includes('preflight:permissoes')).sql;
  assert.ok(permissoes.includes("'SELECT') AS selecionar"));assert.ok(permissoes.includes("'INSERT') AS inserir"));assert.ok(permissoes.includes("'UPDATE') AS atualizar"));
});
