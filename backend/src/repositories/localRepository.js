const { sqlCapacidade } = require('../utils/permissoes');
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

async function listarParaExportacao() {
  const query = `
    SELECT
      c.nome_campanha,
      l.id_local,
      l.nome_local,
      l.setor,
      l.endereco,
      l.latitude AS latitude_local,
      l.longitude AS longitude_local,
      l.status,
      e.id_evidencia,
      e.tipo AS tipo_evidencia,
      e.descricao AS descricao_evidencia,
      e.latitude AS latitude_foto,
      e.longitude AS longitude_foto,
      e.origem_coordenadas,
      e.precisao_gps
    FROM local l
    INNER JOIN campanha c
      ON c.id_campanha = l.id_campanha
    LEFT JOIN evidencia e
      ON e.id_local = l.id_local
    ORDER BY
      c.nome_campanha ASC,
      l.nome_local ASC,
      e.id_evidencia ASC
  `;

  const result = await pool.query(query);

  return result.rows;
}

// Consulta específica da exportação autenticada. Depende de campanha.id_ambiente
// previsto na migração 020; a compatibilidade real exige homologação.
async function listarParaExportacaoPorAmbiente(idAmbiente, usuarioAutenticado) {
  if (
    typeof idAmbiente !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idAmbiente)
  ) {
    const erro = new Error("Identificação do ambiente inválida.");
    erro.statusCode = 400;
    throw erro;
  }

  if (!usuarioAutenticado || typeof usuarioAutenticado !== "object" ||
    Array.isArray(usuarioAutenticado) || usuarioAutenticado.id_ambiente !== idAmbiente ||
    !Number.isSafeInteger(usuarioAutenticado.id_usuario) || usuarioAutenticado.id_usuario <= 0) {
    const erro = new Error("Usuário não autenticado.");
    erro.statusCode = 401;
    throw erro;
  }

  const query = `
    SELECT
      c.nome_campanha,
      l.id_local,
      l.nome_local,
      l.setor,
      l.endereco,
      l.latitude AS latitude_local,
      l.longitude AS longitude_local,
      l.status,
      e.id_evidencia,
      e.tipo AS tipo_evidencia,
      e.descricao AS descricao_evidencia,
      e.latitude AS latitude_foto,
      e.longitude AS longitude_foto,
      e.origem_coordenadas,
      e.precisao_gps
    FROM local l
    INNER JOIN campanha c
      ON c.id_campanha = l.id_campanha
    LEFT JOIN evidencia e
      ON e.id_local = l.id_local
    WHERE c.id_ambiente = $1
      AND EXISTS (
        SELECT 1 FROM usuario AS u
        INNER JOIN ambiente AS a ON a.id_ambiente = u.id_ambiente
        WHERE u.id_usuario = $2 AND u.id_ambiente = c.id_ambiente
          AND u.ativo = TRUE AND a.ativo = TRUE
          AND ${sqlCapacidade('u', 'locais.exportar')}
      )
    ORDER BY
      c.nome_campanha ASC,
      l.nome_local ASC,
      e.id_evidencia ASC
  `;

  const result = await pool.query(query, [idAmbiente, usuarioAutenticado.id_usuario]);
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
  listarParaExportacao,
  listarParaExportacaoPorAmbiente,
  buscarPorId,
  atualizar,
  atualizarStatus,
};
