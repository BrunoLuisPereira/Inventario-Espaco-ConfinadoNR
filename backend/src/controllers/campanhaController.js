const campanhaService = require("../services/campanhaService");

async function criar(req, res) {
  try {
    const campanha = await campanhaService.criarCampanha(
      req.body,
      req.usuario
    );

    return res.status(201).json({
      status: "success",
      message: "Campanha criada com sucesso.",
      data: campanha,
    });
  } catch (error) {
    console.error("Erro ao criar campanha:", error);

    return res.status(error.statusCode || 500).json({
      status: "error",
      message:
        error.statusCode
          ? error.message
          : "Erro interno ao criar campanha.",
    });
  }
}

async function listar(req, res) {
  try {
    const campanhas = await campanhaService.listarCampanhas();

    return res.status(200).json({
      status: "success",
      total: campanhas.length,
      data: campanhas,
    });
  } catch (error) {
    console.error("Erro ao listar campanhas:", error);

    return res.status(500).json({
      status: "error",
      message: "Erro interno ao listar campanhas.",
    });
  }
}

async function buscarPorId(req, res) {
  try {
    const campanha = await campanhaService.buscarCampanhaPorId(
      req.params.id
    );

    return res.status(200).json({
      status: "success",
      data: campanha,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: "error",
      message:
        error.statusCode
          ? error.message
          : "Erro interno ao buscar campanha.",
    });
  }
}
async function atualizar(req, res) {
  try {
    const campanha = await campanhaService.atualizarCampanha(
      req.params.id,
      req.body,
      req.usuario
    );

    return res.status(200).json({
      status: "success",
      message: "Campanha atualizada com sucesso.",
      data: campanha,
    });
  } catch (error) {
    console.error("Erro ao atualizar campanha:", error);

    return res.status(error.statusCode || 500).json({
      status: "error",
      message:
        error.statusCode
          ? error.message
          : "Erro interno ao atualizar campanha.",
    });
  }
}

async function alterarStatus(req, res) {
  try {
    const campanha =
      await campanhaService.alterarStatusCampanha(
        req.params.id,
        req.body,
        req.usuario
      );

    return res.status(200).json({
      status: "success",
      message: "Status da campanha atualizado com sucesso.",
      data: campanha,
    });
  } catch (error) {
    console.error(
      "Erro ao alterar status da campanha:",
      error
    );

    return res.status(error.statusCode || 500).json({
      status: "error",
      message:
        error.statusCode
          ? error.message
          : "Erro interno ao alterar status da campanha.",
    });
  }
}
module.exports = {
  criar,
  listar,
  buscarPorId,
  atualizar,
  alterarStatus,
};