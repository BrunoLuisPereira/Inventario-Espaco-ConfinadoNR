const express = require("express");
const evidenciaController = require("../controllers/evidenciaController");

const {
  autenticar,
} = require("../middlewares/autenticacaoMiddleware");

const {
  uploadEvidencia,
} = require("../middlewares/uploadEvidenciaMiddleware");

const router = express.Router();

router.use(autenticar);

router.post("/", evidenciaController.criar);

router.post(
  "/upload",
  uploadEvidencia.single("arquivo"),
  evidenciaController.criarComUpload
);

router.get("/", evidenciaController.listar);
router.get("/local/:idLocal", evidenciaController.listarPorLocal);
router.get("/:id", evidenciaController.buscarPorId);
router.put("/:id", evidenciaController.atualizar);
router.delete("/:id", evidenciaController.excluir);

module.exports = router;