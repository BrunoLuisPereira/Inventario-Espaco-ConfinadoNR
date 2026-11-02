const { senhaExistenteValida } = require('./senha-existente.cjs');
async function verificar(senha, criarClient = c => new (require('pg').Client)(c)) {
  if (!senhaExistenteValida(senha)) throw Error('CREDENCIAL_INVALIDA');
  const client = criarClient({ host: '127.0.0.1', port: 5432, database: 'inventario_nr33_multitenant_dev',
    user: 'nr33_dev_app', password: senha, ssl: false, connectionTimeoutMillis: 5000,
    query_timeout: 10000, options: '-c search_path=pg_catalog,public' });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const { rows: [r] } = await client.query(`SELECT current_database() AS banco, current_user AS papel,
      current_setting('server_version_num')::int / 10000 AS versao`);
    if (r?.banco !== 'inventario_nr33_multitenant_dev' || r.papel !== 'nr33_dev_app' || r.versao !== 17) throw Error('DESTINO_INVALIDO');
    await client.query('COMMIT');
    return { autenticada: true, banco: r.banco, papel: r.papel, versao: r.versao };
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {});
    throw Error(erro.code === '28P01' ? 'CREDENCIAL_DIVERGENTE' : erro.message === 'DESTINO_INVALIDO' ? 'DESTINO_INVALIDO' : 'POSTGRES_INDISPONIVEL');
  } finally { await client.end().catch(() => {}); }
}
async function principal() {
  let texto = '', entrada;
  try {
    if (process.stdin.isTTY || process.argv.length !== 2) throw Error();
    process.stdin.setEncoding('utf8');
    for await (const parte of process.stdin) { texto += parte; if (texto.length > 32768) throw Error(); }
    entrada = JSON.parse(texto);
    process.stdout.write(JSON.stringify(await verificar(entrada.senha)));
  } finally { texto = null; if (entrada) entrada.senha = null; }
}
if (require.main === module) principal().catch(erro => {
  const codigos = ['CREDENCIAL_INVALIDA', 'CREDENCIAL_DIVERGENTE', 'DESTINO_INVALIDO', 'POSTGRES_INDISPONIVEL'];
  process.stderr.write(codigos.includes(erro.message) ? erro.message : 'CANAL_PRIVADO_INVALIDO'); process.exitCode = 1;
});
module.exports = { verificar };
