
const pool = require("../config/database");

/**
 * Cria uma evidência, incluindo os dados
 * opcionais de localização.
 */
async function criar(evidencia) {
  const {
    id_local,
    tipo,
    caminho_arquivo,
    descricao,
    id_usuario,
    id_operacao_cliente,
    latitude,
    longitude,
    precisao_gps,
    origem_coordenadas,
    data_captura_gps,
  } = evidencia;

  const query = `
    INSERT INTO evidencia (
      id_local,
      tipo,
      caminho_arquivo,
      descricao,
      id_usuario,
      id_operacao_cliente,
      latitude,
      longitude,
      precisao_gps,
      origem_coordenadas,
      data_captura_gps
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11
    )
    RETURNING *;
  `;

  const valores = [
    id_local,
    tipo,
    caminho_arquivo || null,
    descricao || null,
    id_usuario,
    id_operacao_cliente || null,
    latitude ?? null,
    longitude ?? null,
    precisao_gps ?? null,
    origem_coordenadas ?? null,
    data_captura_gps ?? null,
  ];

  const resultado = await pool.query(
    query,
    valores
  );

  return resultado.rows[0];
}

/**
 * Lista todas as evidências.
 */
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

/**
 * Lista apenas as evidências pertencentes
 * a campanhas do usuário responsável.
 */
async function listarPorUsuarioResponsavel(
  idUsuario
) {
  const query = `
    SELECT
      e.*,
      l.nome_local,
      u.nome AS usuario_responsavel
    FROM evidencia e
    INNER JOIN local l
      ON l.id_local = e.id_local
    INNER JOIN campanha c
      ON c.id_campanha = l.id_campanha
    INNER JOIN usuario u
      ON u.id_usuario = e.id_usuario
    WHERE c.id_usuario = $1
    ORDER BY e.id_evidencia ASC;
  `;

  const resultado = await pool.query(
    query,
    [idUsuario]
  );

  return resultado.rows;
}

/**
 * Busca uma evidência pelo ID.
 */
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

  const resultado = await pool.query(
    query,
    [idEvidencia]
  );

  return resultado.rows[0];
}

/**
 * Busca uma evidência pelo identificador
 * de operação utilizado na sincronização.
 */
async function buscarPorIdOperacaoCliente(
  idOperacaoCliente
) {
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
    WHERE e.id_operacao_cliente = $1;
  `;

  const resultado = await pool.query(
    query,
    [idOperacaoCliente]
  );

  return resultado.rows[0];
}

/**
 * Lista as evidências de determinado local.
 */
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

  const resultado = await pool.query(
    query,
    [idLocal]
  );

  return resultado.rows;
}

/**
 * Atualiza uma evidência existente,
 * incluindo os dados de localização.
 */
async function atualizar(
  idEvidencia,
  dados
) {
  const {
    tipo,
    caminho_arquivo,
    descricao,
    latitude,
    longitude,
    precisao_gps,
    origem_coordenadas,
    data_captura_gps,
  } = dados;

  const query = `
    UPDATE evidencia
    SET
      tipo = $1,
      caminho_arquivo = $2,
      descricao = $3,
      latitude = $4,
      longitude = $5,
      precisao_gps = $6,
      origem_coordenadas = $7,
      data_captura_gps = $8,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE id_evidencia = $9
    RETURNING *;
  `;

  const valores = [
    tipo,
    caminho_arquivo || null,
    descricao || null,
    latitude ?? null,
    longitude ?? null,
    precisao_gps ?? null,
    origem_coordenadas ?? null,
    data_captura_gps ?? null,
    idEvidencia,
  ];

  const resultado = await pool.query(
    query,
    valores
  );

  return resultado.rows[0];
}

/**
 * Exclui uma evidência.
 */
async function excluir(idEvidencia) {
  const query = `
    DELETE FROM evidencia
    WHERE id_evidencia = $1
    RETURNING *;
  `;

  const resultado = await pool.query(
    query,
    [idEvidencia]
  );

  return resultado.rows[0];
}

module.exports = {
  criar,
  listarTodos,
  listarPorUsuarioResponsavel,
  buscarPorId,
  buscarPorIdOperacaoCliente,
  listarPorLocal,
  atualizar,
  excluir,
};
