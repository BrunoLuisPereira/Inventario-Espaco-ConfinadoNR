const LIMITES_TEXTOS = Object.freeze({
  codigo_identificacao: 150,
  dimensoes_aberturas: 5000,
  formas_acesso: 5000,
  geometria: 2000,
  utilizacao_produto: 5000,
  perigos_antes_liberacao: 5000,
});
const CAMPOS = Object.freeze(['codigo_identificacao', 'volume_m3', 'quantidade_aberturas',
  'dimensoes_aberturas', 'formas_acesso', 'geometria', 'utilizacao_produto', 'perigos_antes_liberacao']);

function invalido(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

// Ausência preserva o valor; null ou texto vazio expressam limpeza explícita.
function selecionarCaracterizacao(dados) {
  const resultado = {};
  for (const campo of CAMPOS) {
    if (!Object.hasOwn(dados, campo) || dados[campo] === undefined) continue;
    const valor = dados[campo];
    if (valor === null || typeof valor === 'string' && !valor.trim()) {
      resultado[campo] = null;
    } else if (Object.hasOwn(LIMITES_TEXTOS, campo)) {
      if (typeof valor !== 'string') throw invalido(`O campo ${campo} deve ser um texto.`);
      const texto = valor.trim();
      if ([...texto].length > LIMITES_TEXTOS[campo]) {
        throw invalido(`O campo ${campo} deve ter no máximo ${LIMITES_TEXTOS[campo]} caracteres.`);
      }
      resultado[campo] = texto;
    } else {
      if (!['number', 'string'].includes(typeof valor) || !Number.isFinite(Number(valor))) {
        throw invalido(`O campo ${campo} deve ser um número válido.`);
      }
      const texto = String(valor).trim();
      if (campo === 'volume_m3') {
        // Evita arredondamento silencioso do NUMERIC(18,6), inclusive para zero.
        if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(texto) || Number(texto) <= 0) {
          throw invalido('O volume deve ser maior que zero, com até 12 dígitos inteiros e 6 casas decimais.');
        }
        resultado[campo] = texto;
      } else {
        if (!/^\d+$/.test(texto) || !Number.isInteger(Number(texto)) || Number(texto) > 2147483647) {
          throw invalido('A quantidade de aberturas deve ser um inteiro entre 0 e 2147483647.');
        }
        resultado[campo] = Number(texto);
      }
    }
  }
  return resultado;
}

module.exports = { CAMPOS, LIMITES_TEXTOS, selecionarCaracterizacao };
