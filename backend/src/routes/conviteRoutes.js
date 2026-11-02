const { autorizarCapacidade } = require('../utils/permissoes');

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
// Token no corpo para evitar exposição em URLs de API e logs de acesso.
router.post('/validar', conviteController.preValidar);

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
  autorizarCapacidade('convites.criar'),
  conviteController.emitir
);

module.exports = router;
