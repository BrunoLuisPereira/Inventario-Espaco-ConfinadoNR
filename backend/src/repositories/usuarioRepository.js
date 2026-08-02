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

module.exports = {
  buscarPorEmail,
  criar,
};