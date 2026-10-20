const localService = require("../services/localMultiTenantService");
const excelService = require("../services/excelMultiTenantService");

// Não registrar nas rotas antes da homologação multi-tenant.
function responderErro(res, error, mensagemInterna) {
  const erroDeAplicacao = [400, 401, 403, 404].includes(error?.statusCode);

  return res.status(erroDeAplicacao ? error.statusCode : 500).json({
    status: "error",
    message: erroDeAplicacao ? error.message : mensagemInterna,
  });
}

async function criar(req, res) {
  try {
    const local = await localService.criarLocal(req.body, req.usuario);

    return res.status(201).json({
      status: "success",
      message: "Local cadastrado com sucesso.",
      data: local,
    });
  } catch (error) {
    return responderErro(res, error, "Erro interno ao cadastrar local.");
  }
}

async function listar(req, res) {
  try {
    const locais = await localService.listarLocais(req.usuario);

    return res.status(200).json({
      status: "success",
      total: locais.length,
      data: locais,
    });
  } catch (error) {
    return responderErro(res, error, "Erro interno ao listar locais.");
  }
}

async function buscarPorId(req, res) {
  try {
    const local = await localService.buscarLocalPorId(req.params.id, req.usuario);

    return res.status(200).json({
      status: "success",
      data: local,
    });
  } catch (error) {
    return responderErro(res, error, "Erro interno ao buscar local.");
  }
}

async function atualizar(req, res) {
  try {
    const local = await localService.atualizarLocal(
      req.params.id,
      req.body,
      req.usuario
    );

    return res.status(200).json({
      status: "success",
      message: "Local atualizado com sucesso.",
      data: local,
    });
  } catch (error) {
    return responderErro(res, error, "Erro interno ao atualizar local.");
  }
}

async function alterarStatus(req, res) {
  try {
    const local = await localService.alterarStatusLocal(
      req.params.id,
      req.body,
      req.usuario
    );

    return res.status(200).json({
      status: "success",
      message: "Status do local atualizado com sucesso.",
      data: local,
    });
  } catch (error) {
    return responderErro(res, error, "Erro interno ao alterar status do local.");
  }
}

async function exportar(req, res) {
  try {
    const buffer = await excelService.gerarExcelLocais(req.usuario);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="inventario-locais.xlsx"'
    );
    res.setHeader("Content-Length", buffer.length);

    return res.status(200).send(buffer);
  } catch (error) {
    return responderErro(res, error, "Erro interno ao exportar locais para Excel.");
  }
}

module.exports = {
  criar,
  listar,
  buscarPorId,
  atualizar,
  alterarStatus,
  exportar,
};
