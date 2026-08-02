const usuarioService = require("../services/usuarioService");

/**
 * POST /api/usuarios
 */
async function criar(req, res) {
  try {
    const usuario = await usuarioService.criarUsuario(req.body);

    return res.status(201).json({
      status: "success",
      message: "Usuário cadastrado com sucesso.",
      data: usuario,
    });
  } catch (error) {
    console.error("Erro ao cadastrar usuário:", error);

    // Código específico do PostgreSQL para violação de UNIQUE.
    if (error.code === "23505") {
      return res.status(409).json({
        status: "error",
        message: "Já existe um usuário com este e-mail.",
      });
    }

    return res.status(error.statusCode || 500).json({
      status: "error",
      message:
        error.statusCode
          ? error.message
          : "Erro interno ao cadastrar usuário.",
    });
  }
}
async function listar(req, res) {
  try {
    const usuarios = await usuarioService.listarUsuarios();

    return res.status(200).json({
      status: "success",
      total: usuarios.length,
      data: usuarios,
    });
  } catch (error) {
    console.error("Erro ao listar usuários:", error);

    return res.status(500).json({
      status: "error",
      message: "Erro interno ao listar usuários.",
    });
  }
}

async function buscarPorId(req, res) {
  try {
    const usuario = await usuarioService.buscarUsuarioPorId(
      req.params.id
    );

    return res.status(200).json({
      status: "success",
      data: usuario,
    });
  } catch (error) {
    console.error("Erro ao buscar usuário:", error);

    return res.status(error.statusCode || 500).json({
      status: "error",
      message:
        error.statusCode
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

    return res.status(200).json({
      status: "success",
      message: "Usuário atualizado com sucesso.",
      data: usuario,
    });
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        status: "error",
        message: "Já existe outro usuário com este e-mail.",
      });
    }

    return res.status(error.statusCode || 500).json({
      status: "error",
      message:
        error.statusCode
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

    return res.status(200).json({
      status: "success",
      message: usuario.ativo
        ? "Usuário ativado com sucesso."
        : "Usuário desativado com sucesso.",
      data: usuario,
    });
  } catch (error) {
    console.error(
      "Erro ao alterar status do usuário:",
      error
    );

    return res.status(error.statusCode || 500).json({
      status: "error",
      message:
        error.statusCode
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