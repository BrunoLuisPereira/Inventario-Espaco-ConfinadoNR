const authService = require("../services/authService");
const express = require("express");
const authController = require("../controllers/authController");
const usuarioRepository = require("../repositories/usuarioRepository");

const {
  autenticar,
} = require("../middlewares/autenticacaoMiddleware");

const router = express.Router();

router.post("/login", authController.login);

router.get("/me", autenticar, (req, res) => {
  return res.status(200).json({
    status: "success",
    message: "Usuário autenticado.",
    data: req.usuario,
  });
});

/**
 * GET /api/auth/perfil
 *
 * Retorna os dados atualizados do usuário autenticado.
 * O ID é obtido do token JWT.
 */
router.get("/perfil", autenticar, async (req, res) => {
  try {
    const idUsuario = req.usuario.id_usuario;

    const usuario = await usuarioRepository.buscarPorId(
      idUsuario
    );

    if (!usuario || !usuario.ativo) {
      return res.status(404).json({
        status: "error",
        message: "Usuário não encontrado ou desativado.",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Perfil consultado com sucesso.",
      data: usuario,
    });
  } catch (error) {
    console.error("Erro ao consultar perfil:", error);

    return res.status(500).json({
      status: "error",
      message: "Erro interno ao consultar perfil.",
    });
  }
});

/**
 * PUT /api/auth/perfil
 *
 * Atualiza apenas o nome e o e-mail
 * do usuário autenticado.
 */
router.put("/perfil", autenticar, async (req, res) => {
  try {
    const idUsuario = req.usuario.id_usuario;
    const { nome, email } = req.body || {};

    if (
      typeof nome !== "string" ||
      !nome.trim() ||
      typeof email !== "string" ||
      !email.trim()
    ) {
      return res.status(400).json({
        status: "error",
        message: "Nome e e-mail são obrigatórios.",
      });
    }

    const emailNormalizado = email.trim().toLowerCase();

    const usuarioAtual =
      await usuarioRepository.buscarPorId(idUsuario);

    if (!usuarioAtual || !usuarioAtual.ativo) {
      return res.status(403).json({
        status: "error",
        message: "Usuário não encontrado ou desativado.",
      });
    }

    const usuarioMesmoEmail =
      await usuarioRepository.buscarPorEmail(
        emailNormalizado
      );

    if (
      usuarioMesmoEmail &&
      Number(usuarioMesmoEmail.id_usuario) !== idUsuario
    ) {
      return res.status(409).json({
        status: "error",
        message: "Já existe outro usuário com este e-mail.",
      });
    }

    const usuarioAtualizado =
      await usuarioRepository.atualizar(idUsuario, {
        nome: nome.trim(),
        email: emailNormalizado,
        perfilAcesso: usuarioAtual.perfil_acesso,
      });

    return res.status(200).json({
      status: "success",
      message: "Perfil atualizado com sucesso.",
      data: usuarioAtualizado,
    });
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        status: "error",
        message: "Já existe outro usuário com este e-mail.",
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Erro interno ao atualizar perfil.",
    });
  }
});

/**
 * PUT /api/auth/senha
 *
 * Permite ao usuário autenticado
 * alterar somente a própria senha.
 */
router.put("/senha", autenticar, async (req, res) => {
  try {
    const idUsuario = req.usuario.id_usuario;

    await authService.alterarSenha(
      idUsuario,
      req.body
    );

    return res.status(200).json({
      status: "success",
      message: "Senha alterada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);

    return res.status(error.statusCode || 500).json({
      status: "error",
      message:
        error.statusCode
          ? error.message
          : "Erro interno ao alterar senha.",
    });
  }
});

module.exports = router;
