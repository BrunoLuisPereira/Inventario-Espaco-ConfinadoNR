const express = require("express");
const campanhaMultiTenantController = require("../controllers/campanhaMultiTenantController");

const {
  autenticarMultiTenant,
} = require("../middlewares/autenticacaoMiddleware");

const router = express.Router();

// Não registrar na aplicação antes da homologação multi-tenant.
router.use(autenticarMultiTenant);

router.post("/", campanhaMultiTenantController.criar);
router.get("/", campanhaMultiTenantController.listar);
router.get("/:id", campanhaMultiTenantController.buscarPorId);
router.put("/:id", campanhaMultiTenantController.atualizar);
router.patch("/:id/status", campanhaMultiTenantController.alterarStatus);

module.exports = router;
