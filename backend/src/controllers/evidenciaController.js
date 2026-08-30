const fs = require("fs");

const evidenciaService = require("../services/evidenciaService");


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
 */
async function criarComUpload(req, res, next) {
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
     * Caminho relativo que será salvo
     * no PostgreSQL.
     */
    const caminhoArquivo =
      `uploads/evidencias/${req.file.filename}`;

    const evidencia =
      await evidenciaService.criarEvidencia(
        {
          id_local: req.body.id_local,
          tipo,
          descricao: req.body.descricao,
          caminho_arquivo: caminhoArquivo,
        },
        req.usuario
      );

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
     * Portanto, se ocorrer algum erro depois
     * do upload, removemos o arquivo físico
     * para evitar arquivos órfãos.
     */
    if (req.file && req.file.path) {
      try {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (erroArquivo) {
        console.error(
          "Erro ao remover arquivo após falha no upload:",
          erroArquivo
        );
      }
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
      await evidenciaService.buscarEvidenciaPorId(
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
async function listarPorLocal(req, res, next) {
  try {
    const evidencias =
      await evidenciaService.listarEvidenciasPorLocal(
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
      await evidenciaService.atualizarEvidencia(
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
      await evidenciaService.excluirEvidencia(
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