const { validarAmbienteLocal } = require('./postgresLocal.cjs');
const { validarPreflight, recusar } = require('./preflight-login.cjs');
async function iniciar() {
  // Prova de configuracao antes de carregar qualquer driver ou router.
  const d = validarAmbienteLocal(process.env);
  const { Pool } = require('pg');
  const pool = new Pool({ host: d.host, port: d.porta, database: d.banco, user: d.papel,
    password: process.env.DB_PASSWORD, connectionTimeoutMillis: 5000,
    options: '-c search_path=pg_catalog,public' });
  pool.on('error', () => console.error('Falha de conexao do desenvolvimento local.'));
  let server;
  let etapa = 'PREFLIGHT_FALHOU';
  let encerrado = false;
  let database, cacheAnterior;
  const aoSinal = () => encerrar().catch(() => { process.exitCode=1; });
  const encerrar = async () => {
    if (encerrado) return;
    encerrado = true;
    for (const signal of ['SIGINT','SIGTERM']) process.removeListener(signal,aoSinal);
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    try { await pool.end(); } finally {
      if (database) {
        if (cacheAnterior) require.cache[database]=cacheAnterior;
        else delete require.cache[database];
      }
    }
  };
  try {
    const client=await pool.connect();
    let descartar=false;
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout = '5s'");
      await validarPreflight(client,d);
      await client.query('COMMIT');
    } catch (erro) {
      try { await client.query('ROLLBACK'); } catch { descartar=true; }
      throw erro;
    } finally { client.release(descartar); }
    // Routers existentes reutilizam exclusivamente este pool explicitamente configurado.
    database = require.resolve('../src/config/database');
    cacheAnterior = require.cache[database];
    require.cache[database] = { id: database, filename: database, loaded: true, exports: pool };
    etapa = 'INICIALIZACAO_HTTP_FALHOU';
    const { criarApp } = require('./app.cjs');
    server = criarApp(d.banco).listen(d.portaHTTP, d.host);
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    console.log(`DESENVOLVIMENTO LOCAL: http://${d.host}:${d.portaHTTP} — ${d.banco}`);
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal,aoSinal);
    return { encerrar, destino:d };
  } catch (erro) {
    await encerrar().catch(()=>{});
    const seguro = erro?.codigoPreflight ? erro : recusar('INICIALIZACAO_INDISPONIVEL');
    seguro.codigoEtapa = etapa;
    throw seguro;
  }
}
if (require.main === module) iniciar().catch(erro => {
  const codigo = ['PREFLIGHT_FALHOU','INICIALIZACAO_HTTP_FALHOU'].includes(erro?.codigoEtapa)
    ? erro.codigoEtapa : 'CONFIGURACAO_LOCAL_INVALIDA';
  console.error(`Backend local nao iniciado [${codigo}]. Confira os pre-requisitos isolados.`);
  process.exitCode=1;
});
module.exports = { iniciar };
