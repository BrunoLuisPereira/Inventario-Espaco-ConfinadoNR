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
  if (res.headersSent) return;
  try {
    if (req.body?.caminho_arquivo != null && req.body.caminho_arquivo !== "") {
      throw Object.assign(new Error("Associe arquivos exclusivamente pelo upload autorizado."), { statusCode: 400 });
    }
    const evidencia =
      await evidenciaMultiTenantService.criarEvidencia(
        req.body,
        req.usuario
      );

    if (res.headersSent) return;
    return res.status(201).json({
      status: "success",
      message: "Evidência criada com sucesso.",
      data: evidencia,
    });
  } catch (erro) {
    if (res.headersSent) return;
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
  if (res.headersSent) return;
  let arquivoPersistido = false;
  let associado = false;
  try {
    if (!req.file) {
      const erro = new Error(
        "Nenhum arquivo foi enviado."
      );

      erro.statusCode = 400;
      throw erro;
    }

    const formato = evidenciaArquivoUtils.validarUpload(req.file);
    const preparado = await evidenciaMultiTenantService.prepararUpload({
      ...req.body, tipo: formato.tipo, caminho_arquivo: null,
    }, req.usuario);
    if (res.headersSent) return;
    if (preparado.existente) {
      return res.status(200).json({
        status: "success",
        message: "Operação já processada anteriormente. Evidência existente retornada.",
        data: preparado.existente,
      });
    }
    const arquivo = await evidenciaArquivoUtils.persistirUploadAutorizado(
      req.file, req.usuario, preparado.dados.id_local
    );
    arquivoPersistido = true;
    // A escrita SQL revalida o contexto; não usa a leitura prévia como autorização final.
    const resultado = await evidenciaMultiTenantService.criarEvidencia({
      ...preparado.dados, caminho_arquivo: arquivo.caminho_arquivo,
    }, req.usuario, { incluirResultadoCriacao: true });
    associado = resultado.criada === true;
    if (!associado) console.warn("Upload sem associação: reconciliação segura pendente.");
    if (res.headersSent) return;
    // Nenhum unlink automático: falha ou corrida não comprova ausência de
    // referência. Arquivo não associado fica pendente para reconciliação segura.
    return res.status(resultado.criada ? 201 : 200).json({
      status: "success",
      message: resultado.criada
        ? "Arquivo enviado e evidência criada com sucesso."
        : "Operação já processada anteriormente. Evidência existente retornada.",
      data: resultado.evidencia,
    });
  } catch (erro) {
    if (arquivoPersistido && !associado) console.warn("Upload sem associação: reconciliação segura pendente.");
    if (res.headersSent) return;
    next(erro);
  }
}

/**
 * Lista as evidências que o usuário autenticado
 * possui permissão para visualizar.
 */
async function listar(req, res, next) {
  if (res.headersSent) return;
  try {
    const evidencias =
      await evidenciaMultiTenantService.listarEvidencias(
        req.usuario
      );

    if (res.headersSent) return;
    return res.status(200).json({
      status: "success",
      total: evidencias.length,
      data: evidencias,
    });
  } catch (erro) {
    if (res.headersSent) return;
    next(erro);
  }
}

/**
 * Busca uma evidência pelo ID respeitando
 * as permissões do usuário autenticado.
 */
async function buscarPorId(req, res, next) {
  if (res.headersSent) return;
  try {
    const evidencia =
      await evidenciaMultiTenantService
        .buscarEvidenciaPorId(
          req.params.id,
          req.usuario
        );

    if (res.headersSent) return;
    return res.status(200).json({
      status: "success",
      data: evidencia,
    });
  } catch (erro) {
    if (res.headersSent) return;
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
  if (res.headersSent) return;
  try {
    const evidencias =
      await evidenciaMultiTenantService
        .listarEvidenciasPorLocal(
          req.params.idLocal,
          req.usuario
        );

    if (res.headersSent) return;
    return res.status(200).json({
      status: "success",
      total: evidencias.length,
      data: evidencias,
    });
  } catch (erro) {
    if (res.headersSent) return;
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
  if (res.headersSent) return;
  try {
    const evidencia =
      await evidenciaMultiTenantService
        .atualizarEvidencia(
          req.params.id,
          req.body,
          req.usuario
        );

    if (res.headersSent) return;
    return res.status(200).json({
      status: "success",
      message:
        "Evidência atualizada com sucesso.",
      data: evidencia,
    });
  } catch (erro) {
    if (res.headersSent) return;
    next(erro);
  }
}

/**
 * Exclui uma evidência.
 *
 * Exclui apenas o registro autorizado. A limpeza física depende de
 * reconciliação de propriedade e referências; não remove arquivos legados.
 */
async function excluir(req, res, next) {
  if (res.headersSent) return;
  try {
    const evidencia =
      await evidenciaMultiTenantService
        .excluirEvidencia(
          req.params.id,
          req.usuario
        );

    if (res.headersSent) return;
    return res.status(200).json({
      status: "success",
      message:
        "Evidência excluída com sucesso.",
      data: evidencia,
    });
  } catch (erro) {
    if (res.headersSent) return;
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
