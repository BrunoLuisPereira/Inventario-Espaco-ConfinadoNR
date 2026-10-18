const express = require('express');
const authController = require('../controllers/authController');
const contaService = require('../services/contaMultiTenantService');
const { autenticarMultiTenant } = require('../middlewares/autenticacaoMiddleware');

const router = express.Router();
router.post('/login', authController.login);

// Apenas erros gerados pela conta possuem mensagens públicas controladas.
function handler(operacao, message, mensagemInterna, incluirData = true) {
  return async (req, res) => {
    if (res.headersSent) return res;
    try {
      const data = await operacao(req);
      if (res.headersSent) return res;
      return res.status(200).json({ status: 'success', message, ...(incluirData ? { data } : {}) });
    } catch (erro) {
      if (res.headersSent) return res;
      const statusCode = erro?.publicoConta === true && Number.isInteger(erro.statusCode) &&
        erro.statusCode >= 400 && erro.statusCode <= 599 ? erro.statusCode : 500;
      console.error('Falha na operação de conta autenticada.', { statusCode });
      return res.status(statusCode).json({
        status: 'error', message: statusCode < 500 ? erro.message : mensagemInterna,
      });
    }
  };
}

router.get('/me', autenticarMultiTenant, handler(
  async (req) => {
    const atual = await contaService.buscarPerfil(req.usuario);
    // Preserva os dois campos anteriores, agora provenientes do banco.
    return { id_usuario: atual.id_usuario, perfil_acesso: atual.perfil_acesso };
  }, 'Usuário autenticado.', 'Erro interno ao validar a autenticação.'
));
router.get('/perfil', autenticarMultiTenant, handler(
  (req) => contaService.buscarPerfil(req.usuario),
  'Perfil consultado com sucesso.', 'Erro interno ao consultar perfil.'
));
router.put('/perfil', autenticarMultiTenant, handler(
  (req) => contaService.atualizarPerfil(req.body, req.usuario),
  'Perfil atualizado com sucesso.', 'Erro interno ao atualizar perfil.'
));
router.put('/senha', autenticarMultiTenant, handler(
  (req) => contaService.alterarSenha(req.body, req.usuario),
  'Senha alterada com sucesso.', 'Erro interno ao alterar senha.', false
));

module.exports = router;
