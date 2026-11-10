// Mesma ordem UTF-16 de sort() sem comparador, independente de localidade.
// A conversao preserva a ordem textual de IDs numericos, sem ordenar por valor.
function compararLexicograficamente(a, b) {
  const esquerda = String(a), direita = String(b);
  return esquerda < direita ? -1 : esquerda > direita ? 1 : 0;
}

module.exports = { compararLexicograficamente };
