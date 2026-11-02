
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
      if (res.headersSent) return res;

      return res.status(401).json({
        status: "error",
        message: "Usuário não autenticado.",
      });
    }

    const resultado = await conviteService.emitirConvite(
      idUsuarioAdministrador,
      req.body || {}
    );

    if (res.headersSent) return res;

    return res.status(201).json({
      status: "success",
      message: "Convite criado com sucesso.",
      data: resultado,
    });
  } catch (erro) {
    if (res.headersSent) return res;

    const statusCode =
      Number.isInteger(erro?.statusCode) &&
      erro.statusCode >= 400 &&
      erro.statusCode <= 599
        ? erro.statusCode
        : 500;

    console.error("Erro ao emitir convite.", { statusCode });

    return res.status(statusCode).json({
      status: "error",
      message: statusCode < 500 && typeof erro?.message === "string" && erro.message
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

    if (res.headersSent) return res;

    return res.status(201).json({
      status: "success",
      message: "Convite aceito com sucesso.",
      data: resultado,
    });
  } catch (erro) {
    if (res.headersSent) return res;

    const statusCode =
      Number.isInteger(erro?.statusCode) &&
      erro.statusCode >= 400 &&
      erro.statusCode <= 599
        ? erro.statusCode
        : 500;

    console.error("Erro ao aceitar convite.", { statusCode });

    return res.status(statusCode).json({
      status: "error",
      message: statusCode < 500 && typeof erro?.message === "string" && erro.message
        ? erro.message
        : "Erro interno ao aceitar convite.",
    });
  }
}

async function preValidar(req, res) {
  if (res.headersSent) return res;
  try {
    const data = await conviteService.preValidarConvite(req.body?.token);
    if (res.headersSent) return res;
    return res.status(200).json({ status: 'success', data });
  } catch (erro) {
    if (res.headersSent) return res;
    const statusCode = [400, 403, 404, 409, 410].includes(erro?.statusCode) ? erro.statusCode : 500;
    // Somente mensagens fixas: nunca expõe erro de driver ou dados do convite.
    const mensagens = {
      400: 'Link de convite inválido ou incompleto.',
      403: 'O ambiente deste convite está inativo.',
      404: 'Convite não encontrado ou inválido.',
      409: 'Este convite não está disponível. Solicite um novo convite.',
      410: 'Este convite expirou. Solicite um novo convite.',
    };
    const estados = ['Este convite já foi utilizado.', 'Este convite foi cancelado.'];
    const message = statusCode === 409 && estados.includes(erro.message) ? erro.message :
      mensagens[statusCode] || 'Não foi possível validar o convite. Tente novamente.';
    return res.status(statusCode).json({ status: 'error', message });
  }
}

module.exports = {
  preValidar,
  emitir,
  aceitar,
};
