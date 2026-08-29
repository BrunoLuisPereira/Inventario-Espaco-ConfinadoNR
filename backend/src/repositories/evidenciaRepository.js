const pool = require("../config/database");

async function criar(evidencia) {
  const {
    id_local,
    tipo,
    caminho_arquivo,
    descricao,
    id_usuario,
  } = evidencia;

  const query = `
    INSERT INTO evidencia (
      id_local,
      tipo,
      caminho_arquivo,
      descricao,
      id_usuario
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;

  const valores = [
    id_local,
    tipo,
    caminho_arquivo || null,
    descricao || null,
    id_usuario,
  ];

  const resultado = await pool.query(query, valores);

  return resultado.rows[0];
}

async function listarTodos() {
  const query = `
    SELECT
      e.*,
      l.nome_local,
      u.nome AS usuario_responsavel
    FROM evidencia e
    INNER JOIN local l
      ON l.id_local = e.id_local
    INNER JOIN usuario u
      ON u.id_usuario = e.id_usuario
    ORDER BY e.id_evidencia ASC;
  `;

  const resultado = await pool.query(query);

  return resultado.rows;
}

async function buscarPorId(idEvidencia) {
  const query = `
    SELECT
      e.*,
      l.nome_local,
      u.nome AS usuario_responsavel
    FROM evidencia e
    INNER JOIN local l
      ON l.id_local = e.id_local
    INNER JOIN usuario u
      ON u.id_usuario = e.id_usuario
    WHERE e.id_evidencia = $1;
  `;

  const resultado = await pool.query(query, [idEvidencia]);

  return resultado.rows[0];
}

async function listarPorLocal(idLocal) {
  const query = `
    SELECT
      e.*,
      u.nome AS usuario_responsavel
    FROM evidencia e
    INNER JOIN usuario u
      ON u.id_usuario = e.id_usuario
    WHERE e.id_local = $1
    ORDER BY e.id_evidencia ASC;
  `;

  const resultado = await pool.query(query, [idLocal]);

  return resultado.rows;
}

async function atualizar(idEvidencia, dados) {
  const {
    tipo,
    caminho_arquivo,
    descricao,
  } = dados;

  const query = `
    UPDATE evidencia
    SET
      tipo = $1,
      caminho_arquivo = $2,
      descricao = $3,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE id_evidencia = $4
    RETURNING *;
  `;

  const valores = [
    tipo,
    caminho_arquivo || null,
    descricao || null,
    idEvidencia,
  ];

  const resultado = await pool.query(query, valores);

  return resultado.rows[0];
}

async function excluir(idEvidencia) {
  const query = `
    DELETE FROM evidencia
    WHERE id_evidencia = $1
    RETURNING *;
  `;

  const resultado = await pool.query(query, [idEvidencia]);

  return resultado.rows[0];
}

module.exports = {
  criar,
  listarTodos,
  buscarPorId,
  listarPorLocal,
  atualizar,
  excluir,
};