
const cadastroService = require("../services/cadastroService");

/**
 * POST /api/cadastro/ambiente
 *
 * Realiza o cadastro público de um ambiente
 * e de seu administrador inicial.
 *
 * IMPORTANTE:
 * Esta funcionalidade depende da migração 020.
 * Não registrar a rota antes da homologação.
 */
async function cadastrarAmbiente(req, res) {
  try {
    const resultado =
      await cadastroService.cadastrarAmbiente(
        req.body || {}
      );

    return res.status(201).json({
      status: "success",
      message:
        "Ambiente e administrador cadastrados com sucesso.",
      data: resultado,
    });
  } catch (erro) {
    console.error(
      "Erro ao cadastrar ambiente:",
      erro
    );

    if (erro.code === "23505") {
      return res.status(409).json({
        status: "error",
        message:
          "Já existe um usuário com este e-mail.",
      });
    }

    return res.status(
      erro.statusCode || 500
    ).json({
      status: "error",
      message: erro.statusCode
        ? erro.message
        : "Erro interno ao cadastrar ambiente.",
    });
  }
}

module.exports = {
  cadastrarAmbiente,
};
