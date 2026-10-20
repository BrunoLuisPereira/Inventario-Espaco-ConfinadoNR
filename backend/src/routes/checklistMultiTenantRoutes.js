const express = require("express");
const checklistMultiTenantController = require("../controllers/checklistMultiTenantController");

const {
  autenticarMultiTenant,
} = require("../middlewares/autenticacaoMiddleware");

const router = express.Router();

// Não registrar estas rotas na aplicação antes da homologação multi-tenant.
router.use(autenticarMultiTenant);

router.post("/", checklistMultiTenantController.criar);
router.get("/", checklistMultiTenantController.listar);
router.get("/:id", checklistMultiTenantController.buscarPorId);
router.put("/:id", checklistMultiTenantController.atualizar);
router.patch("/:id/status", checklistMultiTenantController.alterarStatus);

module.exports = router;
