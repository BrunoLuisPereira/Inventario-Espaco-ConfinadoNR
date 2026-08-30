const pool = require("../config/database");

async function criar(dados) {
  const {
    id_local,
    id_usuario_responsavel,
    numero_art,
    caminho_pdf,
    hash_pdf,
    status,
    data_emissao,
  } = dados;

  const query = `
    INSERT INTO relatorio (
      id_local,
      id_usuario_responsavel,
      numero_art,
      caminho_pdf,
      hash_pdf,
      status,
      data_emissao
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `;

  const valores = [
    id_local,
    id_usuario_responsavel,
    numero_art ?? null,
    caminho_pdf ?? null,
    hash_pdf ?? null,
    status ?? "RASCUNHO",
    data_emissao ?? null,
  ];

  const resultado = await pool.query(query, valores);

  return resultado.rows[0];
}

async function listarTodos() {
  const query = `
    SELECT
      r.*,
      l.nome_local,
      u.nome AS usuario_responsavel
    FROM relatorio r
    INNER JOIN local l
      ON l.id_local = r.id_local
    INNER JOIN usuario u
      ON u.id_usuario = r.id_usuario_responsavel
    ORDER BY r.id_relatorio ASC;
  `;

  const resultado = await pool.query(query);

  return resultado.rows;
}

async function buscarPorId(idRelatorio) {
  const query = `
    SELECT
      r.*,
      l.nome_local,
      u.nome AS usuario_responsavel
    FROM relatorio r
    INNER JOIN local l
      ON l.id_local = r.id_local
    INNER JOIN usuario u
      ON u.id_usuario = r.id_usuario_responsavel
    WHERE r.id_relatorio = $1;
  `;

  const resultado = await pool.query(query, [idRelatorio]);

  return resultado.rows[0];
}

async function buscarPorLocal(idLocal) {
  const query = `
    SELECT
      r.*,
      u.nome AS usuario_responsavel
    FROM relatorio r
    INNER JOIN usuario u
      ON u.id_usuario = r.id_usuario_responsavel
    WHERE r.id_local = $1;
  `;

  const resultado = await pool.query(query, [idLocal]);

  return resultado.rows[0];
}

async function buscarDadosCompletos(idRelatorio) {
  const query = `
    SELECT
      r.id_relatorio,
      r.numero_art,
      r.status AS status_relatorio,
      r.data_emissao,
      r.caminho_pdf,
      r.hash_pdf,

      u.id_usuario AS id_responsavel,
      u.nome AS responsavel,
      u.email AS email_responsavel,

      l.id_local,
      l.nome_local,
      l.setor,
      l.descricao AS descricao_local,
      l.endereco,
      l.latitude,
      l.longitude,
      l.status AS status_local,

      c.id_campanha,
      c.nome_campanha,
      c.empresa,
      c.responsavel AS responsavel_campanha,
      c.data_inicio,
      c.status AS status_campanha,

      ch.id_checklist,
      ch.identificacao_espaco,
      ch.acesso_controlado,
      ch.ventilacao_adequada,
      ch.monitoramento_atmosferico,
      ch.procedimento_emergencia,
      ch.observacoes AS observacoes_checklist,
      ch.status AS status_checklist,

      dt.id_dados,
      dt.pressao_atmosferica,
      dt.ventilacao,
      dt.oxigenio,
      dt.gas_inflamavel,
      dt.monoxido_carbono,
      dt.sulfeto_hidrogenio,
      dt.temperatura,
      dt.umidade,
      dt.observacoes AS observacoes_dados_tecnicos,
      dt.status AS status_dados_tecnicos,

      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id_evidencia', e.id_evidencia,
              'tipo', e.tipo,
              'caminho_arquivo', e.caminho_arquivo,
              'descricao', e.descricao,
              'id_usuario', e.id_usuario,
              'data_criacao', e.data_criacao
            )
            ORDER BY e.id_evidencia
          )
          FROM evidencia e
          WHERE e.id_local = l.id_local
        ),
        '[]'::json
      ) AS evidencias

    FROM relatorio r

    INNER JOIN local l
      ON l.id_local = r.id_local

    INNER JOIN campanha c
      ON c.id_campanha = l.id_campanha

    INNER JOIN usuario u
      ON u.id_usuario = r.id_usuario_responsavel

    LEFT JOIN checklist_nr33 ch
      ON ch.id_local = l.id_local

    LEFT JOIN dados_tecnicos dt
      ON dt.id_local = l.id_local

    WHERE r.id_relatorio = $1;
  `;

  const resultado = await pool.query(query, [idRelatorio]);

  return resultado.rows[0];
}

async function atualizar(idRelatorio, dados) {
  const {
    numero_art,
    caminho_pdf,
    hash_pdf,
    status,
    data_emissao,
  } = dados;

  const query = `
    UPDATE relatorio
    SET
      numero_art = $1,
      caminho_pdf = $2,
      hash_pdf = $3,
      status = $4,
      data_emissao = $5,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE id_relatorio = $6
    RETURNING *;
  `;

  const valores = [
    numero_art ?? null,
    caminho_pdf ?? null,
    hash_pdf ?? null,
    status,
    data_emissao ?? null,
    idRelatorio,
  ];

  const resultado = await pool.query(query, valores);

  return resultado.rows[0];
}

async function excluir(idRelatorio) {
  const query = `
    DELETE FROM relatorio
    WHERE id_relatorio = $1
    RETURNING *;
  `;

  const resultado = await pool.query(query, [idRelatorio]);

  return resultado.rows[0];
}

module.exports = {
  criar,
  listarTodos,
  buscarPorId,
  buscarPorLocal,
  buscarDadosCompletos,
  atualizar,
  excluir,
};