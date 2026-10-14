
const conviteService = require("../services/conviteService");

/**
 * POST /api/convites
 *
 * Emite um convite para o ambiente
 * do administrador autenticado.
 *
 * IMPORTANTE:
 * Depende da migração 020 e da autenticação
 * multi-tenant ainda não ativada.
 */
async function emitir(req, res) {
  try {
    const idUsuarioAdministrador =
      req.usuario?.id_usuario;

    if (
      !Number.isSafeInteger(idUsuarioAdministrador) ||
      idUsuarioAdministrador <= 0
    ) {
      return res.status(401).json({
        status: "error",
        message: "Usuário não autenticado.",
      });
    }

    const resultado = await conviteService.emitirConvite(
      idUsuarioAdministrador,
      req.body || {}
    );

    return res.status(201).json({
      status: "success",
      message: "Convite criado com sucesso.",
      data: resultado,
    });
  } catch (erro) {
    console.error(
      "Erro ao emitir convite:",
      erro
    );

    return res.status(erro.statusCode || 500).json({
      status: "error",
      message: erro.statusCode
        ? erro.message
        : "Erro interno ao emitir convite.",
    });
  }
}

/**
 * POST /api/convites/aceitar
 *
 * Aceita um convite válido e cadastra
 * o usuário no ambiente correspondente.
 *
 * Esta operação não exige autenticação,
 * pois o convidado ainda não possui conta.
 */
async function aceitar(req, res) {
  try {
    const { token, nome, senha } = req.body || {};

    const resultado = await conviteService.aceitarConvite(
      token,
      { nome, senha }
    );

    return res.status(201).json({
      status: "success",
      message: "Convite aceito com sucesso.",
      data: resultado,
    });
  } catch (erro) {
    console.error(
      "Erro ao aceitar convite:",
      erro
    );

    return res.status(erro.statusCode || 500).json({
      status: "error",
      message: erro.statusCode
        ? erro.message
        : "Erro interno ao aceitar convite.",
    });
  }
}

module.exports = {
  emitir,
  aceitar,
};
