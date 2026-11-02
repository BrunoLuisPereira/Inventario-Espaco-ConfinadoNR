const crypto = require('node:crypto');
const { senhaExistenteValida } = require('./senha-existente.cjs');
const { verificar } = require('./verificar-credencial-aplicacao.cjs');
const CONFIRMACAO = 'SINCRONIZAR nr33_dev_app inventario_nr33_multitenant_dev';
function criarVerificador(senha) {
  // Mesma preparação SASL usada pelo driver pg instalado (RFC 4013/5802).
  const preparada = senha.replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u00AD\u034F\u1806\u180B\u180C\u180D\u200C\u200D\u2060\uFE00-\uFE0F\uFEFF]/g, '').normalize('NFKC');
  const salt = crypto.randomBytes(16);
  const salted = crypto.pbkdf2Sync(preparada, salt, 4096, 32, 'sha256');
  const clientKey = crypto.createHmac('sha256', salted).update('Client Key').digest();
  const stored = crypto.createHash('sha256').update(clientKey).digest('base64');
  const server = crypto.createHmac('sha256', salted).update('Server Key').digest('base64');
  salted.fill(0); clientKey.fill(0);
  return `SCRAM-SHA-256$4096:${salt.toString('base64')}$${stored}:${server}`;
}
async function sincronizar(entrada, criarClient = c => new (require('pg').Client)(c), autenticar = verificar) {
  if (entrada.confirmacao !== CONFIRMACAO || !senhaExistenteValida(entrada.senha) || !senhaExistenteValida(entrada.admin)) throw Error('AUTORIZACAO_RECUSADA');
  const client = criarClient({ host: '127.0.0.1', port: 5432, database: 'inventario_nr33_multitenant_dev',
    user: 'postgres', password: entrada.admin, ssl: false, connectionTimeoutMillis: 5000, query_timeout: 10000,
    options: '-c search_path=pg_catalog,public' });
  let commit = false, etapa = 'AUTENTICACAO_ADMIN';
  try {
    await client.connect();
    etapa = 'DESTINO';
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SET LOCAL statement_timeout='5s'");
    const { rows: [r] } = await client.query(`SELECT current_database() AS banco, current_user AS papel,
      session_user AS sessao, current_setting('server_version_num')::int / 10000 AS versao,
      host(inet_server_addr()) AS host, inet_server_port() AS porta`);
    if (r?.banco !== 'inventario_nr33_multitenant_dev' || r.papel !== 'postgres' || r.sessao !== 'postgres' || r.versao !== 17 || r.host !== '127.0.0.1' || r.porta !== 5432) throw Error('DESTINO_INVALIDO');
    const consulta = "SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolvaliduntil FROM pg_roles WHERE rolname='nr33_dev_app'";
    etapa = 'PAPEL';
    const { rows: [antes] } = await client.query(consulta);
    if (!antes?.rolcanlogin || antes.rolsuper || antes.rolcreatedb || antes.rolcreaterole || antes.rolreplication || antes.rolbypassrls) throw Error('PAPEL_INCOMPATIVEL');
    // Nunca envia a senha original como texto SQL, somente o verificador SCRAM.
    const verificador = criarVerificador(entrada.senha);
    if (!/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(verificador)) throw Error('VERIFICADOR_INVALIDO');
    etapa = 'ALTERACAO_PASSWORD';
    await client.query("ALTER ROLE nr33_dev_app PASSWORD '" + verificador + "'");
    const { rows: [depois] } = await client.query(consulta);
    if (JSON.stringify(antes) !== JSON.stringify(depois)) throw Error('ATRIBUTOS_DIVERGENTES');
    commit = true;
    await client.query('COMMIT');
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {});
    throw Error(commit ? 'RESULTADO_INCERTO_VERIFICAR_SEM_REPETIR' : erro.code === '28P01' ? 'ADMIN_AUTENTICACAO_RECUSADA' : 'SINCRONIZACAO_RECUSADA_' + etapa);
  } finally { await client.end().catch(() => {}); }
  await autenticar(entrada.senha);
  return { sincronizada: true, autenticada: true };
}
async function principal() {
  let texto = '', entrada;
  try {
    if (process.stdin.isTTY || process.argv.length !== 2) throw Error();
    process.stdin.setEncoding('utf8');
    for await (const parte of process.stdin) { texto += parte; if (texto.length > 131072) throw Error(); }
    entrada = JSON.parse(texto);
    process.stdout.write(JSON.stringify(await sincronizar(entrada)));
  } finally { texto = null; if (entrada) { entrada.senha = null; entrada.admin = null; } }
}
if (require.main === module) principal().catch(erro => {
  const codigo = /^(SINCRONIZACAO_RECUSADA_(AUTENTICACAO_ADMIN|DESTINO|PAPEL|ALTERACAO_PASSWORD)|ADMIN_AUTENTICACAO_RECUSADA|RESULTADO_INCERTO_VERIFICAR_SEM_REPETIR|CREDENCIAL_DIVERGENTE)$/.test(erro.message)
    ? erro.message : 'SINCRONIZACAO_NAO_CONFIRMADA';
  process.stderr.write(codigo); process.exitCode = 1;
});
module.exports = { sincronizar, criarVerificador, CONFIRMACAO };
