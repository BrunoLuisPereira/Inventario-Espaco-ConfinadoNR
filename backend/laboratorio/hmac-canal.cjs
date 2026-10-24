// Canal privado entre processos. Nunca invocar para exibir uma chave no terminal.
const { randomBytes } = require('node:crypto');
const { hmacValido } = require('../src/utils/loginHmac');
function gerar(aleatorio = randomBytes) {
  const bytes = aleatorio(32);
  try { return bytes.toString('base64'); } finally { bytes.fill(0); }
}
if (require.main === module) {
  const modo = process.argv[2];
  if (process.env.NR33_HMAC_CANAL_INTERNO !== 'PASSO28_PIPE' || process.stdout.isTTY ||
      process.stdin.isTTY || process.argv.length !== 3 || !['gerar','validar'].includes(modo)) {
    process.stderr.write('Canal HMAC privado obrigatorio.\n');
    process.exitCode = 1;
  } else if (modo === 'gerar') {
    try { process.stdout.write(gerar()); }
    catch { process.stderr.write('Geracao HMAC recusada.\n'); process.exitCode = 1; }
  } else {
    let entrada = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', parte => {
      if (entrada.length + parte.length > 64) { entrada = ''; process.exit(1); }
      entrada += parte;
    });
    process.stdin.on('end', () => {
      const valido = hmacValido(entrada); entrada = '';
      process.stdout.write(JSON.stringify({ formatoValido: valido }));
      process.exitCode = valido ? 0 : 1;
    });
  }
}
module.exports = { gerar };
