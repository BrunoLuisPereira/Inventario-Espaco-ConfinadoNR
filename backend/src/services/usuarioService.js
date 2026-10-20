const bcrypt = require("bcryptjs");
const usuarioRepository = require("../repositories/usuarioRepository");

const { perfis: PERFIS_PERMITIDOS } = require('../utils/permissoes');

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
// Identidade vem de req.usuario, revalidada pelo middleware, nunca do cliente.
// Nas escritas, o repositório revalida novamente dentro da transação.
function validarAdministradorConsulta(usuarioAutenticado) {
  if (
    !usuarioAutenticado ||
    !Number.isSafeInteger(usuarioAutenticado.id_usuario) ||
    usuarioAutenticado.id_usuario <= 0 ||
    typeof usuarioAutenticado.id_ambiente !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usuarioAutenticado.id_ambiente)
  ) {
    const error = new Error("Usuário não autenticado.");
    error.statusCode = 401;
    throw error;
  }
  if (usuarioAutenticado.perfil_acesso !== "ADMINISTRADOR") {
    const error = new Error("Você não possui permissão para acessar este recurso.");
    error.statusCode = 403;
    throw error;
  }
  return usuarioAutenticado.id_ambiente;
}

async function listarUsuarios(usuarioAutenticado) {
  const idAmbiente = validarAdministradorConsulta(usuarioAutenticado);
  return usuarioRepository.listarPorAmbiente(idAmbiente);
}

async function buscarUsuarioPorId(idUsuario, usuarioAutenticado) {
  const idAmbiente = validarAdministradorConsulta(usuarioAutenticado);
  const id = Number(idUsuario);

  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error("O ID do usuário é inválido.");
    error.statusCode = 400;
    throw error;
  }

  const usuario = await usuarioRepository.buscarPorIdEAmbiente(id, idAmbiente);

  if (!usuario) {
    const error = new Error("Usuário não encontrado.");
    error.statusCode = 404;
    throw error;
  }

  return usuario;
}
async function atualizarUsuario(idUsuario, dados, usuarioAutenticado) {
  validarAdministradorConsulta(usuarioAutenticado);
  const id = Number(idUsuario);

  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error("O ID do usuário é inválido.");
    error.statusCode = 400;
    throw error;
  }

  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    const error = new Error("Dados do usuário inválidos.");
    error.statusCode = 400;
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

  return usuarioRepository.atualizarNoAmbiente(id, {
    nome: nomeNormalizado,
    email: emailNormalizado,
    perfilAcesso,
  }, usuarioAutenticado);
}

async function alterarStatusUsuario(idUsuario, dados, usuarioAutenticado) {
  validarAdministradorConsulta(usuarioAutenticado);
  const id = Number(idUsuario);

  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error("O ID do usuário é inválido.");
    error.statusCode = 400;
    throw error;
  }

  if (!dados || typeof dados !== "object" || Array.isArray(dados) || typeof dados.ativo !== "boolean") {
    const error = new Error(
      "O campo ativo deve ser verdadeiro ou falso."
    );
    error.statusCode = 400;
    throw error;
  }

  return usuarioRepository.atualizarStatusNoAmbiente(
    id,
    dados.ativo,
    usuarioAutenticado
  );
}

module.exports = {
  criarUsuario,
  listarUsuarios,
  buscarUsuarioPorId,
  atualizarUsuario,
  alterarStatusUsuario,
};
