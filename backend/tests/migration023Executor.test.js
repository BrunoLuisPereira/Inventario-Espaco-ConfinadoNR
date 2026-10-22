const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {plano,validarFonte,executar}=require('../laboratorio/migrar-login-023.cjs');
const {receber}=require('../laboratorio/migration-023-canal.cjs');
const banco='inventario_nr33_multitenant_dev';
const opcoes={banco,executar:true,confirmacao:'APLICAR 023 '+banco};
const fonte=fs.readFileSync(require.resolve('../database/023_controle_tentativas_login.sql'),'utf8');
const env={NR33_MIGRACAO_023_USER:'nr33_migracao',NR33_MIGRACAO_023_PASSWORD:'credencial-sintetica-nao-real'};
test('canal privado compativel com executor real e driver simulado',async()=>{
  const s=simulador({identidade:{papel:'postgres',sessao:'postgres'},estado:{papel:'postgres'}});
  await receber(JSON.stringify({banco,operador:'postgres',senha:'sintetica',confirmacao:opcoes.confirmacao}),
    (op,deps)=>executar(op,{...s.deps,env:deps.env}));
  assert.equal(s.queries.at(-1),'COMMIT');
});
function simulador(override={}) {
  const queries=[],eventos=[];
  const identidade={banco,papel:env.NR33_MIGRACAO_023_USER,sessao:env.NR33_MIGRACAO_023_USER,versao:17,host:'127.0.0.1',porta:5432,...override.identidade};
  const estado={banco,papel:env.NR33_MIGRACAO_023_USER,versao:17,tabela_ausente:true,indice_ausente:true,uso:true,criar:true,papel_app:true,...override.estado};
  const permissoes={selecionar:true,inserir:true,atualizar:true,...override.permissoes};
  const client={async connect(){eventos.push('connect');},async end(){eventos.push('end');},async query(sql){
    queries.push(sql);
    if(override.falha && sql.includes(override.falha))throw Error('CREDENCIAL_SQL_SINTETICA_NAO_PUBLICAR');
    if(sql.includes('preflight:identidade')){
      assert.match(sql,/\bhost\(inet_server_addr\(\)\) AS host/);
      assert.doesNotMatch(sql,/inet_server_addr\(\)::text/);
      return {rows:[identidade]};
    }
    if(sql.includes('migration023:preflight'))return {rows:[estado]};
    if(sql.includes('migration023:privilegios'))return {rows:[permissoes]};
    return {rows:[]};
  }};
  const deps={env:{...env},lerFonte:()=>override.fonte??fonte,criarClient(config){
    eventos.push('driver');assert.equal(config.host,'127.0.0.1');assert.equal(config.database,banco);
    assert.equal(config.port,5432);assert.equal(config.ssl,false);return client;
  }};
  return {deps,queries,eventos};
}
test('plano puro não contém credenciais ou SQL de alteração',()=>{
  assert.deepEqual(plano().privilegios,['SELECT','INSERT','UPDATE']);
  assert.equal(plano().executado,false);assert.equal(plano().banco,banco);
  assert.ok(!JSON.stringify(plano()).includes(env.NR33_MIGRACAO_023_PASSWORD));
});
test('somente a 023 revisada é aceita, inclusive com CRLF',()=>{
  const corpo=validarFonte(fonte);assert.equal(validarFonte(fonte.replace(/\r?\n/g,'\r\n')),corpo);
  assert.match(corpo,/CREATE TABLE public.login_tentativa/);
  assert.doesNotMatch(corpo,/\bBEGIN;|\bCOMMIT;|\b(?:UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i);
});
for(const mudar of [o=>{o.banco='postgres';},o=>{o.banco=banco+' ';},o=>{o.executar=false;},o=>{o.confirmacao='sim';}]) {
  test('destino ou confirmação recusados antes do driver',async()=>{
    const s=simulador(),o={...opcoes};mudar(o);await assert.rejects(executar(o,s.deps));assert.deepEqual(s.eventos,[]);
  });
}
for(const [nome,valor] of [['NODE_OPTIONS','override'],['PGHOST','localhost'],['PGPASSWORD','sintetica'],['PGSERVICE','servico'],['DATABASE_URL','postgres://nao-usar']]) {
  test('override '+nome+' recusado antes de conectar',async()=>{
    const s=simulador();s.deps.env[nome]=valor;await assert.rejects(executar(opcoes,s.deps));assert.deepEqual(s.eventos,[]);
  });
}
for(const f of [fonte+'\nDELETE FROM public.usuario;',fonte.replace('<= 5','<= 6'),fonte.replace('COMMIT;','COMMIT;\nBEGIN;'), '']) {
  test('fonte divergente não chega ao driver: tamanho '+f.length,async()=>{
    const s=simulador({fonte:f});await assert.rejects(executar(opcoes,s.deps));assert.deepEqual(s.eventos,[]);
  });
}
for(const identidade of [{banco:'postgres'},{versao:18},{host:'192.0.2.1'},{host:'127.0.0.1/32'},{porta:55432},{papel:'outro'},{sessao:'outro'}]) {
  test('destino conectado divergente: '+Object.keys(identidade)[0],async()=>{
    const s=simulador({identidade});await assert.rejects(executar(opcoes,s.deps));
    assert.ok(s.queries.every(q=>!q.includes('CREATE TABLE')));assert.deepEqual(s.eventos,['driver','connect','end']);
  });
}
for(const estado of [{tabela_ausente:false},{indice_ausente:false},{uso:false},{criar:false},{papel_app:false},{banco:'postgres'}]) {
  test('preflight DDL recusa '+Object.keys(estado)[0]+' sem alterar estrutura',async()=>{
    const s=simulador({estado});await assert.rejects(executar(opcoes,s.deps));
    assert.ok(s.queries.includes('ROLLBACK'));assert.ok(!s.queries.some(q=>q.includes('CREATE TABLE')));
  });
}
test('execução simulada valida destino antes de DDL; uma transação inclui grants',async()=>{
  const s=simulador(),antes={...s.deps.env};
  assert.deepEqual(await executar(opcoes,s.deps),{banco,migration:'023',aplicada:true});
  const ddl=s.queries.findIndex(q=>q.includes('CREATE TABLE'));
  assert.ok(s.queries.findIndex(q=>q.includes('preflight:identidade'))<ddl);
  assert.ok(s.queries.findIndex(q=>q.includes('migration023:preflight'))<ddl);
  assert.equal(s.queries.filter(q=>q==='BEGIN').length,1);assert.equal(s.queries.at(-1),'COMMIT');
  assert.equal(s.queries[ddl+1],'GRANT SELECT, INSERT, UPDATE ON TABLE public.login_tentativa TO nr33_dev_app');
  assert.deepEqual(s.deps.env,antes);assert.deepEqual(s.eventos,['driver','connect','end']);
});
for(const falha of ['CREATE TABLE','GRANT SELECT','COMMIT'])test('falha em '+falha+': rollback, sem repetição ou operação destrutiva',async()=>{
  const s=simulador({falha});
  await assert.rejects(executar(opcoes,s.deps),e=>!e.message.includes('CREDENCIAL_SQL'));
  assert.equal(s.queries.filter(q=>q==='ROLLBACK').length,1);
  assert.ok(s.queries.every(q=>!/^\s*(?:DROP|TRUNCATE|DELETE|ALTER ROLE)\b/i.test(q)));
  assert.equal(s.eventos.filter(e=>e==='connect').length,1);assert.equal(s.eventos.at(-1),'end');
});
test('grant sem privilégio efetivo impede COMMIT',async()=>{
  const s=simulador({permissoes:{atualizar:false}});await assert.rejects(executar(opcoes,s.deps));
  assert.equal(s.queries.includes('COMMIT'),false);assert.equal(s.queries.at(-1),'ROLLBACK');
});
