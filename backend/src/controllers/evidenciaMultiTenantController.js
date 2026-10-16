const evidenciaService = require("../services/evidenciaMultiTenantService");

// Não registrar nas rotas antes da homologação multi-tenant.
// Este controller trata somente registros, sem operações físicas de arquivos.
function responderErro(res, error, mensagemInterna) {
  if (res.headersSent) return res;

  const erroDeAplicacao = [400, 401, 403, 404, 409].includes(error?.statusCode);
  const statusCode = erroDeAplicacao ? error.statusCode : 500;
  let message = mensagemInterna;
  if (statusCode === 409) {
    // Tanto idempotência quanto CONFLITO_GPS têm uma resposta pública segura.
    message = "Não foi possível concluir a operação devido a um conflito. Recarregue os dados e tente novamente.";
  } else if (erroDeAplicacao) {
    message = typeof error.message === "string"
      ? error.message : "Não foi possível processar a solicitação.";
  }

  return res.status(statusCode).json({
    status: "error",
    message,
  });
}

async function criar(req, res) {
  try {
    const resultado = await evidenciaService.criarEvidencia(
      req.body,
      req.usuario,
      { incluirResultadoCriacao: true }
    );
    if (
      resultado === null || typeof resultado !== "object" || Array.isArray(resultado) ||
      resultado.evidencia === null || typeof resultado.evidencia !== "object" ||
      Array.isArray(resultado.evidencia) ||
      (resultado.criada !== true && resultado.criada !== false)
    ) {
      throw new Error("Resultado de criação inválido.");
    }

    return res.status(resultado.criada === true ? 201 : 200).json({
      status: "success",
      message: resultado.criada === true
        ? "Evidência criada com sucesso."
        : "Evidência existente retornada com sucesso.",
      data: resultado.evidencia,
    });
  } catch (error) {
    return responderErro(res, error, "Erro interno ao criar evidência.");
  }
}

async function listar(req, res) {
  try {
    const evidencias = await evidenciaService.listarEvidencias(req.usuario);

    return res.status(200).json({
      status: "success",
      total: evidencias.length,
      data: evidencias,
    });
  } catch (error) {
    return responderErro(res, error, "Erro interno ao listar evidências.");
  }
}

async function buscarPorId(req, res) {
  try {
    const evidencia = await evidenciaService.buscarEvidenciaPorId(
      req.params.id,
      req.usuario
    );

    return res.status(200).json({
      status: "success",
      data: evidencia,
    });
  } catch (error) {
    return responderErro(res, error, "Erro interno ao buscar evidência.");
  }
}

async function listarPorLocal(req, res) {
  try {
    const evidencias = await evidenciaService.listarEvidenciasPorLocal(
      req.params.idLocal,
      req.usuario
    );

    return res.status(200).json({
      status: "success",
      total: evidencias.length,
      data: evidencias,
    });
  } catch (error) {
    return responderErro(res, error, "Erro interno ao listar evidências do local.");
  }
}

async function atualizar(req, res) {
  try {
    const evidencia = await evidenciaService.atualizarEvidencia(
      req.params.id,
      req.body,
      req.usuario
    );

    return res.status(200).json({
      status: "success",
      message: "Evidência atualizada com sucesso.",
      data: evidencia,
    });
  } catch (error) {
    return responderErro(res, error, "Erro interno ao atualizar evidência.");
  }
}

async function excluir(req, res) {
  try {
    const evidencia = await evidenciaService.excluirEvidencia(
      req.params.id,
      req.usuario
    );

    return res.status(200).json({
      status: "success",
      message: "Evidência excluída com sucesso.",
      data: evidencia,
    });
  } catch (error) {
    return responderErro(res, error, "Erro interno ao excluir evidência.");
  }
}

module.exports = {
  criar,
  listar,
  buscarPorId,
  listarPorLocal,
  atualizar,
  excluir,
};
