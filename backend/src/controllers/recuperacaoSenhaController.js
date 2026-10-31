const { servico } = require('../services/recuperacaoSenhaService');
function criarController(service = servico) {
  function executar(operacao, status, mensagem) {
    return async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        const data = await operacao(req.body, req.ip);
        return res.status(status).json({ status: 'success', message: data?.mensagem || mensagem });
      } catch (erro) {
        const codigo = erro.publicoRecuperacao === true && [400, 429, 503].includes(erro.statusCode) ? erro.statusCode : 503;
        if (codigo === 429) res.set('Retry-After', '900');
        return res.status(codigo).json({ status: 'error', message: [400, 429].includes(codigo)
          ? erro.message : 'Recuperação temporariamente indisponível. Tente novamente mais tarde.' });
      }
    };
  }
  return { solicitar: executar(service.solicitar, 202), redefinir: executar(service.redefinir, 200, 'Senha redefinida. Entre novamente.') };
}
module.exports = { criarController, ...criarController() };
