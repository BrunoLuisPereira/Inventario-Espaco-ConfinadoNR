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

// Consultas e alterações usam identidade atual. O cadastro direto POST
// permanece legado até sua revisão específica.
router.get("/", autenticarMultiTenant, autorizar("ADMINISTRADOR"), usuarioController.listar);
router.get("/:id", autenticarMultiTenant, autorizar("ADMINISTRADOR"), usuarioController.buscarPorId);
router.put("/:id", autenticarMultiTenant, autorizar("ADMINISTRADOR"), usuarioController.atualizar);
router.patch("/:id/status", autenticarMultiTenant, autorizar("ADMINISTRADOR"), usuarioController.alterarStatus);

router.use(
  autenticar,
  autorizar("ADMINISTRADOR")
);

router.post("/", (req, res) => {
  if (res.headersSent) return res;

  return res.status(403).json({
    status: "error",
    message: "Cadastro direto de usuários desativado. Utilize o fluxo de convites.",
  });
});

module.exports = router;
