const fs = require("fs");
const path = require("path");

const pastaEvidencias = path.resolve(
  __dirname,
  "../../uploads/evidencias"
);

/**
 * Converte o caminho relativo salvo no banco
 * para um caminho absoluto seguro.
 *
 * Exemplo salvo no banco:
 * uploads/evidencias/arquivo.jpg
 */
function obterCaminhoCompleto(caminhoArquivo) {
  if (!caminhoArquivo) {
    return null;
  }

  const caminhoCompleto = path.resolve(
    __dirname,
    "../../",
    caminhoArquivo
  );

  /*
   * Proteção para impedir que um caminho armazenado
   * indevidamente no banco permita apagar arquivos
   * fora de uploads/evidencias.
   */
  const caminhoRelativo = path.relative(
    pastaEvidencias,
    caminhoCompleto
  );

  const foraDaPasta =
    caminhoRelativo.startsWith("..") ||
    path.isAbsolute(caminhoRelativo);

  if (foraDaPasta) {
    console.error(
      "Tentativa de remover arquivo fora da pasta de evidências:",
      caminhoArquivo
    );

    return null;
  }

  return caminhoCompleto;
}

/**
 * Remove um único arquivo físico de evidência.
 *
 * A ausência do arquivo não é considerada erro,
 * pois o objetivo final já está satisfeito.
 */
async function removerArquivo(caminhoArquivo) {
  const caminhoCompleto =
    obterCaminhoCompleto(caminhoArquivo);

  if (!caminhoCompleto) {
    return false;
  }

  try {
    await fs.promises.unlink(caminhoCompleto);

    return true;
  } catch (erro) {
    if (erro.code === "ENOENT") {
      return false;
    }

    console.error(
      `Erro ao remover arquivo de evidência ${caminhoArquivo}:`,
      erro
    );

    return false;
  }
}

/**
 * Remove vários arquivos físicos.
 *
 * Esta função não lança erro quando um arquivo
 * individual não pode ser removido.
 *
 * Isso é importante porque ela poderá ser executada
 * depois do COMMIT da transação PostgreSQL.
 */
async function removerArquivos(caminhosArquivos = []) {
  const caminhosValidos = [
    ...new Set(
      caminhosArquivos.filter(Boolean)
    ),
  ];

  const resultado = {
    total: caminhosValidos.length,
    removidos: 0,
    naoRemovidos: 0,
  };

  for (const caminhoArquivo of caminhosValidos) {
    const removido =
      await removerArquivo(caminhoArquivo);

    if (removido) {
      resultado.removidos += 1;
    } else {
      resultado.naoRemovidos += 1;
    }
  }

  return resultado;
}

module.exports = {
  obterCaminhoCompleto,
  removerArquivo,
  removerArquivos,
};