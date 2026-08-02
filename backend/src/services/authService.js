const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
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
  const { email, senha } = dados;

  if (!email || typeof email !== "string" || !email.trim()) {
    throw criarErro("O e-mail é obrigatório.", 400);
  }

  if (!senha || typeof senha !== "string") {
    throw criarErro("A senha é obrigatória.", 400);
  }

  verificarConfiguracaoJwt();

  const emailNormalizado = email.trim().toLowerCase();

  const usuario = await usuarioRepository.buscarPorEmail(
    emailNormalizado
  );

  /*
   * Usamos a mesma mensagem para usuário inexistente e senha incorreta.
   * Assim, a API não revela se determinado e-mail está cadastrado.
   */
  if (!usuario) {
    throw criarErro("E-mail ou senha inválidos.", 401);
  }

  if (!usuario.ativo) {
    throw criarErro(
      "Usuário desativado. Entre em contato com o administrador.",
      403
    );
  }

  const senhaCorreta = await bcrypt.compare(
    senha,
    usuario.senha_hash
  );

  if (!senhaCorreta) {
    throw criarErro("E-mail ou senha inválidos.", 401);
  }

  const payload = {
    perfil: usuario.perfil_acesso,
  };

  const token = jwt.sign(
    payload,
    process.env.JWT_SECRET,
    {
      subject: String(usuario.id_usuario),
      expiresIn: process.env.JWT_EXPIRES_IN || "8h",
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
    expiraEm: process.env.JWT_EXPIRES_IN || "8h",
    usuario: {
      id_usuario: usuario.id_usuario,
      nome: usuario.nome,
      email: usuario.email,
      perfil_acesso: usuario.perfil_acesso,
    },
  };
}

module.exports = {
  login,
};