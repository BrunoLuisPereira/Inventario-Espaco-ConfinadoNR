const { autorizarModulo } = require('../utils/permissoes');
const express = require("express");
const evidenciaController = require(
  "../controllers/evidenciaController"
);

const {
  autenticarMultiTenant,
} = require("../middlewares/autenticacaoMiddleware");

const {
  uploadEvidencia,
} = require("../middlewares/uploadEvidenciaMiddleware");

const router = express.Router();

// Todas as operações revalidam a identidade antes de ler dados ou receber uploads.
router.use(autenticarMultiTenant);
router.use(autorizarModulo('evidencias'));

// O download revalida a identidade e o ambiente antes de acessar o arquivo.
router.get(
  "/:id/arquivo",
  evidenciaController.visualizarArquivo
);

// Criar evidência sem upload de arquivo.
router.post(
  "/",
  evidenciaController.criar
);

// Criar evidência com upload de JPG, PNG ou PDF.
router.post(
  "/upload",
  uploadEvidencia.single("arquivo"),
  evidenciaController.criarComUpload
);

// Listar todas as evidências permitidas ao usuário.
router.get(
  "/",
  evidenciaController.listar
);

// Listar evidências de um local específico.
router.get(
  "/local/:idLocal",
  evidenciaController.listarPorLocal
);

// Buscar uma evidência específica.
router.get(
  "/:id",
  evidenciaController.buscarPorId
);

// Atualizar uma evidência.
router.put(
  "/:id",
  evidenciaController.atualizar
);

// Excluir uma evidência.
router.delete(
  "/:id",
  evidenciaController.excluir
);

module.exports = router;
