const pool = require("../config/database");

async function criar(dados) {
  const {
    id_local,
    pressao_atmosferica,
    ventilacao,
    oxigenio,
    gas_inflamavel,
    monoxido_carbono,
    sulfeto_hidrogenio,
    temperatura,
    umidade,
    observacoes,
    status,
    id_usuario,
  } = dados;

  const query = `
    INSERT INTO dados_tecnicos (
      id_local,
      pressao_atmosferica,
      ventilacao,
      oxigenio,
      gas_inflamavel,
      monoxido_carbono,
      sulfeto_hidrogenio,
      temperatura,
      umidade,
      observacoes,
      status,
      id_usuario
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11, $12
    )
    RETURNING *;
  `;

  const valores = [
    id_local,
    pressao_atmosferica ?? null,
    ventilacao ?? null,
    oxigenio ?? null,
    gas_inflamavel ?? null,
    monoxido_carbono ?? null,
    sulfeto_hidrogenio ?? null,
    temperatura ?? null,
    umidade ?? null,
    observacoes ?? null,
    status ?? "PENDENTE",
    id_usuario,
  ];

  const resultado = await pool.query(
    query,
    valores
  );

  return resultado.rows[0];
}

async function listarTodos() {
  const query = `
    SELECT
      d.*,
      l.nome_local,
      u.nome AS usuario_responsavel
    FROM dados_tecnicos d
    INNER JOIN local l
      ON l.id_local = d.id_local
    INNER JOIN usuario u
      ON u.id_usuario = d.id_usuario
    ORDER BY d.id_dados ASC;
  `;

  const resultado = await pool.query(query);

  return resultado.rows;
}

async function buscarPorId(idDados) {
  const query = `
    SELECT
      d.*,
      l.nome_local,
      u.nome AS usuario_responsavel
    FROM dados_tecnicos d
    INNER JOIN local l
      ON l.id_local = d.id_local
    INNER JOIN usuario u
      ON u.id_usuario = d.id_usuario
    WHERE d.id_dados = $1;
  `;

  const resultado = await pool.query(
    query,
    [idDados]
  );

  return resultado.rows[0];
}

async function buscarPorLocal(idLocal) {
  const query = `
    SELECT
      d.*,
      u.nome AS usuario_responsavel
    FROM dados_tecnicos d
    INNER JOIN usuario u
      ON u.id_usuario = d.id_usuario
    WHERE d.id_local = $1;
  `;

  const resultado = await pool.query(
    query,
    [idLocal]
  );

  return resultado.rows[0];
}

async function atualizar(idDados, dados) {
  const {
    pressao_atmosferica,
    ventilacao,
    oxigenio,
    gas_inflamavel,
    monoxido_carbono,
    sulfeto_hidrogenio,
    temperatura,
    umidade,
    observacoes,
    status,
  } = dados;

  const query = `
    UPDATE dados_tecnicos
    SET
      pressao_atmosferica = $1,
      ventilacao = $2,
      oxigenio = $3,
      gas_inflamavel = $4,
      monoxido_carbono = $5,
      sulfeto_hidrogenio = $6,
      temperatura = $7,
      umidade = $8,
      observacoes = $9,
      status = $10,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE id_dados = $11
    RETURNING *;
  `;

  const valores = [
    pressao_atmosferica ?? null,
    ventilacao ?? null,
    oxigenio ?? null,
    gas_inflamavel ?? null,
    monoxido_carbono ?? null,
    sulfeto_hidrogenio ?? null,
    temperatura ?? null,
    umidade ?? null,
    observacoes ?? null,
    status,
    idDados,
  ];

  const resultado = await pool.query(
    query,
    valores
  );

  return resultado.rows[0];
}

async function excluir(idDados) {
  const query = `
    DELETE FROM dados_tecnicos
    WHERE id_dados = $1
    RETURNING *;
  `;

  const resultado = await pool.query(
    query,
    [idDados]
  );

  return resultado.rows[0];
}

module.exports = {
  criar,
  listarTodos,
  buscarPorId,
  buscarPorLocal,
  atualizar,
  excluir,
};