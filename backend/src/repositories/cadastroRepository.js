/**
 * Operações de banco para o cadastro inicial
 * de um ambiente multi-tenant.
 *
 * Recebe uma conexão PostgreSQL externa para
 * participar da mesma transação que cria o ambiente.
 */

async function criarAdministrador(
  client,
  { idAmbiente, nome, email, senhaHash }
) {
  if (!client || typeof client.query !== "function") {
    throw new Error(
      "Uma conexão PostgreSQL válida é obrigatória."
    );
  }

  if (
    !idAmbiente ||
    typeof nome !== "string" ||
    typeof email !== "string" ||
    typeof senhaHash !== "string"
  ) {
    throw new Error(
      "Dados obrigatórios do administrador não informados."
    );
  }

  const query = `
    INSERT INTO usuario (
      id_ambiente,
      nome,
      email,
      senha_hash,
      perfil_acesso
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      'ADMINISTRADOR'
    )
    RETURNING
      id_usuario,
      id_ambiente,
      nome,
      email,
      perfil_acesso,
      ativo,
      data_criacao,
      data_atualizacao
  `;

  const resultado = await client.query(query, [
    idAmbiente,
    nome,
    email,
    senhaHash,
  ]);

  return resultado.rows[0];
}

module.exports = {
  criarAdministrador,
};