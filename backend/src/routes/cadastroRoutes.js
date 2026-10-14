
const express = require("express");

const cadastroController = require(
  "../controllers/cadastroController"
);

const router = express.Router();

/**
 * POST /api/cadastro/ambiente
 *
 * Cadastro público de um novo ambiente
 * e de seu primeiro administrador.
 *
 * IMPORTANTE:
 * Esta rota depende da migração 020.
 *
 * NÃO registrar no app.js antes
 * da homologação das migrações.
 */
router.post(
  "/ambiente",
  cadastroController.cadastrarAmbiente
);

module.exports = router;
