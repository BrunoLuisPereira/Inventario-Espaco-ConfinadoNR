const express = require("express");

const sincronizacaoController = require(
  "../controllers/sincronizacaoController"
);

const {
  autenticar,
} = require("../middlewares/autenticacaoMiddleware");

const router = express.Router();


// ======================================================
// Todas as rotas de sincronização exigem autenticação
// ======================================================

router.use(autenticar);


// ======================================================
// Criar registro de sincronização
// POST /api/sincronizacoes
// ======================================================

router.post(
  "/",
  sincronizacaoController.criar
);


// ======================================================
// Listar todas as sincronizações
// GET /api/sincronizacoes
// ======================================================

router.get(
  "/",
  sincronizacaoController.listar
);


// ======================================================
// Buscar sincronizações pendentes
// GET /api/sincronizacoes/pendentes
// ======================================================

router.get(
  "/pendentes",
  sincronizacaoController.buscarPendentes
);


// ======================================================
// Buscar conflitos
// GET /api/sincronizacoes/conflitos
// ======================================================

router.get(
  "/conflitos",
  sincronizacaoController.buscarConflitos
);


// ======================================================
// Buscar sincronizações por entidade
// GET /api/sincronizacoes/entidade/:entidade/:idEntidade
// ======================================================

router.get(
  "/entidade/:entidade/:idEntidade",
  sincronizacaoController.buscarPorEntidade
);


// ======================================================
// Resolver conflito
// PATCH /api/sincronizacoes/:id/resolver
// ======================================================

router.patch(
  "/:id/resolver",
  sincronizacaoController.resolverConflito
);


// ======================================================
// Processar sincronização pendente
// POST /api/sincronizacoes/:id/processar
// ======================================================

router.post(
  "/:id/processar",
  sincronizacaoController.processarSincronizacao
);


// ======================================================
// Atualizar status da sincronização
// PATCH /api/sincronizacoes/:id/status
// ======================================================

router.patch(
  "/:id/status",
  sincronizacaoController.atualizarStatus
);


// ======================================================
// Buscar sincronização por ID
// GET /api/sincronizacoes/:id
// ======================================================

router.get(
  "/:id",
  sincronizacaoController.buscarPorId
);


// ======================================================
// Excluir sincronização
// DELETE /api/sincronizacoes/:id
// ======================================================

router.delete(
  "/:id",
  sincronizacaoController.excluir
);


module.exports = router;