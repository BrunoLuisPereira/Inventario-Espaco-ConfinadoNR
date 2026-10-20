const { autorizarModulo } = require('../utils/permissoes');
const express = require("express");
const campanhaController = require("../controllers/campanhaController");

const {
  autenticarMultiTenant,
} = require("../middlewares/autenticacaoMiddleware");

const router = express.Router();

router.use(autenticarMultiTenant);
router.use(autorizarModulo('campanhas'));

router.post("/", campanhaController.criar);
router.get("/", campanhaController.listar);
router.get("/:id", campanhaController.buscarPorId);
router.put("/:id", campanhaController.atualizar);
router.patch("/:id/status", campanhaController.alterarStatus);

module.exports = router;
