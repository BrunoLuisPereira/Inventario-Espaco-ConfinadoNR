const checklistService = require("../services/checklistMultiTenantService");
const { CAMPOS_ESTADO_RELEVANTE } = require("../utils/adaptadorCamposNr33");

// Lista fechada local: nunca serializa error, details arbitrarios ou SQLSTATE.
function encaminharErro(erro, res, next) {
  if (res.headersSent) return next(erro);
  const contratos = {
    NR33_ESQUEMA_INCOMPATIVEL: [503, "Avaliação NR-33 temporariamente indisponível."],
    NR33_CAMPO_SOMENTE_LEITURA: [400, "avaliacao_nr33 é somente leitura."],
    NR33_DADOS_INVALIDOS: [400, "Dados NR-33 inválidos."],
    NR33_CONCLUSAO_INVALIDA: [400, "Checklist incompleto ou incoerente para conclusão."],
    NR33_CONFIRMACAO_LIMPEZA_NECESSARIA: [409, "A operação exige confirmação de limpeza, ainda não disponível."],
  };
  if (!Object.hasOwn(contratos, erro?.code) || contratos[erro.code][0] !== erro.statusCode) return next(erro);
  const campos = valores => Array.isArray(valores)
    ? valores.filter(campo => CAMPOS_ESTADO_RELEVANTE.includes(campo)) : [];
  const codigos = ["RESPOSTA_OBRIGATORIA", "CARACTERIZACAO_PENDENTE", "CONDICAO_ATMOSFERICA_OBRIGATORIA",
    "RESPOSTA_PLACA_OBRIGATORIA", "RESPOSTAS_FORA_DE_APLICABILIDADE"];
  let details = {};
  if (erro.code === "NR33_CAMPO_SOMENTE_LEITURA") details = { campos: ["avaliacao_nr33"] };
  if (erro.code === "NR33_CONCLUSAO_INVALIDA") details = { erros: Array.isArray(erro.validacaoNr33)
    ? erro.validacaoNr33.filter(item => item && codigos.includes(item.codigo))
      .map(item => ({ codigo: item.codigo, campos: campos(item.campos) })) : [] };
  if (erro.code === "NR33_CONFIRMACAO_LIMPEZA_NECESSARIA") details = {
    necessita_confirmacao_limpeza: true, campos: campos(erro.camposLimpeza),
  };
  return res.status(contratos[erro.code][0]).json({
    status: "error", message: contratos[erro.code][1], code: erro.code, details,
  });
}

async function criar(req, res, next) {
  if (res.headersSent) return res;
  try {
    const checklist = await checklistService.criarChecklist(
      req.body,
      req.usuario
    );

    if (res.headersSent) return res;
    return res.status(201).json({
      status: "success",
      data: checklist,
    });
  } catch (erro) {
    return encaminharErro(erro, res, next);
  }
}

async function listar(req, res, next) {
  if (res.headersSent) return res;
  try {
    const checklists = await checklistService.listarChecklists(req.usuario);

    if (res.headersSent) return res;
    return res.status(200).json({
      status: "success",
      total: checklists.length,
      data: checklists,
    });
  } catch (erro) {
    return encaminharErro(erro, res, next);
  }
}

async function buscarPorId(req, res, next) {
  if (res.headersSent) return res;
  try {
    const checklist = await checklistService.buscarChecklistPorId(
      req.params.id,
      req.usuario
    );

    if (res.headersSent) return res;
    return res.status(200).json({
      status: "success",
      data: checklist,
    });
  } catch (erro) {
    return encaminharErro(erro, res, next);
  }
}
async function atualizar(req, res, next) {
  if (res.headersSent) return res;
  try {
    const checklist = await checklistService.atualizarChecklist(
      req.params.id,
      req.body,
      req.usuario
    );

    if (res.headersSent) return res;
    return res.status(200).json({
      status: "success",
      message: "Checklist atualizado com sucesso.",
      data: checklist,
    });
  } catch (erro) {
    return encaminharErro(erro, res, next);
  }
}
async function alterarStatus(req, res, next) {
  if (res.headersSent) return res;
  try {
    const checklist =
      await checklistService.alterarStatusChecklist(
        req.params.id,
        req.body,
        req.usuario
      );

    if (res.headersSent) return res;
    return res.status(200).json({
      status: "success",
      message: "Status do checklist atualizado com sucesso.",
      data: checklist,
    });
  } catch (erro) {
    return encaminharErro(erro, res, next);
  }
}
module.exports = {
  criar,
  listar,
  buscarPorId,
  atualizar,
  alterarStatus,
};
