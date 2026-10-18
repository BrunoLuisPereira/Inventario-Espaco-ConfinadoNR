const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

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
  if (typeof caminhoArquivo !== "string" || !caminhoArquivo || caminhoArquivo.includes("\0")) {
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
    caminhoRelativo === "" ||
    caminhoRelativo === ".." ||
    caminhoRelativo.startsWith(`..${path.sep}`) ||
    path.isAbsolute(caminhoRelativo) ||
    (process.platform === "win32" && caminhoRelativo.includes(":"));

  if (foraDaPasta) {
    console.error(
      "Tentativa de remover arquivo fora da pasta de evidências:",
      "Caminho rejeitado."
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
      "Não foi possível remover arquivo de evidência."
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

function validarUpload(file) {
  const invalido = () => Object.assign(new Error("Arquivo inválido. Use JPG, PNG ou PDF com conteúdo compatível."), { statusCode: 400 });
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || file.buffer.length > 10 * 1024 * 1024 || typeof file.originalname !== "string") throw invalido();
  const extensao = path.extname(file.originalname).toLowerCase();
  const b = file.buffer;
  const jpeg = file.mimetype === "image/jpeg" && [".jpg", ".jpeg"].includes(extensao) &&
    b.length >= 4 && b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) && b.subarray(-2).equals(Buffer.from([0xff, 0xd9]));
  const png = file.mimetype === "image/png" && extensao === ".png" && b.length >= 20 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    b.subarray(-12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]));
  const pdf = file.mimetype === "application/pdf" && extensao === ".pdf" &&
    b.subarray(0, 5).toString("ascii") === "%PDF-" && /%%EOF\s*$/.test(b.subarray(-1024).toString("latin1"));
  if (!jpeg && !png && !pdf) throw invalido();
  return { extensao: jpeg ? ".jpg" : png ? ".png" : ".pdf", tipo: pdf ? "DOCUMENTO" : "FOTO" };
}

async function persistirUploadAutorizado(file, usuario, idLocal) {
  const formato = validarUpload(file);
  if (!/^[0-9a-f-]{36}$/i.test(usuario?.id_ambiente) || !Number.isSafeInteger(idLocal) || idLocal <= 0) {
    throw Object.assign(new Error("Contexto do arquivo inválido."), { statusCode: 400 });
  }
  const identidade = (stat) => {
    if (stat.dev == null || stat.ino == null) throw new Error("Identidade física indisponível.");
    return `${stat.dev}:${stat.ino}`;
  };
  const mesmoCaminho = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
  // bigint evita arredondar IDs de arquivo NTFS. Não usa mtime de diretórios:
  // outro upload legítimo pode alterá-lo sem substituir o diretório.
  async function verificarPastas(esperadas) {
    const atuais = [];
    for (const pasta of [path.dirname(pastaEvidencias), pastaEvidencias]) {
      const stat = await fs.promises.lstat(pasta, { bigint: true });
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Diretório de armazenamento inválido.");
      atuais.push(identidade(stat));
    }
    const real = await fs.promises.realpath(pastaEvidencias);
    if (!mesmoCaminho(real, pastaEvidencias) || (esperadas && atuais.some((id, i) => id !== esperadas[i]))) {
      throw new Error("Diretório de armazenamento alterado.");
    }
    return atuais;
  }
  // Usa apenas a pasta existente: não migra nem reorganiza arquivos legados.
  const pastas = await verificarPastas();
  const nome = `${usuario.id_ambiente}_${idLocal}_${randomUUID()}${formato.extensao}`;
  const destino = path.join(pastaEvidencias, nome);
  const handle = await fs.promises.open(destino, "wx", 0o600);
  let falha;
  async function verificarArquivo() {
    await verificarPastas(pastas);
    const aberto = await handle.stat({ bigint: true });
    const atual = await fs.promises.lstat(destino, { bigint: true });
    const real = await fs.promises.realpath(destino);
    if (!aberto.isFile() || !atual.isFile() || atual.isSymbolicLink() ||
      String(aberto.nlink) !== "1" || String(atual.nlink) !== "1" ||
      identidade(aberto) !== identidade(atual) || !mesmoCaminho(real, destino)) {
      throw new Error("Arquivo de armazenamento alterado.");
    }
  }
  try {
    await verificarArquivo();
    await handle.writeFile(file.buffer);
    await handle.sync();
    await verificarArquivo();
  } catch (erro) {
    falha = erro;
    throw erro;
  } finally {
    try { await handle.close(); }
    catch (erro) { if (!falha) throw erro; }
  }
  // Ainda não é openat()/dirfd: permissões do SO e homologação são necessárias
  // contra um agente capaz de trocar diretórios entre estas verificações.
  // Nunca tenta unlink depois de falha: o caminho pode ter sido substituído.
  return { caminho_arquivo: `uploads/evidencias/${nome}` };
}

module.exports = {
  validarUpload,
  persistirUploadAutorizado,
  obterCaminhoCompleto,
  removerArquivo,
  removerArquivos,
};
