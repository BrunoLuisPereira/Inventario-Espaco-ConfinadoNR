// Formato exclusivo do cofre JWT local: 48 bytes / 384 bits, Base64 canonico.
function jwtValido(valor) {
  if (typeof valor !== 'string' || !/^[A-Za-z0-9+/]{64}$/.test(valor)) return false;
  const bytes = Buffer.from(valor, 'base64');
  try { return bytes.length === 48 && bytes.toString('base64') === valor; }
  finally { bytes.fill(0); }
}
module.exports = { jwtValido };
