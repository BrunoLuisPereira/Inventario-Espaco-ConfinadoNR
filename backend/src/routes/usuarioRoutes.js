const express = require("express");
const usuarioController = require("../controllers/usuarioController");

const router = express.Router();

router.post("/", usuarioController.criar);
router.get("/", usuarioController.listar);
router.get("/:id", usuarioController.buscarPorId);
router.put("/:id", usuarioController.atualizar);
router.patch("/:id/status", usuarioController.alterarStatus);

module.exports = router;