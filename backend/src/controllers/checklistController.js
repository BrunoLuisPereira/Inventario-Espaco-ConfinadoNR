const checklistService = require("../services/checklistMultiTenantService");

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
    return next(erro);
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
    return next(erro);
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
    return next(erro);
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
    return next(erro);
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
    return next(erro);
  }
}
module.exports = {
  criar,
  listar,
  buscarPorId,
  atualizar,
  alterarStatus,
};
