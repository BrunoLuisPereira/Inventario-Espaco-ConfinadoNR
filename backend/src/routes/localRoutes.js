const express = require("express");
const localController = require("../controllers/localController");

const {
  autenticar,
  autenticarMultiTenant,
} = require("../middlewares/autenticacaoMiddleware");

const router = express.Router();

// Somente a exportação usa identidade e ambiente revalidados.
// Deve preceder o middleware legado e a rota "/:id".
router.get("/exportar", autenticarMultiTenant, localController.exportar);

router.use(autenticar);

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
