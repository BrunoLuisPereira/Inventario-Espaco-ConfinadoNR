const pool = require("../config/database");

async function criar(campanha) {
  const {
    nomeCampanha,
    empresa,
    responsavel,
    dataInicio,
    status,
    idUsuario,
  } = campanha;

  const query = `
    INSERT INTO campanha (
      nome_campanha,
      empresa,
      responsavel,
      data_inicio,
      status,
      id_usuario
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING
      id_campanha,
      nome_campanha,
      empresa,
      responsavel,
      data_inicio,
      status,
      id_usuario,
      data_criacao,
      data_atualizacao
  `;

  const values = [
    nomeCampanha,
    empresa,
    responsavel,
    dataInicio,
    status,
    idUsuario,
  ];

  const result = await pool.query(query, values);

  return result.rows[0];
}

async function listarTodas() {
  const query = `
    SELECT
      c.id_campanha,
      c.nome_campanha,
      c.empresa,
      c.responsavel,
      c.data_inicio,
      c.status,
      c.id_usuario,
      u.nome AS usuario_responsavel,
      c.data_criacao,
      c.data_atualizacao
    FROM campanha c
    INNER JOIN usuario u
      ON u.id_usuario = c.id_usuario
    ORDER BY c.data_criacao DESC
  `;

  const result = await pool.query(query);

  return result.rows;
}

async function buscarPorId(idCampanha) {
  const query = `
    SELECT
      c.id_campanha,
      c.nome_campanha,
      c.empresa,
      c.responsavel,
      c.data_inicio,
      c.status,
      c.id_usuario,
      u.nome AS usuario_responsavel,
      c.data_criacao,
      c.data_atualizacao
    FROM campanha c
    INNER JOIN usuario u
      ON u.id_usuario = c.id_usuario
    WHERE c.id_campanha = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [idCampanha]);

  return result.rows[0] || null;
}
async function atualizar(idCampanha, dados) {
  const {
    nomeCampanha,
    empresa,
    responsavel,
    dataInicio,
  } = dados;

  const query = `
    UPDATE campanha
    SET
      nome_campanha = $1,
      empresa = $2,
      responsavel = $3,
      data_inicio = $4,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE id_campanha = $5
    RETURNING
      id_campanha,
      nome_campanha,
      empresa,
      responsavel,
      data_inicio,
      status,
      id_usuario,
      data_criacao,
      data_atualizacao
  `;

  const values = [
    nomeCampanha,
    empresa,
    responsavel,
    dataInicio,
    idCampanha,
  ];

  const result = await pool.query(query, values);

  return result.rows[0] || null;
}

async function atualizarStatus(idCampanha, status) {
  const query = `
    UPDATE campanha
    SET
      status = $1,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE id_campanha = $2
    RETURNING
      id_campanha,
      nome_campanha,
      empresa,
      responsavel,
      data_inicio,
      status,
      id_usuario,
      data_criacao,
      data_atualizacao
  `;

  const result = await pool.query(query, [
    status,
    idCampanha,
  ]);

  return result.rows[0] || null;
}
module.exports = {
  criar,
  listarTodas,
  buscarPorId,
  atualizar,
  atualizarStatus,
};