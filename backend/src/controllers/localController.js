const localService = require("../services/localService");

async function criar(req, res) {
  try {
    const local = await localService.criarLocal(
      req.body,
      req.usuario
    );

    return res.status(201).json({
      status: "success",
      message: "Local cadastrado com sucesso.",
      data: local,
    });
  } catch (error) {
    console.error("Erro ao cadastrar local:", error);

    return res.status(error.statusCode || 500).json({
      status: "error",
      message:
        error.statusCode
          ? error.message
          : "Erro interno ao cadastrar local.",
    });
  }
}

async function listar(req, res) {
  try {
    const locais = await localService.listarLocais();

    return res.status(200).json({
      status: "success",
      total: locais.length,
      data: locais,
    });
  } catch (error) {
    console.error("Erro ao listar locais:", error);

    return res.status(500).json({
      status: "error",
      message: "Erro interno ao listar locais.",
    });
  }
}

async function buscarPorId(req, res) {
  try {
    const local = await localService.buscarLocalPorId(
      req.params.id
    );

    return res.status(200).json({
      status: "success",
      data: local,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: "error",
      message:
        error.statusCode
          ? error.message
          : "Erro interno ao buscar local.",
    });
  }
}
async function atualizar(req, res) {
  try {
    const local = await localService.atualizarLocal(
      req.params.id,
      req.body,
      req.usuario
    );

    return res.status(200).json({
      status: "success",
      message: "Local atualizado com sucesso.",
      data: local,
    });
  } catch (error) {
    console.error("Erro ao atualizar local:", error);

    return res.status(error.statusCode || 500).json({
      status: "error",
      message:
        error.statusCode
          ? error.message
          : "Erro interno ao atualizar local.",
    });
  }
}

async function alterarStatus(req, res) {
  try {
    const local = await localService.alterarStatusLocal(
      req.params.id,
      req.body,
      req.usuario
    );

    return res.status(200).json({
      status: "success",
      message: "Status do local atualizado com sucesso.",
      data: local,
    });
  } catch (error) {
    console.error("Erro ao alterar status do local:", error);

    return res.status(error.statusCode || 500).json({
      status: "error",
      message:
        error.statusCode
          ? error.message
          : "Erro interno ao alterar status do local.",
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