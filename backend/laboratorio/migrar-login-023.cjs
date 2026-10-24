// Executor incremental, sem dotenv. Importar ou usar --plano NÃO conecta.
// Preparado no PASSO 27; executar somente após autorização específica.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { validarCorpoSQL } = require('./validar-corpo-sql.cjs');
const { identidade } = require('./preflight-login.cjs');
const BANCO='inventario_nr33_multitenant_dev';
const CONFIRMACAO=`APLICAR 023 ${BANCO}`;
const HASH='65c1d31cba4287a9bffaa0c92d96f0c0c8d521163fdc802f4e9c8e068c56b96d';
function recusar(codigo) { return Error(`Migration 023 recusada [${codigo}]. Nenhum detalhe de credencial foi registrado.`); }
function plano() {
  return { banco:BANCO, host:'127.0.0.1', porta:5432, versao:17,
    arquivo:'backend/database/023_controle_tentativas_login.sql', sha256:HASH,
    papelAplicacao:'nr33_dev_app', privilegios:['SELECT','INSERT','UPDATE'], executado:false };
}
function validarFonte(fonte) {
  const sql=fonte.replace(/\r\n/g,'\n');
  if (createHash('sha256').update(sql,'utf8').digest('hex')!==HASH) throw recusar('FONTE_DIVERGENTE');
  const corpo=sql.slice(sql.indexOf('BEGIN;')+6,sql.lastIndexOf('COMMIT;'));
  const comandos=validarCorpoSQL(corpo);
  if (comandos.length!==2 || !/^CREATE TABLE public\.login_tentativa\s*\(/.test(comandos[0]) ||
      !/^CREATE INDEX idx_login_tentativa_limpeza ON public\.login_tentativa\s*\(/.test(comandos[1])) throw recusar('DDL_DIVERGENTE');
  return corpo;
}
function validarOpcoes(opcoes,env) {
  if (opcoes.banco!==BANCO || opcoes.executar!==true || opcoes.confirmacao!==CONFIRMACAO) throw recusar('AUTORIZACAO_OU_DESTINO');
  if (Object.keys(env).some(k=>k.startsWith('PG') || ['NODE_OPTIONS','DATABASE_URL'].includes(k))) throw recusar('OVERRIDES_AMBIENTE');
  const user=env.NR33_MIGRACAO_023_USER, password=env.NR33_MIGRACAO_023_PASSWORD;
  if (typeof user!=='string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(user) || user==='nr33_dev_app' ||
      typeof password!=='string' || !password) throw recusar('CREDENCIAL_PRIVADA');
  return { host:'127.0.0.1',port:5432,database:BANCO,user,password,
    ssl:false,connectionTimeoutMillis:5000,query_timeout:10000,
    application_name:'nr33_migration_023',options:'-c search_path=pg_catalog,public' };
}
async function executar(opcoes,dependencias={}) {
  const env=dependencias.env ?? process.env;
  const config=validarOpcoes(opcoes,env);
  const fonte=(dependencias.lerFonte ?? (()=>fs.readFileSync(path.join(__dirname,'../database/023_controle_tentativas_login.sql'),'utf8')))();
  const corpo=validarFonte(fonte);
  // Carregamento tardio: plano, autorização inválida ou fonte adulterada nunca
  // chegam ao driver. Não importa a configuração de banco da aplicação.
  const criarClient=dependencias.criarClient ?? (c=>new (require('pg').Client)(c));
  const client=criarClient(config);
  let transacao=false;
  try {
    await client.connect();
    const r=await identidade(client);
    if (r?.banco!==BANCO || r.versao!==17 || r.host!=='127.0.0.1' || r.porta!==5432 ||
        r.papel!==config.user || r.sessao!==config.user) throw recusar('DESTINO_CONECTADO');
    await client.query('BEGIN'); transacao=true;
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    // Serializa somente outros executores desta migration, sem bloquear usuários.
    await client.query("SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nr33:023:inventario_nr33_multitenant_dev',0))");
    const { rows:[s] }=await client.query(`/* migration023:preflight */
      SELECT current_database() AS banco, current_user AS papel,
        current_setting('server_version_num')::int / 10000 AS versao,
        pg_catalog.to_regclass('public.login_tentativa') IS NULL AS tabela_ausente,
        pg_catalog.to_regclass('public.idx_login_tentativa_limpeza') IS NULL AS indice_ausente,
        has_schema_privilege(current_user,'public','USAGE') AS uso,
        has_schema_privilege(current_user,'public','CREATE') AS criar,
        EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='nr33_dev_app' AND rolcanlogin
          AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AS papel_app`);
    if (s?.banco!==BANCO || s.papel!==config.user || s.versao!==17 || !s.tabela_ausente ||
        !s.indice_ausente || !s.uso || !s.criar || !s.papel_app) throw recusar('PRE_REQUISITOS_DDL');
    // Somente o corpo fixado por hash; BEGIN/COMMIT da fonte são substituídos
    // por esta única transação, que também engloba as concessões específicas.
    await client.query(corpo);
    await client.query('GRANT SELECT, INSERT, UPDATE ON TABLE public.login_tentativa TO nr33_dev_app');
    const { rows:[p] }=await client.query(`/* migration023:privilegios */ SELECT
      has_table_privilege('nr33_dev_app','public.login_tentativa','SELECT') AS selecionar,
      has_table_privilege('nr33_dev_app','public.login_tentativa','INSERT') AS inserir,
      has_table_privilege('nr33_dev_app','public.login_tentativa','UPDATE') AS atualizar`);
    if (!p?.selecionar || !p.inserir || !p.atualizar) throw recusar('PRIVILEGIOS');
    await client.query('COMMIT'); transacao=false;
    return { banco:BANCO, migration:'023', aplicada:true };
  } catch {
    if (transacao) await client.query('ROLLBACK').catch(()=>{});
    // COMMIT com falha de transporte tem resultado incerto. Nunca repetir,
    // remover tabelas ou tentar reparar automaticamente; revisar o catálogo.
    throw recusar('EXECUCAO_INTERROMPIDA_VERIFICAR_ESTADO');
  } finally { await client.end().catch(()=>{}); }
}
if (require.main===module) {
  const args=process.argv.slice(2);
  if (!args.length || (args.length===1 && args[0]==='--plano')) console.log(JSON.stringify(plano(),null,2));
  else if (args.length===5 && args[0]==='--executar' && args[1]==='--banco' && args[3]==='--confirmacao') {
    executar({ executar:true,banco:args[2],confirmacao:args[4] }).then(()=>console.log('Migration 023 concluida no banco isolado. Validar preflight antes de iniciar HTTP.'))
      .catch(()=>{ console.error('Migration 023 recusada ou interrompida. Verifique destino, autorizacao e estado do catalogo; nao repetir automaticamente.'); process.exitCode=1; });
  } else { console.error('Argumentos recusados. Use --plano para revisao sem conexao.'); process.exitCode=1; }
}
module.exports={ plano,validarFonte,validarOpcoes,executar };
