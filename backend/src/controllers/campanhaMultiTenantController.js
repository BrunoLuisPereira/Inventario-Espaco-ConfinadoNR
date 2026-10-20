const campanhaService = require("../services/campanhaMultiTenantService");

function handler(metodo, argumentos, status, mensagem, mensagemInterna, lista = false) {
  return async (req, res) => {
    if (res.headersSent) return;
    try {
      const data = await campanhaService[metodo](...argumentos(req));
      if (res.headersSent) return;
      const resposta = { status: "success" };
      if (mensagem) resposta.message = mensagem;
      if (lista) resposta.total = data.length;
      resposta.data = data;
      return res.status(status).json(resposta);
    } catch (erro) {
      if (res.headersSent) return;
      const valido = Number.isInteger(erro?.statusCode) && erro.statusCode >= 400 && erro.statusCode <= 599;
      const codigo = valido ? erro.statusCode : 500;
      const message = codigo < 500 && typeof erro?.message === "string" ? erro.message : mensagemInterna;
      console.error("Falha na operação de campanha.", { statusCode: codigo });
      return res.status(codigo).json({ status: "error", message });
    }
  };
}

module.exports = {
  criar: handler("criarCampanha", (req) => [req.body, req.usuario], 201,
    "Campanha criada com sucesso.", "Erro interno ao criar campanha."),
  listar: handler("listarCampanhas", (req) => [req.usuario], 200,
    null, "Erro interno ao listar campanhas.", true),
  buscarPorId: handler("buscarCampanhaPorId", (req) => [req.params.id, req.usuario], 200,
    null, "Erro interno ao buscar campanha."),
  atualizar: handler("atualizarCampanha", (req) => [req.params.id, req.body, req.usuario], 200,
    "Campanha atualizada com sucesso.", "Erro interno ao atualizar campanha."),
  alterarStatus: handler("alterarStatusCampanha", (req) => [req.params.id, req.body, req.usuario], 200,
    "Status da campanha atualizado com sucesso.", "Erro interno ao alterar status da campanha."),
};
