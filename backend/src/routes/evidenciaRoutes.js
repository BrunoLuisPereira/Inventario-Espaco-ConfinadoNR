const express = require("express");
const evidenciaController = require(
  "../controllers/evidenciaController"
);

const {
  autenticar,
} = require("../middlewares/autenticacaoMiddleware");

const {
  uploadEvidencia,
} = require("../middlewares/uploadEvidenciaMiddleware");

const router = express.Router();

// Todas as rotas de evidências exigem autenticação.
router.use(autenticar);

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

// Visualizar o arquivo de uma evidência.
// Deve ficar antes da rota GET /:id.
router.get(
  "/:id/arquivo",
  evidenciaController.visualizarArquivo
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