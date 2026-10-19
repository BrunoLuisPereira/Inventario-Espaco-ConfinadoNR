// Preparacao pura: importar este modulo nao conecta nem carrega pg/dotenv.
const { montarSQL } = require('./montar-sql.cjs');
const BANCO = 'inventario_nr33_multitenant_dev';
const PAPEL = 'nr33_dev_app';
function destinoLocal(banco) {
  if (banco !== BANCO) throw Error('Banco local nao autorizado.');
  return { banco: BANCO, host: '127.0.0.1', porta: 5432, papel: PAPEL, portaHTTP: 3001 };
}
function validarAmbienteLocal(env) {
  const d = destinoLocal(env.DB_NAME);
  if (env.NR33_LOCAL_AUTORIZADO !== 'PASSO712' || env.DB_HOST !== d.host ||
      env.DB_PORT !== String(d.porta) || env.DB_USER !== d.papel ||
      typeof env.DB_PASSWORD !== 'string' || env.DB_PASSWORD.length < 32 ||
      typeof env.JWT_SECRET !== 'string' || env.JWT_SECRET.length < 48) {
    throw Error('Configuracao local isolada obrigatoria.');
  }
  if (env.NR33_BACKEND_PORT !== undefined && !['3000', '3001'].includes(env.NR33_BACKEND_PORT)) {
    throw Error('Porta HTTP local nao autorizada.');
  }
  return { ...d, portaHTTP: Number(env.NR33_BACKEND_PORT ?? d.portaHTTP) };
}
function sqlInstalacaoLocal(banco, fontes, senha, revisao = false) {
  destinoLocal(banco);
  // Nao ha coercoes nem interpolacao de identificadores fornecidos pelo cliente.
  if (revisao !== true && (typeof senha !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(senha) || senha.trim() !== senha)) {
    throw Error('Senha nova deve ter 32-128 caracteres A-Z/a-z/0-9/_/-.');
  }
  const base = montarSQL(banco, fontes);
  if ((base.match(/IS DISTINCT FROM 'passo710'/g) || []).length !== 3) throw Error('Guardas SQL divergentes.');
  const corpo = base.replace(/^BEGIN;\n/, '').replace(/COMMIT;\n$/, '')
    .replaceAll("IS DISTINCT FROM 'passo710'", "IS DISTINCT FROM 'passo712'");
  const papelSQL = revisao === true ? `CREATE ROLE ${PAPEL} NOLOGIN` : `CREATE ROLE ${PAPEL} LOGIN PASSWORD '${senha}'`;
  return `${revisao === true ? '-- ARTEFATO DE REVISAO SEM SENHAS: papel NOLOGIN. Instalar pelo postgres-local.ps1 aprovado.\n' : ''}BEGIN;
SET LOCAL nr33.laboratorio = 'passo712';
SET LOCAL search_path = public, pg_catalog;
DO $preflight$
BEGIN
  IF current_database() <> '${BANCO}' OR current_setting('server_version_num')::int / 10000 <> 17 THEN
    RAISE EXCEPTION 'Banco ou versao PostgreSQL nao autorizados.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='${PAPEL}') THEN
    RAISE EXCEPTION 'Instalacao exige esquema vazio e papel novo; reutilizacao bloqueada.';
  END IF;
END;
$preflight$;
${corpo}
${papelSQL} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
REVOKE ALL ON DATABASE ${BANCO} FROM PUBLIC;
GRANT CONNECT ON DATABASE ${BANCO} TO ${PAPEL};
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ${PAPEL};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${PAPEL};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${PAPEL};
COMMIT;
`;
}
if (require.main === module) {
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const { arquivos } = require('./montar-sql.cjs');
    const revisao = process.argv.length === 5 && process.argv[4] === '--revisao';
    if ((!revisao && process.argv.length !== 4) || process.argv[2] !== '--banco') throw Error();
    destinoLocal(process.argv[3]);
    const fontes = arquivos.map(a => fs.readFileSync(path.resolve(__dirname, '../database', a), 'utf8'));
    process.stdout.write(sqlInstalacaoLocal(process.argv[3], fontes, revisao ? undefined : process.env.NR33_SENHA_INSTALACAO, revisao));
  } catch {
    console.error('Preparacao SQL local recusada; nenhum detalhe de credencial foi registrado.');
    process.exitCode = 1;
  }
}
module.exports = { destinoLocal, validarAmbienteLocal, sqlInstalacaoLocal };
