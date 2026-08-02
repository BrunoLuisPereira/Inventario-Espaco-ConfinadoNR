const pool = require("../config/database");

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
module.exports = {
  buscarPorEmail,
  criar,
  listarTodos,
  buscarPorId,
  atualizar,
  atualizarStatus,
};