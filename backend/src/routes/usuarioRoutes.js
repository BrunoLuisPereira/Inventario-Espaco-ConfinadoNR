const express = require("express");
const usuarioController = require("../controllers/usuarioController");

const {
  autenticar,
} = require("../middlewares/autenticacaoMiddleware");

const {
  autorizar,
} = require("../middlewares/autorizacaoMiddleware");

const router = express.Router();

router.use(
  autenticar,
  autorizar("ADMINISTRADOR")
);

router.post("/", usuarioController.criar);
router.get("/", usuarioController.listar);
router.get("/:id", usuarioController.buscarPorId);
router.put("/:id", usuarioController.atualizar);
router.patch("/:id/status", usuarioController.alterarStatus);

module.exports = router;