const sincronizacaoService = require(
  "../services/sincronizacaoService"
);

async function criar(req, res, next) {
  try {
    const sincronizacao =
      await sincronizacaoService.criarSincronizacao(
        req.body,
        req.usuario
      );

    const statusHttp =
      sincronizacao.status === "CONFLITO"
        ? 409
        : 201;

    return res.status(statusHttp).json({
      status:
        sincronizacao.status === "CONFLITO"
          ? "conflict"
          : "success",
      message:
        sincronizacao.status === "CONFLITO"
          ? "Conflito de sincronização detectado."
          : "Registro de sincronização criado com sucesso.",
      data: sincronizacao,
    });
  } catch (erro) {
    next(erro);
  }
}

async function listar(req, res, next) {
  try {
    const sincronizacoes =
      await sincronizacaoService.listarSincronizacoes();

    return res.status(200).json({
      status: "success",
      total: sincronizacoes.length,
      data: sincronizacoes,
    });
  } catch (erro) {
    next(erro);
  }
}

async function buscarPorId(req, res, next) {
  try {
    const sincronizacao =
      await sincronizacaoService.buscarSincronizacaoPorId(
        req.params.id
      );

    return res.status(200).json({
      status: "success",
      data: sincronizacao,
    });
  } catch (erro) {
    next(erro);
  }
}

async function buscarPorEntidade(req, res, next) {
  try {
    const sincronizacoes =
      await sincronizacaoService.buscarPorEntidade(
        req.params.entidade,
        req.params.idEntidade
      );

    return res.status(200).json({
      status: "success",
      total: sincronizacoes.length,
      data: sincronizacoes,
    });
  } catch (erro) {
    next(erro);
  }
}

async function buscarPendentes(req, res, next) {
  try {
    const sincronizacoes =
      await sincronizacaoService.buscarPendentes(
        req.usuario
      );

    return res.status(200).json({
      status: "success",
      total: sincronizacoes.length,
      data: sincronizacoes,
    });
  } catch (erro) {
    next(erro);
  }
}

async function atualizarStatus(req, res, next) {
  try {
    const sincronizacao =
      await sincronizacaoService.atualizarStatus(
        req.params.id,
        req.body
      );

    return res.status(200).json({
      status: "success",
      message:
        "Status da sincronização atualizado com sucesso.",
      data: sincronizacao,
    });
  } catch (erro) {
    next(erro);
  }
}

async function excluir(req, res, next) {
  try {
    const sincronizacao =
      await sincronizacaoService.excluirSincronizacao(
        req.params.id
      );

    return res.status(200).json({
      status: "success",
      message:
        "Registro de sincronização excluído com sucesso.",
      data: sincronizacao,
    });
  } catch (erro) {
    next(erro);
  }
}
async function buscarConflitos(
  req,
  res,
  next
) {
  try {
    const sincronizacoes =
      await sincronizacaoService
        .buscarConflitos(
          req.usuario
        );

    return res.status(200).json({
      status: "success",
      total:
        sincronizacoes.length,
      data:
        sincronizacoes,
    });
  } catch (erro) {
    next(erro);
  }
}
async function resolverConflito(
  req,
  res,
  next
) {
  try {
    const sincronizacao =
      await sincronizacaoService
        .resolverConflito(
          req.params.id,
          req.body,
          req.usuario
        );

    return res.status(200).json({
      status: "success",

      message:
        "Conflito resolvido com sucesso.",

      data:
        sincronizacao,
    });
  } catch (erro) {
    next(erro);
  }
}
// ======================================================
// Processar sincronização pendente
// ======================================================

async function processarSincronizacao(
  req,
  res,
  next
) {
  try {
    const resultado =
      await sincronizacaoService
        .processarSincronizacao(
          req.params.id,
          req.usuario
        );

    return res.status(200).json({
      status: "success",
      message:
        "Sincronização processada com sucesso.",
      data: resultado,
    });
  } catch (erro) {
    next(erro);
  }
}
module.exports = {
  criar,
  listar,
  buscarPorId,
  buscarPorEntidade,
  buscarPendentes,
  atualizarStatus,
  excluir,
  buscarConflitos,
  resolverConflito,
  processarSincronizacao,
};