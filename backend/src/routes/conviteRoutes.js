
const express = require("express");

const conviteController = require(
  "../controllers/conviteController"
);

const {
  autenticarMultiTenant,
} = require(
  "../middlewares/autenticacaoMiddleware"
);

const {
  autorizar,
} = require(
  "../middlewares/autorizacaoMiddleware"
);

const router = express.Router();

/**
 * POST /api/convites/aceitar
 *
 * Rota pública para aceitar um convite.
 *
 * O token será validado pelo serviço,
 * que também verificará o ambiente.
 */
router.post(
  "/aceitar",
  conviteController.aceitar
);

/**
 * POST /api/convites
 *
 * Somente administradores autenticados
 * podem emitir novos convites.
 *
 * A identidade e o perfil são recuperados
 * diretamente do PostgreSQL.
 */
router.post(
  "/",
  autenticarMultiTenant,
  autorizar("ADMINISTRADOR"),
  conviteController.emitir
);

module.exports = router;
