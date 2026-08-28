const express = require("express");

const checklistController = require("../controllers/checklistController");
const { autenticar } = require("../middlewares/autenticacaoMiddleware");

const router = express.Router();

router.use(autenticar);

router.post("/", checklistController.criar);
router.get("/", checklistController.listar);
router.get("/:id", checklistController.buscarPorId);
router.put("/:id", checklistController.atualizar);
router.patch("/:id/status", checklistController.alterarStatus);

module.exports = router;