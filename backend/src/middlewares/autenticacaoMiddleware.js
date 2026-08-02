const jwt = require("jsonwebtoken");

function autenticar(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      return res.status(401).json({
        status: "error",
        message: "Token de autenticação não informado.",
      });
    }

    const partes = authorization.trim().split(/\s+/);

    if (
      partes.length !== 2 ||
      partes[0].toLowerCase() !== "bearer"
    ) {
      return res.status(401).json({
        status: "error",
        message:
          "Formato de autenticação inválido. Use Bearer Token.",
      });
    }

    const token = partes[1];

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET não configurado.");

      return res.status(500).json({
        status: "error",
        message: "Erro na configuração da autenticação.",
      });
    }

    const payload = jwt.verify(
      token,
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

    req.usuario = {
      id_usuario: Number(payload.sub),
      perfil_acesso: payload.perfil,
    };

    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        status: "error",
        message: "Token expirado. Realize o login novamente.",
      });
    }

    return res.status(401).json({
      status: "error",
      message: "Token inválido.",
    });
  }
}

module.exports = {
  autenticar,
};