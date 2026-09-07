const sincronizacaoService = require(
  "../services/sincronizacaoService"
);


// ======================================================
// Criar sincronização
// ======================================================

async function criar(
  req,
  res,
  next
) {
  try {
    const sincronizacao =
      await sincronizacaoService
        .criarSincronizacao(
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

      data:
        sincronizacao,
    });
  } catch (erro) {
    next(erro);
  }
}


// ======================================================
// Listar sincronizações
// ======================================================

async function listar(
  req,
  res,
  next
) {
  try {
    const sincronizacoes =
      await sincronizacaoService
        .listarSincronizacoes(
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


// ======================================================
// Buscar sincronização por ID
// ======================================================

async function buscarPorId(
  req,
  res,
  next
) {
  try {
    const sincronizacao =
      await sincronizacaoService
        .buscarSincronizacaoPorId(
          req.params.id,
          req.usuario
        );

    return res.status(200).json({
      status: "success",
      data:
        sincronizacao,
    });
  } catch (erro) {
    next(erro);
  }
}


// ======================================================
// Buscar sincronizações por entidade
// ======================================================

async function buscarPorEntidade(
  req,
  res,
  next
) {
  try {
    const sincronizacoes =
      await sincronizacaoService
        .buscarPorEntidade(
          req.params.entidade,
          req.params.idEntidade,
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


// ======================================================
// Buscar sincronizações pendentes
// ======================================================

async function buscarPendentes(
  req,
  res,
  next
) {
  try {
    const sincronizacoes =
      await sincronizacaoService
        .buscarPendentes(
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


// ======================================================
// Buscar conflitos
// ======================================================

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


// ======================================================
// Atualizar status manualmente
// ======================================================

async function atualizarStatus(
  req,
  res,
  next
) {
  try {
    const sincronizacao =
      await sincronizacaoService
        .atualizarStatus(
          req.params.id,
          req.body,
          req.usuario
        );

    return res.status(200).json({
      status: "success",

      message:
        "Status da sincronização atualizado com sucesso.",

      data:
        sincronizacao,
    });
  } catch (erro) {
    next(erro);
  }
}


// ======================================================
// Excluir sincronização
// ======================================================

async function excluir(
  req,
  res,
  next
) {
  try {
    const sincronizacao =
      await sincronizacaoService
        .excluirSincronizacao(
          req.params.id,
          req.usuario
        );

    return res.status(200).json({
      status: "success",

      message:
        "Registro de sincronização excluído com sucesso.",

      data:
        sincronizacao,
    });
  } catch (erro) {
    next(erro);
  }
}


// ======================================================
// Resolver conflito
// ======================================================

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

    const statusHttp =
      resultado.status === "CONFLITO"
        ? 409
        : 200;

    return res.status(statusHttp).json({
      status:
        resultado.status === "CONFLITO"
          ? "conflict"
          : "success",

      message:
        resultado.status === "CONFLITO"
          ? "Conflito de sincronização detectado durante o processamento."
          : "Sincronização processada com sucesso.",

      data:
        resultado,
    });
  } catch (erro) {
    next(erro);
  }
}


// ======================================================
// Exportações
// ======================================================

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