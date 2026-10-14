
/**
 * Bloqueio transacional por e-mail.
 *
 * Todas as operações que reservam um e-mail
 * (cadastro público, emissão e aceite de convite)
 * deverão utilizar esta função antes de consultar
 * ou modificar os registros correspondentes.
 *
 * O bloqueio permanece ativo até COMMIT ou ROLLBACK.
 */

async function bloquearEmail(client, email) {
  if (!client || typeof client.query !== "function") {
    throw new Error(
      "Uma conexão PostgreSQL válida é obrigatória."
    );
  }

  if (typeof email !== "string" || !email.trim()) {
    throw new Error(
      "O e-mail é obrigatório para obter o bloqueio."
    );
  }

  const emailNormalizado = email.trim().toLowerCase();

  await client.query(
    `
      SELECT pg_advisory_xact_lock(
        hashtextextended($1::text, 0)
      )
    `,
    [emailNormalizado]
  );
}

module.exports = {
  bloquearEmail,
};
