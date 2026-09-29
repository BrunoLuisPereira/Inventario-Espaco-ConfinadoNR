const pool = require("../config/database");

async function criar(checklist) {
  const {
    id_local,
    criterio_a,
    criterio_b,
    criterio_c,
    acesso_controlado,
    ventilacao_adequada,
    monitoramento_atmosferico,
    procedimento_emergencia,
    observacoes,
    status,
    id_usuario,
  } = checklist;

  const query = `
    INSERT INTO checklist_nr33 (
      id_local,
      criterio_a,
      criterio_b,
      criterio_c,
      acesso_controlado,
      ventilacao_adequada,
      monitoramento_atmosferico,
      procedimento_emergencia,
      observacoes,
      status,
      id_usuario
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *;
  `;

  const valores = [
    id_local,
    criterio_a,
    criterio_b,
    criterio_c,
    acesso_controlado,
    ventilacao_adequada,
    monitoramento_atmosferico,
    procedimento_emergencia,
    observacoes || null,
    status || "PENDENTE",
    id_usuario,
  ];

  const resultado = await pool.query(query, valores);

  return resultado.rows[0];
}

async function listarTodos() {
  const query = `
    SELECT
      c.*,
      l.nome_local,
      u.nome AS usuario_responsavel
    FROM checklist_nr33 c
    INNER JOIN local l
      ON l.id_local = c.id_local
    INNER JOIN usuario u
      ON u.id_usuario = c.id_usuario
    ORDER BY c.id_checklist ASC;
  `;

  const resultado = await pool.query(query);

  return resultado.rows;
}

async function buscarPorId(idChecklist) {
  const query = `
    SELECT
      c.*,
      l.nome_local,
      u.nome AS usuario_responsavel
    FROM checklist_nr33 c
    INNER JOIN local l
      ON l.id_local = c.id_local
    INNER JOIN usuario u
      ON u.id_usuario = c.id_usuario
    WHERE c.id_checklist = $1;
  `;

  const resultado = await pool.query(query, [idChecklist]);

  return resultado.rows[0];
}

async function buscarPorLocal(idLocal) {
  const query = `
    SELECT *
    FROM checklist_nr33
    WHERE id_local = $1;
  `;

  const resultado = await pool.query(query, [idLocal]);

  return resultado.rows[0];
}

async function atualizar(idChecklist, dados) {
  const {
    criterio_a,
    criterio_b,
    criterio_c,
    acesso_controlado,
    ventilacao_adequada,
    monitoramento_atmosferico,
    procedimento_emergencia,
    observacoes,
  } = dados;

  const query = `
    UPDATE checklist_nr33
    SET
      criterio_a = $1,
      criterio_b = $2,
      criterio_c = $3,
      acesso_controlado = $4,
      ventilacao_adequada = $5,
      monitoramento_atmosferico = $6,
      procedimento_emergencia = $7,
      observacoes = $8,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE id_checklist = $9
    RETURNING *;
  `;

  const valores = [
    criterio_a,
    criterio_b,
    criterio_c,
    acesso_controlado,
    ventilacao_adequada,
    monitoramento_atmosferico,
    procedimento_emergencia,
    observacoes || null,
    idChecklist,
  ];

  const resultado = await pool.query(query, valores);

  return resultado.rows[0];
}

async function atualizarStatus(idChecklist, status) {
  const query = `
    UPDATE checklist_nr33
    SET
      status = $1,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE id_checklist = $2
    RETURNING *;
  `;

  const resultado = await pool.query(query, [
    status,
    idChecklist,
  ]);

  return resultado.rows[0];
}

module.exports = {
  criar,
  listarTodos,
  buscarPorId,
  buscarPorLocal,
  atualizar,
  atualizarStatus,
};