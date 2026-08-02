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

module.exports = {
  criar,
};