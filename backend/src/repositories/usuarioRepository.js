
const pool = require("../config/database");
const emailLockRepository = require("./emailLockRepository");
const conviteRepository = require("./conviteRepository");

/**
 * Procura um usuário pelo e-mail.
 *
 * @param {string} email
 * @returns {Promise<object | null>}
 */
async function buscarPorEmail(email) {
  const query = `
    SELECT
      id_usuario,
      nome,
      email,
      senha_hash,
      perfil_acesso,
      eh_fundador,
      id_convite_origem,
      ativo,
      data_criacao,
      data_atualizacao
    FROM usuario
    WHERE LOWER(email) = LOWER($1)
    LIMIT 1
  `;

  const result = await pool.query(query, [email]);

  return result.rows[0] || null;
}

/**
 * Insere um usuário no PostgreSQL.
 *
 * @param {object} usuario
 * @returns {Promise<object>}
 */
async function criar(usuario) {
  const {
    nome,
    email,
    senhaHash,
    perfilAcesso,
  } = usuario;

  const query = `
    INSERT INTO usuario (
      nome,
      email,
      senha_hash,
      perfil_acesso
    )
    VALUES ($1, $2, $3, $4)
    RETURNING
      id_usuario,
      nome,
      email,
      perfil_acesso,
      eh_fundador,
      id_convite_origem,
      ativo,
      data_criacao,
      data_atualizacao
  `;

  const values = [
    nome,
    email,
    senhaHash,
    perfilAcesso,
  ];

  const result = await pool.query(query, values);

  return result.rows[0];
}

async function listarTodos() {
  const query = `
    SELECT
      id_usuario,
      nome,
      email,
      perfil_acesso,
      eh_fundador,
      id_convite_origem,
      ativo,
      data_criacao,
      data_atualizacao
    FROM usuario
    ORDER BY nome ASC
  `;

  const result = await pool.query(query);

  return result.rows;
}

async function buscarPorId(idUsuario) {
  const query = `
    SELECT
      id_usuario,
      nome,
      email,
      perfil_acesso,
      eh_fundador,
      id_convite_origem,
      ativo,
      data_criacao,
      data_atualizacao
    FROM usuario
    WHERE id_usuario = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [idUsuario]);

  return result.rows[0] || null;
}

// Consultas específicas: as funções globais acima permanecem para os módulos
// legados que ainda dependem delas, sem fallback global nestas duas operações.
function validarAmbienteConsulta(idAmbiente) {
  if (
    typeof idAmbiente !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idAmbiente)
  ) {
    const error = new Error("Identificador do ambiente inválido.");
    error.statusCode = 400;
    throw error;
  }
}

async function listarPorAmbiente(idAmbiente) {
  validarAmbienteConsulta(idAmbiente);
  const query = `
    SELECT
      id_usuario,
      nome,
      email,
      perfil_acesso,
      eh_fundador,
      id_convite_origem,
      ativo,
      data_criacao,
      data_atualizacao
    FROM usuario
    WHERE id_ambiente = $1
    ORDER BY nome ASC
  `;
  const result = await pool.query(query, [idAmbiente]);
  return result.rows;
}

async function buscarPorIdEAmbiente(idUsuario, idAmbiente) {
  validarAmbienteConsulta(idAmbiente);
  if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0) {
    const error = new Error("O ID do usuário é inválido.");
    error.statusCode = 400;
    throw error;
  }
  const query = `
    SELECT
      id_usuario,
      nome,
      email,
      perfil_acesso,
      eh_fundador,
      id_convite_origem,
      ativo,
      data_criacao,
      data_atualizacao
    FROM usuario
    WHERE id_usuario = $1
      AND id_ambiente = $2
    LIMIT 1
  `;
  const result = await pool.query(query, [idUsuario, idAmbiente]);
  return result.rows[0] || null;
}

async function atualizar(idUsuario, dados) {
  const {
    nome,
    email,
    perfilAcesso,
  } = dados;

  const query = `
    UPDATE usuario
    SET
      nome = $1,
      email = $2,
      perfil_acesso = $3,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE id_usuario = $4
    RETURNING
      id_usuario,
      nome,
      email,
      perfil_acesso,
      eh_fundador,
      id_convite_origem,
      ativo,
      data_criacao,
      data_atualizacao
  `;

  const values = [
    nome,
    email,
    perfilAcesso,
    idUsuario,
  ];

  const result = await pool.query(query, values);

  return result.rows[0] || null;
}

async function atualizarStatus(idUsuario, ativo) {
  const query = `
    UPDATE usuario
    SET
      ativo = $1,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE id_usuario = $2
    RETURNING
      id_usuario,
      nome,
      email,
      perfil_acesso,
      eh_fundador,
      id_convite_origem,
      ativo,
      data_criacao,
      data_atualizacao
  `;

  const result = await pool.query(query, [
    ativo,
    idUsuario,
  ]);

  return result.rows[0] || null;
}

/**
 * Busca os dados necessários para autenticação
 * e alteração da própria senha.
 *
 * O hash nunca deve ser enviado ao frontend.
 */
async function buscarPorIdComSenha(idUsuario) {
  const query = `
    SELECT
      id_usuario,
      nome,
      email,
      senha_hash,
      perfil_acesso,
      ativo
    FROM usuario
    WHERE id_usuario = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [idUsuario]);

  return result.rows[0] || null;
}

/**
 * Atualiza a senha do usuário autenticado.
 *
 * Recebe somente o hash gerado pelo backend.
 * Nunca armazena a senha em texto simples.
 */
async function atualizarSenha(idUsuario, senhaHash) {
  const query = `
    UPDATE usuario
    SET
      senha_hash = $1,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE id_usuario = $2
      AND ativo = TRUE
    RETURNING id_usuario
  `;

  const result = await pool.query(query, [
    senhaHash,
    idUsuario,
  ]);

  return result.rows[0] || null;
}

/**
 * Busca a identidade atual de um usuário autenticado.
 *
 * O id_ambiente e o perfil_acesso são obtidos
 * diretamente do PostgreSQL, nunca do JWT.
 *
 * Retorna null quando:
 * - o usuário não existe;
 * - o usuário está desativado;
 * - o ambiente não existe;
 * - o ambiente está desativado.
 *
 * IMPORTANTE:
 * Esta consulta depende da migração 020.
 * Não utilizar antes da homologação das migrações.
 */
async function buscarIdentidadeAutenticada(idUsuario) {
  const id = Number(idUsuario);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return null;
  }

  const query = `
    SELECT
      u.id_usuario,
      u.id_ambiente,
      u.nome,
      u.email,
      u.perfil_acesso, u.eh_fundador
    FROM usuario AS u
    INNER JOIN ambiente AS a
      ON a.id_ambiente = u.id_ambiente
    WHERE u.id_usuario = $1
      AND u.ativo = TRUE
      AND a.ativo = TRUE
    LIMIT 1
  `;

  const result = await pool.query(query, [id]);

  return result.rows[0] || null;
}

function erroEscritaUsuario(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

// Ordem: e-mail de destino (PUT), ambiente, usuários em ordem de ID.
// Os locks de linha permanecem até o encerramento da mesma transação do UPDATE.
async function executarEscritaNoAmbiente(idUsuario, dados, usuarioAutenticado, alterarStatus) {
  const idAdministrador = usuarioAutenticado?.id_usuario;
  const idAmbiente = usuarioAutenticado?.id_ambiente;
  if (!Number.isSafeInteger(idAdministrador) || idAdministrador <= 0 ||
      typeof idAmbiente !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idAmbiente)) {
    throw erroEscritaUsuario("Usuário não autenticado.", 401);
  }
  if (usuarioAutenticado.perfil_acesso !== "ADMINISTRADOR") {
    throw erroEscritaUsuario("Você não possui permissão para acessar este recurso.", 403);
  }
  if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0) {
    throw erroEscritaUsuario("O ID do usuário é inválido.", 400);
  }
  if (!dados || typeof dados !== "object" || Array.isArray(dados) ||
      (alterarStatus ? typeof dados.ativo !== "boolean" :
        typeof dados.nome !== "string" || !dados.nome.trim() ||
        typeof dados.email !== "string" || !dados.email.trim() ||
        !require('../utils/permissoes').perfis.includes(dados.perfilAcesso))) {
    throw erroEscritaUsuario("Dados do usuário inválidos.", 400);
  }
  const email = alterarStatus ? null : dados.email.trim().toLowerCase();
  const client = await pool.connect();
  let iniciada = false;
  let descartar = false;
  try {
    await client.query("BEGIN");
    iniciada = true;
    if (!alterarStatus) {
      // Mesmo advisory lock usado por cadastro, emissão e aceite de convites.
      // Protege a aquisição do novo e-mail; a liberação do antigo é o UPDATE.
      await emailLockRepository.bloquearEmail(client, email);
    }
    const ambiente = await client.query(`
      SELECT id_ambiente FROM ambiente
      WHERE id_ambiente = $1 AND ativo = TRUE
      FOR SHARE
    `, [idAmbiente]);
    if (ambiente.rows.length === 0) {
      throw erroEscritaUsuario("Usuário ou ambiente inválido ou desativado. Realize o login novamente.", 401);
    }
    const usuarios = await client.query(`
      SELECT id_usuario, id_ambiente, perfil_acesso, eh_fundador, id_convite_origem, ativo, email
      FROM usuario
      WHERE id_usuario = $1 OR (id_usuario = $2 AND id_ambiente = $3)
      ORDER BY id_usuario
      FOR UPDATE
    `, [idAdministrador, idUsuario, idAmbiente]);
    const administrador = usuarios.rows.find((u) => Number(u.id_usuario) === idAdministrador);
    if (!administrador || administrador.ativo !== true || administrador.id_ambiente !== idAmbiente) {
      throw erroEscritaUsuario("Usuário ou ambiente inválido ou desativado. Realize o login novamente.", 401);
    }
    if (administrador.perfil_acesso !== "ADMINISTRADOR" || administrador.eh_fundador !== true) {
      throw erroEscritaUsuario("Você não possui permissão para acessar este recurso.", 403);
    }
    const alvo = usuarios.rows.find((u) => Number(u.id_usuario) === idUsuario && u.id_ambiente === idAmbiente);
    if (!alvo) throw erroEscritaUsuario("Usuário não encontrado.", 404);

    if (!alterarStatus && dados.perfilAcesso !== alvo.perfil_acesso) {
      throw erroEscritaUsuario('Utilize a operacao de editar permissoes para alterar o perfil.', 409);
    }
    if (!alterarStatus) {
      // Consulta global somente de existência, necessária à exclusividade do
      // e-mail. Não recupera dados ou identidade de usuários de outro ambiente.
      const duplicado = await client.query(`
        SELECT 1 FROM usuario
        WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1)) AND id_usuario <> $2
        LIMIT 1
      `, [email, idUsuario]);
      if (duplicado.rows.length > 0) {
        throw erroEscritaUsuario("Já existe outro usuário com este e-mail.", 409);
      }
      if (email !== alvo.email.trim().toLowerCase() &&
          await conviteRepository.existeConvitePendente(client, email)) {
        throw erroEscritaUsuario("Este e-mail não está disponível para alteração.", 409);
      }
    }

    const filtroAutorizacao = `
      AND EXISTS (
        SELECT 1 FROM usuario AS administrador
        INNER JOIN ambiente AS a ON a.id_ambiente = administrador.id_ambiente
        WHERE administrador.id_usuario = $3
          AND administrador.id_ambiente = $2
          AND administrador.ativo = TRUE
          AND administrador.perfil_acesso = 'ADMINISTRADOR' AND administrador.eh_fundador = TRUE
          AND a.ativo = TRUE
      )
    `;
    const colunasRetorno = `
      alvo.id_usuario, alvo.nome, alvo.email, alvo.perfil_acesso, alvo.eh_fundador, alvo.id_convite_origem,
      alvo.ativo, alvo.data_criacao, alvo.data_atualizacao
    `;
    const sql = alterarStatus ? `
      UPDATE usuario AS alvo
      SET ativo = $4, data_atualizacao = CURRENT_TIMESTAMP
      WHERE alvo.id_usuario = $1 AND alvo.id_ambiente = $2
      ${filtroAutorizacao}
      RETURNING ${colunasRetorno}
    ` : `
      UPDATE usuario AS alvo
      SET nome = $4, email = $5, perfil_acesso = $6,
          data_atualizacao = CURRENT_TIMESTAMP
      WHERE alvo.id_usuario = $1 AND alvo.id_ambiente = $2
      ${filtroAutorizacao}
      RETURNING ${colunasRetorno}
    `;
    const parametros = alterarStatus
      ? [idUsuario, idAmbiente, idAdministrador, dados.ativo]
      : [idUsuario, idAmbiente, idAdministrador, dados.nome.trim(), email, dados.perfilAcesso];
    const resultado = await client.query(sql, parametros);
    if (!resultado.rows[0]) {
      // Com as linhas autorizadoras bloqueadas, um UPDATE vazio é inesperado.
      // Não converte falha técnica/trigger em um 404 artificial.
      throw new Error("Atualização autorizada não retornou o usuário.");
    }
    await client.query("COMMIT");
    iniciada = false;
    return resultado.rows[0];
  } catch (erro) {
    if (iniciada) {
      try { await client.query("ROLLBACK"); }
      catch { descartar = true; }
    } else {
      // Inclui falha no BEGIN; evita reutilizar uma conexão de estado incerto.
      descartar = true;
    }
    throw erro;
  } finally {
    if (descartar) client.release(true);
    else client.release();
  }
}

async function atualizarNoAmbiente(idUsuario, dados, usuarioAutenticado) {
  return executarEscritaNoAmbiente(idUsuario, dados, usuarioAutenticado, false);
}

async function atualizarStatusNoAmbiente(idUsuario, ativo, usuarioAutenticado) {
  return executarEscritaNoAmbiente(idUsuario, { ativo }, usuarioAutenticado, true);
}

module.exports = {
  buscarPorEmail,
  criar,
  listarTodos,
  buscarPorId,
  listarPorAmbiente,
  buscarPorIdEAmbiente,
  buscarPorIdComSenha,
  atualizar,
  atualizarStatus,
  atualizarNoAmbiente,
  atualizarStatusNoAmbiente,
  atualizarSenha,
  buscarIdentidadeAutenticada,
};
