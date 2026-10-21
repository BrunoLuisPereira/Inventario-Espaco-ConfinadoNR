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
const { autorizarCapacidade } = require('../utils/permissoes');
const permissoesController = require('../controllers/usuarioPermissoesController');
const auditoriaExportacaoController = require('../controllers/auditoriaExportacaoController');
router.get('/auditoria/perfis/exportar', autenticarMultiTenant, autorizarCapacidade('usuarios.auditoria.consultar'), auditoriaExportacaoController.historicoCompleto);
router.get('/auditoria/entidades', autenticarMultiTenant, autorizarCapacidade('auditoria.consultar'), permissoesController.historico);
router.get('/auditoria/perfis', autenticarMultiTenant, autorizarCapacidade('usuarios.auditoria.consultar'), permissoesController.auditoria);
router.patch('/:id/permissoes', autenticarMultiTenant, autorizarCapacidade('usuarios.permissoes.alterar'), permissoesController.alterar);

// Consultas e alterações usam identidade atual. O cadastro direto POST
// permanece legado até sua revisão específica.
router.get("/", autenticarMultiTenant, autorizarCapacidade('usuarios.consultar'), usuarioController.listar);
router.get("/:id", autenticarMultiTenant, autorizarCapacidade('usuarios.consultar'), usuarioController.buscarPorId);
router.put("/:id", autenticarMultiTenant, autorizarCapacidade('usuarios.editar'), usuarioController.atualizar);
router.patch("/:id/status", autenticarMultiTenant, autorizarCapacidade('usuarios.status'), usuarioController.alterarStatus);

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
