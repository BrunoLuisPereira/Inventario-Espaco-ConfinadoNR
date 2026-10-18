const localService = require("../services/localMultiTenantService");
const excelService = require("../services/excelService");

function responderErro(res, erro, mensagem) {
  if (res.headersSent) return res;
  const statusCode = Number.isInteger(erro?.statusCode) && erro.statusCode >= 400 && erro.statusCode <= 599 ? erro.statusCode : 500;
  console.error("Falha na operação de locais.", { statusCode });
  return res.status(statusCode).json({ status: "error", message: statusCode < 500 ? erro.message : mensagem });
}

async function criar(req, res) {
  if (res.headersSent) return res;
  try {
    const local = await localService.criarLocal(
      req.body,
      req.usuario
    );

    if (res.headersSent) return res;
    return res.status(201).json({
      status: "success",
      message: "Local cadastrado com sucesso.",
      data: local,
    });
  } catch (erro) {
    return responderErro(res, erro, "Erro interno ao cadastrar local.");
  }
}

async function listar(req, res) {
  if (res.headersSent) return res;
  try {
    const locais = await localService.listarLocais(req.usuario);

    if (res.headersSent) return res;
    return res.status(200).json({
      status: "success",
      total: locais.length,
      data: locais,
    });
  } catch (erro) {
    return responderErro(res, erro, "Erro interno ao listar locais.");
  }
}

async function buscarPorId(req, res) {
  if (res.headersSent) return res;
  try {
    const local = await localService.buscarLocalPorId(
      req.params.id,
      req.usuario
    );

    if (res.headersSent) return res;
    return res.status(200).json({
      status: "success",
      data: local,
    });
  } catch (erro) {
    return responderErro(res, erro, "Erro interno ao buscar local.");
  }
}
async function atualizar(req, res) {
  if (res.headersSent) return res;
  try {
    const local = await localService.atualizarLocal(
      req.params.id,
      req.body,
      req.usuario
    );

    if (res.headersSent) return res;
    return res.status(200).json({
      status: "success",
      message: "Local atualizado com sucesso.",
      data: local,
    });
  } catch (erro) {
    return responderErro(res, erro, "Erro interno ao atualizar local.");
  }
}

async function alterarStatus(req, res) {
  if (res.headersSent) return res;
  try {
    const local = await localService.alterarStatusLocal(
      req.params.id,
      req.body,
      req.usuario
    );

    if (res.headersSent) return res;
    return res.status(200).json({
      status: "success",
      message: "Status do local atualizado com sucesso.",
      data: local,
    });
  } catch (erro) {
    return responderErro(res, erro, "Erro interno ao alterar status do local.");
  }
}
async function exportar(req, res) {
  try {
    const buffer = await excelService.gerarExcelLocais(req.usuario);

    if (res.headersSent) return res;

    const nomeArquivo = "inventario-locais.xlsx";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${nomeArquivo}"`
    );

    res.setHeader(
      "Content-Length",
      buffer.length
    );

    return res.status(200).send(buffer);
  } catch (error) {
    if (res.headersSent) return res;

    const statusCode = error?.statusCode === 401 ? 401 : 500;
    console.error("Erro ao exportar locais para Excel.", { statusCode });

    return res.status(statusCode).json({
      status: "error",
      message:
        statusCode === 401
          ? "Usuário não autenticado."
          : "Erro interno ao exportar locais para Excel.",
    });
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
