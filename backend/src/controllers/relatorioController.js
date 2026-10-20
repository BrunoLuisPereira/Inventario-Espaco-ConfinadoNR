const relatorioService = require("../services/relatorioMultiTenantService");

async function criar(req, res, next) {
  if (res.headersSent) return res;
  try {
    const relatorio =
      await relatorioService.criarRelatorio(
        req.body,
        req.usuario
      );

    if (res.headersSent) return res;
    return res.status(201).json({
      status: "success",
      message: "Relatório cadastrado com sucesso.",
      data: relatorio,
    });
  } catch (erro) {
    return next(erro);
  }
}

async function listar(req, res, next) {
  if (res.headersSent) return res;
  try {
    const relatorios =
      await relatorioService.listarRelatorios(
        req.usuario
      );

    if (res.headersSent) return res;
    return res.status(200).json({
      status: "success",
      total: relatorios.length,
      data: relatorios,
    });
  } catch (erro) {
    return next(erro);
  }
}

async function buscarPorId(req, res, next) {
  if (res.headersSent) return res;
  try {
    const relatorio =
      await relatorioService.buscarRelatorioPorId(
        req.params.id,
        req.usuario
      );

    if (res.headersSent) return res;
    return res.status(200).json({
      status: "success",
      data: relatorio,
    });
  } catch (erro) {
    return next(erro);
  }
}

async function buscarPorLocal(req, res, next) {
  if (res.headersSent) return res;
  try {
    const relatorio =
      await relatorioService.buscarRelatorioPorLocal(
        req.params.idLocal,
        req.usuario
      );

    if (res.headersSent) return res;
    return res.status(200).json({
      status: "success",
      data: relatorio,
    });
  } catch (erro) {
    return next(erro);
  }
}

async function atualizar(req, res, next) {
  if (res.headersSent) return res;
  try {
    const relatorio =
      await relatorioService.atualizarRelatorio(
        req.params.id,
        req.body,
        req.usuario
      );

    if (res.headersSent) return res;
    return res.status(200).json({
      status: "success",
      message: "Relatório atualizado com sucesso.",
      data: relatorio,
    });
  } catch (erro) {
    return next(erro);
  }
}

async function excluir(req, res, next) {
  if (res.headersSent) return res;
  try {
    const relatorio =
      await relatorioService.excluirRelatorio(
        req.params.id,
        req.usuario
      );

    if (res.headersSent) return res;
    return res.status(200).json({
      status: "success",
      message: "Relatório excluído com sucesso.",
      data: relatorio,
    });
  } catch (erro) {
    return next(erro);
  }
}

async function buscarCompleto(req, res, next) {
  if (res.headersSent) return res;
  try {
    const relatorio =
      await relatorioService.buscarRelatorioCompleto(
        req.params.id,
        req.usuario
      );

    if (res.headersSent) return res;
    return res.status(200).json({
      status: "success",
      data: relatorio,
    });
  } catch (erro) {
    return next(erro);
  }
}

async function gerarPdf(req, res, next) {
  if (res.headersSent) return res;
  try {
    const resultado =
      await relatorioService.gerarPdfRelatorio(
        req.params.id,
        req.usuario
      );

    if (res.headersSent) return res;
    return res.status(200).json({
      status: "success",
      message: "PDF do relatório gerado com sucesso.",
      data: resultado,
    });
  } catch (erro) {
    return next(erro);
  }
}

async function baixarPdf(req, res, next) {
  if (res.headersSent) return res;
  try {
    const resultado = await relatorioService.obterPdfParaDownload(req.params.id, req.usuario);
    if (res.headersSent) return res;
    const { buffer, relatorio, modificado } = resultado;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-${relatorio.id_relatorio}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Accept-Ranges', 'bytes');
    if (modificado) res.setHeader('Last-Modified', modificado.toUTCString());
    let parte = buffer;
    let status = 200;
    const ifRange = req.headers['if-range'];
    if (req.range && (!ifRange || modificado && Date.parse(ifRange) >= modificado.getTime())) {
      const ranges = req.range(buffer.length);
      if (ranges === -1) { res.setHeader('Content-Range', `bytes */${buffer.length}`); return res.status(416).end(); }
      if (Array.isArray(ranges) && ranges.type === 'bytes' && ranges.length === 1) {
        const { start, end } = ranges[0];
        parte = buffer.subarray(start, end + 1); status = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${buffer.length}`);
      }
    }
    res.setHeader('Content-Length', parte.length);
    return res.status(status).send(parte);
  } catch (erro) { return next(erro); }
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