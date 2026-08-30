const checklistService = require("../services/checklistService");

async function criar(req, res, next) {
  try {
    const checklist = await checklistService.criarChecklist(
      req.body,
      req.usuario
    );

    return res.status(201).json({
      status: "success",
      data: checklist,
    });
  } catch (erro) {
    next(erro);
  }
}

async function listar(req, res, next) {
  try {
    const checklists = await checklistService.listarChecklists();

    return res.status(200).json({
      status: "success",
      total: checklists.length,
      data: checklists,
    });
  } catch (erro) {
    next(erro);
  }
}

async function buscarPorId(req, res, next) {
  try {
    const checklist = await checklistService.buscarChecklistPorId(
      req.params.id
    );

    return res.status(200).json({
      status: "success",
      data: checklist,
    });
  } catch (erro) {
    next(erro);
  }
}
async function atualizar(req, res, next) {
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
  } catch (erro) {
    next(erro);
  }
}
async function alterarStatus(req, res, next) {
  try {
    const checklist =
      await checklistService.alterarStatusChecklist(
        req.params.id,
        req.body,
        req.usuario
      );

    return res.status(200).json({
      status: "success",
      message: "Status do checklist atualizado com sucesso.",
      data: checklist,
    });
  } catch (erro) {
    next(erro);
  }
}
module.exports = {
  criar,
  listar,
  buscarPorId,
  atualizar,
  alterarStatus,
};