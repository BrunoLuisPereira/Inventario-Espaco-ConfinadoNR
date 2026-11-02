// Importação/--plano puros. Sem dotenv, startup ou conexão automática.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { validarCorpoSQL } = require('./validar-corpo-sql.cjs');
const { identidade } = require('./preflight-login.cjs');
const BANCO = 'inventario_nr33_multitenant_dev';
const HASH = 'cbfee661df82eee7c81268ded42102053ecc1b9491a8931a123bc5bdf453814a';
const TABELAS = ['recuperacao_senha', 'recuperacao_limite', 'recuperacao_envio'];
const INDICES = ['uq_recuperacao_senha_pendente', 'idx_recuperacao_senha_expira', 'idx_recuperacao_limite_janela', 'idx_recuperacao_envio_pendente', 'idx_recuperacao_envio_email'];
function recusar(codigo) { return Error(`Migration 024 recusada [${codigo}]. Revisar estado antes de repetir; detalhes privados omitidos.`); }
function plano() {
  return { banco: BANCO, host: '127.0.0.1', porta: 5432, versao: 17, papelAplicacao: 'nr33_dev_app',
    arquivo: 'backend/database/024_recuperacao_senha.sql', sha256: HASH,
    privilegios: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], executado: false };
}
function validarFonte(fonte) {
  const sql = fonte.replace(/\r\n/g, '\n');
  if (createHash('sha256').update(sql).digest('hex') !== HASH) throw recusar('FONTE_DIVERGENTE');
  const corpo = sql.slice(sql.indexOf('BEGIN;') + 6, sql.lastIndexOf('COMMIT;'));
  const comandos = validarCorpoSQL(corpo);
  if (comandos.length !== 11 || !comandos[0].startsWith('ALTER TABLE public.usuario ADD COLUMN sessao_versao') ||
      comandos.filter(c => c.startsWith('CREATE TABLE')).length !== 3 ||
      comandos.filter(c => c.startsWith('CREATE') && c.includes('INDEX')).length !== 5 ||
      !comandos[9].startsWith('REVOKE ALL') || !comandos[10].startsWith('GRANT SELECT, INSERT, UPDATE, DELETE')) throw recusar('DDL_DIVERGENTE');
  return corpo;
}
function configurar(opcoes, env) {
  if (opcoes.banco !== BANCO || opcoes.executar !== true || opcoes.confirmacao !== `APLICAR 024 ${BANCO}`) throw recusar('AUTORIZACAO_OU_DESTINO');
  if (Object.keys(env).some(k => k.startsWith('PG') || ['NODE_OPTIONS', 'DATABASE_URL'].includes(k))) throw recusar('OVERRIDES_AMBIENTE');
  const user = env.NR33_MIGRACAO_024_USER, password = env.NR33_MIGRACAO_024_PASSWORD;
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(user || '') || user === 'nr33_dev_app' || typeof password !== 'string' || !password) throw recusar('CREDENCIAL_PRIVADA');
  return { host: '127.0.0.1', port: 5432, database: BANCO, user, password,
    ssl: false, connectionTimeoutMillis: 5000, query_timeout: 15000,
    application_name: 'nr33_migration_024', options: '-c search_path=pg_catalog,public' };
}
async function preflight(client) {
  const { rows: [r] } = await client.query(`/* migration024:preflight */ SELECT
    has_schema_privilege(current_user, 'public', 'USAGE') AND has_schema_privilege(current_user, 'public', 'CREATE') AS esquema,
    EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.usuario'::regclass
      AND pg_has_role(current_user, relowner, 'USAGE')) AS proprietario,
    has_table_privilege(current_user, 'public.usuario', 'REFERENCES') AS referencia,
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nr33_dev_app' AND rolcanlogin
      AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AS papel_app,
    has_schema_privilege('nr33_dev_app', 'public', 'USAGE') AND has_table_privilege('nr33_dev_app', 'public.usuario', 'SELECT')
      AND has_table_privilege('nr33_dev_app', 'public.usuario', 'UPDATE') AS usuario_app,
    to_regclass('public.ambiente') IS NOT NULL AND to_regclass('public.login_tentativa') IS NOT NULL
      AND EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.usuario'::regclass AND attname='eh_fundador' AND NOT attisdropped)
      AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.usuario'::regclass AND tgname='trg_usuario_perfil_rbac' AND tgenabled='O') AS anteriores,
    EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.usuario'::regclass AND c.contype IN ('p','u')
      AND c.convalidated AND c.conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid='public.usuario'::regclass AND attname='id_usuario'),
        (SELECT attnum FROM pg_attribute WHERE attrelid='public.usuario'::regclass AND attname='id_ambiente')]) AS chave_composta,
    NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.usuario'::regclass AND attname='sessao_versao' AND NOT attisdropped) AS coluna_ausente,
    NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname = ANY($1::text[])) AS objetos_ausentes`, [TABELAS.concat(INDICES)]);
  if (!r || ['esquema', 'proprietario', 'referencia', 'papel_app', 'usuario_app', 'anteriores', 'chave_composta', 'coluna_ausente', 'objetos_ausentes']
    .some(k => r[k] !== true)) throw recusar('PRE_REQUISITOS_OU_ESTADO_DIVERGENTE');
}
async function posflight(client) {
  const { rows: [r] } = await client.query(`/* migration024:posflight */ SELECT
    (SELECT count(*) = 3 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relkind='r' AND NOT c.relrowsecurity) AS tabelas,
    (SELECT count(*) = 5 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($2::text[]) AND i.indisvalid) AS indices,
    EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid='public.usuario'::regclass AND a.attname='sessao_versao' AND NOT a.attisdropped
        AND a.atttypid='int4'::regtype AND a.attnotnull AND pg_get_expr(d.adbin,d.adrelid)='0') AS versao,
    EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.usuario'::regclass AND contype='c' AND convalidated
      AND position('sessao_versao >= 0' in pg_get_constraintdef(oid)) > 0) AS versao_check,
    EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.recuperacao_senha'::regclass AND contype='f'
      AND confrelid='public.usuario'::regclass AND convalidated AND array_length(conkey,1)=2) AS fk,
    EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.recuperacao_senha'::regclass AND attname='ativado_em' AND NOT attisdropped) AS ativacao,
    (SELECT bool_and(has_table_privilege('nr33_dev_app', 'public.' || t, p))
      FROM unnest($1::text[]) t CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p) AS privilegios,
    NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) a
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND a.grantee=0) AS publico_sem_acesso`, [TABELAS, INDICES]);
  if (!r || ['tabelas', 'indices', 'versao', 'versao_check', 'fk', 'ativacao', 'privilegios', 'publico_sem_acesso']
    .some(k => r[k] !== true)) throw recusar('POS_CONDICOES_OU_PRIVILEGIOS');
}
async function executar(opcoes, deps = {}) {
  const config = configurar(opcoes, deps.env || process.env);
  const corpo = validarFonte((deps.lerFonte || (() => fs.readFileSync(path.join(__dirname, '../database/024_recuperacao_senha.sql'), 'utf8')))());
  const client = (deps.criarClient || (c => new (require('pg').Client)(c)))(config);
  let transacao = false, commitIniciado = false;
  try {
    await client.connect();
    const r = await identidade(client);
    if (r?.banco !== BANCO || r.versao !== 17 || r.host !== '127.0.0.1' || r.porta !== 5432 ||
        r.papel !== config.user || r.sessao !== config.user) throw recusar('DESTINO_CONECTADO');
    await client.query('BEGIN'); transacao = true;
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('nr33:024:inventario_nr33_multitenant_dev',0))");
    await preflight(client);
    // Não há execução parcial nem transação aninhada: somente o corpo revisado.
    await client.query(corpo);
    await posflight(client);
    commitIniciado = true;
    await client.query('COMMIT'); transacao = false;
    return { banco: BANCO, migration: '024', aplicada: true };
  } catch {
    if (transacao) await client.query('ROLLBACK').catch(() => {});
    throw recusar(commitIniciado ? 'COMMIT_INCERTO_VERIFICAR_CATALOGO' : 'EXECUCAO_INTERROMPIDA_VERIFICAR_ESTADO');
  } finally { await client.end().catch(() => {}); }
}
if (require.main === module) {
  if (process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--plano')) console.log(JSON.stringify(plano(), null, 2));
  else { console.error('Use --plano ou o canal PowerShell supervisionado da 024.'); process.exitCode = 1; }
}
module.exports = { plano, validarFonte, configurar, preflight, posflight, executar };
