const fs = require("fs");
const path = require("path");

const evidenciaRepository = require("../repositories/evidenciaRepository");
const localRepository = require("../repositories/localRepository");
const campanhaRepository = require("../repositories/campanhaRepository");

const TIPOS_VALIDOS = ["FOTO", "TEXTO", "DOCUMENTO"];


/**
 * Verifica se o usuário autenticado possui permissão
 * para alterar evidências de determinado local.
 *
 * Administrador: pode alterar qualquer evidência.
 * Engenheiro: somente evidências de locais pertencentes
 * às campanhas pelas quais ele é responsável.
 */
async function validarPermissaoLocal(
  idLocal,
  usuarioAutenticado
) {
  const local = await localRepository.buscarPorId(idLocal);

  if (!local) {
    const erro = new Error("Local não encontrado.");
    erro.statusCode = 404;
    throw erro;
  }

  const campanha = await campanhaRepository.buscarPorId(
    local.id_campanha
  );

  if (!campanha) {
    const erro = new Error("Campanha não encontrada.");
    erro.statusCode = 404;
    throw erro;
  }

  const ehAdministrador =
    usuarioAutenticado.perfil_acesso === "ADMINISTRADOR";

  const ehResponsavel =
    Number(campanha.id_usuario) ===
    Number(usuarioAutenticado.id_usuario);

  if (!ehAdministrador && !ehResponsavel) {
    const erro = new Error(
      "Você não possui permissão para alterar evidências deste local."
    );

    erro.statusCode = 403;
    throw erro;
  }

  return local;
}


/**
 * Cria uma nova evidência.
 */
async function criarEvidencia(
  dados,
  usuarioAutenticado
) {
  const {
    id_local,
    tipo,
    caminho_arquivo,
    descricao,
  } = dados;

  if (!id_local) {
    const erro = new Error(
      "O campo id_local é obrigatório."
    );

    erro.statusCode = 400;
    throw erro;
  }

  if (!TIPOS_VALIDOS.includes(tipo)) {
    const erro = new Error(
      "Tipo inválido. Use FOTO, TEXTO ou DOCUMENTO."
    );

    erro.statusCode = 400;
    throw erro;
  }

  await validarPermissaoLocal(
    id_local,
    usuarioAutenticado
  );

  return evidenciaRepository.criar({
    id_local,
    tipo,
    caminho_arquivo,
    descricao,
    id_usuario: usuarioAutenticado.id_usuario,
  });
}


/**
 * Lista todas as evidências.
 */
async function listarEvidencias() {
  return evidenciaRepository.listarTodos();
}


/**
 * Busca uma evidência pelo ID.
 */
async function buscarEvidenciaPorId(idEvidencia) {
  const id = Number(idEvidencia);

  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error(
      "ID da evidência inválido."
    );

    erro.statusCode = 400;
    throw erro;
  }

  const evidencia =
    await evidenciaRepository.buscarPorId(id);

  if (!evidencia) {
    const erro = new Error(
      "Evidência não encontrada."
    );

    erro.statusCode = 404;
    throw erro;
  }

  return evidencia;
}


/**
 * Lista todas as evidências de determinado local.
 */
async function listarEvidenciasPorLocal(idLocal) {
  const id = Number(idLocal);

  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error(
      "ID do local inválido."
    );

    erro.statusCode = 400;
    throw erro;
  }

  const local = await localRepository.buscarPorId(id);

  if (!local) {
    const erro = new Error(
      "Local não encontrado."
    );

    erro.statusCode = 404;
    throw erro;
  }

  return evidenciaRepository.listarPorLocal(id);
}


/**
 * Atualiza uma evidência.
 */
async function atualizarEvidencia(
  idEvidencia,
  dados,
  usuarioAutenticado
) {
  const id = Number(idEvidencia);

  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error(
      "ID da evidência inválido."
    );

    erro.statusCode = 400;
    throw erro;
  }

  const evidencia =
    await evidenciaRepository.buscarPorId(id);

  if (!evidencia) {
    const erro = new Error(
      "Evidência não encontrada."
    );

    erro.statusCode = 404;
    throw erro;
  }

  await validarPermissaoLocal(
    evidencia.id_local,
    usuarioAutenticado
  );

  const tipo =
    dados.tipo ?? evidencia.tipo;

  const caminho_arquivo =
    dados.caminho_arquivo ??
    evidencia.caminho_arquivo;

  const descricao =
    dados.descricao ??
    evidencia.descricao;

  if (!TIPOS_VALIDOS.includes(tipo)) {
    const erro = new Error(
      "Tipo inválido. Use FOTO, TEXTO ou DOCUMENTO."
    );

    erro.statusCode = 400;
    throw erro;
  }

  return evidenciaRepository.atualizar(
    id,
    {
      tipo,
      caminho_arquivo,
      descricao,
    }
  );
}


/**
 * Exclui uma evidência.
 *
 * Além de remover o registro do PostgreSQL,
 * também remove o arquivo físico armazenado
 * em uploads/evidencias, quando existir.
 */
async function excluirEvidencia(
  idEvidencia,
  usuarioAutenticado
) {
  const id = Number(idEvidencia);

  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error(
      "ID da evidência inválido."
    );

    erro.statusCode = 400;
    throw erro;
  }

  const evidencia =
    await evidenciaRepository.buscarPorId(id);

  if (!evidencia) {
    const erro = new Error(
      "Evidência não encontrada."
    );

    erro.statusCode = 404;
    throw erro;
  }

  // Verifica se o usuário possui permissão
  await validarPermissaoLocal(
    evidencia.id_local,
    usuarioAutenticado
  );

  // Primeiro remove o registro do banco
  const evidenciaExcluida =
    await evidenciaRepository.excluir(id);

  /*
   * Se a evidência possuir um arquivo físico,
   * tenta removê-lo da pasta uploads.
   */
  if (evidencia.caminho_arquivo) {
    const caminhoCompleto = path.join(
      __dirname,
      "../../",
      evidencia.caminho_arquivo
    );

    if (fs.existsSync(caminhoCompleto)) {
      fs.unlinkSync(caminhoCompleto);
    }
  }

  return evidenciaExcluida;
}


module.exports = {
  criarEvidencia,
  listarEvidencias,
  buscarEvidenciaPorId,
  listarEvidenciasPorLocal,
  atualizarEvidencia,
  excluirEvidencia,
};