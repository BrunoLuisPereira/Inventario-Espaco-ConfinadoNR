const express = require("express");
const localMultiTenantController = require("../controllers/localMultiTenantController");

const {
  autenticarMultiTenant,
} = require("../middlewares/autenticacaoMiddleware");

const router = express.Router();

// Não registrar estas rotas na aplicação antes da homologação multi-tenant.
router.use(autenticarMultiTenant);

router.post("/", localMultiTenantController.criar);
router.get("/", localMultiTenantController.listar);

// Deve permanecer antes de /:id para evitar conflito de rotas.
router.get("/exportar", localMultiTenantController.exportar);
router.get("/:id", localMultiTenantController.buscarPorId);

router.put("/:id", localMultiTenantController.atualizar);
router.patch("/:id/status", localMultiTenantController.alterarStatus);

module.exports = router;
