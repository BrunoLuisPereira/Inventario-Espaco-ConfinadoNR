const authService = require("../services/authService");

/**
 * POST /api/auth/login
 */
async function login(req, res) {
  try {
    const resultado = await authService.login(req.body);

    return res.status(200).json({
      status: "success",
      message: "Login realizado com sucesso.",
      data: resultado,
    });
  } catch (error) {
    console.error("Erro ao realizar login:", error.message);

    return res.status(error.statusCode || 500).json({
      status: "error",
      message:
        error.statusCode
          ? error.message
          : "Erro interno ao realizar login.",
    });
  }
}

module.exports = {
  login,
};