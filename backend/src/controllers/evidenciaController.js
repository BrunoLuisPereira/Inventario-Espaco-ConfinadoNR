const evidenciaService = require(
  "../services/evidenciaService"
);

const evidenciaMultiTenantService = require(
  "../services/evidenciaMultiTenantService"
);

const evidenciaArquivoUtils = require(
  "../utils/evidenciaArquivoUtils"
);

/**
 * Cria uma evidência sem upload de arquivo.
 */
async function criar(req, res, next) {
  try {
    const evidencia =
      await evidenciaMultiTenantService.criarEvidencia(
        req.body,
        req.usuario
      );

    return res.status(201).json({
      status: "success",
      message: "Evidência criada com sucesso.",
      data: evidencia,
    });
  } catch (erro) {
    next(erro);
  }
}

/**
 * Cria uma evidência com upload de arquivo.
 *
 * JPG e PNG são registrados como FOTO.
 * PDF é registrado como DOCUMENTO.
 *
 * O campo id_operacao_cliente pode ser enviado
 * pelo PWA para garantir idempotência durante
 * a sincronização offline.
 */
async function criarComUpload(req, res, next) {
  let caminhoArquivo = null;

  try {
    if (!req.file) {
      const erro = new Error(
        "Nenhum arquivo foi enviado."
      );

      erro.statusCode = 400;
      throw erro;
    }

    const tipo =
      req.file.mimetype === "application/pdf"
        ? "DOCUMENTO"
        : "FOTO";

    caminhoArquivo =
      `uploads/evidencias/${req.file.filename}`;

    const evidencia =
  await evidenciaService.criarEvidencia(
    {
      id_local: req.body.id_local,
      tipo,
      descricao: req.body.descricao,
      caminho_arquivo: caminhoArquivo,
      id_operacao_cliente:
        req.body.id_operacao_cliente,

      // Localização da evidência
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      precisao_gps: req.body.precisao_gps,
      origem_coordenadas:
        req.body.origem_coordenadas,
      data_captura_gps:
        req.body.data_captura_gps,
    },
    req.usuario
  );

    const operacaoJaProcessada =
      req.body.id_operacao_cliente &&
      evidencia.caminho_arquivo !==
        caminhoArquivo;

    if (operacaoJaProcessada) {
      await evidenciaArquivoUtils.removerArquivo(
        caminhoArquivo
      );

      return res.status(200).json({
        status: "success",
        message:
          "Operação já processada anteriormente. Evidência existente retornada.",
        data: evidencia,
      });
    }

    return res.status(201).json({
      status: "success",
      message:
        "Arquivo enviado e evidência criada com sucesso.",
      data: evidencia,
    });
  } catch (erro) {
    if (caminhoArquivo) {
      await evidenciaArquivoUtils.removerArquivo(
        caminhoArquivo
      );
    }

    next(erro);
  }
}

/**
 * Lista as evidências que o usuário autenticado
 * possui permissão para visualizar.
 */
async function listar(req, res, next) {
  try {
    const evidencias =
      await evidenciaService.listarEvidencias(
        req.usuario
      );

    return res.status(200).json({
      status: "success",
      total: evidencias.length,
      data: evidencias,
    });
  } catch (erro) {
    next(erro);
  }
}

/**
 * Busca uma evidência pelo ID respeitando
 * as permissões do usuário autenticado.
 */
async function buscarPorId(req, res, next) {
  try {
    const evidencia =
      await evidenciaService
        .buscarEvidenciaPorId(
          req.params.id,
          req.usuario
        );

    return res.status(200).json({
      status: "success",
      data: evidencia,
    });
  } catch (erro) {
    next(erro);
  }
}

/**
 * Lista as evidências de determinado local
 * respeitando as permissões do usuário.
 */
async function listarPorLocal(
  req,
  res,
  next
) {
  try {
    const evidencias =
      await evidenciaService
        .listarEvidenciasPorLocal(
          req.params.idLocal,
          req.usuario
        );

    return res.status(200).json({
      status: "success",
      total: evidencias.length,
      data: evidencias,
    });
  } catch (erro) {
    next(erro);
  }
}

/**
 * Retorna o arquivo físico de uma evidência.
 *
 * A evidência é buscada pelo service para garantir
 * que o usuário autenticado possui permissão para
 * acessar o local ao qual ela pertence.
 */
async function visualizarArquivo(
  req,
  res,
  next
) {
  if (res.headersSent) return;

  let erroArquivoEncaminhado = false;
  const encaminharErroArquivo = (erro) => {
    if (res.headersSent || erroArquivoEncaminhado) return;
    erroArquivoEncaminhado = true;

    const ausente = erro?.code === "ENOENT";
    const erroPublico = new Error(
      ausente ? "Arquivo da evidência não encontrado." : "Erro interno do servidor."
    );
    erroPublico.statusCode = ausente ? 404 : 500;
    return next(erroPublico);
  };

  try {
    const evidencia =
      await evidenciaMultiTenantService.buscarEvidenciaPorId(
        req.params.id,
        req.usuario
      );

    if (res.headersSent) return;

    if (!evidencia.caminho_arquivo) {
      const erro = new Error(
        "Esta evidência não possui arquivo."
      );

      erro.statusCode = 404;
      throw erro;
    }

    let caminhoCompleto;
    try {
      caminhoCompleto = evidenciaArquivoUtils.obterCaminhoCompleto(
        evidencia.caminho_arquivo
      );
    } catch (erro) {
      return encaminharErroArquivo(erro);
    }

    if (!caminhoCompleto) {
      const erro = new Error(
        "Arquivo da evidência inválido."
      );

      erro.statusCode = 404;
      throw erro;
    }

    if (res.headersSent) return;

    try {
      return res.sendFile(
        caminhoCompleto,
        (erro) => {
          if (erro) return encaminharErroArquivo(erro);
        }
      );
    } catch (erro) {
      return encaminharErroArquivo(erro);
    }
  } catch (erro) {
    if (res.headersSent) return;
    return next(erro);
  }
}

/**
 * Atualiza uma evidência existente.
 */
async function atualizar(req, res, next) {
  try {
    const evidencia =
      await evidenciaService
        .atualizarEvidencia(
          req.params.id,
          req.body,
          req.usuario
        );

    return res.status(200).json({
      status: "success",
      message:
        "Evidência atualizada com sucesso.",
      data: evidencia,
    });
  } catch (erro) {
    next(erro);
  }
}

/**
 * Exclui uma evidência.
 *
 * A remoção do arquivo físico é feita
 * pelo evidenciaService.
 */
async function excluir(req, res, next) {
  try {
    const evidencia =
      await evidenciaService
        .excluirEvidencia(
          req.params.id,
          req.usuario
        );

    return res.status(200).json({
      status: "success",
      message:
        "Evidência excluída com sucesso.",
      data: evidencia,
    });
  } catch (erro) {
    next(erro);
  }
}

module.exports = {
  criar,
  criarComUpload,
  listar,
  buscarPorId,
  listarPorLocal,
  visualizarArquivo,
  atualizar,
  excluir,
};
