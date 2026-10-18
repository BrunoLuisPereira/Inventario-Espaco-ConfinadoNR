
const jwt = require("jsonwebtoken");

const usuarioRepository = require(
  "../repositories/usuarioRepository"
);

/**
 * Extrai e valida o JWT da requisição.
 *
 * Não consulta o banco de dados.
 */
function validarToken(req) {
  const authorization = req.headers.authorization;

  if (!authorization) {
    const error = new Error(
      "Token de autenticação não informado."
    );
    error.statusCode = 401;
    throw error;
  }

  const partes = authorization.trim().split(/\s+/);

  if (
    partes.length !== 2 ||
    partes[0].toLowerCase() !== "bearer" ||
    !partes[1]
  ) {
    const error = new Error(
      "Formato de autenticação inválido. Use Bearer Token."
    );
    error.statusCode = 401;
    throw error;
  }

  if (!process.env.JWT_SECRET) {
    const error = new Error(
      "Erro na configuração da autenticação."
    );
    error.statusCode = 500;
    throw error;
  }

  const payload = jwt.verify(
    partes[1],
    process.env.JWT_SECRET,
    {
      algorithms: ["HS256"],
      issuer:
        process.env.JWT_ISSUER ||
        "inventario-espacos-confinados-api",
      audience:
        process.env.JWT_AUDIENCE ||
        "inventario-espacos-confinados-pwa",
    }
  );

  const idUsuario = Number(payload?.sub);

  const perfisPermitidos = [
    "ADMINISTRADOR",
    "ENGENHEIRO_SEGURANCA",
  ];

  if (
    !payload ||
    typeof payload !== "object" ||
    !Number.isSafeInteger(idUsuario) ||
    idUsuario <= 0 ||
    !perfisPermitidos.includes(payload.perfil)
  ) {
    const error = new Error("Token inválido.");
    error.statusCode = 401;
    throw error;
  }

  return {
    id_usuario: idUsuario,
    perfil_acesso: payload.perfil,
  };
}

/**
 * Responde aos erros de validação do JWT.
 */
function responderErroAutenticacao(res, error) {
  if (res.headersSent) return res;
  if (error.name === "TokenExpiredError") {
    return res.status(401).json({
      status: "error",
      message: "Token expirado. Realize o login novamente.",
    });
  }

  if (error.statusCode === 500) {
    console.error(
      "Erro na configuração da autenticação:",
      { statusCode: 500 }
    );

    return res.status(500).json({
      status: "error",
      message: "Erro na configuração da autenticação.",
    });
  }

  return res.status(401).json({
    status: "error",
    message:
      error.statusCode === 401
        ? error.message
        : "Token inválido.",
  });
}

/**
 * Middleware legado.
 *
 * Mantido temporariamente para preservar
 * o funcionamento das rotas atuais.
 *
 * IMPORTANTE:
 * Não fornece isolamento multi-tenant.
 */
function autenticar(req, res, next) {
  try {
    req.usuario = validarToken(req);
    return next();
  } catch (error) {
    return responderErroAutenticacao(res, error);
  }
}

/**
 * Middleware de autenticação multi-tenant.
 *
 * Valida o JWT e consulta o PostgreSQL para
 * verificar a identidade e as permissões atuais.
 *
 * IMPORTANTE:
 * Depende da migração 020.
 * Não utilizar nas rotas antes da homologação.
 */
async function autenticarMultiTenant(req, res, next) {
  if (res.headersSent) return res;
  let identidadeToken;

  // Etapa 1: validação do JWT.
  try {
    identidadeToken = validarToken(req);
  } catch (error) {
    return responderErroAutenticacao(res, error);
  }

  // Etapa 2: consulta ao PostgreSQL.
  try {
    const usuario =
      await usuarioRepository.buscarIdentidadeAutenticada(
        identidadeToken.id_usuario
      );

    if (res.headersSent) return res;

    if (!usuario) {
      return res.status(401).json({
        status: "error",
        message:
          "Usuário ou ambiente inválido ou desativado. Realize o login novamente.",
      });
    }

    req.usuario = {
      id_usuario: usuario.id_usuario,
      id_ambiente: usuario.id_ambiente,
      perfil_acesso: usuario.perfil_acesso,
    };

    return next();
  } catch (error) {
    if (res.headersSent) return res;
    console.error(
      "Erro ao consultar identidade autenticada:",
      { statusCode: 500 }
    );

    return res.status(500).json({
      status: "error",
      message:
        "Erro interno ao validar a autenticação.",
    });
  }
}

module.exports = {
  autenticar,
  autenticarMultiTenant,
};
