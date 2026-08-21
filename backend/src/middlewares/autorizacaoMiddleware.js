function autorizar(...perfisPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        status: "error",
        message: "Usuário não autenticado.",
      });
    }

    if (!perfisPermitidos.includes(req.usuario.perfil_acesso)) {
      return res.status(403).json({
        status: "error",
        message: "Você não possui permissão para acessar este recurso.",
      });
    }

    return next();
  };
}

module.exports = {
  autorizar,
};