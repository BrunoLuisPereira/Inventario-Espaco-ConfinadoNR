const authService = require("../services/authService");

/**
 * POST /api/auth/login
 */
async function login(req, res) {
  try {
    const resultado = await authService.login(req.body);

    if (res.headersSent) return res;

    return res.status(200).json({
      status: "success",
      message: "Login realizado com sucesso.",
      data: resultado,
    });
  } catch (error) {
    // Não substitui a falha original por uma segunda tentativa de resposta.
    if (res.headersSent) return res;

    const statusCode =
      Number.isInteger(error?.statusCode) &&
      error.statusCode >= 400 && error.statusCode <= 599
        ? error.statusCode
        : 500;

    console.error("Erro ao realizar login.", { statusCode });

    return res.status(statusCode).json({
      status: "error",
      message:
        statusCode < 500 && typeof error?.message === "string" && error.message
          ? error.message
          : "Erro interno ao realizar login.",
    });
  }
}

module.exports = {
  login,
};
