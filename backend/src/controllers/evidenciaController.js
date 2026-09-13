const evidenciaService = require(
  "../services/evidenciaService"
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
      await evidenciaService.criarEvidencia(
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

    /*
     * Define automaticamente o tipo da evidência
     * de acordo com o arquivo recebido.
     */
    const tipo =
      req.file.mimetype === "application/pdf"
        ? "DOCUMENTO"
        : "FOTO";

    /*
     * Caminho relativo salvo no PostgreSQL.
     */
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
        },
        req.usuario
      );

    /*
     * Se o Service devolveu uma evidência cujo
     * caminho é diferente do arquivo recém-enviado,
     * significa que o id_operacao_cliente já havia
     * sido processado anteriormente.
     *
     * O Multer já salvou uma nova cópia no disco,
     * portanto removemos essa cópia para evitar
     * arquivo órfão.
     */
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
    /*
     * O Multer salva o arquivo antes de o Service
     * validar completamente a operação.
     *
     * Se ocorrer algum erro depois do upload,
     * removemos o arquivo físico recém-recebido
     * para evitar arquivos órfãos.
     */
    if (caminhoArquivo) {
      await evidenciaArquivoUtils.removerArquivo(
        caminhoArquivo
      );
    }

    next(erro);
  }
}

/**
 * Lista todas as evidências.
 */
async function listar(req, res, next) {
  try {
    const evidencias =
      await evidenciaService.listarEvidencias();

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
 * Busca uma evidência pelo ID.
 */
async function buscarPorId(req, res, next) {
  try {
    const evidencia =
      await evidenciaService
        .buscarEvidenciaPorId(
          req.params.id
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
 * Lista as evidências de determinado local.
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
          req.params.idLocal
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
  atualizar,
  excluir,
};