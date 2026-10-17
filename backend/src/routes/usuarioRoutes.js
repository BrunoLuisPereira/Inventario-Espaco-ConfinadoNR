const express = require("express");
const usuarioController = require("../controllers/usuarioController");

const {
  autenticar,
  autenticarMultiTenant,
} = require("../middlewares/autenticacaoMiddleware");

const {
  autorizar,
} = require("../middlewares/autorizacaoMiddleware");

const router = express.Router();

// Consultas usam identidade e perfil atuais do banco. As escritas abaixo
// continuam com a autenticação legada até sua revisão específica.
router.get("/", autenticarMultiTenant, autorizar("ADMINISTRADOR"), usuarioController.listar);
router.get("/:id", autenticarMultiTenant, autorizar("ADMINISTRADOR"), usuarioController.buscarPorId);

router.use(
  autenticar,
  autorizar("ADMINISTRADOR")
);

router.post("/", usuarioController.criar);
router.put("/:id", usuarioController.atualizar);
router.patch("/:id/status", usuarioController.alterarStatus);

module.exports = router;
