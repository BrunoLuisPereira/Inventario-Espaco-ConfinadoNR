
/**
 * Repositório de ambientes do sistema multi-tenant.
 *
 * As funções recebem uma conexão PostgreSQL para
 * permitir sua utilização dentro de transações.
 */

/**
 * Valida a conexão PostgreSQL recebida.
 */
function validarConexao(client) {
  if (!client || typeof client.query !== "function") {
    throw new Error(
      "Uma conexão PostgreSQL válida é obrigatória."
    );
  }
}

/**
 * Cria um ambiente e retorna seus dados.
 *
 * @param {object} client - Conexão PostgreSQL.
 * @param {string} nome - Nome do ambiente.
 * @returns {Promise<object>}
 */
async function criar(client, nome) {
  validarConexao(client);

  if (typeof nome !== "string" || !nome.trim()) {
    throw new Error(
      "O nome do ambiente é obrigatório."
    );
  }

  const nomeNormalizado = nome.trim();

  if (nomeNormalizado.length > 180) {
    throw new Error(
      "O nome do ambiente deve possuir no máximo 180 caracteres."
    );
  }

  const query = `
    INSERT INTO ambiente (nome)
    VALUES ($1)
    RETURNING
      id_ambiente,
      nome,
      ativo,
      data_criacao,
      data_atualizacao
  `;

  const resultado = await client.query(query, [
    nomeNormalizado,
  ]);

  return resultado.rows[0];
}

/**
 * Busca um ambiente ativo e bloqueia seu registro
 * com FOR SHARE durante a transação.
 *
 * Esse bloqueio impede UPDATE ou DELETE concorrente
 * do ambiente até o COMMIT ou ROLLBACK.
 *
 * IMPORTANTE:
 * - Deve ser utilizada dentro de uma transação.
 * - O idAmbiente deve vir do backend/banco de dados.
 * - Não deve ser obtido diretamente do frontend.
 *
 * @param {object} client - Conexão PostgreSQL.
 * @param {string} idAmbiente - UUID do ambiente.
 * @returns {Promise<object|null>}
 */
async function buscarAmbienteAtivoComBloqueio(
  client,
  idAmbiente
) {
  validarConexao(client);

  if (
    typeof idAmbiente !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idAmbiente
    )
  ) {
    throw new Error(
      "Identificador do ambiente inválido."
    );
  }

  const query = `
    SELECT
      id_ambiente,
      nome,
      ativo
    FROM ambiente
    WHERE id_ambiente = $1
      AND ativo = TRUE
    FOR SHARE
  `;

  const resultado = await client.query(query, [
    idAmbiente,
  ]);

  return resultado.rows[0] || null;
}

module.exports = {
  criar,
  buscarAmbienteAtivoComBloqueio,
};
