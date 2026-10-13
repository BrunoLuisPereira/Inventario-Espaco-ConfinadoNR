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

module.exports = {
  login,
  alterarSenha,
};