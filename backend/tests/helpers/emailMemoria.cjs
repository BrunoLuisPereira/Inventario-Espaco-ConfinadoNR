// Exclusivo dos testes. Não é importado pela aplicação nem grava mensagens.
function criarTransporteMemoria() {
  const mensagens = [];
  return { mensagens, async enviar(mensagem) { mensagens.push(structuredClone(mensagem)); } };
}
module.exports = { criarTransporteMemoria };
