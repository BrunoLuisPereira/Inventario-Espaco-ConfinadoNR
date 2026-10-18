const express = require("express");
const localController = require("../controllers/localController");

const {
  autenticarMultiTenant,
} = require("../middlewares/autenticacaoMiddleware");

const router = express.Router();

// Uma única autenticação atual para todas as operações montadas.
router.use(autenticarMultiTenant);
// A exportação deve preceder "/:id".
router.get("/exportar", localController.exportar);

// Criar local
router.post("/", localController.criar);

// Listar todos os locais
router.get("/", localController.listar);

// Buscar local por ID
router.get("/:id", localController.buscarPorId);

// Atualizar local
router.put("/:id", localController.atualizar);

// Alterar status do local
router.patch(
  "/:id/status",
  localController.alterarStatus
);

module.exports = router;
