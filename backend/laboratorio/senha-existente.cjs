// Credencial existente é autenticada pelo PostgreSQL, não por política de criação.
function senhaExistenteValida(senha) {
  return typeof senha === 'string' && senha.length > 0 && senha.length <= 4096 && !senha.includes('\0');
}
module.exports = { senhaExistenteValida };
