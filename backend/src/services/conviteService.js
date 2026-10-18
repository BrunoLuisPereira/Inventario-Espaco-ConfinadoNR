
const crypto = require("crypto");
const pool = require("../config/database");
const bcrypt = require("bcryptjs");
const usuarioConvidadoRepository = require("../repositories/usuarioConvidadoRepository");
const administradorRepository = require("../repositories/administradorRepository");
const ambienteRepository = require("../repositories/ambienteRepository");
const conviteRepository = require("../repositories/conviteRepository");
const emailLockRepository = require("../repositories/emailLockRepository");

const PERFIS_PERMITIDOS = [
  "ADMINISTRADOR",
  "ENGENHEIRO_SEGURANCA",
];

const PRAZO_CONVITE_HORAS = 48;

function criarErro(mensagem, statusCode) {
  const erro = new Error(mensagem);
  erro.statusCode = statusCode;
  return erro;
}

function gerarTokenConvite() {
  const token = crypto.randomBytes(32).toString("hex");

  const tokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  return { token, tokenHash };
}

function validarDadosConvite(dados = {}) {
  if (
    !dados ||
    typeof dados !== "object" ||
    Array.isArray(dados)
  ) {
    throw criarErro("Dados do convite inválidos.", 400);
  }

  const { email, perfilAcesso } = dados;

  if (typeof email !== "string" || !email.trim()) {
    throw criarErro("O e-mail é obrigatório.", 400);
  }

  const emailNormalizado = email.trim().toLowerCase();

  if (
    emailNormalizado.length > 180 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)
  ) {
    throw criarErro("Informe um e-mail válido.", 400);
  }

  if (!PERFIS_PERMITIDOS.includes(perfilAcesso)) {
    throw criarErro(
      "Perfil de acesso inválido para o convite.",
      400
    );
  }

  return {
    email: emailNormalizado,
    perfilAcesso,
  };
}

async function validarAdministrador(idUsuario) {
  if (
    !Number.isSafeInteger(idUsuario) ||
    idUsuario <= 0
  ) {
    throw criarErro(
      "Identificação do usuário inválida.",
      401
    );
  }

  const client = await pool.connect();

  try {
    const administrador =
      await administradorRepository.buscarAdministradorAtivo(
        client,
        idUsuario
      );

    if (!administrador) {
      throw criarErro(
        "Você não possui permissão para gerenciar convites.",
        403
      );
    }

    return administrador;
  } finally {
    client.release();
  }
}

/**
 * Emite um convite dentro de uma transação.
 *
 * O idUsuarioAdministrador deverá ser obtido
 * do usuário autenticado pelo backend.
 */
async function emitirConvite(idUsuarioAdministrador, dados) {
  if (
    !Number.isSafeInteger(idUsuarioAdministrador) ||
    idUsuarioAdministrador <= 0
  ) {
    throw criarErro(
      "Identificação do usuário inválida.",
      401
    );
  }

  const { email, perfilAcesso } = validarDadosConvite(dados);

  const client = await pool.connect();
  let iniciada = false;
  let descartar = false;
  let commitIniciado = false;

  try {
    await client.query("BEGIN");
    iniciada = true;

    // O bloqueio coordena convites e cadastros
    // concorrentes para o mesmo e-mail.
    await emailLockRepository.bloquearEmail(
      client,
      email
    );

    // A autorização é verificada na mesma transação.
    const administrador =
      await administradorRepository.buscarAdministradorAtivo(
        client,
        idUsuarioAdministrador,
        { bloquear: true }
      );

    if (!administrador) {
      throw criarErro(
        "Você não possui permissão para gerenciar convites.",
        403
      );
    }

    const usuarioExistente =
      await conviteRepository.existeUsuarioPorEmail(
        client,
        email
      );

    if (usuarioExistente) {
      throw criarErro(
        "Este e-mail já pertence a um usuário cadastrado.",
        409
      );
    }

    const conviteExistente =
      await conviteRepository.existeConvitePendente(
        client,
        email
      );

    if (conviteExistente) {
      throw criarErro(
        "Este e-mail já possui um convite pendente.",
        409
      );
    }

    const { token, tokenHash } = gerarTokenConvite();

    const dataExpiracao = new Date(
      Date.now() + PRAZO_CONVITE_HORAS * 60 * 60 * 1000
    );

    const convite = await conviteRepository.criarConvite(
      client,
      {
        idAmbiente: administrador.id_ambiente,
        email,
        perfilAcesso,
        tokenHash,
        idUsuarioConvite: administrador.id_usuario,
        dataExpiracao,
      }
    );

    if (!convite) throw new Error("Emissão não retornou o convite.");

    commitIniciado = true;
    await client.query("COMMIT");
    iniciada = false;

    return {
      convite,
      token,
    };
  } catch (erro) {
    descartar = commitIniciado || !iniciada;
    if (iniciada) {
      try { await client.query("ROLLBACK"); }
      catch {
        descartar = true;
        console.error("Falha ao encerrar transação de cadastro/convite.", { statusCode: 500 });
      }
    }

    throw erro;
  } finally {
    if (descartar) client.release(true); else client.release();
  }
}

/**
 * Valida o formato do token recebido pelo link
 * e calcula seu hash SHA-256.
 *
 * O token original nunca deve ser salvo no banco
 * ou registrado nos logs da aplicação.
 */
function calcularHashTokenConvite(token) {
  if (
    typeof token !== "string" ||
    !/^[a-f0-9]{64}$/.test(token)
  ) {
    throw criarErro(
      "Token de convite inválido.",
      400
    );
  }

  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

/**
 * Verifica se um convite pode ser aceito.
 *
 * Deve ser chamada após buscar o convite
 * dentro de uma transação PostgreSQL.
 */
function validarConviteParaAceite(convite) {
  if (!convite) {
    throw criarErro(
      "Convite não encontrado ou inválido.",
      404
    );
  }

  if (convite.data_aceite !== null) {
    throw criarErro(
      "Este convite já foi utilizado.",
      409
    );
  }

  if (convite.data_cancelamento !== null) {
    throw criarErro(
      "Este convite foi cancelado.",
      409
    );
  }

  
  // A validade é calculada pelo PostgreSQL.
  // Não dependemos do relógio do servidor Node.js.
  if (convite.nao_expirado !== true) {
    throw criarErro(
      "Este convite expirou.",
      410
    );
  }

  if (convite.ambiente_ativo !== true) {
    throw criarErro(
      "O ambiente deste convite está inativo.",
      403
    );
  }

  return convite;
}

/**
 * Aceita um convite e cria o usuário no ambiente
 * definido pelo administrador que emitiu o convite.
 */
async function aceitarConvite(token, dados = {}) {
  const tokenHash = calcularHashTokenConvite(token);

  if (
    !dados ||
    typeof dados !== "object" ||
    Array.isArray(dados)
  ) {
    throw criarErro("Dados de cadastro inválidos.", 400);
  }

  const { nome, senha } = dados;

  if (
    typeof nome !== "string" ||
    !nome.trim() ||
    nome.trim().length > 120
  ) {
    throw criarErro("Informe um nome válido.", 400);
  }

  if (typeof senha !== "string" || senha.length < 8) {
    throw criarErro(
      "A senha deve possuir pelo menos 8 caracteres.",
      400
    );
  }

  const senhaHash = await bcrypt.hash(senha, 12);
  const client = await pool.connect();
  let iniciada = false;
  let descartar = false;
  let commitIniciado = false;

  try {
    await client.query("BEGIN");
    iniciada = true;

    // Primeira consulta: identifica o e-mail sem
    // bloquear o registro do convite.
    const referencia =
      await conviteRepository.buscarEmailConvitePorTokenHash(
        client,
        tokenHash
      );

    if (!referencia) {
      throw criarErro(
        "Convite não encontrado ou inválido.",
        404
      );
    }

    // Primeiro bloqueio: e-mail.
    await emailLockRepository.bloquearEmail(
      client,
      referencia.email
    );

    // Consulta preliminar preserva a precedência dos erros públicos. Não é
    // autorização para escrita: o convite será relido sob bloqueio abaixo.
    const candidato =
      await conviteRepository.buscarConvitePorTokenHash(
        client,
        tokenHash,
        { bloquear: false }
      );

    validarConviteParaAceite(candidato);
    if (candidato.email.trim().toLowerCase() !== referencia.email.trim().toLowerCase()) {
      throw criarErro("Não foi possível concluir o aceite do convite.", 409);
    }

    // Bloqueia o ambiente durante o aceite.
    // Impede sua desativação até COMMIT ou ROLLBACK.
    const ambiente =
      await ambienteRepository.buscarAmbienteAtivoComBloqueio(
        client,
        candidato.id_ambiente
      );

    if (!ambiente) {
      throw criarErro(
        "O ambiente deste convite está inativo.",
        403
      );
    }

    // Ordem de locks: e-mail -> ambiente -> convite. Revalida o estado que
    // pode ter mudado enquanto aguardava qualquer um desses bloqueios.
    const convite = await conviteRepository.buscarConvitePorTokenHash(client, tokenHash);
    validarConviteParaAceite(convite);
    if (convite.id_ambiente !== candidato.id_ambiente ||
        convite.email.trim().toLowerCase() !== referencia.email.trim().toLowerCase()) {
      throw criarErro("Não foi possível concluir o aceite do convite.", 409);
    }

    // Confirma que o e-mail não foi cadastrado
    // por outra operação.
    const usuarioExistente =
      await conviteRepository.existeUsuarioPorEmail(
        client,
        convite.email
      );

    if (usuarioExistente) {
      throw criarErro(
        "Este e-mail já pertence a um usuário cadastrado.",
        409
      );
    }

    // Ambiente, e-mail e perfil vêm exclusivamente
    // do convite armazenado no PostgreSQL.
    const usuario =
      await usuarioConvidadoRepository.criarUsuarioConvidado(
        client,
        {
          idAmbiente: convite.id_ambiente,
          nome: nome.trim(),
          email: convite.email,
          senhaHash,
          perfilAcesso: convite.perfil_acesso,
        }
      );

    if (!usuario) throw new Error("Aceite não retornou o usuário.");

    const aceite =
      await conviteRepository.registrarAceiteConvite(
        client,
        convite.id_convite
      );

    if (!aceite) {
      throw criarErro(
        "Não foi possível concluir o aceite do convite.",
        409
      );
    }

    commitIniciado = true;
    await client.query("COMMIT");
    iniciada = false;

    return {
      usuario,
      convite: {
        id_convite: aceite.id_convite,
        data_aceite: aceite.data_aceite,
      },
    };
  } catch (erro) {
    descartar = commitIniciado || !iniciada;
    if (iniciada) {
      try { await client.query("ROLLBACK"); }
      catch {
        descartar = true;
        console.error("Falha ao encerrar transação de cadastro/convite.", { statusCode: 500 });
      }
    }

    if (erro?.code === "23505") {
      throw criarErro(
        "Este e-mail já pertence a um usuário cadastrado.",
        409
      );
    }

    throw erro;
  } finally {
    if (descartar) client.release(true); else client.release();
  }
}

module.exports = {
  criarErro,
  gerarTokenConvite,
  validarDadosConvite,
  validarAdministrador,
  emitirConvite,
  calcularHashTokenConvite,
  validarConviteParaAceite,
  aceitarConvite,
};
