const { conferir: conferirCapacidadeSql } = require('./helpers/rbacSqlSimulado.cjs');
const politicaRbac723 = require('../src/utils/permissoes');
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const repoPath = require.resolve('../src/repositories/sincronizacaoMultiTenantRepository');
const servicePath = require.resolve('../src/services/sincronizacaoMultiTenantService');
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OP = '11111111-1111-4111-8111-111111111111', REG = '22222222-2222-4222-8222-222222222222';
const especificacoes = {
  CAMPANHA: ['campanha', 'id_campanha', 'nome_campanha'], LOCAL: ['local', 'id_local', 'nome_local'],
  CHECKLIST_NR33: ['checklist_nr33', 'id_checklist', 'acesso_controlado'], DADOS_TECNICOS: ['dados_tecnicos', 'id_dados', 'oxigenio'], EVIDENCIA: ['evidencia', 'id_evidencia', 'descricao']
};
const clone = x => structuredClone(x);
const rows = r => ({ rows: r, rowCount: r.length });
const tecnico = () => Object.assign(new Error('SQL_TOKEN_SENHA_CAMINHO_PRIVADO'), { code: 'XX000' });
function preparar(t) {
  const estado = { usuarios: new Map(), ambientes: new Map([[A,true],[B,true]]), tabelas: {}, versoes: new Map(), sync: new Map(),
    consultas: [], escritas: [], eventos: [], liberacoes: [], desconhecidas: [], erro: null, hook: null, conflitosInsercao: null };
  for (const [ambiente, base] of [[A,10],[B,20]]) {
    for (const [n,perfil] of [[1,'ADMINISTRADOR'],[2,'ENGENHEIRO_SEGURANCA'],[3,'ENGENHEIRO_SEGURANCA']]) estado.usuarios.set(base+n,{ id_usuario:base+n,id_ambiente:ambiente,perfil_acesso:perfil,ativo:true });
    for (const [entidade,[tabela,chave,campo]] of Object.entries(especificacoes)) {
      estado.tabelas[tabela] ??= new Map();
      const r = { [chave]:base, [campo]: entidade === 'DADOS_TECNICOS' ? 19 : entidade === 'CHECKLIST_NR33' ? 'NAO' : `ORIGINAL_${base}`, status: entidade === 'CAMPANHA' ? 'EM ANDAMENTO' : entidade === 'LOCAL' ? 'ATIVO' : 'PENDENTE' };
      if (entidade === 'CAMPANHA') Object.assign(r,{id_usuario:base+2,id_ambiente:ambiente,empresa:`EMPRESA_${base}`});
      else if (entidade === 'LOCAL') Object.assign(r,{id_campanha:base,latitude:4,longitude:5});
      else Object.assign(r,{id_local:base,id_usuario:base+3});
      estado.tabelas[tabela].set(base,r); estado.versoes.set(`${ambiente}:${entidade}:${base}`,{id_ambiente:ambiente,entidade,id_entidade:base,versao:5,excluido:false});
    }
    estado.sync.set(base,{id_sincronizacao:base,id_usuario:base+2,id_ambiente:ambiente,entidade:'LOCAL',id_entidade:base,
      operacao:'ATUALIZAR',versao_cliente:5,versao_servidor:5,status:'PENDENTE',dados_cliente:{nome_local:`NOVO_${base}`},dados_servidor:null,
      id_operacao_cliente:null,id_registro_cliente:null});
  }
  let pendente, savepoint, aberta = false;
  // Mudança externa confirmada ANTES de bloquear a campanha precisa aparecer
  // na próxima consulta READ COMMITTED. Não simula revogação atravessando lock.
  estado.revogarCampanha = (campanha, responsavel) => {
    estado.tabelas.campanha.get(campanha).id_usuario = responsavel;
    if (pendente) pendente.tabelas.campanha.get(campanha).id_usuario = responsavel;
  };
  const atual = () => pendente || estado;
  const u = { id_usuario:11, id_ambiente:A, perfil_acesso:'FORJADO_NAO_USADO' };
  function autorizado(env,uid,e,valor) {
    const usuario = estado.usuarios.get(uid), [tabela,chave] = especificacoes[e], alvo = atual().tabelas[tabela].get(Number(valor));
    const local = e === 'LOCAL' ? alvo : e === 'CAMPANHA' ? null : atual().tabelas.local.get(alvo?.id_local);
    const c = e === 'CAMPANHA' ? alvo : atual().tabelas.campanha.get(local?.id_campanha);
    return usuario?.ativo && estado.ambientes.get(env) && usuario.id_ambiente === env && c?.id_ambiente === env &&
      ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR','SUPERVISOR','AUDITOR','VISUALIZADOR'].includes(usuario.perfil_acesso) ? { ...alvo, _campanha:c.id_campanha, _local:local?.id_local ?? null } : null;
  }
  function syncPermitida(s,env,uid,visivel) {
    const usuario = estado.usuarios.get(uid);
    if (!s || !usuario?.ativo || !estado.ambientes.get(env) || usuario.id_ambiente !== env || s.id_ambiente !== env ||
      !['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR'].includes(usuario.perfil_acesso) || !(usuario.perfil_acesso === 'ADMINISTRADOR' || s.id_usuario === uid)) return false;
    if (!visivel || s.operacao === 'CRIAR' && s.id_entidade == null) return true;
    return !!autorizado(env,uid,s.entidade,s.id_entidade) || s.operacao === 'EXCLUIR' && usuario.perfil_acesso === 'ADMINISTRADOR' && atual().versoes.get(`${env}:${s.entidade}:${s.id_entidade}`)?.excluido;
  }
  function conferirSync(sql,params) {
    assert.match(sql,/s\.id_ambiente = \$1/); assert.match(sql,/solicitante\.id_usuario = \$2/);
    assert.match(sql,/solicitante\.ativo = TRUE AND a\.ativo = TRUE/);
    assert.match(sql,/solicitante\.perfil_acesso = 'ADMINISTRADOR' OR s\.id_usuario = solicitante\.id_usuario/);
    assert.equal(typeof params[0],'string'); assert.ok(Number.isSafeInteger(params[1]));
  }
  function conferirEntidade(sql,params,e) {
    assert.match(sql,/id_ambiente = \$1/); assert.match(sql,/solicitante\.id_usuario = \$2/);
    assert.match(sql,/solicitante\.ativo = TRUE AND a\.ativo = TRUE/);
    conferirCapacidadeSql(sql, 'solicitante');
    if (!['CAMPANHA','LOCAL'].includes(e)) assert.match(sql,/JOIN local l ON l\.id_local = e\.id_local JOIN campanha c ON c\.id_campanha = l\.id_campanha/);
    if (e === 'LOCAL') assert.match(sql,/JOIN campanha c ON c\.id_campanha = e\.id_campanha/);
    assert.equal(typeof params[0],'string'); assert.ok(Number.isSafeInteger(params[1]));
  }
  async function query(texto, params = []) {
    const sql = texto.replace(/\s+/g,' ').trim(); estado.consultas.push({sql,params:clone(params)});
    if (estado.hook) estado.hook(sql,params);
    if (estado.erro?.prefixo && sql.startsWith(estado.erro.prefixo)) throw estado.erro.erro;
    if (sql === 'BEGIN ISOLATION LEVEL READ COMMITTED') { assert.equal(aberta,false); aberta=true; pendente=clone({tabelas:estado.tabelas,versoes:estado.versoes,sync:estado.sync}); estado.eventos.push('BEGIN'); return rows([]); }
    if (sql === 'COMMIT') { assert.equal(aberta,true); estado.tabelas=pendente.tabelas; estado.versoes=pendente.versoes; estado.sync=pendente.sync; pendente=null; aberta=false; estado.eventos.push('COMMIT'); if (estado.falhaAposCommit) { estado.falhaAposCommit=false; throw tecnico(); } return rows([]); }
    if (sql === 'ROLLBACK') { pendente=null; aberta=false; estado.eventos.push('ROLLBACK'); if (estado.rollbackFalho) throw tecnico(); return rows([]); }
    if (sql === 'SAVEPOINT registrar_sync') { savepoint=clone(pendente); return rows([]); }
    if (sql === 'RELEASE SAVEPOINT registrar_sync') return rows([]);
    if (sql === 'ROLLBACK TO SAVEPOINT registrar_sync') { pendente=savepoint; if (estado.colisaoPersistida) pendente.sync.set(99,clone(estado.colisaoPersistida)); return rows([]); }
    if (sql.startsWith('SELECT u.id_usuario, u.perfil_acesso FROM ambiente a')) {
      assert.ok(aberta); assert.deepEqual(params,[u.id_ambiente,u.id_usuario]); assert.match(sql,/FOR SHARE OF (?:a|u)$/);
      const usuario=estado.usuarios.get(params[1]); return rows(usuario?.ativo && estado.ambientes.get(params[0]) && usuario.id_ambiente === params[0] ? [clone(usuario)] : []);
    }
    if (sql.startsWith('SELECT e.*,')) {
      assert.ok(aberta); const tabela=sql.match(/FROM (\w+) e/)[1], e=Object.keys(especificacoes).find(e => especificacoes[e][0] === tabela);
      conferirEntidade(sql,params,e); assert.match(sql,/FOR UPDATE OF (?:c|l|e)$/);
      const alvo=autorizado(params[0],params[1],e,params[2]);
      if (alvo && params.length > 3 && (alvo._campanha !== params[3] || params.length > 4 && alvo._local !== params[4])) return rows([]);
      return rows(alvo ? [alvo] : []);
    }
    if (sql.startsWith('SELECT v.* FROM versao_entidade v')) {
      assert.match(sql,/v\.id_ambiente = \$1 AND v\.entidade = \$2 AND v\.id_entidade = \$3/);
      const v=atual().versoes.get(`${params[0]}:${params[1]}:${params[2]}`); return rows(v ? [clone(v)] : []);
    }
    if (sql.startsWith('SELECT s.id_entidade, s.status FROM sincronizacao s')) {
      assert.match(sql,/s\.id_ambiente = \$1 AND s\.id_usuario = \$2/); assert.match(sql,/FOR SHARE OF s$/);
      return rows([...atual().sync.values()].filter(s=>s.id_ambiente===params[0] && s.id_usuario===params[1] && s.entidade===params[2] && s.operacao==='CRIAR' && s.id_registro_cliente===params[3] && ['PENDENTE','SINCRONIZADO'].includes(s.status)).map(s=>({id_entidade:s.id_entidade,status:s.status})));
    }
    if (sql.startsWith('SELECT s.* FROM sincronizacao s WHERE s.id_ambiente = $1 AND s.id_usuario = $2')) {
      assert.match(sql,/s\.id_operacao_cliente = \$3/); assert.match(sql,/s\.id_registro_cliente = \$5/);
      return rows([...atual().sync.values()].filter(s=>s.id_ambiente===params[0] && s.id_usuario===params[1] && (params[2] != null && s.id_operacao_cliente===params[2] || params[4]!=null && s.entidade===params[3] && s.operacao==='CRIAR' && s.id_registro_cliente===params[4])).map(clone));
    }
    if (sql.startsWith('SELECT s.* FROM sincronizacao s')) {
      conferirSync(sql,params); const bloquear=sql.includes('FOR UPDATE OF s'); if (bloquear) assert.ok(aberta);
      if (!bloquear) for (const [e,[tabela,chave]] of Object.entries(especificacoes)) {
        assert.ok(sql.includes(`s.entidade = '${e}' AND EXISTS (SELECT 1 FROM ${tabela} e`)); assert.ok(sql.includes(`e.${chave} = s.id_entidade`));
      }
      let lista=[...atual().sync.values()].filter(s=>syncPermitida(s,params[0],params[1],!bloquear));
      if (sql.includes('s.id_sincronizacao = $3')) lista=lista.filter(s=>s.id_sincronizacao===params[2]);
      else { let i=2; for (const campo of ['status','entidade','id_entidade']) if (sql.includes(`AND s.${campo} = $${i+1}`)) { const valor=params[i++]; lista=lista.filter(s=>s[campo]===valor); } }
      return rows(lista.map(clone));
    }
    if (sql.startsWith('INSERT INTO sincronizacao')) {
      assert.ok(aberta); assert.match(sql,/FROM usuario u JOIN ambiente a/); assert.match(sql,/u\.id_ambiente = \$1/); assert.match(sql,/u\.ativo = TRUE AND a\.ativo = TRUE/);
      estado.escritas.push('INSERT_SYNC');
      if (estado.conflitosInsercao) { const falha=estado.conflitosInsercao; estado.conflitosInsercao=null; throw falha; }
      const repetida=[...atual().sync.values()].some(s=>s.id_ambiente===params[0] && (params[4]!=null && s.id_operacao_cliente===params[4] || params[5]!=null && s.entidade===params[2] && s.operacao==='CRIAR' && s.id_registro_cliente===params[5]));
      if (repetida) throw Object.assign(tecnico(),{code:'23505',constraint:'uq_sincronizacao_operacao_cliente'});
      const s={id_sincronizacao:Math.max(0,...atual().sync.keys())+1,id_ambiente:params[0],id_usuario:params[1],entidade:params[2],id_entidade:params[3],id_operacao_cliente:params[4],id_registro_cliente:params[5],operacao:params[6],versao_cliente:params[7],versao_servidor:params[8],status:params[9],dados_cliente:JSON.parse(params[10]),dados_servidor:params[11]==null?null:JSON.parse(params[11]),mensagem_erro:params[12]};
      atual().sync.set(s.id_sincronizacao,s); return rows([clone(s)]);
    }
    if (sql.startsWith('UPDATE sincronizacao s')) {
      conferirSync(sql,params); assert.ok(aberta); const s=atual().sync.get(params[2]); estado.escritas.push('UPDATE_SYNC');
      if (estado.finalizacaoVazia) return rows([]);
      if (!syncPermitida(s,params[0],params[1],false) || params.length===10 && s.status!==params[9]) return rows([]);
      if (sql.includes('status = COALESCE($4')) Object.assign(s,{status:params[3]??s.status,mensagem_erro:params[4]});
      else Object.assign(s,{status:params[3],id_entidade:params[4]??s.id_entidade,versao_servidor:params[5],dados_servidor:params[6]==null?null:JSON.parse(params[6]),mensagem_erro:params[7],resolucao:params[8]});
      return rows([clone(s)]);
    }
    if (sql.startsWith('DELETE FROM sincronizacao s')) {
      conferirSync(sql,params); assert.ok(aberta); const s=atual().sync.get(params[2]); if (!syncPermitida(s,params[0],params[1],false)) return rows([]);
      estado.escritas.push('DELETE_SYNC'); atual().sync.delete(params[2]); return rows([clone(s)]);
    }
    if (sql.startsWith('SELECT id_usuario FROM usuario WHERE')) {
      assert.ok(aberta); assert.match(sql,/id_ambiente = \$2 AND ativo = TRUE FOR SHARE$/);
      const autor=estado.usuarios.get(params[0]); return rows(autor?.ativo && autor.id_ambiente===params[1] ? [clone(autor)] : []);
    }
    if (/^(?:UPDATE|DELETE FROM) (campanha|local|checklist_nr33|dados_tecnicos) alvo/.test(sql)) {
      const tabela=sql.match(/^(?:UPDATE|DELETE FROM) (\w+) alvo/)[1], e=Object.keys(especificacoes).find(e=>especificacoes[e][0]===tabela), [,,campo]=especificacoes[e];
      conferirEntidade(sql,params,e); assert.ok(aberta); estado.escritas.push('ENTIDADE'); const anterior=autorizado(params[0],params[1],e,params[2]); if (!anterior) return rows([]);
      const r=atual().tabelas[tabela].get(params[2]);
      if (sql.startsWith('DELETE')) atual().tabelas[tabela].delete(params[2]);
      else {
        const sets=sql.match(/ SET (.+), data_atualizacao/)[1].split(', ');
        for (const set of sets) { const [,nome,n]=set.match(/^(\w+) = \$(\d+)$/); assert.ok(!['id_ambiente','id_local','id_usuario','id_campanha'].includes(nome)); r[nome]=params[Number(n)-1]; }
      }
      const v=atual().versoes.get(`${params[0]}:${e}:${params[2]}`); v.versao++; v.excluido=sql.startsWith('DELETE'); return rows([clone(r)]);
    }
    if (/^INSERT INTO (campanha|local|checklist_nr33|dados_tecnicos) /.test(sql)) {
      const [,tabela,colunas,projecoes]=sql.match(/^INSERT INTO (\w+) \(([^)]+)\) SELECT (.+?) FROM /), e=Object.keys(especificacoes).find(e=>especificacoes[e][0]===tabela), chave=especificacoes[e][1];
      assert.ok(aberta); estado.escritas.push('ENTIDADE'); if (e !== 'CAMPANHA') conferirEntidade(sql,params,e==='LOCAL'?'CAMPANHA':'LOCAL');
      else assert.match(sql,/e\.id_usuario = \$2 AND e\.id_ambiente = \$1 AND e\.ativo = TRUE AND a\.ativo = TRUE/);
      const r=Object.fromEntries(colunas.split(', ').map((c,i)=>[c,params[Number(projecoes.split(', ')[i].slice(1))-1]]));
      if (e !== 'CAMPANHA') assert.ok(autorizado(params[0],params[1],e==='LOCAL'?'CAMPANHA':'LOCAL',params[2]));
      r[chave]=Math.max(100,...atual().tabelas[tabela].keys())+1; atual().tabelas[tabela].set(r[chave],r);
      atual().versoes.set(`${params[0]}:${e}:${r[chave]}`,{id_ambiente:params[0],entidade:e,id_entidade:r[chave],versao:1,excluido:false}); return rows([clone(r)]);
    }
    estado.desconhecidas.push(sql); throw new Error('SQL DESCONHECIDO: ' + sql);
  }
  const client={query, release(erro) { estado.liberacoes.push(erro); estado.eventos.push('RELEASE'); }}, pool={query,async connect() { if (estado.connectFalho) throw estado.connectFalho; return client; }};
  const load=Module._load, cache=new Map([repoPath,servicePath].map(p=>[p,require.cache[p]])); let repo,service;
  try {
    for (const p of cache.keys()) delete require.cache[p];
    Module._load=function(r,parent,...args) {
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (r === '../utils/permissoes') return politicaRbac723;
      if (parent?.filename===repoPath) { if (r==='../config/database') return pool; throw new Error('Dependência real proibida: '+r); }
      if (parent?.filename===servicePath) { if (r==='../repositories/sincronizacaoMultiTenantRepository') return repo; throw new Error('Dependência real proibida: '+r); }
      return load.call(this,r,parent,...args);
    };
    repo=require(repoPath); service=require(servicePath);
  } finally { Module._load=load; for (const [p,v] of cache) { if (v) require.cache[p]=v; else delete require.cache[p]; } }
  t.after(()=>assert.deepEqual(estado.desconhecidas,[]));
  function dados(e='LOCAL',operacao='ATUALIZAR',alvo=10) {
    const valor=e==='DADOS_TECNICOS'?0:e==='CHECKLIST_NR33'?'SIM':'ALTERADO';
    return {entidade:e,operacao,id_entidade:alvo,versao_cliente:5,id_operacao_cliente:OP,id_registro_cliente:operacao==='CRIAR'?REG:null,dados_cliente:{[especificacoes[e][2]]:valor}};
  }
  return {estado,u,repo,service,dados};
}

test('regressao 42P08: finalizacao usa varchar(20) consistente e confirma escrita autorizada', async t => {
  const s=preparar(t);
  const r=await s.service.processarSincronizacao(10,s.u);
  assert.equal(r.status,'SINCRONIZADO');
  const q=s.estado.consultas.find(q=>q.sql.includes('data_sincronizacao = CASE'));
  assert.ok(q);
  assert.match(q.sql,/SET status = \$4::varchar\(20\)/);
  assert.match(q.sql,/CASE WHEN \$4::varchar\(20\) = 'SINCRONIZADO'/);
  assert.equal(q.params[3],'SINCRONIZADO');
  assert.equal(q.params[0],s.u.id_ambiente);
  assert.equal(q.params[1],s.u.id_usuario);
  assert.ok(s.estado.eventos.includes('COMMIT'));
});

for (const e of Object.keys(especificacoes)) for (const ambiente of [A,B]) for (const papel of ['admin','responsavel','naoResponsavel','externo']) test(`${e}: registro contextual ${ambiente} ${papel}`, async t=>{
  const s=preparar(t), base=ambiente===A?10:20; s.u.id_ambiente=ambiente; s.u.id_usuario=base+(papel==='admin'?1:papel==='naoResponsavel'?3:2);
  const alvo=papel==='externo'?(base===10?20:10):base;
  if (papel === 'externo') {
    await assert.rejects(s.service.criarSincronizacao(s.dados(e,'ATUALIZAR',alvo),s.u),{statusCode:404}); assert.deepEqual(s.estado.escritas,[]);
  } else {
    const r=await s.service.criarSincronizacao(s.dados(e,'ATUALIZAR',alvo),s.u); assert.equal(r.id_ambiente,ambiente); assert.equal(r.id_usuario,s.u.id_usuario); assert.equal(r.status,'PENDENTE');
  }
  assert.equal(s.estado.eventos.at(-1),'RELEASE');
});
for (const e of ['CAMPANHA','LOCAL','CHECKLIST_NR33','DADOS_TECNICOS']) for (const op of ['ATUALIZAR','EXCLUIR']) for (const c of ['igual','divergente','externo','revogado']) test(`${e} ${op}: processamento ${c}`,async t=>{
  const s=preparar(t), d=s.dados(e,op,c==='externo'?20:10); Object.assign(s.estado.sync.get(10),d,{id_operacao_cliente:null});
  if (c==='divergente') s.estado.versoes.get(`${A}:${e}:10`).versao=6;
  if (c==='revogado') { s.u.id_usuario=12; s.estado.usuarios.get(12).perfil_acesso='AUDITOR'; }
  const anterior=clone(s.estado.tabelas[especificacoes[e][0]].get(10));
  if (['externo','revogado'].includes(c)) { await assert.rejects(s.service.processarSincronizacao(10,s.u),{statusCode:c==='revogado'?403:404}); assert.deepEqual(s.estado.escritas,[]); }
  else {
    const r=await s.service.processarSincronizacao(10,s.u); assert.equal(r.status,c==='divergente'?'CONFLITO':'SINCRONIZADO');
    assert.equal(s.estado.escritas.filter(x=>x==='ENTIDADE').length,c==='divergente'?0:1);
    if (c==='divergente') assert.deepEqual(s.estado.tabelas[especificacoes[e][0]].get(10),anterior);
    else if(op==='EXCLUIR') assert.equal(s.estado.tabelas[especificacoes[e][0]].has(10),false);
    else assert.equal(s.estado.tabelas[especificacoes[e][0]].get(10)[especificacoes[e][2]],d.dados_cliente[especificacoes[e][2]]);
  }
});
for (const condicao of ['usuario','ambiente','perfil','identidadeAmbiente']) test('revalidação transacional '+condicao,async t=>{
  const s=preparar(t);
  if(condicao==='usuario')s.estado.usuarios.get(11).ativo=false;
  if(condicao==='ambiente')s.estado.ambientes.set(A,false);
  if(condicao==='perfil')s.estado.usuarios.get(11).perfil_acesso='INEXISTENTE';
  if(condicao==='identidadeAmbiente')s.u.id_ambiente=B;
  await assert.rejects(s.service.processarSincronizacao(10,s.u),{statusCode:condicao==='perfil'?403:401}); assert.deepEqual(s.estado.escritas,[]);
});
for (const filtros of ['listar','pendentes','conflitos','entidade']) for (const ambiente of [A,B]) test(`leitura ${filtros} somente ${ambiente}`,async t=>{
  const s=preparar(t), base=ambiente===A?10:20; s.u.id_usuario=base+1; s.u.id_ambiente=ambiente;
  if(filtros==='conflitos')s.estado.sync.get(base).status='CONFLITO';
  const r=await ({listar:()=>s.service.listarSincronizacoes(s.u),pendentes:()=>s.service.buscarPendentes(s.u),conflitos:()=>s.service.buscarConflitos(s.u),entidade:()=>s.service.buscarPorEntidade('LOCAL',base,s.u)})[filtros]();
  assert.deepEqual(r.map(x=>x.id_sincronizacao),[base]);
});
for (const alvo of [20,999]) test('busca externa/inexistente indistinguível '+alvo,async t=>{
  const s=preparar(t); await assert.rejects(s.service.buscarSincronizacaoPorId(alvo,s.u),e=>e.statusCode===404&&e.message==='Registro de sincronização ou entidade não encontrado.');
});
test('snapshot não é exposto após revogação da capacidade offline',async t=>{
  const s=preparar(t); s.u.id_usuario=12; s.estado.usuarios.get(12).perfil_acesso='AUDITOR';
  s.estado.sync.get(10).dados_servidor={segredo:'NAO_EXIBIR'};
  assert.deepEqual(await s.service.listarSincronizacoes(s.u),[]); await assert.rejects(s.service.buscarSincronizacaoPorId(10,s.u),{statusCode:404});
});
for (const variar of ['igual','conteudo','entidade','versao','local','usuario']) test('chave idempotente '+variar,async t=>{
  const s=preparar(t), d=s.dados(); s.u.id_usuario=12;
  const primeiro=await s.service.criarSincronizacao(d,s.u); const alterado=clone(d);
  if(variar==='conteudo')alterado.dados_cliente.nome_local='DIFERENTE';
  if(variar==='entidade')alterado.entidade='CAMPANHA';
  if(variar==='versao')alterado.versao_cliente=4;
  if(variar==='local') { s.estado.tabelas.local.set(30,{id_local:30,id_campanha:10}); s.estado.versoes.set(`${A}:LOCAL:30`,{versao:5}); alterado.id_entidade=30; }
  if(variar==='usuario')s.u.id_usuario=11;
  if(variar==='igual') { const r=await s.service.criarSincronizacao(alterado,s.u); assert.deepEqual(r,primeiro); assert.equal(s.estado.escritas.filter(x=>x==='INSERT_SYNC').length,1); }
  else await assert.rejects(s.service.criarSincronizacao(alterado,s.u),e=>e.statusCode===409&&!e.message.includes('SQL_TOKEN'));
});
test('mesma chave em ambientes diferentes não recupera a operação externa',async t=>{
  const s=preparar(t); const a=await s.service.criarSincronizacao(s.dados(),s.u);
  s.u.id_usuario=21;s.u.id_ambiente=B;const b=await s.service.criarSincronizacao(s.dados('LOCAL','ATUALIZAR',20),s.u);
  assert.notEqual(a.id_sincronizacao,b.id_sincronizacao);assert.equal(b.id_ambiente,B);
});
test('payload equivalente com ordem de propriedades diferente é repetição válida',async t=>{
  const s=preparar(t),d=s.dados();d.dados_cliente={nome_local:'Nome',latitude:0,longitude:0};
  const primeiro=await s.service.criarSincronizacao(d,s.u); d.dados_cliente={longitude:0,nome_local:'Nome',latitude:0};
  assert.deepEqual(await s.service.criarSincronizacao(d,s.u),primeiro);
});
for(const constraint of ['uq_sincronizacao_operacao_cliente','uq_sincronizacao_registro_cliente_criar','outra_constraint'])test('colisão 23505 '+constraint,async t=>{
  const s=preparar(t), d=s.dados(), falha=Object.assign(tecnico(),{code:'23505',constraint});s.estado.conflitosInsercao=falha;
  await assert.rejects(s.service.criarSincronizacao(d,s.u),e=>constraint==='outra_constraint'?e===falha:e.statusCode===409);
  assert.ok(s.estado.eventos.includes('ROLLBACK'));assert.equal(s.estado.sync.size,2);
});
test('corrida de INSERT recupera somente mesma operação autorizada após savepoint',async t=>{
  const s=preparar(t),d=s.dados();s.estado.colisaoPersistida={...clone(d),id_sincronizacao:99,id_ambiente:A,id_usuario:11,status:'PENDENTE'};
  s.estado.conflitosInsercao={code:'23505',constraint:'uq_sincronizacao_operacao_cliente'};
  const r=await s.service.criarSincronizacao(d,s.u); assert.equal(r.id_sincronizacao,99);
  assert.ok(s.estado.consultas.some(q=>q.sql==='ROLLBACK TO SAVEPOINT registrar_sync'));
});
for(const [campo,valor]of [['status','SINCRONIZADO'],['status','INVALIDO']])test('status controlado '+valor,async t=>{
  const s=preparar(t);await assert.rejects(s.service.atualizarStatus(10,{[campo]:valor},s.u),{statusCode:valor==='SINCRONIZADO'?409:400});assert.deepEqual(s.estado.escritas,[]);
});
test('status não aceita versão/snapshot/data de aplicação do cliente',async t=>{
  const s=preparar(t);const r=await s.service.atualizarStatus(10,{status:'ERRO',versao_servidor:99,dados_servidor:{segredo:'forjado'},data_sincronizacao:'forjada'},s.u);
  assert.equal(r.status,'ERRO');assert.equal(r.versao_servidor,5);assert.equal(r.dados_servidor,null);assert.equal(r.data_sincronizacao,undefined);
});
for(const acao of ['excluir','reabrir'])test('retém comprovante aplicado: '+acao,async t=>{
  const s=preparar(t);s.estado.sync.get(10).status='SINCRONIZADO';
  await assert.rejects(acao==='excluir'?s.service.excluirSincronizacao(10,s.u):s.service.atualizarStatus(10,{status:'PENDENTE'},s.u),{statusCode:409});assert.deepEqual(s.estado.escritas,[]);
});
for(const resolucao of ['CLIENTE','MESCLADO','SERVIDOR'])for(const mudou of [false,true])test(`resolução ${resolucao} mudou=${mudou}`,async t=>{
  const s=preparar(t);s.estado.sync.get(10).status='CONFLITO';if(mudou)s.estado.versoes.get(`${A}:LOCAL:10`).versao=6;
  if(mudou&&resolucao!=='SERVIDOR'){await assert.rejects(s.service.resolverConflito(10,{resolucao,dados_resolvidos:{nome_local:'Mesclado'}},s.u),{statusCode:409});assert.deepEqual(s.estado.escritas,[]);}
  else {const r=await s.service.resolverConflito(10,{resolucao,dados_resolvidos:{nome_local:'Mesclado'}},s.u);assert.equal(r.status,'SINCRONIZADO');assert.equal(r.resolucao,resolucao);assert.equal(s.estado.escritas.filter(x=>x==='ENTIDADE').length,resolucao==='SERVIDOR'?0:1);}
});
for(const prefixo of ['BEGIN','SELECT e.*','UPDATE local','UPDATE sincronizacao','COMMIT'])test('falha transacional em '+prefixo,async t=>{
  const s=preparar(t),falha=tecnico(),anterior=clone(s.estado.tabelas.local.get(10));s.estado.erro={prefixo,erro:falha};
  await assert.rejects(s.service.processarSincronizacao(10,s.u),e=>e===falha);assert.deepEqual(s.estado.tabelas.local.get(10),anterior);assert.equal(s.estado.liberacoes.length,1);
  if(prefixo!=='BEGIN')assert.ok(s.estado.eventos.includes('ROLLBACK'));
});
test('rollback falho descarta cliente e preserva erro original',async t=>{
  const s=preparar(t),falha=tecnico();s.estado.erro={prefixo:'UPDATE local',erro:falha};s.estado.rollbackFalho=true;
  await assert.rejects(s.service.processarSincronizacao(10,s.u),e=>e===falha);assert.ok(s.estado.liberacoes[0] instanceof Error);assert.ok(!s.estado.eventos.includes('COMMIT'));
});
test('timeout após aplicação não duplica entidade no retry da mesma chave',async t=>{
  const s=preparar(t),d=s.dados();const r=await s.service.criarSincronizacao(d,s.u);await s.service.processarSincronizacao(r.id_sincronizacao,s.u);
  const repetida=await s.service.criarSincronizacao(d,s.u);assert.equal(repetida.status,'SINCRONIZADO');assert.equal(s.estado.escritas.filter(x=>x==='ENTIDADE').length,1);
  await assert.rejects(s.service.processarSincronizacao(r.id_sincronizacao,s.u),{statusCode:409});
});
test('identidade forjada no envelope não define autor/ambiente/perfil',async t=>{
  const s=preparar(t),d={...s.dados(),id_usuario:21,id_ambiente:B,perfil_acesso:'ADMINISTRADOR'};
  const r=await s.service.criarSincronizacao(d,s.u);assert.equal(r.id_usuario,11);assert.equal(r.id_ambiente,A);
});
for(const usuario of [null,{}, {id_usuario:0,id_ambiente:A},{id_usuario:true,id_ambiente:A},{id_usuario:11,id_ambiente:'invalido'}])test('identidade inválida '+JSON.stringify(usuario),async t=>{
  const s=preparar(t);await assert.rejects(async()=>s.service.criarSincronizacao(s.dados(),usuario),{statusCode:401});assert.deepEqual(s.estado.consultas,[]);
});
for(const valor of [0,-1,'abc',true,[],Number.MAX_SAFE_INTEGER+1])test('ID seguro '+JSON.stringify(valor),async t=>{
  const s=preparar(t);await assert.rejects(async()=>s.service.buscarSincronizacaoPorId(valor,s.u),{statusCode:400});assert.deepEqual(s.estado.consultas,[]);
});
test('GPS zero e campos omitidos são preservados na aplicação parcial',async t=>{
  const s=preparar(t);s.estado.sync.get(10).dados_cliente={latitude:0,id_campanha:20,id_usuario:21,id_ambiente:B,caminho_arquivo:'../../arquivo'};
  await s.service.processarSincronizacao(10,s.u);const r=s.estado.tabelas.local.get(10);assert.equal(r.latitude,0);assert.equal(r.longitude,5);assert.equal(r.id_campanha,10);assert.equal(r.caminho_arquivo,undefined);
});
test('EVIDENCIA enfileirada não finge aplicação ainda não implementada',async t=>{
  const s=preparar(t);s.estado.sync.get(10).entidade='EVIDENCIA';
  await assert.rejects(s.service.processarSincronizacao(10,s.u),{statusCode:400});assert.deepEqual(s.estado.escritas,[]);
});

function criacao(s,e) {
  const d=s.dados(e,'CRIAR');d.versao_cliente=1;
  if(e==='CAMPANHA')d.dados_cliente={nome_campanha:'NOVA',empresa:'EMPRESA',responsavel:'RESPONSAVEL',data_inicio:'2026-10-18',id_ambiente:B,id_usuario:21};
  if(e==='LOCAL')d.dados_cliente={nome_local:'NOVO',id_campanha:10,latitude:0,longitude:0,id_usuario:21};
  if(e==='CHECKLIST_NR33')d.dados_cliente={id_local:10,identificacao_espaco:'A',acesso_controlado:'SIM',ventilacao_adequada:'NAO',monitoramento_atmosferico:'SIM',procedimento_emergencia:'NAO',id_usuario:21};
  if(e==='DADOS_TECNICOS')d.dados_cliente={id_local:10,oxigenio:0,temperatura:0,id_usuario:21};
  return d;
}
for(const e of ['CAMPANHA','LOCAL','CHECKLIST_NR33','DADOS_TECNICOS'])for(const ator of [11,12])test(`criação ${e}: autor autenticado e vínculo no ambiente, executor=${ator}`,async t=>{
  const s=preparar(t);s.u.id_usuario=ator;const d=criacao(s,e),fila=await s.service.criarSincronizacao(d,s.u);
  assert.equal(fila.id_entidade,null,'ID fornecido pelo cliente não se torna ID oficial');assert.equal(fila.status,'PENDENTE');
  const r=await s.service.processarSincronizacao(fila.id_sincronizacao,s.u);assert.equal(r.status,'SINCRONIZADO');assert.equal(r.versao_servidor,1);
  const alvo=s.estado.tabelas[especificacoes[e][0]].get(r.id_entidade);assert.ok(alvo);
  if(e==='CAMPANHA'){assert.equal(alvo.id_ambiente,A);assert.equal(alvo.id_usuario,ator);}
  if(e==='LOCAL'){assert.equal(alvo.id_campanha,10);assert.equal(alvo.latitude,0);assert.equal(alvo.longitude,0);}
  if(e==='CHECKLIST_NR33'){assert.equal(alvo.criterio_a,'SIM');assert.equal(alvo.criterio_b,'NAO');assert.equal(alvo.criterio_c,'NAO');assert.equal(alvo.id_usuario,ator);}
  if(e==='DADOS_TECNICOS'){assert.equal(alvo.oxigenio,0);assert.equal(alvo.id_usuario,ator);}
  const repetida=await s.service.criarSincronizacao(d,s.u);assert.equal(repetida.id_entidade,r.id_entidade);assert.equal(s.estado.escritas.filter(x=>x==='ENTIDADE').length,1);
});
for(const e of ['LOCAL','CHECKLIST_NR33','DADOS_TECNICOS'])test(`criação ${e}: pai externo recusa antes de INSERT da fila`,async t=>{
  const s=preparar(t),d=criacao(s,e);d.dados_cliente[e==='LOCAL'?'id_campanha':'id_local']=20;
  await assert.rejects(s.service.criarSincronizacao(d,s.u),{statusCode:404});assert.deepEqual(s.estado.escritas,[]);
});
test('campanha -> local -> checklist: IDs temporários, ordem inversa e retry independente',async t=>{
  const s=preparar(t);s.u.id_usuario=12;
  const camp=criacao(s,'CAMPANHA'),c=await s.service.criarSincronizacao(camp,s.u);
  const loc=criacao(s,'LOCAL');loc.id_operacao_cliente='33333333-3333-4333-8333-333333333333';loc.id_registro_cliente='44444444-4444-4444-8444-444444444444';
  delete loc.dados_cliente.id_campanha;loc.dados_cliente.id_campanha_cliente=REG;
  const l=await s.service.criarSincronizacao(loc,s.u);
  const check=criacao(s,'CHECKLIST_NR33');check.id_operacao_cliente='55555555-5555-4555-8555-555555555555';check.id_registro_cliente='66666666-6666-4666-8666-666666666666';
  delete check.dados_cliente.id_local;check.dados_cliente.id_local_cliente=loc.id_registro_cliente;
  const ch=await s.service.criarSincronizacao(check,s.u);
  await assert.rejects(s.service.processarSincronizacao(ch.id_sincronizacao,s.u),{statusCode:409});
  await assert.rejects(s.service.processarSincronizacao(l.id_sincronizacao,s.u),{statusCode:409});
  assert.equal(s.estado.sync.get(ch.id_sincronizacao).status,'PENDENTE');assert.equal(s.estado.escritas.filter(x=>x==='ENTIDADE').length,0);
  const cAplicada=await s.service.processarSincronizacao(c.id_sincronizacao,s.u);
  const lAplicada=await s.service.processarSincronizacao(l.id_sincronizacao,s.u);
  const chAplicado=await s.service.processarSincronizacao(ch.id_sincronizacao,s.u);
  assert.equal(lAplicada.dados_servidor.id_campanha,cAplicada.id_entidade);assert.equal(chAplicado.dados_servidor.id_local,lAplicada.id_entidade);
  assert.equal(s.estado.escritas.filter(x=>x==='ENTIDADE').length,3);
});
for(const externo of ['ambiente','usuario'])test('mapeamento UUID não usa pai de outro '+externo,async t=>{
  const s=preparar(t),d=criacao(s,'LOCAL');delete d.dados_cliente.id_campanha;d.dados_cliente.id_campanha_cliente=REG;
  s.estado.sync.set(99,{id_sincronizacao:99,id_ambiente:externo==='ambiente'?B:A,id_usuario:externo==='ambiente'?21:12,entidade:'CAMPANHA',operacao:'CRIAR',status:'SINCRONIZADO',id_registro_cliente:REG,id_entidade:externo==='ambiente'?20:10});
  await assert.rejects(s.service.criarSincronizacao(d,s.u),{statusCode:409});assert.deepEqual(s.estado.escritas,[]);
});
test('capacidade revogada depois do enfileiramento impede criação dependente',async t=>{
  const s=preparar(t);s.u.id_usuario=12;const d=criacao(s,'LOCAL'),fila=await s.service.criarSincronizacao(d,s.u);
  s.estado.usuarios.get(12).perfil_acesso='AUDITOR';s.estado.escritas=[];
  await assert.rejects(s.service.processarSincronizacao(fila.id_sincronizacao,s.u),{statusCode:403});assert.deepEqual(s.estado.escritas,[]);
});
test('checklist antigo não sobrescreve critérios explicitamente enviados',async t=>{
  const s=preparar(t),d=criacao(s,'CHECKLIST_NR33');d.dados_cliente.criterio_b='SIM';
  const fila=await s.service.criarSincronizacao(d,s.u),r=await s.service.processarSincronizacao(fila.id_sincronizacao,s.u);
  assert.equal(r.dados_servidor.criterio_a,'SIM');assert.equal(r.dados_servidor.criterio_b,'SIM');assert.equal(r.dados_servidor.criterio_c,'NAO');
});
test('troca de responsável durante aquisição de locks preserva a autorização por ambiente',async t=>{
  const s=preparar(t);s.u.id_usuario=12;let mudou=false;
  s.estado.hook=sql=>{if(!mudou&&sql.startsWith('SELECT e.*')&&sql.endsWith('FOR UPDATE OF c')){mudou=true;s.estado.revogarCampanha(10,13);}};
  assert.equal((await s.service.processarSincronizacao(10,s.u)).status,'SINCRONIZADO');assert.equal(s.estado.escritas.filter(x=>x==='ENTIDADE').length,1);assert.ok(mudou);
});
test('bloqueios do contexto seguem ambiente -> usuário -> campanha -> local -> versão',async t=>{
  const s=preparar(t);await s.service.processarSincronizacao(10,s.u);
  const locks=s.estado.consultas.filter(q=>/FOR (?:SHARE|UPDATE)/.test(q.sql)).map(q=>q.sql.match(/FOR (?:SHARE|UPDATE) OF (\w+)$/)?.[1]);
  assert.deepEqual(locks.slice(0,6),['a','u','s','c','e','v']);
});
test('COMMIT aplicado com resposta perdida não permite duplicar no retry',async t=>{
  const s=preparar(t),d=criacao(s,'CAMPANHA');const fila=await s.service.criarSincronizacao(d,s.u);
  s.estado.falhaAposCommit=true;await assert.rejects(s.service.processarSincronizacao(fila.id_sincronizacao,s.u),e=>e.code==='XX000');
  assert.equal(s.estado.sync.get(fila.id_sincronizacao).status,'SINCRONIZADO');
  const r=await s.service.criarSincronizacao(d,s.u);assert.equal(r.status,'SINCRONIZADO');assert.equal(s.estado.escritas.filter(x=>x==='ENTIDADE').length,1);
});
test('falha em uma operação não marca outras operações da fila como concluídas',async t=>{
  const s=preparar(t),d=s.dados(),fila=await s.service.criarSincronizacao(d,s.u);s.estado.erro={prefixo:'UPDATE local',erro:tecnico()};
  await assert.rejects(s.service.processarSincronizacao(fila.id_sincronizacao,s.u));
  assert.equal(s.estado.sync.get(10).status,'PENDENTE');assert.equal(s.estado.sync.get(20).status,'PENDENTE');assert.equal(s.estado.sync.get(fila.id_sincronizacao).status,'PENDENTE');
});
test('dois dispositivos sobre mesma versão: segundo fica em conflito',async t=>{
  const s=preparar(t),primeiro=await s.service.criarSincronizacao(s.dados(),s.u),d=s.dados();d.id_operacao_cliente='33333333-3333-4333-8333-333333333333';
  const segundo=await s.service.criarSincronizacao(d,s.u);await s.service.processarSincronizacao(primeiro.id_sincronizacao,s.u);
  const r=await s.service.processarSincronizacao(segundo.id_sincronizacao,s.u);assert.equal(r.status,'CONFLITO');assert.equal(r.versao_servidor,6);assert.equal(s.estado.escritas.filter(x=>x==='ENTIDADE').length,1);
});
test('retry sem id_operacao_cliente usa UUID do registro somente para mesmo conteúdo',async t=>{
  const s=preparar(t),d=criacao(s,'CAMPANHA');delete d.id_operacao_cliente;
  const primeiro=await s.service.criarSincronizacao(d,s.u);assert.deepEqual(await s.service.criarSincronizacao(d,s.u),primeiro);
  d.dados_cliente.empresa='OUTRA';await assert.rejects(s.service.criarSincronizacao(d,s.u),{statusCode:409});
});
test('administrador processa dependência do autor original sem tomar sua campanha',async t=>{
  const s=preparar(t);s.u.id_usuario=12;
  const c=await s.service.criarSincronizacao(criacao(s,'CAMPANHA'),s.u),d=criacao(s,'LOCAL');
  d.id_operacao_cliente='33333333-3333-4333-8333-333333333333';d.id_registro_cliente='44444444-4444-4444-8444-444444444444';
  delete d.dados_cliente.id_campanha;d.dados_cliente.id_campanha_cliente=REG;
  const l=await s.service.criarSincronizacao(d,s.u);s.u.id_usuario=11;
  const camp=await s.service.processarSincronizacao(c.id_sincronizacao,s.u),loc=await s.service.processarSincronizacao(l.id_sincronizacao,s.u);
  assert.equal(camp.dados_servidor.id_usuario,12);assert.equal(loc.dados_servidor.id_campanha,camp.id_entidade);
  const mapa=s.estado.consultas.find(q=>q.sql.startsWith('SELECT s.id_entidade, s.status')&&q.params[1]===12);assert.ok(mapa);
});
test('finalização inesperadamente vazia reverte escrita da entidade e não declara sucesso',async t=>{
  const s=preparar(t),anterior=clone(s.estado.tabelas.local.get(10));s.estado.finalizacaoVazia=true;
  await assert.rejects(s.service.processarSincronizacao(10,s.u),{statusCode:500});assert.deepEqual(s.estado.tabelas.local.get(10),anterior);assert.equal(s.estado.sync.get(10).status,'PENDENTE');assert.ok(s.estado.eventos.includes('ROLLBACK'));
});
test('versão fora do INTEGER PostgreSQL é rejeitada antes de SQL',async t=>{
  const s=preparar(t),d=s.dados();d.versao_cliente=2147483648;
  await assert.rejects(s.service.criarSincronizacao(d,s.u),{statusCode:400});assert.deepEqual(s.estado.consultas,[]);
});
for(const resolucao of ['CLIENTE','MESCLADO','SERVIDOR'])test('revogação bloqueia resolução '+resolucao,async t=>{
  const s=preparar(t);s.u.id_usuario=12;s.estado.sync.get(10).status='CONFLITO';s.estado.usuarios.get(12).perfil_acesso='AUDITOR';
  await assert.rejects(s.service.resolverConflito(10,{resolucao,dados_resolvidos:{nome_local:'Nome'}},s.u),{statusCode:403});assert.deepEqual(s.estado.escritas,[]);
});
test('exclusão manual de registro pendente continua autorizada e contextual',async t=>{
  const s=preparar(t);const r=await s.service.excluirSincronizacao(10,s.u);assert.equal(r.id_sincronizacao,10);assert.equal(s.estado.sync.has(10),false);assert.equal(s.estado.sync.has(20),true);
});
test('exclusão já consumada: administrador confirma tombstone somente no ambiente',async t=>{
  const s=preparar(t);s.estado.sync.get(10).operacao='EXCLUIR';s.estado.tabelas.local.delete(10);s.estado.versoes.get(`${A}:LOCAL:10`).excluido=true;
  const r=await s.service.processarSincronizacao(10,s.u);assert.equal(r.status,'SINCRONIZADO');assert.equal(s.estado.escritas.filter(x=>x==='ENTIDADE').length,0);
});
test('tombstone sem ancestralidade não inventa responsabilidade de engenheiro',async t=>{
  const s=preparar(t);s.u.id_usuario=12;s.estado.sync.get(10).operacao='EXCLUIR';s.estado.tabelas.local.delete(10);s.estado.versoes.get(`${A}:LOCAL:10`).excluido=true;
  await assert.rejects(s.service.processarSincronizacao(10,s.u),{statusCode:404});assert.deepEqual(s.estado.escritas,[]);
});

for(const perfil of ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR','SUPERVISOR','AUDITOR','VISUALIZADOR']) for(const entidade of ['CAMPANHA','LOCAL','CHECKLIST_NR33','DADOS_TECNICOS']) test('RBAC offline '+perfil+' '+entidade,async t=>{
  const s=preparar(t);s.u.id_usuario=12;s.estado.usuarios.get(12).perfil_acesso=perfil;
  s.estado.tabelas.campanha.get(10).id_usuario=999;
  const d=s.dados(entidade);
  if(['SUPERVISOR','AUDITOR','VISUALIZADOR'].includes(perfil)) {
    await assert.rejects(s.service.criarSincronizacao(d,s.u),{statusCode:403});assert.deepEqual(s.estado.escritas,[]);
  } else {
    const fila=await s.service.criarSincronizacao(d,s.u);
    const r=await s.service.processarSincronizacao(fila.id_sincronizacao,s.u);
    assert.equal(r.status,'SINCRONIZADO');assert.equal(s.estado.escritas.filter(x=>x==='ENTIDADE').length,1);
  }
});
for(const perfil of ['SUPERVISOR','AUDITOR','VISUALIZADOR']) test('RBAC offline perfil revogado depois da fila: '+perfil,async t=>{
  const s=preparar(t);s.u.id_usuario=12;
  const fila=await s.service.criarSincronizacao(s.dados(),s.u);s.estado.escritas=[];
  s.estado.usuarios.get(12).perfil_acesso=perfil;
  await assert.rejects(s.service.processarSincronizacao(fila.id_sincronizacao,s.u),{statusCode:403});
  assert.deepEqual(s.estado.escritas,[]);assert.equal(s.estado.sync.get(fila.id_sincronizacao).status,'PENDENTE');
});

for(const perfil of ['TECNICO_SEGURANCA','COORDENADOR']) for(const entidade of ['CAMPANHA','LOCAL','CHECKLIST_NR33','DADOS_TECNICOS']) test('RBAC offline nao amplia exclusao destrutiva: '+perfil+' '+entidade,async t=>{
  const s=preparar(t);s.u.id_usuario=12;s.estado.usuarios.get(12).perfil_acesso=perfil;
  await assert.rejects(s.service.criarSincronizacao(s.dados(entidade,'EXCLUIR'),s.u),{statusCode:403});
  assert.deepEqual(s.estado.escritas,[]);assert.equal(s.estado.tabelas[especificacoes[entidade][0]].has(10),true);
});
