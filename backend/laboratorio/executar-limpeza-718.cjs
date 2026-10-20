'use strict';
// Executa uma unica tentativa; qualquer divergencia aborta sem retry.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const BANCO = 'inventario_nr33_multitenant_dev';
const HASH = 'a869beca282e4878e1d9c0b882319e209441d0f517c2468c7b63f16c5dc8406e';
const tabelas = {
  ambiente: ['id_ambiente', 'SELECT id_ambiente,nome,ativo FROM public.ambiente ORDER BY id_ambiente'],
  usuario: ['id_usuario', 'SELECT id_usuario,LOWER(BTRIM(email)) AS email,id_ambiente,perfil_acesso,ativo FROM public.usuario ORDER BY id_usuario'],
  campanha: ['id_campanha', 'SELECT id_campanha,id_usuario,id_ambiente FROM public.campanha ORDER BY id_campanha'],
  local: ['id_local', 'SELECT l.id_local,l.id_campanha,c.id_ambiente FROM public.local l JOIN public.campanha c USING(id_campanha) ORDER BY l.id_local'],
  checklist_nr33: ['id_checklist', 'SELECT e.id_checklist,e.id_local,e.id_usuario,c.id_ambiente FROM public.checklist_nr33 e JOIN public.local l USING(id_local) JOIN public.campanha c USING(id_campanha) ORDER BY e.id_checklist'],
  dados_tecnicos: ['id_dados', 'SELECT e.id_dados,e.id_local,e.id_usuario,c.id_ambiente FROM public.dados_tecnicos e JOIN public.local l USING(id_local) JOIN public.campanha c USING(id_campanha) ORDER BY e.id_dados'],
  evidencia: ['id_evidencia', "SELECT e.id_evidencia,e.id_local,e.id_usuario,c.id_ambiente,(NULLIF(BTRIM(e.caminho_arquivo),'') IS NOT NULL) AS possui_arquivo FROM public.evidencia e JOIN public.local l USING(id_local) JOIN public.campanha c USING(id_campanha) ORDER BY e.id_evidencia"],
  relatorio: ['id_relatorio', "SELECT e.id_relatorio,e.id_local,e.id_usuario_responsavel,c.id_ambiente,(NULLIF(BTRIM(e.caminho_pdf),'') IS NOT NULL) AS possui_arquivo FROM public.relatorio e JOIN public.local l USING(id_local) JOIN public.campanha c USING(id_campanha) ORDER BY e.id_relatorio"],
  convite: ['id_convite', 'SELECT id_convite,id_ambiente,id_usuario_convite,LOWER(BTRIM(email)) AS email,(data_aceite IS NOT NULL) AS aceito FROM public.convite ORDER BY id_convite'],
  sincronizacao: ['id_sincronizacao', 'SELECT id_sincronizacao,id_ambiente,id_usuario,id_usuario_resolucao,entidade,id_entidade,status FROM public.sincronizacao ORDER BY id_sincronizacao'],
  versao_entidade: ['id_versao', 'SELECT id_versao,id_ambiente,entidade,id_entidade,versao,excluido FROM public.versao_entidade ORDER BY id_versao'],
};
const ordenar = xs => [...xs].sort();
async function verificarFKs(c) {
  const fks=(await c.query(`SELECT c.conname,a.relname AS origem,b.relname AS destino,
    array_agg(x.attname::text ORDER BY k.ord) AS cols_origem,array_agg(y.attname::text ORDER BY k.ord) AS cols_destino
    FROM pg_constraint c JOIN pg_class a ON a.oid=c.conrelid JOIN pg_namespace n ON n.oid=a.relnamespace
    JOIN pg_class b ON b.oid=c.confrelid JOIN pg_namespace nb ON nb.oid=b.relnamespace
    CROSS JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY k(src,dst,ord)
    JOIN pg_attribute x ON x.attrelid=a.oid AND x.attnum=k.src JOIN pg_attribute y ON y.attrelid=b.oid AND y.attnum=k.dst
    WHERE c.contype='f' AND n.nspname='public' AND nb.nspname='public' GROUP BY c.oid,c.conname,a.relname,b.relname`)).rows;
  assert.ok(fks.length>0,'Nenhuma FK encontrada.');
  const qi=s=>'"'+s.replaceAll('"','""')+'"';
  for(const fk of fks) {
    assert.ok(tabelas[fk.origem] && tabelas[fk.destino]);
    assert.ok(Array.isArray(fk.cols_origem) && Array.isArray(fk.cols_destino),'Metadados de FK precisam ser arrays JavaScript.');
    assert.ok(fk.cols_origem.length>0 && fk.cols_origem.length===fk.cols_destino.length);
    assert.ok([...fk.cols_origem,...fk.cols_destino].every(x=>typeof x==='string' && x.length>0));
    const nonnull=fk.cols_origem.map(x=>'o.'+qi(x)+' IS NOT NULL').join(' AND ');
    const iguais=fk.cols_origem.map((x,i)=>'d.'+qi(fk.cols_destino[i])+'=o.'+qi(x)).join(' AND ');
    const n=(await c.query(`SELECT count(*) AS n FROM public.${qi(fk.origem)} o WHERE ${nonnull} AND NOT EXISTS(SELECT 1 FROM public.${qi(fk.destino)} d WHERE ${iguais})`)).rows[0].n;
    assert.equal(n,'0','Integridade referencial divergente.');
  }
  return fks.length;
}
async function auditarFKsSomenteLeitura() {
  assert.ok(process.env.NR33_CREDENCIAL_715 && !process.env.NODE_OPTIONS);
  const {Client}=require('pg');
  const c=new Client({host:'127.0.0.1',port:5432,database:BANCO,user:'nr33_dev_app',password:process.env.NR33_CREDENCIAL_715,
    options:'-c default_transaction_read_only=on -c search_path=public,pg_catalog',connectionTimeoutMillis:5000});
  try {
    await c.connect();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await c.query("SET LOCAL statement_timeout='30s'");
    const destino=(await c.query("SELECT current_database() AS banco,host(inet_server_addr()) AS host,inet_server_port() AS porta,current_setting('transaction_read_only') AS somente_leitura")).rows[0];
    assert.deepEqual(destino,{banco:BANCO,host:'127.0.0.1',porta:5432,somente_leitura:'on'});
    const quantidade=await verificarFKs(c);
    await c.query('COMMIT');
    console.log(JSON.stringify({resultado:'FKS_APROVADAS_SOMENTE_LEITURA',destino,fks_verificadas:quantidade,arrays_javascript_confirmados:true}));
  } catch(e) {
    await c.query('ROLLBACK').catch(()=>{});
    console.error(JSON.stringify({resultado:'AUDITORIA_FKS_INTERROMPIDA',codigo:e.code||'VALIDACAO'}));process.exitCode=1;
  } finally {await c.end();}
}
async function executar() {
  assert.equal(process.env.NR33_AUTORIZAR_718, 'EXCLUIR_93_REGISTROS_APROVADOS');
  assert.ok(process.env.NR33_CREDENCIAL_715 && !process.env.NODE_OPTIONS);
  // O caminho muda entre maquinas; hash e escopo da autorizacao permanecem fixos.
  const arquivo = process.env.NR33_PLANO_718_ARQUIVO;
  const relativo = arquivo && path.relative(path.resolve(__dirname,'../..'),path.resolve(arquivo));
  assert.ok(arquivo && path.isAbsolute(arquivo) && path.extname(arquivo)==='.json' && relativo &&
    (relativo.startsWith('..'+path.sep) || path.isAbsolute(relativo)), 'Informe inventario privado absoluto fora do repositorio em NR33_PLANO_718_ARQUIVO.');
  const bytes = fs.readFileSync(arquivo);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), HASH, 'Inventario privado alterado.');
  const plano = JSON.parse(bytes);
  assert.equal(plano.pronto_para_aprovacao, true);
  assert.equal(plano.destino.banco, BANCO);
  assert.equal(plano.ambientes_candidatos.length, 10);
  assert.equal(Object.values(plano.tabelas).reduce((n,t)=>n+t.remover,0), 93);
  assert.deepEqual(ordenar(plano.tabelas.usuario.ids_preservar), ['21','22']);
  assert.deepEqual(plano.tabelas.campanha.ids_preservar, ['12']);
  assert.deepEqual(plano.tabelas.versao_entidade.ids_preservar, ['42']);
  assert.deepEqual(ordenar(plano.tabelas.ambiente.ids_preservar), ordenar(plano.preservados.map(u=>u.id_ambiente)));
  const {Pool} = require('pg');
  const pool = new Pool({host:'127.0.0.1',port:5432,database:BANCO,user:'nr33_dev_app',password:process.env.NR33_CREDENCIAL_715,
    options:'-c search_path=public,pg_catalog',connectionTimeoutMillis:5000,max:1});
  pool.on('error',()=>{});
  let c, fase='conexao', transacao=false, commit=false;
  try {
    c = await pool.connect();
    await c.query('BEGIN'); transacao=true;
    await c.query("SET LOCAL lock_timeout='8s'");
    await c.query("SET LOCAL statement_timeout='30s'");
    const destino=(await c.query('SELECT current_database() AS banco,host(inet_server_addr()) AS host,inet_server_port() AS porta,current_user AS papel')).rows[0];
    assert.deepEqual(destino,{banco:BANCO,host:'127.0.0.1',porta:5432,papel:'nr33_dev_app'});
    fase='bloqueio';
    await c.query(`LOCK TABLE ${Object.keys(tabelas).sort().map(t=>'public.'+t).join(',')} IN SHARE ROW EXCLUSIVE MODE`);
    const inventario=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
    assert.deepEqual(inventario,Object.keys(tabelas).sort());
    const protecoesSQL=`SELECT
      (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated) AS constraints_nao_validadas,
      (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND t.tgenabled NOT IN ('O','A')) AS triggers_inativos`;
    assert.deepEqual((await c.query(protecoesSQL)).rows[0],{constraints_nao_validadas:0,triggers_inativos:0});
    fase='revalidacao_93_registros';
    const antes={}, protegidos={};
    const fingerprint = async(t,ids)=>(await c.query(`SELECT ${tabelas[t][0]}::text AS id,md5(row_to_json(t)::text) AS hash FROM public.${t} t WHERE ${tabelas[t][0]}=ANY($1::${t==='ambiente'||t==='convite'?'uuid':'bigint'}[]) ORDER BY ${tabelas[t][0]}`,[ids])).rows;
    for(const [t,[id,sql]] of Object.entries(tabelas)) {
      const rows=(await c.query(sql)).rows;
      antes[t]=rows.length;
      assert.equal(rows.length,plano.tabelas[t].total,`Contagem divergente: ${t}`);
      assert.equal(Number((await c.query(`SELECT count(*) AS n FROM public.${t}`)).rows[0].n),rows.length,`Ancestralidade incompleta: ${t}`);
      const candidatos=rows.filter(r=>plano.tabelas[t].ids_remover.includes(r[id]));
      assert.deepEqual(candidatos,plano.registros_candidatos[t],`Registros candidatos divergentes: ${t}`);
      assert.deepEqual(ordenar(rows.map(r=>r[id])),ordenar([...plano.tabelas[t].ids_remover,...plano.tabelas[t].ids_preservar]),`IDs divergentes: ${t}`);
      for(const r of candidatos)assert.ok(plano.tabelas.ambiente.ids_remover.includes(r.id_ambiente));
      protegidos[t]=await fingerprint(t,plano.tabelas[t].ids_preservar);
      if(t==='usuario')assert.deepEqual(rows.filter(r=>['21','22'].includes(r.id_usuario)),plano.preservados);
      if(t==='ambiente')assert.deepEqual(rows.filter(r=>plano.tabelas.ambiente.ids_preservar.includes(r.id_ambiente)),plano.ambientes_preservados);
    }
    // Identidade e vinculos dos recursos protegidos nao podem ser trocados.
    assert.equal((await c.query('SELECT id_ambiente FROM public.campanha WHERE id_campanha=$1',['12'])).rows[0].id_ambiente,
      (await c.query('SELECT id_ambiente FROM public.versao_entidade WHERE id_versao=$1',['42'])).rows[0].id_ambiente);
    const removidos={};
    const excluir=async(t)=>{
      fase='exclusao_'+t;
      const [id]=tabelas[t];
      const ids=plano.tabelas[t].ids_remover;
      const tipo=t==='ambiente'||t==='convite'?'uuid':'bigint';
      let escopo='id_ambiente=ANY($2::uuid[])';
      if(t==='local')escopo='EXISTS(SELECT 1 FROM public.campanha c WHERE c.id_campanha=t.id_campanha AND c.id_ambiente=ANY($2::uuid[]))';
      if(['checklist_nr33','dados_tecnicos','evidencia','relatorio'].includes(t))escopo='EXISTS(SELECT 1 FROM public.local l JOIN public.campanha c USING(id_campanha) WHERE l.id_local=t.id_local AND c.id_ambiente=ANY($2::uuid[]))';
      const res=await c.query(`DELETE FROM public.${t} t WHERE ${id}=ANY($1::${tipo}[]) AND ${escopo} RETURNING ${id}::text AS id`,[ids,plano.tabelas.ambiente.ids_remover]);
      assert.deepEqual(ordenar(res.rows.map(r=>r.id)),ordenar(ids),`Exclusao incompleta: ${t}`);
      removidos[t]=res.rowCount;
    };
    for(const t of ['sincronizacao','convite','relatorio','checklist_nr33','dados_tecnicos','evidencia','local','campanha'])await excluir(t);
    fase='tombstones';
    const versoes=(await c.query(tabelas.versao_entidade[1])).rows;
    assert.deepEqual(ordenar(versoes.map(v=>v.id_versao)),ordenar([...plano.tabelas.versao_entidade.ids_remover,'42']),'Versionamento inesperado.');
    for(const v of versoes.filter(v=>v.id_versao!=='42')) {
      const original=plano.registros_candidatos.versao_entidade.find(o=>o.id_versao===v.id_versao);
      assert.ok(original && original.id_ambiente===v.id_ambiente && original.entidade===v.entidade && original.id_entidade===v.id_entidade && v.excluido,'Tombstone fora do inventario.');
      assert.equal(BigInt(v.versao),BigInt(original.versao)+(original.excluido?0n:1n));
    }
    await excluir('versao_entidade');
    await excluir('usuario');
    await excluir('ambiente');
    fase='validacao_final';
    await c.query('SET CONSTRAINTS ALL IMMEDIATE');
    const depois={};
    for(const [t,[id]] of Object.entries(tabelas)) {
      depois[t]=Number((await c.query(`SELECT count(*) AS n FROM public.${t}`)).rows[0].n);
      assert.equal(depois[t],plano.tabelas[t].preservar,`Contagem final divergente: ${t}`);
      assert.deepEqual(await fingerprint(t,plano.tabelas[t].ids_preservar),protegidos[t],`Dados protegidos alterados: ${t}`);
      assert.deepEqual(ordenar((await c.query(`SELECT ${id}::text AS id FROM public.${t}`)).rows.map(r=>r.id)),ordenar(plano.tabelas[t].ids_preservar));
    }
    assert.deepEqual((await c.query(protecoesSQL)).rows[0],{constraints_nao_validadas:0,triggers_inativos:0});
    // Confirma cada FK existente, sem desabilitar nem reconstruir constraints.
    const fksVerificadas=await verificarFKs(c);
    assert.equal(Object.values(depois).reduce((n,x)=>n+x,0),6);
    assert.equal(Object.values(removidos).reduce((n,x)=>n+x,0),93);
    fase='commit';
    await c.query('COMMIT');transacao=false;commit=true;
    console.log(JSON.stringify({resultado:'COMMIT_CONFIRMADO',destino,antes,depois,removidos,total_removido:93,fks_verificadas:fksVerificadas,
      protegidos_integralmente_inalterados:true,tombstones_verificados:29,tabelas:11,arquivos_fisicos:'NAO_ACESSADOS',inventario_sha256:HASH}));
  } catch(e) {
    let rollback='NAO_NECESSARIO';
    if(transacao && c)try{await c.query('ROLLBACK');rollback='CONFIRMADO';}catch{rollback='FALHA_CONEXAO_ESTADO_A_CONFIRMAR';}
    console.error(JSON.stringify({resultado:'INTERROMPIDO_SEM_RETRY',fase,codigo:e.code||'VALIDACAO',rollback,commit_confirmado:commit}));
    process.exitCode=1;
  } finally {if(c)c.release();await pool.end();}
}
module.exports={verificarFKs};
if(require.main===module)(process.argv[2]==='--verificar-fks'?auditarFKsSomenteLeitura():executar()).catch(()=>{console.error('Operacao recusada; nenhuma repeticao automatica.');process.exitCode=1;});
