const express = require("express");

const dadosTecnicosController = require(
  "../controllers/dadosTecnicosController"
);

const {
  autenticar,
} = require("../middlewares/autenticacaoMiddleware");

const router = express.Router();

/*
 * Todas as rotas de dados técnicos
 * exigem autenticação JWT.
 */
router.use(autenticar);


/*
 * POST /api/dados-tecnicos
 * Cria os dados técnicos de um local.
 */
router.post(
  "/",
  dadosTecnicosController.criar
);


/*
 * GET /api/dados-tecnicos
 * Lista todos os registros.
 */
router.get(
  "/",
  dadosTecnicosController.listar
);


/*
 * GET /api/dados-tecnicos/local/:idLocal
 * Busca os dados técnicos de um local específico.
 *
 * IMPORTANTE:
 * esta rota deve vir antes de /:id
 */
router.get(
  "/local/:idLocal",
  dadosTecnicosController.buscarPorLocal
);


/*
 * GET /api/dados-tecnicos/:id
 * Busca um registro pelo ID.
 */
router.get(
  "/:id",
  dadosTecnicosController.buscarPorId
);


/*
 * PUT /api/dados-tecnicos/:id
 * Atualiza os dados técnicos.
 */
router.put(
  "/:id",
  dadosTecnicosController.atualizar
);


/*
 * DELETE /api/dados-tecnicos/:id
 * Exclui os dados técnicos.
 */
router.delete(
  "/:id",
  dadosTecnicosController.excluir
);


module.exports = router;