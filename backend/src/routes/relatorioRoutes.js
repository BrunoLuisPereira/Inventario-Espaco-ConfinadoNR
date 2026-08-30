const express = require("express");

const relatorioController = require("../controllers/relatorioController");

const { autenticar } = require("../middlewares/autenticacaoMiddleware");

const router = express.Router();

router.use(autenticar);

router.post("/", relatorioController.criar);

router.get("/", relatorioController.listar);

router.get(
  "/local/:idLocal",
  relatorioController.buscarPorLocal
);

router.get(
  "/:id/completo",
  relatorioController.buscarCompleto
);

router.post(
  "/:id/gerar-pdf",
  relatorioController.gerarPdf
);

router.get(
  "/:id/pdf",
  relatorioController.baixarPdf
);

router.get(
  "/:id",
  relatorioController.buscarPorId
);

router.put(
  "/:id",
  relatorioController.atualizar
);

router.delete(
  "/:id",
  relatorioController.excluir
);

module.exports = router;