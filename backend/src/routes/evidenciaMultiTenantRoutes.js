const express = require("express");
const evidenciaMultiTenantController = require("../controllers/evidenciaMultiTenantController");

const {
  autenticarMultiTenant,
} = require("../middlewares/autenticacaoMiddleware");

const router = express.Router();

// Não registrar estas rotas na aplicação antes da homologação multi-tenant.
router.use(autenticarMultiTenant);

router.post("/", evidenciaMultiTenantController.criar);
router.get("/", evidenciaMultiTenantController.listar);

// Manter a rota de locais antes da busca por ID de evidência.
router.get("/local/:idLocal", evidenciaMultiTenantController.listarPorLocal);
router.get("/:id", evidenciaMultiTenantController.buscarPorId);

router.put("/:id", evidenciaMultiTenantController.atualizar);
router.delete("/:id", evidenciaMultiTenantController.excluir);

module.exports = router;
