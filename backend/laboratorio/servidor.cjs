const { execFileSync } = require('node:child_process');
const { validarAmbiente, validarContainer } = require('./config.cjs');
async function iniciar() {
  // Nenhum modulo que importe pool e carregado antes da prova de destino.
  const d = validarAmbiente(process.env);
  if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw Error('Override de Docker proibido.');
  const endpoint = execFileSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { encoding: 'utf8', windowsHide: true }).trim();
  if (!['npipe:////./pipe/dockerDesktopLinuxEngine', 'npipe:////./pipe/docker_engine'].includes(endpoint)) throw Error('Docker local nao comprovado.');
  const formato = '{"labels":{{json .Config.Labels}},"ports":{{json .HostConfig.PortBindings}},"image":{{json .Config.Image}},"running":{{json .State.Running}},"mounts":{{json .Mounts}}}';
  validarContainer(d, JSON.parse(execFileSync('docker', ['inspect', '--format', formato, d.container], { encoding: 'utf8', windowsHide: true })));
  const pool = require('../src/config/database');
  let server;
  const encerrar = async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
  };
  try {
    const r = await pool.query(`SELECT current_database() AS banco, current_user AS papel,
      to_regclass('public.ambiente') IS NOT NULL AS ambiente,
      to_regclass('public.convite') IS NOT NULL AS convite,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_campanha_usuario_ambiente') AS vinculo,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_versao_entidade' AND array_length(conkey, 1) = 3) AS versao`);
    const s = r.rows[0];
    if (s?.banco !== d.banco || s.papel !== d.papel || !s.ambiente || !s.convite || !s.vinculo || !s.versao) throw Error('Esquema de laboratorio incompleto.');
    const { criarApp } = require('./app.cjs');
    server = criarApp(d.banco).listen(d.portaHTTP, d.host);
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    console.log(`${d.persistente ? 'DESENVOLVIMENTO ISOLADO' : 'LABORATORIO DESCARTAVEL'}: http://${d.host}:${d.portaHTTP} — ${d.banco}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { encerrar().catch(() => { process.exitCode = 1; }); });
  } catch {
    await encerrar();
    throw Error('Inicio do laboratorio recusado. Confira destino, container e esquema aprovado.');
  }
}
if (require.main === module) iniciar().catch(() => { console.error('Laboratorio nao iniciado; configuracao ou esquema invalido.'); process.exitCode = 1; });
module.exports = { iniciar };
