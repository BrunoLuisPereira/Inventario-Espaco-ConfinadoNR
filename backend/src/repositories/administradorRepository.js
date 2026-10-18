
/**
 * Repositório de autorização administrativa multi-tenant.
 *
 * Utiliza a conexão da transação recebida pelo serviço.
 */

/**
 * Busca um administrador ativo e seu ambiente.
 *
 * O idUsuario deve ser obtido da autenticação
 * validada pelo backend, nunca do corpo da requisição.
 */
async function buscarAdministradorAtivo(client, idUsuario, opcoes = {}) {
  if (!client || typeof client.query !== "function") {
    throw new Error(
      "Uma conexão PostgreSQL válida é obrigatória."
    );
  }

  if (
    !Number.isSafeInteger(idUsuario) ||
    idUsuario <= 0
  ) {
    throw new Error(
      "Identificador de usuário inválido."
    );
  }

  const query = `
    SELECT
      u.id_usuario,
      u.id_ambiente,
      u.nome,
      u.email,
      u.perfil_acesso
    FROM usuario AS u
    INNER JOIN ambiente AS a
      ON a.id_ambiente = u.id_ambiente
    WHERE u.id_usuario = $1
      AND u.perfil_acesso = 'ADMINISTRADOR'
      AND u.ativo = TRUE
      AND a.ativo = TRUE
    LIMIT 1
  `;

  const resultado = await client.query(query, [
    idUsuario,
  ]);

  const referencia = resultado.rows[0];
  if (!referencia || opcoes.bloquear !== true) return referencia || null;

  // A leitura inicial só descobre o ambiente. A autorização efetiva ocorre
  // novamente sob locks, na ordem ambiente -> usuário, até o fim da transação.
  const ambiente = await client.query(`
    SELECT id_ambiente FROM ambiente
    WHERE id_ambiente = $1 AND ativo = TRUE FOR SHARE
  `, [referencia.id_ambiente]);
  if (!ambiente.rows[0]) return null;
  const bloqueado = await client.query(`
    SELECT u.id_usuario, u.id_ambiente, u.nome, u.email, u.perfil_acesso
    FROM usuario AS u
    WHERE u.id_usuario = $1 AND u.id_ambiente = $2
      AND u.ativo = TRUE AND u.perfil_acesso = 'ADMINISTRADOR'
    FOR SHARE OF u
  `, [idUsuario, referencia.id_ambiente]);
  return bloqueado.rows[0] || null;
}

module.exports = {
  buscarAdministradorAtivo,
};
