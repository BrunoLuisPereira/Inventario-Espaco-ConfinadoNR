// Validação pura: não gera, persiste, imprime ou carrega segredos.
function hmacValido(valor) {
  return typeof valor === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(valor) &&
    Buffer.from(valor, 'base64').length === 32 &&
    Buffer.from(valor, 'base64').toString('base64') === valor;
}
module.exports = { hmacValido };
