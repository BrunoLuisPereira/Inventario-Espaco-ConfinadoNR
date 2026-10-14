
const pool = require("../config/database");

/**
 * Valida o identificador UUID do ambiente.
 *
 * O identificador deve vir exclusivamente
 * da autenticação realizada pelo backend.
 */
function validarIdAmbiente(idAmbiente) {
  if (
    typeof idAmbiente !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idAmbiente
    )
  ) {
    const erro = new Error(
      "Identificação do ambiente inválida."
    );

    erro.statusCode = 403;
    throw erro;
  }
}

/**
 * Lista somente as campanhas de um ambiente.
 *
 * IMPORTANTE:
 * Depende da migração 020.
 * Não utilizar antes da homologação.
 */
async function listarPorAmbiente(idAmbiente) {
  validarIdAmbiente(idAmbiente);

  const query = `
    SELECT
      c.id_campanha,
      c.id_ambiente,
      c.nome_campanha,
      c.empresa,
      c.responsavel,
      c.data_inicio,
      c.status,
      c.id_usuario,
      u.nome AS usuario_responsavel,
      c.data_criacao,
      c.data_atualizacao
    FROM campanha AS c
    INNER JOIN usuario AS u
      ON u.id_usuario = c.id_usuario
      AND u.id_ambiente = c.id_ambiente
    WHERE c.id_ambiente = $1
    ORDER BY c.data_criacao DESC
  `;

  const resultado = await pool.query(
    query,
    [idAmbiente]
  );

  return resultado.rows;
}

/**
 * Busca uma campanha pertencente ao ambiente.
 *
 * Campanhas de outros ambientes não são
 * retornadas, mesmo que seu ID seja conhecido.
 */
async function buscarPorIdEAmbiente(
  idCampanha,
  idAmbiente
) {
  validarIdAmbiente(idAmbiente);

  const id = Number(idCampanha);

  if (!Number.isSafeInteger(id) || id <= 0) {
    const erro = new Error(
      "ID da campanha inválido."
    );

    erro.statusCode = 400;
    throw erro;
  }

  const query = `
    SELECT
      c.id_campanha,
      c.id_ambiente,
      c.nome_campanha,
      c.empresa,
      c.responsavel,
      c.data_inicio,
      c.status,
      c.id_usuario,
      u.nome AS usuario_responsavel,
      c.data_criacao,
      c.data_atualizacao
    FROM campanha AS c
    INNER JOIN usuario AS u
      ON u.id_usuario = c.id_usuario
      AND u.id_ambiente = c.id_ambiente
    WHERE c.id_campanha = $1
      AND c.id_ambiente = $2
    LIMIT 1
  `;

  const resultado = await pool.query(
    query,
    [id, idAmbiente]
  );

  return resultado.rows[0] || null;
}

module.exports = {
  listarPorAmbiente,
  buscarPorIdEAmbiente,
};
