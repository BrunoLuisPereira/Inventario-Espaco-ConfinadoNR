const repository = require('../repositories/usuarioPermissoesRepository');
function handler(operacao) {
  return async (req, res) => {
    if (res.headersSent) return res;
    try {
      const data = await operacao(req);
      if (res.headersSent) return res;
      return res.status(200).json({ status: 'success', message: 'Operação concluída com sucesso.', data });
    } catch (e) {
      if (res.headersSent) return res;
      const codigo = Number.isInteger(e?.statusCode) && [400,401,403,404,409].includes(e.statusCode) ? e.statusCode : 500;
      console.error('Falha na operação de permissões.', { statusCode: codigo });
      return res.status(codigo).json({ status: 'error', message: codigo === 500 ? 'Erro interno ao gerenciar permissões.' : e.message });
    }
  };
}
module.exports = {
  alterar: handler(req => {
    if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object' || Object.keys(req.body).some(k => k !== 'perfil_acesso')) {
      throw Object.assign(new Error('Informe somente o novo perfil de acesso.'), { statusCode: 400 });
    }
    return repository.alterar(req.params.id, req.body.perfil_acesso, req.usuario);
  }),
  auditoria: handler(req => repository.listarAuditoria(req.usuario)),
  historico: handler(req => repository.listarHistorico(req.usuario)),
};
