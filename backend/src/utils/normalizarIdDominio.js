/** Normaliza somente IDs positivos de domínio; não altera registros ou parsers. */
function normalizarIdDominio(valor) {
  if (typeof valor === "string") {
    // O teste de whitespace também impede o terminador de linha aceito por $.
    if (!/^[1-9][0-9]*$/.test(valor) || /\s/.test(valor)) {
      throw new TypeError("Identificador inválido.");
    }
    const limite = String(Number.MAX_SAFE_INTEGER);
    if (valor.length > limite.length || (valor.length === limite.length && valor > limite)) {
      throw new RangeError("Identificador fora da faixa segura.");
    }
    valor = Number(valor);
  }
  if (typeof valor !== "number" || !Number.isSafeInteger(valor) || valor <= 0) {
    throw new TypeError("Identificador inválido.");
  }
  return valor;
}

module.exports = normalizarIdDominio;
