const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const normalizarIdDominio = require("../utils/normalizarIdDominio");
const usuarioRepository = require("../repositories/usuarioRepository");

function criarErro(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function verificarConfiguracaoJwt() {
  if (!process.env.JWT_SECRET) {
    throw new Error(
      "A variável JWT_SECRET não está configurada no arquivo .env."
    );
  }
}

/**
 * Autentica um usuário e gera um token JWT.
 *
 * @param {object} dados
 * @returns {Promise<object>}
 */
async function login(dados) {
  // O endpoint existente conserva seu envelope e seus campos públicos.
  // A autenticação efetiva passa pela mesma cadeia multi-tenant.
  const resultado = await loginMultiTenant(dados);
  const { id_ambiente, ...usuario } = resultado.usuario;
  return { ...resultado, usuario };
}

/**
 * Altera a senha do próprio usuário autenticado.
 *
 * Valida a senha atual e armazena somente
 * o hash da nova senha.
 */
async function alterarSenha(
  idUsuario,
  dados = {}
) {
  const {
    senhaAtual,
    novaSenha,
    confirmarSenha,
  } = dados;

  if (
    typeof senhaAtual !== "string" ||
    !senhaAtual
  ) {
    throw criarErro(
      "Informe a senha atual.",
      400
    );
  }

  if (
    typeof novaSenha !== "string" ||
    novaSenha.length < 8
  ) {
    throw criarErro(
      "A nova senha deve possuir pelo menos 8 caracteres.",
      400
    );
  }

  if (novaSenha !== confirmarSenha) {
    throw criarErro(
      "A confirmação da nova senha não confere.",
      400
    );
  }

  if (novaSenha === senhaAtual) {
    throw criarErro(
      "A nova senha deve ser diferente da senha atual.",
      400
    );
  }

  const usuario =
    await usuarioRepository.buscarPorIdComSenha(
      idUsuario
    );

  if (!usuario || !usuario.ativo) {
    throw criarErro(
      "Usuário não encontrado ou desativado.",
      403
    );
  }

  const senhaCorreta = await bcrypt.compare(
    senhaAtual,
    usuario.senha_hash
  );

  if (!senhaCorreta) {
    throw criarErro(
      "A senha atual está incorreta.",
      400
    );
  }

  const senhaHash = await bcrypt.hash(
    novaSenha,
    12
  );

  const resultado =
    await usuarioRepository.atualizarSenha(
      idUsuario,
      senhaHash
    );

  if (!resultado) {
    throw criarErro(
      "Não foi possível atualizar a senha.",
      403
    );
  }

  return {
    mensagem: "Senha alterada com sucesso.",
  };
}

/**
 * Autentica um usuário considerando seu ambiente.
 *
 * IMPORTANTE:
 * Depende da migração 020.
 * Não utilizar nas rotas antes da homologação.
 */
async function loginMultiTenant(dados = {}) {
  const { email, senha } = dados && typeof dados === "object" && !Array.isArray(dados) ? dados : {};

  if (
    typeof email !== "string" ||
    !email.trim()
  ) {
    throw criarErro("O e-mail é obrigatório.", 400);
  }

  if (
    typeof senha !== "string" ||
    !senha
  ) {
    throw criarErro("A senha é obrigatória.", 400);
  }

  verificarConfiguracaoJwt();

  const emailNormalizado = email.trim().toLowerCase();

  const autenticacaoMultiTenantRepository = require(
    "../repositories/autenticacaoMultiTenantRepository"
  );

  let usuario =
    await autenticacaoMultiTenantRepository
      .buscarPorEmailComAmbiente(emailNormalizado);

  if (!usuario) {
    throw criarErro("E-mail ou senha inválidos.", 401);
  }

  const senhaCorreta = await bcrypt.compare(
    senha,
    usuario.senha_hash
  );

  if (!senhaCorreta) {
    throw criarErro("E-mail ou senha inválidos.", 401);
  }

  // bcrypt é assíncrono. Reconsulta o estado após a conferência, sem emitir
  // claims provenientes de um snapshot anterior à revogação/desativação.
  const anterior = usuario;
  usuario = await autenticacaoMultiTenantRepository.buscarPorEmailComAmbiente(emailNormalizado);
  if (!usuario) throw criarErro("E-mail ou senha inválidos.", 401);

  if (usuario.ativo !== true) {
    throw criarErro("Usuário desativado. Entre em contato com o administrador.", 403);
  }

  if (
    usuario.ativo !== true ||
    usuario.ambiente_ativo !== true ||
    typeof usuario.id_ambiente !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usuario.id_ambiente)
  ) {
    throw criarErro(
      "Usuário ou ambiente desativado.",
      403
    );
  }

  const perfisPermitidos = [
    "ADMINISTRADOR",
    "ENGENHEIRO_SEGURANCA",
  ];

  if (
    !perfisPermitidos.includes(usuario.perfil_acesso)
  ) {
    throw criarErro(
      "Perfil de acesso inválido.",
      403
    );
  }

  let idUsuario, idAnterior;
  try {
    idUsuario = normalizarIdDominio(usuario.id_usuario);
    idAnterior = normalizarIdDominio(anterior.id_usuario);
  } catch {
    throw criarErro("E-mail ou senha inválidos.", 401);
  }
  if (idUsuario !== idAnterior || usuario.id_ambiente !== anterior.id_ambiente ||
      usuario.senha_hash !== anterior.senha_hash) {
    throw criarErro("E-mail ou senha inválidos.", 401);
  }

  const token = jwt.sign(
    { perfil: usuario.perfil_acesso },
    process.env.JWT_SECRET,
    {
      subject: String(idUsuario),
      expiresIn:
        process.env.JWT_EXPIRES_IN || "8h",
      issuer:
        process.env.JWT_ISSUER ||
        "inventario-espacos-confinados-api",
      audience:
        process.env.JWT_AUDIENCE ||
        "inventario-espacos-confinados-pwa",
      algorithm: "HS256",
    }
  );

  return {
    token,
    tipo: "Bearer",
    expiraEm:
      process.env.JWT_EXPIRES_IN || "8h",
    usuario: {
      id_usuario: usuario.id_usuario,
      id_ambiente: usuario.id_ambiente,
      nome: usuario.nome,
      email: usuario.email,
      perfil_acesso: usuario.perfil_acesso,
    },
  };
}

module.exports = {
  login,
  loginMultiTenant,
  alterarSenha,
};
