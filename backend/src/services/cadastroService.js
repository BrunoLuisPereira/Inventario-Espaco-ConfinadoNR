
const bcrypt = require("bcryptjs");
const pool = require("../config/database");

const ambienteRepository = require("../repositories/ambienteRepository");
const cadastroRepository = require("../repositories/cadastroRepository");
const conviteRepository = require("../repositories/conviteRepository");
const emailLockRepository = require("../repositories/emailLockRepository");

function criarErro(mensagem, statusCode) {
  const erro = new Error(mensagem);
  erro.statusCode = statusCode;
  return erro;
}

/**
 * Cadastro público multi-tenant.
 *
 * Cria um ambiente e seu primeiro administrador
 * dentro da mesma transação PostgreSQL.
 *
 * O e-mail é bloqueado durante a transação para
 * coordenar o cadastro com a emissão de convites.
 */
async function cadastrarAmbiente(dados = {}) {
  const { nome, email, senha } = dados && typeof dados === 'object' && !Array.isArray(dados) ? dados : {};

  if (typeof nome !== "string" || !nome.trim()) {
    throw criarErro("O nome é obrigatório.", 400);
  }

  const nomeNormalizado = nome.trim();

  if (nomeNormalizado.length > 180) {
    throw criarErro(
      "O nome deve possuir no máximo 180 caracteres.",
      400
    );
  }

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

    // Serializa operações concorrentes para o mesmo e-mail.
    await emailLockRepository.bloquearEmail(
      client,
      emailNormalizado
    );

    // Um convite pendente reserva o e-mail para seu ambiente.
    const possuiConvite =
      await conviteRepository.existeConvitePendente(
        client,
        emailNormalizado
      );

    if (possuiConvite) {
      throw criarErro(
        "Este e-mail possui um convite pendente. Utilize o convite recebido ou solicite seu cancelamento.",
        409
      );
    }

    if (await conviteRepository.existeUsuarioPorEmail(client, emailNormalizado)) {
      throw criarErro("Já existe um usuário com este e-mail.", 409);
    }

    const ambiente = await ambienteRepository.criar(
      client,
      `Ambiente de ${nomeNormalizado}`.slice(0, 180)
    );

    const administrador =
      await cadastroRepository.criarAdministrador(client, {
        idAmbiente: ambiente.id_ambiente,
        nome: nomeNormalizado,
        email: emailNormalizado,
        senhaHash,
      });

    if (!administrador) throw new Error("Cadastro não retornou o administrador.");

    commitIniciado = true;
    await client.query("COMMIT");
    iniciada = false;

    return {
      ambiente: {
        id_ambiente: ambiente.id_ambiente,
        nome: ambiente.nome,
      },
      usuario: administrador,
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
        "Já existe um usuário com este e-mail.",
        409
      );
    }

    throw erro;
  } finally {
    if (descartar) client.release(true); else client.release();
  }
}

module.exports = {
  cadastrarAmbiente,
};
