const { executar } = require('./migrar-recuperacao-024.cjs');
async function receber(texto, aplicar = executar) {
  let entrada, env;
  try {
    if (typeof texto !== 'string' || texto.length > 16384) throw Error();
    entrada = JSON.parse(texto);
    if (entrada.banco !== 'inventario_nr33_multitenant_dev' || entrada.operador !== 'postgres' ||
        typeof entrada.senha !== 'string' || !entrada.senha || entrada.senha.length > 4096 ||
        entrada.confirmacao !== 'APLICAR 024 inventario_nr33_multitenant_dev') throw Error();
    env = { NR33_MIGRACAO_024_USER: entrada.operador, NR33_MIGRACAO_024_PASSWORD: entrada.senha };
    return await aplicar({ banco: entrada.banco, executar: true, confirmacao: entrada.confirmacao }, { env });
  } catch { throw Error('Operação 024 recusada ou interrompida. Estado pode ser incerto; verificar catálogo antes de repetir.'); }
  finally { if (entrada) entrada.senha = null; if (env) env.NR33_MIGRACAO_024_PASSWORD = null; }
}
async function principal() {
  if (process.stdin.isTTY || process.stdout.isTTY || process.argv.length !== 2) throw Error();
  let texto = '';
  try {
    process.stdin.setEncoding('utf8');
    for await (const parte of process.stdin) { texto += parte; if (texto.length > 16384) throw Error(); }
    await receber(texto);
    process.stdout.write('Migration 024 concluída e pós-condições verificadas.\n');
  } finally { texto = null; }
}
if (require.main === module) principal().catch(() => {
  process.stderr.write('Operação 024 interrompida; verificar catálogo antes de repetir. Detalhes privados omitidos.\n');
  process.exitCode = 1;
});
module.exports = { receber };
