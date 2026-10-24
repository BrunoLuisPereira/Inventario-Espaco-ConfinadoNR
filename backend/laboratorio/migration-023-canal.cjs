// Canal privado via stdin; importar nao le stdin nem carrega o driver PostgreSQL.
const { executar } = require('./migrar-login-023.cjs');
async function receber(texto, executarMigration = executar) {
  let entrada, ambiente;
  try {
    if (typeof texto !== 'string' || texto.length > 16384) throw Error();
    entrada = JSON.parse(texto);
    if (entrada.banco !== 'inventario_nr33_multitenant_dev' || entrada.operador !== 'postgres' ||
        typeof entrada.senha !== 'string' || !entrada.senha || entrada.senha.length > 4096 ||
        entrada.confirmacao !== 'APLICAR 023 inventario_nr33_multitenant_dev') throw Error();
    ambiente = { NR33_MIGRACAO_023_USER: entrada.operador, NR33_MIGRACAO_023_PASSWORD: entrada.senha };
    texto = null;
    return await executarMigration({ banco: entrada.banco, executar: true, confirmacao: entrada.confirmacao },
      { env: ambiente });
  } catch { throw Error('Canal administrativo 023 recusado ou interrompido. Revisar estado antes de repetir.'); }
  finally {
    if (entrada) entrada.senha = null;
    if (ambiente) ambiente.NR33_MIGRACAO_023_PASSWORD = null;
  }
}
async function principal() {
  if (process.stdin.isTTY || process.stdout.isTTY || process.argv.length !== 2) throw Error();
  const mensagem = { texto: '' };
  try {
    process.stdin.setEncoding('utf8');
    for await (const parte of process.stdin) {
      mensagem.texto += parte;
      if (mensagem.texto.length > 16384) throw Error();
    }
    await receber(mensagem.texto);
    process.stdout.write('Migration 023 concluida no destino isolado.\n');
  } finally { mensagem.texto = null; }
}
if (require.main === module) principal().catch(() => {
  process.stderr.write('Operacao 023 recusada ou interrompida. Revisar estado antes de repetir.\n');
  process.exitCode = 1;
});
module.exports = { receber };
