
/**
 * Repositório de usuários cadastrados por convite.
 *
 * Todas as operações utilizam a conexão PostgreSQL
 * recebida do serviço, permitindo transações.
 */

/**
 * Cria um usuário no ambiente do convite.
 *
 * idAmbiente e perfilAcesso devem ser obtidos
 * exclusivamente de um convite validado.
 */
async function criarUsuarioConvidado(client, dados) {
  if (!client || typeof client.query !== "function") {
    throw new Error(
      "Uma conexão PostgreSQL válida é obrigatória."
    );
  }

  if (
    !dados ||
    typeof dados !== "object" ||
    Array.isArray(dados)
  ) {
    throw new Error(
      "Dados do usuário convidado inválidos."
    );
  }

  const {
    idAmbiente,
    nome,
    email,
    senhaHash,
    perfilAcesso,
    idConviteOrigem,
  } = dados;

  const query = `
    INSERT INTO usuario (
      id_ambiente,
      nome,
      email,
      senha_hash,
      perfil_acesso,
      id_convite_origem
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING
      id_usuario,
      id_ambiente,
      nome,
      email,
      perfil_acesso,
      ativo,
      data_criacao
  `;

  const resultado = await client.query(query, [
    idAmbiente,
    nome,
    email,
    senhaHash,
    perfilAcesso,
    idConviteOrigem,
  ]);

  return resultado.rows[0];
}

module.exports = {
  criarUsuarioConvidado,
};
