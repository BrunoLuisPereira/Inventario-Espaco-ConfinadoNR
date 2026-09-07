const pool = require("../config/database");

async function buscarVersao(
  entidade,
  idEntidade
) {
  const query = `
    SELECT *
    FROM versao_entidade
    WHERE entidade = $1
      AND id_entidade = $2;
  `;

  const resultado = await pool.query(
    query,
    [entidade, idEntidade]
  );

  return resultado.rows[0] || null;
}


async function criarVersao(
  entidade,
  idEntidade,
  versao = 1
) {
  const query = `
    INSERT INTO versao_entidade (
      entidade,
      id_entidade,
      versao
    )
    VALUES ($1, $2, $3)
    ON CONFLICT (entidade, id_entidade)
    DO NOTHING
    RETURNING *;
  `;

  const resultado = await pool.query(
    query,
    [
      entidade,
      idEntidade,
      versao,
    ]
  );

  /*
   * Se outro processo já tiver criado
   * o controle de versão, buscamos
   * o registro existente.
   */
  if (resultado.rows[0]) {
    return resultado.rows[0];
  }

  return buscarVersao(
    entidade,
    idEntidade
  );
}


async function obterOuCriarVersao(
  entidade,
  idEntidade
) {
  const existente =
    await buscarVersao(
      entidade,
      idEntidade
    );

  if (existente) {
    return existente;
  }

  return criarVersao(
    entidade,
    idEntidade,
    1
  );
}


async function incrementarVersao(
  entidade,
  idEntidade
) {
  /*
   * Primeiro garantimos que exista
   * controle de versão para a entidade.
   */
  await obterOuCriarVersao(
    entidade,
    idEntidade
  );

  const query = `
    UPDATE versao_entidade
    SET
      versao = versao + 1,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE entidade = $1
      AND id_entidade = $2
    RETURNING *;
  `;

  const resultado = await pool.query(
    query,
    [entidade, idEntidade]
  );

  return resultado.rows[0] || null;
}


async function definirVersao(
  entidade,
  idEntidade,
  versao
) {
  const query = `
    INSERT INTO versao_entidade (
      entidade,
      id_entidade,
      versao
    )
    VALUES ($1, $2, $3)

    ON CONFLICT (entidade, id_entidade)

    DO UPDATE SET
      versao = EXCLUDED.versao,
      data_atualizacao = CURRENT_TIMESTAMP

    RETURNING *;
  `;

  const resultado = await pool.query(
    query,
    [
      entidade,
      idEntidade,
      versao,
    ]
  );

  return resultado.rows[0];
}


async function excluirVersao(
  entidade,
  idEntidade
) {
  const query = `
    DELETE FROM versao_entidade
    WHERE entidade = $1
      AND id_entidade = $2
    RETURNING *;
  `;

  const resultado = await pool.query(
    query,
    [entidade, idEntidade]
  );

  return resultado.rows[0] || null;
}


module.exports = {
  buscarVersao,
  criarVersao,
  obterOuCriarVersao,
  incrementarVersao,
  definirVersao,
  excluirVersao,
};