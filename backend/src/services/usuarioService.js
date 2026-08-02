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
async function listarUsuarios() {
  return usuarioRepository.listarTodos();
}

async function buscarUsuarioPorId(idUsuario) {
  const id = Number(idUsuario);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("O ID do usuário é inválido.");
    error.statusCode = 400;
    throw error;
  }

  const usuario = await usuarioRepository.buscarPorId(id);

  if (!usuario) {
    const error = new Error("Usuário não encontrado.");
    error.statusCode = 404;
    throw error;
  }

  return usuario;
}
async function atualizarUsuario(idUsuario, dados) {
  const id = Number(idUsuario);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("O ID do usuário é inválido.");
    error.statusCode = 400;
    throw error;
  }

  const usuarioAtual =
    await usuarioRepository.buscarPorId(id);

  if (!usuarioAtual) {
    const error = new Error("Usuário não encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const {
    nome,
    email,
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

  if (!PERFIS_PERMITIDOS.includes(perfilAcesso)) {
    const error = new Error(
      "O perfil deve ser ADMINISTRADOR ou ENGENHEIRO_SEGURANCA."
    );
    error.statusCode = 400;
    throw error;
  }

  const nomeNormalizado = nome.trim();
  const emailNormalizado = email.trim().toLowerCase();

  const usuarioMesmoEmail =
    await usuarioRepository.buscarPorEmail(emailNormalizado);

  if (
    usuarioMesmoEmail &&
    Number(usuarioMesmoEmail.id_usuario) !== id
  ) {
    const error = new Error(
      "Já existe outro usuário com este e-mail."
    );
    error.statusCode = 409;
    throw error;
  }

  return usuarioRepository.atualizar(id, {
    nome: nomeNormalizado,
    email: emailNormalizado,
    perfilAcesso,
  });
}

async function alterarStatusUsuario(idUsuario, dados) {
  const id = Number(idUsuario);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("O ID do usuário é inválido.");
    error.statusCode = 400;
    throw error;
  }

  if (typeof dados.ativo !== "boolean") {
    const error = new Error(
      "O campo ativo deve ser verdadeiro ou falso."
    );
    error.statusCode = 400;
    throw error;
  }

  const usuario = await usuarioRepository.buscarPorId(id);

  if (!usuario) {
    const error = new Error("Usuário não encontrado.");
    error.statusCode = 404;
    throw error;
  }

  return usuarioRepository.atualizarStatus(
    id,
    dados.ativo
  );
}

module.exports = {
  criarUsuario,
  listarUsuarios,
  buscarUsuarioPorId,
  atualizarUsuario,
  alterarStatusUsuario,
};