// Executado somente com autorizacao do PASSO 715. Nao importa app/.env/arquivos.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const BANCO='inventario_nr33_multitenant_dev';
const tabelas=['ambiente','usuario','convite','campanha','local','checklist_nr33','dados_tecnicos','evidencia','relatorio','sincronizacao','versao_entidade'];
async function executar(etapa) {
  if (process.env.NR33_EXECUCAO_715 !== BANCO || !['preflight','validar'].includes(etapa)) throw Error('Destino/etapa nao autorizado.');
  const { Pool } = require('pg');
  const pool=new Pool({host:'127.0.0.1',port:5432,database:BANCO,
    user:etapa==='preflight'?'postgres':'nr33_dev_app',password:process.env.NR33_CREDENCIAL_715,
    options:'-c search_path=public,pg_catalog',connectionTimeoutMillis:5000,max:4});
  pool.on('error',()=>{});
  let fase='conexao';
  try {
    const s=(await pool.query(`SELECT current_database() AS banco,current_setting('server_version') AS versao,
      current_setting('server_version_num')::int/10000 AS principal,current_user AS papel`)).rows[0];
    assert.equal(s.banco,BANCO); assert.equal(s.principal,17);
    console.log(JSON.stringify({fase:'servidor',banco:s.banco,versao:s.versao,papel:s.papel}));
    if(etapa==='preflight') {
      fase='preflight';
      const r=(await pool.query(`SELECT
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S')) AS objetos,
        EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS funcoes,
        EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nr33_dev_app') AS papel_existe`)).rows[0];
      assert.equal(r.objetos,false); assert.equal(r.funcoes,false); assert.equal(r.papel_existe,false);
      console.log('PREFLIGHT_OK: esquema public vazio e papel ausente.'); return;
    }
    fase='inventario';
    const ts=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
    assert.deepEqual(ts,[...tabelas].sort());
    const cs=(await pool.query(`SELECT contype,count(*)::int AS total FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' GROUP BY contype ORDER BY contype`)).rows;
    assert.equal(cs.find(r=>r.contype==='p').total,11);
    const triggers=(await pool.query(`SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY tgname`)).rows.map(r=>r.tgname);
    assert.equal(triggers.length,16);
    const indices=(await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='public'")).rows.map(r=>r.indexname);
    for(const indice of ['uq_usuario_email_normalizado','uq_versao_entidade_identidade_global','uq_sincronizacao_operacao_cliente','uq_evidencia_id_operacao_cliente']) assert.ok(indices.includes(indice));
    const papel=(await pool.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
    assert.ok(Object.values(papel).every(v=>v===false));
    const privilegios=(await pool.query(`SELECT has_database_privilege(current_user,current_database(),'CONNECT') AS conectar,
      has_schema_privilege(current_user,'public','USAGE') AS usar,
      has_schema_privilege(current_user,'public','CREATE') AS criar`)).rows[0];
    assert.equal(privilegios.conectar,true); assert.equal(privilegios.usar,true); assert.equal(privilegios.criar,false);
    console.log(JSON.stringify({fase,tabelas:ts,constraints:cs,triggers:triggers.length,indices:indices.length,aplicacao_sem_administracao:true}));
    fase='integridade_versionamento';
    const c=await pool.connect();
    const nonce=crypto.randomBytes(8).toString('hex');
    let checks=0;
    async function negar(sql,params,codigo) {
      await c.query('SAVEPOINT tentativa715');
      let erro;
      try { await c.query(sql,params); } catch(e) { erro=e; }
      await c.query('ROLLBACK TO SAVEPOINT tentativa715');
      assert.ok(erro,'Operacao insegura foi aceita'); assert.equal(erro.code,codigo); checks++;
    }
    try {
      await c.query('BEGIN');
      const a=(await c.query("INSERT INTO ambiente(nome) VALUES('Sintetico715 A') RETURNING id_ambiente")).rows[0].id_ambiente;
      const b=(await c.query("INSERT INTO ambiente(nome) VALUES('Sintetico715 B') RETURNING id_ambiente")).rows[0].id_ambiente;
      const usuarios=[];
      for(const [i,ambiente] of [a,b].entries()) usuarios.push((await c.query("INSERT INTO usuario(id_ambiente,nome,email,senha_hash,perfil_acesso) VALUES($1,'Pessoa sintetica',$2,'hash-ficticio','ADMINISTRADOR') RETURNING id_usuario",[ambiente,`p${i}_${nonce}@lab.invalid`])).rows[0].id_usuario);
      await negar("UPDATE usuario SET id_ambiente=$1 WHERE id_usuario=$2",[b,usuarios[0]],'P0001');
      await negar("INSERT INTO usuario(id_ambiente,nome,email,senha_hash,perfil_acesso) VALUES($1,'Duplicado',$2,'hash-ficticio','ADMINISTRADOR')",[b,` P0_${nonce.toUpperCase()}@LAB.INVALID `],'23505');
      const campanha=(await c.query("INSERT INTO campanha(id_ambiente,id_usuario,nome_campanha,empresa,responsavel,data_inicio) VALUES($1,$2,'Campanha sintetica','Empresa sintetica','Equipe sintetica',CURRENT_DATE) RETURNING id_campanha",[a,usuarios[0]])).rows[0].id_campanha;
      await negar("UPDATE campanha SET id_usuario=$1 WHERE id_campanha=$2",[usuarios[1],campanha],'23503');
      const local=(await c.query("INSERT INTO local(id_campanha,nome_local) VALUES($1,'Local sintetico') RETURNING id_local",[campanha])).rows[0].id_local;
      const checklistSQL="INSERT INTO checklist_nr33(id_local,id_usuario,criterio_a,criterio_b,criterio_c,acesso_controlado,ventilacao_adequada,monitoramento_atmosferico,procedimento_emergencia) VALUES($1,$2,'SIM','NAO','NAO','SIM','SIM','SIM','SIM') RETURNING id_checklist";
      const dadosSQL="INSERT INTO dados_tecnicos(id_local,id_usuario) VALUES($1,$2) RETURNING id_dados";
      const evidenciaSQL="INSERT INTO evidencia(id_local,id_usuario,tipo,latitude,longitude) VALUES($1,$2,'TEXTO',0,0) RETURNING id_evidencia";
      const relatorioSQL="INSERT INTO relatorio(id_local,id_usuario_responsavel) VALUES($1,$2) RETURNING id_relatorio";
      for(const sql of [checklistSQL,dadosSQL,evidenciaSQL,relatorioSQL]) await negar(sql,[local,usuarios[1]],'P0001');
      await negar("INSERT INTO convite(id_ambiente,email,perfil_acesso,token_hash,id_usuario_convite,data_expiracao) VALUES($1,$2,'ENGENHEIRO_SEGURANCA',$3,$4,clock_timestamp()+interval '1 hour')",[b,`c_${nonce}@lab.invalid`,crypto.randomBytes(32).toString('hex'),usuarios[0]],'23503');
      await negar("INSERT INTO sincronizacao(id_ambiente,id_usuario,entidade,operacao) VALUES($1,$2,'CAMPANHA','CRIAR')",[b,usuarios[0]],'23503');
      const checklist=(await c.query(checklistSQL,[local,usuarios[0]])).rows[0].id_checklist;
      const dados=(await c.query(dadosSQL,[local,usuarios[0]])).rows[0].id_dados;
      const evidencia=(await c.query(evidenciaSQL,[local,usuarios[0]])).rows[0].id_evidencia;
      await c.query(relatorioSQL,[local,usuarios[0]]);
      const recursos=[['CAMPANHA',campanha,'campanha','id_campanha','nome_campanha'],['LOCAL',local,'local','id_local','nome_local'],['CHECKLIST_NR33',checklist,'checklist_nr33','id_checklist','observacoes'],['DADOS_TECNICOS',dados,'dados_tecnicos','id_dados','observacoes'],['EVIDENCIA',evidencia,'evidencia','id_evidencia','descricao']];
      for(const [entidade,id,tabela,chave,campo] of recursos) {
        const v=(await c.query('SELECT versao,excluido FROM versao_entidade WHERE id_ambiente=$1 AND entidade=$2 AND id_entidade=$3',[a,entidade,id])).rows[0];
        assert.equal(v.versao,1); assert.equal(v.excluido,false);
        await c.query(`UPDATE ${tabela} SET ${campo}='Atualizacao sintetica715' WHERE ${chave}=$1`,[id]);
        assert.equal((await c.query('SELECT versao FROM versao_entidade WHERE id_ambiente=$1 AND entidade=$2 AND id_entidade=$3',[a,entidade,id])).rows[0].versao,2);
      }
      await c.query('DELETE FROM campanha WHERE id_campanha=$1',[campanha]);
      const tombstones=(await c.query('SELECT entidade,versao,excluido,data_exclusao FROM versao_entidade WHERE id_ambiente=$1',[a])).rows;
      assert.equal(tombstones.length,5); assert.ok(tombstones.every(v=>v.versao===3 && v.excluido && v.data_exclusao));
      assert.equal((await c.query('SELECT count(*)::int AS total FROM relatorio WHERE id_local=$1',[local])).rows[0].total,0);
      await c.query('ROLLBACK');
      assert.equal((await c.query('SELECT count(*)::int AS total FROM ambiente WHERE id_ambiente=ANY($1::uuid[])',[[a,b]])).rows[0].total,0);
      console.log(JSON.stringify({fase,recusas:checks,entidades_versionadas:5,tombstones:5,cascata_relatorio:true,rollback_confirmado:true}));
    } finally { await c.query('ROLLBACK').catch(()=>{}); c.release(); }
    fase='concorrencia_email';
    const c1=await pool.connect(),c2=await pool.connect();
    try {
      await c1.query('BEGIN'); await c2.query('BEGIN');
      const email=`lock715_${nonce}@lab.invalid`;
      await c1.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))',[email]);
      await c2.query("SET LOCAL lock_timeout='250ms'");
      await assert.rejects(c2.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))',[email]),{code:'55P03'});
      console.log('CONCORRENCIA_OK: bloqueio de email confirmado entre duas conexoes.');
    } finally { await c2.query('ROLLBACK').catch(()=>{}); await c1.query('ROLLBACK').catch(()=>{}); c2.release(); c1.release(); }
  } catch(e) {
    console.error(JSON.stringify({resultado:'FALHA',fase,codigo:/^[0-9A-Z]{5}$/.test(e.code||'')?e.code:'VALIDACAO',status:e.statusCode||null}));
    process.exitCode=1;
  } finally { await pool.end(); }
}
if(require.main===module) executar(process.argv[2]).catch(()=>{console.error('Execucao715 recusada antes da conexao.');process.exitCode=1;});
module.exports={executar};
