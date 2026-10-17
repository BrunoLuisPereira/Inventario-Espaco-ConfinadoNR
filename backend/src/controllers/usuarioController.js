const usuarioService = require("../services/usuarioService");

/**
 * POST /api/usuarios
 */
async function criar(req, res) {
  try {
    const usuario = await usuarioService.criarUsuario(req.body);

    if (res.headersSent) return res;

    return res.status(201).json({
      status: "success",
      message: "Usuário cadastrado com sucesso.",
      data: usuario,
    });
  } catch (error) {
    if (res.headersSent) return res;

    const statusCode = error?.code === "23505"
      ? 409
      : Number.isInteger(error?.statusCode) &&
        error.statusCode >= 400 && error.statusCode <= 599
        ? error.statusCode
        : 500;

    console.error("Erro ao cadastrar usuário.", { statusCode });

    // Código específico do PostgreSQL para violação de UNIQUE.
    if (error?.code === "23505") {
      return res.status(409).json({
        status: "error",
        message: "Já existe um usuário com este e-mail.",
      });
    }

    return res.status(statusCode).json({
      status: "error",
      message:
        statusCode < 500 && typeof error?.message === "string" && error.message
          ? error.message
          : "Erro interno ao cadastrar usuário.",
    });
  }
}
async function listar(req, res) {
  try {
    const usuarios = await usuarioService.listarUsuarios(req.usuario);

    if (res.headersSent) return res;

    return res.status(200).json({
      status: "success",
      total: usuarios.length,
      data: usuarios,
    });
  } catch (error) {
    if (res.headersSent) return res;

    const statusCode = error?.statusCode === 401 || error?.statusCode === 403
      ? error.statusCode
      : 500;

    console.error("Erro ao listar usuários.", { statusCode });

    return res.status(statusCode).json({
      status: "error",
      message: statusCode < 500 && typeof error?.message === "string" && error.message
        ? error.message
        : "Erro interno ao listar usuários.",
    });
  }
}

async function buscarPorId(req, res) {
  try {
    const usuario = await usuarioService.buscarUsuarioPorId(
      req.params.id,
      req.usuario
    );

    if (res.headersSent) return res;

    return res.status(200).json({
      status: "success",
      data: usuario,
    });
  } catch (error) {
    if (res.headersSent) return res;

    const statusCode =
      Number.isInteger(error?.statusCode) &&
      error.statusCode >= 400 && error.statusCode <= 599
        ? error.statusCode
        : 500;

    console.error("Erro ao buscar usuário.", { statusCode });

    return res.status(statusCode).json({
      status: "error",
      message:
        statusCode < 500 && typeof error?.message === "string" && error.message
          ? error.message
          : "Erro interno ao buscar usuário.",
    });
  }
}

async function atualizar(req, res) {
  try {
    const usuario = await usuarioService.atualizarUsuario(
      req.params.id,
      req.body
    );

    if (res.headersSent) return res;

    return res.status(200).json({
      status: "success",
      message: "Usuário atualizado com sucesso.",
      data: usuario,
    });
  } catch (error) {
    if (res.headersSent) return res;

    const statusCode = error?.code === "23505"
      ? 409
      : Number.isInteger(error?.statusCode) &&
        error.statusCode >= 400 && error.statusCode <= 599
        ? error.statusCode
        : 500;

    console.error("Erro ao atualizar usuário.", { statusCode });

    if (error?.code === "23505") {
      return res.status(409).json({
        status: "error",
        message: "Já existe outro usuário com este e-mail.",
      });
    }

    return res.status(statusCode).json({
      status: "error",
      message:
        statusCode < 500 && typeof error?.message === "string" && error.message
          ? error.message
          : "Erro interno ao atualizar usuário.",
    });
  }
}

async function alterarStatus(req, res) {
  try {
    const usuario =
      await usuarioService.alterarStatusUsuario(
        req.params.id,
        req.body
      );

    if (res.headersSent) return res;

    return res.status(200).json({
      status: "success",
      message: usuario.ativo
        ? "Usuário ativado com sucesso."
        : "Usuário desativado com sucesso.",
      data: usuario,
    });
  } catch (error) {
    if (res.headersSent) return res;

    const statusCode =
      Number.isInteger(error?.statusCode) &&
      error.statusCode >= 400 && error.statusCode <= 599
        ? error.statusCode
        : 500;

    console.error("Erro ao alterar status do usuário.", { statusCode });

    return res.status(statusCode).json({
      status: "error",
      message:
        statusCode < 500 && typeof error?.message === "string" && error.message
          ? error.message
          : "Erro interno ao alterar status do usuário.",
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
