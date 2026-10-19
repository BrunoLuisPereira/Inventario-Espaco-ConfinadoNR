const { validarAmbienteLocal } = require('./postgresLocal.cjs');
async function iniciar() {
  // Prova de configuracao antes de carregar qualquer driver ou router.
  const d = validarAmbienteLocal(process.env);
  const { Pool } = require('pg');
  const pool = new Pool({ host: d.host, port: d.porta, database: d.banco, user: d.papel,
    password: process.env.DB_PASSWORD, connectionTimeoutMillis: 5000,
    options: '-c search_path=public,pg_catalog' });
  pool.on('error', () => console.error('Falha de conexao do desenvolvimento local.'));
  let server;
  const encerrar = async () => {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await pool.end();
  };
  try {
    const r = await pool.query(`SELECT current_database() AS banco, current_user AS papel,
      current_setting('server_version_num')::int / 10000 AS versao,
      (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public'
       AND table_type='BASE TABLE' AND table_name = ANY($1::text[])) AS tabelas,
      (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
       FROM pg_roles WHERE rolname=current_user) AS privilegiado,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.campanha'::regclass
       AND conname='fk_campanha_usuario_ambiente') AS vinculo,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.versao_entidade'::regclass
       AND conname='uq_versao_entidade' AND array_length(conkey,1)=3) AS versionamento`,
    [['ambiente','convite','usuario','campanha','local','checklist_nr33','dados_tecnicos','evidencia','relatorio','sincronizacao','versao_entidade']]);
    const s = r.rows[0];
    if (s?.banco !== d.banco || s.papel !== d.papel || s.versao !== 17 || s.tabelas !== 11 ||
        s.privilegiado !== false || !s.vinculo || !s.versionamento) throw Error();
    // Routers existentes reutilizam exclusivamente este pool explicitamente configurado.
    const database = require.resolve('../src/config/database');
    require.cache[database] = { id: database, filename: database, loaded: true, exports: pool };
    const { criarApp } = require('./app.cjs');
    server = criarApp(d.banco).listen(d.portaHTTP, d.host);
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    console.log(`DESENVOLVIMENTO LOCAL: http://${d.host}:${d.portaHTTP} — ${d.banco}`);
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => encerrar().catch(() => { process.exitCode=1; }));
  } catch {
    await encerrar();
    throw Error('Inicio local recusado; confira banco novo, papel limitado e esquema PostgreSQL 17.');
  }
}
if (require.main === module) iniciar().catch(() => { console.error('Backend local nao iniciado. Detalhes internos omitidos.'); process.exitCode=1; });
module.exports = { iniciar };
