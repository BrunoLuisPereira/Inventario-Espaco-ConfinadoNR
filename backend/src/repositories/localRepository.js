const pool = require("../config/database");

async function criar(local) {
  const {
    nomeLocal,
    setor,
    descricao,
    endereco,
    latitude,
    longitude,
    status,
    idCampanha,
  } = local;

  const query = `
    INSERT INTO local (
      nome_local,
      setor,
      descricao,
      endereco,
      latitude,
      longitude,
      status,
      id_campanha
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING
      id_local,
      nome_local,
      setor,
      descricao,
      endereco,
      latitude,
      longitude,
      status,
      id_campanha,
      data_criacao,
      data_atualizacao
  `;

  const values = [
    nomeLocal,
    setor,
    descricao,
    endereco,
    latitude,
    longitude,
    status,
    idCampanha,
  ];

  const result = await pool.query(query, values);

  return result.rows[0];
}

async function listarTodos() {
  const query = `
    SELECT
      l.id_local,
      l.nome_local,
      l.setor,
      l.descricao,
      l.endereco,
      l.latitude,
      l.longitude,
      l.status,
      l.id_campanha,
      c.nome_campanha,
      l.data_criacao,
      l.data_atualizacao
    FROM local l
    INNER JOIN campanha c
      ON c.id_campanha = l.id_campanha
    ORDER BY l.data_criacao DESC
  `;

  const result = await pool.query(query);

  return result.rows;
}

async function buscarPorId(idLocal) {
  const query = `
    SELECT
      l.id_local,
      l.nome_local,
      l.setor,
      l.descricao,
      l.endereco,
      l.latitude,
      l.longitude,
      l.status,
      l.id_campanha,
      c.nome_campanha,
      l.data_criacao,
      l.data_atualizacao
    FROM local l
    INNER JOIN campanha c
      ON c.id_campanha = l.id_campanha
    WHERE l.id_local = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [idLocal]);

  return result.rows[0] || null;
}
async function atualizar(idLocal, dados) {
  const {
    nomeLocal,
    setor,
    descricao,
    endereco,
    latitude,
    longitude,
  } = dados;

  const query = `
    UPDATE local
    SET
      nome_local = $1,
      setor = $2,
      descricao = $3,
      endereco = $4,
      latitude = $5,
      longitude = $6,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE id_local = $7
    RETURNING
      id_local,
      nome_local,
      setor,
      descricao,
      endereco,
      latitude,
      longitude,
      status,
      id_campanha,
      data_criacao,
      data_atualizacao
  `;

  const values = [
    nomeLocal,
    setor,
    descricao,
    endereco,
    latitude,
    longitude,
    idLocal,
  ];

  const result = await pool.query(query, values);

  return result.rows[0] || null;
}

async function atualizarStatus(idLocal, status) {
  const query = `
    UPDATE local
    SET
      status = $1,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE id_local = $2
    RETURNING
      id_local,
      nome_local,
      setor,
      descricao,
      endereco,
      latitude,
      longitude,
      status,
      id_campanha,
      data_criacao,
      data_atualizacao
  `;

  const result = await pool.query(query, [
    status,
    idLocal,
  ]);

  return result.rows[0] || null;
}
module.exports = {
  criar,
  listarTodos,
  buscarPorId,
  atualizar,
  atualizarStatus,
};