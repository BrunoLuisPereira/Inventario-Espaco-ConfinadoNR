const checklistService = require("../services/checklistMultiTenantService");

// Não registrar nas rotas antes da homologação multi-tenant.
function responderErro(res, error, mensagemInterna) {
  const erroDeAplicacao = [400, 401, 403, 404, 409].includes(error?.statusCode);

  return res.status(erroDeAplicacao ? error.statusCode : 500).json({
    status: "error",
    message: erroDeAplicacao ? error.message : mensagemInterna,
  });
}

async function criar(req, res) {
  try {
    const checklist = await checklistService.criarChecklist(
      req.body,
      req.usuario
    );

    return res.status(201).json({
      status: "success",
      data: checklist,
    });
  } catch (error) {
    return responderErro(res, error, "Erro interno ao criar checklist.");
  }
}

async function listar(req, res) {
  try {
    const checklists = await checklistService.listarChecklists(req.usuario);

    return res.status(200).json({
      status: "success",
      total: checklists.length,
      data: checklists,
    });
  } catch (error) {
    return responderErro(res, error, "Erro interno ao listar checklists.");
  }
}

async function buscarPorId(req, res) {
  try {
    const checklist = await checklistService.buscarChecklistPorId(
      req.params.id,
      req.usuario
    );

    return res.status(200).json({
      status: "success",
      data: checklist,
    });
  } catch (error) {
    return responderErro(res, error, "Erro interno ao buscar checklist.");
  }
}

async function atualizar(req, res) {
  try {
    const checklist = await checklistService.atualizarChecklist(
      req.params.id,
      req.body,
      req.usuario
    );

    return res.status(200).json({
      status: "success",
      message: "Checklist atualizado com sucesso.",
      data: checklist,
    });
  } catch (error) {
    return responderErro(res, error, "Erro interno ao atualizar checklist.");
  }
}

async function alterarStatus(req, res) {
  try {
    const checklist = await checklistService.alterarStatusChecklist(
      req.params.id,
      req.body,
      req.usuario
    );

    return res.status(200).json({
      status: "success",
      message: "Status do checklist atualizado com sucesso.",
      data: checklist,
    });
  } catch (error) {
    return responderErro(res, error, "Erro interno ao alterar status do checklist.");
  }
}

module.exports = {
  criar,
  listar,
  buscarPorId,
  atualizar,
  alterarStatus,
};
