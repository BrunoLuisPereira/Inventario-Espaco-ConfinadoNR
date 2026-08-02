const bcrypt = require("bcryptjs");
const usuarioRepository = require("../repositories/usuarioRepository");

const PERFIS_PERMITIDOS = [
  "ADMINISTRADOR",
  "ENGENHEIRO_SEGURANCA",
];

/**
 * Valida e cria um usuário.
 *
 * @param {object} dados
 * @returns {Promise<object>}
 */
async function criarUsuario(dados) {
  const {
    nome,
    email,
    senha,
    perfil_acesso: perfilAcesso,
  } = dados;

  if (!nome || typeof nome !== "string" || !nome.trim()) {
    const error = new Error("O nome é obrigatório.");
    error.statusCode = 400;
    throw error;
  }

  if (!email || typeof email !== "string" || !email.trim()) {
    const error = new Error("O e-mail é obrigatório.");
    error.statusCode = 400;
    throw error;
  }

  if (!senha || typeof senha !== "string") {
    const error = new Error("A senha é obrigatória.");
    error.statusCode = 400;
    throw error;
  }

  if (senha.length < 8) {
    const error = new Error(
      "A senha deve possuir pelo menos 8 caracteres."
    );
    error.statusCode = 400;
    throw error;
  }

  if (!PERFIS_PERMITIDOS.includes(perfilAcesso)) {
    const error = new Error(
      "O perfil deve ser ADMINISTRADOR ou ENGENHEIRO_SEGURANCA."
    );
    error.statusCode = 400;
    throw error;
  }

  const nomeNormalizado = nome.trim();
  const emailNormalizado = email.trim().toLowerCase();

  const usuarioExistente =
    await usuarioRepository.buscarPorEmail(emailNormalizado);

  if (usuarioExistente) {
    const error = new Error("Já existe um usuário com este e-mail.");
    error.statusCode = 409;
    throw error;
  }

  // O número 12 representa o custo de processamento do hash.
  const senhaHash = await bcrypt.hash(senha, 12);

  return usuarioRepository.criar({
    nome: nomeNormalizado,
    email: emailNormalizado,
    senhaHash,
    perfilAcesso,
  });
}

module.exports = {
  criarUsuario,
};