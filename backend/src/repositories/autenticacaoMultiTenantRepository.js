
const pool = require("../config/database");

/**
 * Busca os dados necessários para o login multi-tenant.
 *
 * A situação do ambiente é obtida diretamente
 * do PostgreSQL.
 *
 * IMPORTANTE:
 * Depende da migração 020.
 * Não utilizar antes da homologação.
 *
 * O hash da senha deve permanecer somente
 * no backend e nunca ser enviado ao frontend.
 */
async function buscarPorEmailComAmbiente(email, client = pool) {
  if (
    typeof email !== "string" ||
    !email.trim()
  ) {
    return null;
  }

  const emailNormalizado = email.trim().toLowerCase();

  const query = `
    SELECT
      u.id_usuario,
      u.id_ambiente,
      u.nome,
      u.email,
      u.senha_hash,
      u.perfil_acesso,
      u.eh_fundador,
      u.ativo,
      a.ativo AS ambiente_ativo
    FROM usuario AS u
    LEFT JOIN ambiente AS a
      ON a.id_ambiente = u.id_ambiente
    WHERE LOWER(u.email) = $1
    LIMIT 1
  `;

  const resultado = await client.query(
    query,
    [emailNormalizado]
  );

  return resultado.rows[0] || null;
}

module.exports = {
  buscarPorEmailComAmbiente,
};
