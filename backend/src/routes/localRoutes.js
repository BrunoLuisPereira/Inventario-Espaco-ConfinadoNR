const express = require("express");
const localController = require("../controllers/localController");

const {
  autenticar,
} = require("../middlewares/autenticacaoMiddleware");

const router = express.Router();

router.use(autenticar);

router.post("/", localController.criar);
router.get("/", localController.listar);
router.get("/:id", localController.buscarPorId);
router.put("/:id", localController.atualizar);
router.patch("/:id/status", localController.alterarStatus);

module.exports = router;