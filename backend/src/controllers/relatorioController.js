const relatorioService = require("../services/relatorioService");
const fs = require("fs");
const path = require("path");

async function criar(req, res, next) {
  try {
    const relatorio = await relatorioService.criarRelatorio(
      req.body,
      req.usuario
    );

    return res.status(201).json({
      status: "success",
      message: "Relatório cadastrado com sucesso.",
      data: relatorio,
    });
  } catch (erro) {
    next(erro);
  }
}

async function listar(req, res, next) {
  try {
    const relatorios = await relatorioService.listarRelatorios();

    return res.status(200).json({
      status: "success",
      total: relatorios.length,
      data: relatorios,
    });
  } catch (erro) {
    next(erro);
  }
}

async function buscarPorId(req, res, next) {
  try {
    const relatorio =
      await relatorioService.buscarRelatorioPorId(req.params.id);

    return res.status(200).json({
      status: "success",
      data: relatorio,
    });
  } catch (erro) {
    next(erro);
  }
}

async function buscarPorLocal(req, res, next) {
  try {
    const relatorio =
      await relatorioService.buscarRelatorioPorLocal(
        req.params.idLocal
      );

    return res.status(200).json({
      status: "success",
      data: relatorio,
    });
  } catch (erro) {
    next(erro);
  }
}

async function atualizar(req, res, next) {
  try {
    const relatorio =
      await relatorioService.atualizarRelatorio(
        req.params.id,
        req.body,
        req.usuario
      );

    return res.status(200).json({
      status: "success",
      message: "Relatório atualizado com sucesso.",
      data: relatorio,
    });
  } catch (erro) {
    next(erro);
  }
}

async function excluir(req, res, next) {
  try {
    const relatorio =
      await relatorioService.excluirRelatorio(
        req.params.id,
        req.usuario
      );

    return res.status(200).json({
      status: "success",
      message: "Relatório excluído com sucesso.",
      data: relatorio,
    });
  } catch (erro) {
    next(erro);
  }
}
async function buscarCompleto(req, res, next) {
  try {
    const relatorio =
      await relatorioService.buscarRelatorioCompleto(
        req.params.id
      );

    return res.status(200).json({
      status: "success",
      data: relatorio,
    });
  } catch (erro) {
    next(erro);
  }
}
async function gerarPdf(req, res, next) {
  try {
    const resultado =
      await relatorioService.gerarPdfRelatorio(
        req.params.id,
        req.usuario
      );

    return res.status(200).json({
      status: "success",
      message: "PDF do relatório gerado com sucesso.",
      data: resultado,
    });
  } catch (erro) {
    next(erro);
  }
}
async function baixarPdf(req, res, next) {
  try {
    const relatorio =
      await relatorioService.obterPdfParaDownload(
        req.params.id,
        req.usuario
      );

    const caminhoCompleto = path.join(
      __dirname,
      "../../",
      relatorio.caminho_pdf
    );

    if (!fs.existsSync(caminhoCompleto)) {
      const erro = new Error(
        "Arquivo PDF não encontrado no servidor."
      );
      erro.statusCode = 404;
      throw erro;
    }

    return res.download(
      caminhoCompleto,
      `relatorio-${relatorio.id_relatorio}.pdf`
    );
  } catch (erro) {
    next(erro);
  }
}
module.exports = {
  criar,
  listar,
  buscarPorId,
  buscarPorLocal,
  atualizar,
  excluir,
  buscarCompleto,
  gerarPdf,
  baixarPdf,
};