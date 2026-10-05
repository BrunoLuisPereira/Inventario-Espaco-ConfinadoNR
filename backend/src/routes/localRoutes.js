const express = require("express");
const localController = require("../controllers/localController");

const {
  autenticar,
} = require("../middlewares/autenticacaoMiddleware");

const router = express.Router();

router.use(autenticar);

// Criar local
router.post("/", localController.criar);

// Listar todos os locais
router.get("/", localController.listar);

// Exportar locais para Excel
// IMPORTANTE: deve ficar antes da rota "/:id"
router.get("/exportar", localController.exportar);

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