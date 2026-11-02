// Somente leitura, stdin privado. Nunca inicia worker ou envia e-mail.
async function verificar(senha, criarClient = config => new (require('pg').Client)(config)) {
  if (!require('./senha-existente.cjs').senhaExistenteValida(senha)) throw Error('CREDENCIAL_POSTGRES');
  const client = criarClient({ host: '127.0.0.1', port: 5432, database: 'inventario_nr33_multitenant_dev',
    user: 'nr33_dev_app', password: senha, connectionTimeoutMillis: 5000, query_timeout: 10000,
    options: '-c search_path=pg_catalog,public', ssl: false });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '5s'");
    const { rows: [r] } = await client.query(`SELECT current_database() AS banco, current_user AS papel,
      current_setting('server_version_num')::int / 10000 AS versao`);
    if (r?.banco !== 'inventario_nr33_multitenant_dev' || r.papel !== 'nr33_dev_app' || r.versao !== 17) throw Error('DESTINO_POSTGRES');
    const { rows: [fila] } = await client.query(`SELECT EXISTS(SELECT 1 FROM public.recuperacao_envio
      WHERE concluido_em IS NULL AND tentativas < 3
        AND criado_em > clock_timestamp() - INTERVAL '30 minutes') AS pendente`);
    // Não deixar a partida enviar automaticamente trabalho preexistente.
    if (fila?.pendente !== false) throw Error('FILA_PENDENTE');
    await client.query('COMMIT');
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {});
    const codigo = erro.code === '28P01' ? 'CREDENCIAL_POSTGRES' :
      ['42P01', '42703', '42501'].includes(erro.code) ? 'MIGRATION024_OU_PERMISSOES' :
        ['DESTINO_POSTGRES', 'FILA_PENDENTE', 'CREDENCIAL_POSTGRES'].includes(erro.message) ? erro.message : 'POSTGRES_INDISPONIVEL';
    throw Error(codigo);
  } finally { await client.end().catch(() => {}); }
}
async function principal() {
  let texto = '', entrada;
  try {
    if (process.stdin.isTTY || process.argv.length !== 2) throw Error('CANAL_PRIVADO');
    process.stdin.setEncoding('utf8');
    for await (const parte of process.stdin) { texto += parte; if (texto.length > 32768) throw Error('CANAL_PRIVADO'); }
    entrada = JSON.parse(texto);
    await verificar(entrada.senha);
  } finally { texto = null; if (entrada) entrada.senha = null; }
}
if (require.main === module) principal().catch(erro => {
  const permitidos = ['CREDENCIAL_POSTGRES', 'DESTINO_POSTGRES', 'FILA_PENDENTE', 'MIGRATION024_OU_PERMISSOES', 'POSTGRES_INDISPONIVEL'];
  process.stderr.write(permitidos.includes(erro.message) ? erro.message : 'CANAL_PRIVADO');
  process.exitCode = 1;
});
module.exports = { verificar };
