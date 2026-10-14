
/**
 * Repositório de consultas para convites multi-tenant.
 *
 * Todas as funções recebem uma conexão PostgreSQL
 * para participar da mesma transação.
 */

function validarConexao(client) {
  if (!client || typeof client.query !== "function") {
    throw new Error(
      "Uma conexão PostgreSQL válida é obrigatória."
    );
  }
}

/**
 * Verifica se existe convite pendente e válido
 * para determinado e-mail.
 *
 * Deve ser chamada após bloquear o e-mail
 * na mesma transação.
 */
async function existeConvitePendente(client, email) {
  validarConexao(client);

  if (typeof email !== "string" || !email.trim()) {
    throw new Error(
      "O e-mail é obrigatório para consultar convites."
    );
  }

  const query = `
    SELECT EXISTS (
      SELECT 1
      FROM convite
      WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1))
        AND data_aceite IS NULL
        AND data_cancelamento IS NULL
        AND data_expiracao > clock_timestamp()
    ) AS existe
  `;

  const resultado = await client.query(query, [
    email.trim(),
  ]);

  return resultado.rows[0].existe;
}

/**
 * Verifica se o e-mail já pertence a um usuário.
 *
 * Deve ser chamada após bloquear o e-mail
 * na mesma transação.
 */
async function existeUsuarioPorEmail(client, email) {
  validarConexao(client);

  if (typeof email !== "string" || !email.trim()) {
    throw new Error(
      "O e-mail é obrigatório para consultar usuários."
    );
  }

  const query = `
    SELECT EXISTS (
      SELECT 1
      FROM usuario
      WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1))
    ) AS existe
  `;

  const resultado = await client.query(query, [
    email.trim(),
  ]);

  return resultado.rows[0].existe;
}

/**
 * Insere um convite associado a um ambiente.
 *
 * O tokenHash deve ser um SHA-256 hexadecimal
 * gerado pelo serviço de convites.
 */
async function criarConvite(client, dados) {
  validarConexao(client);

  const {
    idAmbiente,
    email,
    perfilAcesso,
    tokenHash,
    idUsuarioConvite,
    dataExpiracao,
  } = dados;

  const query = `
    INSERT INTO convite (
      id_ambiente,
      email,
      perfil_acesso,
      token_hash,
      id_usuario_convite,
      data_expiracao
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING
      id_convite,
      id_ambiente,
      email,
      perfil_acesso,
      id_usuario_convite,
      data_expiracao,
      data_criacao
  `;

  const resultado = await client.query(query, [
    idAmbiente,
    email,
    perfilAcesso,
    tokenHash,
    idUsuarioConvite,
    dataExpiracao,
  ]);

  return resultado.rows[0];
}

/**
 * Busca um convite pelo hash do token.
 *
 * FOR UPDATE OF c bloqueia o registro do convite
 * durante a transação, impedindo dois aceites
 * simultâneos do mesmo convite.
 *
 * O serviço deverá verificar se o convite:
 * - não expirou;
 * - não foi aceito;
 * - não foi cancelado;
 * - pertence a um ambiente ativo.
 *
 * ATENÇÃO:
 * O bloqueio do ambiente associado ainda será
 * tratado em uma etapa posterior.
 */
async function buscarConvitePorTokenHash(
  client,
  tokenHash
) {
  validarConexao(client);

  if (
    typeof tokenHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(tokenHash)
  ) {
    throw new Error(
      "Hash do token de convite inválido."
    );
  }

  const query = `
    SELECT
      c.id_convite,
      c.id_ambiente,
      c.email,
      c.perfil_acesso,
      c.data_expiracao,
      (c.data_expiracao > clock_timestamp()) AS nao_expirado,
      c.data_aceite,
      c.data_cancelamento,
      a.ativo AS ambiente_ativo
    FROM convite AS c
    INNER JOIN ambiente AS a
      ON a.id_ambiente = c.id_ambiente
    WHERE c.token_hash = $1
    FOR UPDATE OF c
  `;

  const resultado = await client.query(query, [
    tokenHash,
  ]);

  return resultado.rows[0] || null;
}

/**
 * Marca um convite como aceito.
 *
 * Deve ser executada na mesma transação
 * que cria o usuário convidado.
 *
 * A atualização só ocorre se o convite ainda
 * estiver pendente e dentro da validade.
 *
 * clock_timestamp() utiliza o horário efetivo
 * do PostgreSQL, independentemente do horário
 * de início da transação.
 */
async function registrarAceiteConvite(client, idConvite) {
  validarConexao(client);

  if (
    typeof idConvite !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idConvite
    )
  ) {
    throw new Error(
      "Identificador do convite inválido."
    );
  }

  const query = `
    UPDATE convite
    SET data_aceite = clock_timestamp()
    WHERE id_convite = $1
      AND data_aceite IS NULL
      AND data_cancelamento IS NULL
      AND data_expiracao > clock_timestamp()
    RETURNING
      id_convite,
      id_ambiente,
      email,
      perfil_acesso,
      data_aceite
  `;

  const resultado = await client.query(query, [
    idConvite,
  ]);

  return resultado.rows[0] || null;
}

/**
 * Localiza inicialmente um convite pelo hash do token.
 *
 * Esta consulta NÃO bloqueia o registro.
 * Seu objetivo é descobrir o e-mail para adquirir
 * primeiro o bloqueio transacional por e-mail.
 *
 * Após obter o bloqueio, o serviço deverá consultar
 * novamente o convite usando FOR UPDATE e validar
 * todos os dados atualizados.
 */
async function buscarEmailConvitePorTokenHash(
  client,
  tokenHash
) {
  validarConexao(client);

  if (
    typeof tokenHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(tokenHash)
  ) {
    throw new Error(
      "Hash do token de convite inválido."
    );
  }

  const query = `
    SELECT email
    FROM convite
    WHERE token_hash = $1
    LIMIT 1
  `;

  const resultado = await client.query(query, [
    tokenHash,
  ]);

  return resultado.rows[0] || null;
}

module.exports = {
  existeConvitePendente,
  existeUsuarioPorEmail,
  criarConvite,
  buscarConvitePorTokenHash,
  registrarAceiteConvite,
  buscarEmailConvitePorTokenHash,
};
