'use strict';

const { validarDestino } = require('./config.cjs');

async function verificarBanco(client, bancoEsperado, permitirHomologacao = false) {
  const tipo = validarDestino(bancoEsperado, permitirHomologacao);

  const identidade = await client.query(`
    SELECT
      current_database() AS banco,
      current_setting('server_version_num')::integer AS versao,
      (
        SELECT r.rolname
        FROM pg_database d
        JOIN pg_roles r ON r.oid = d.datdba
        WHERE d.datname = current_database()
      ) AS proprietario
  `);

  const { banco, versao, proprietario } = identidade.rows[0];

  if (banco !== bancoEsperado) {
    throw new Error('Banco conectado diferente do destino autorizado.');
  }

  if (Math.floor(versao / 10000) !== 17) {
    throw new Error('PostgreSQL 17 obrigatorio.');
  }

  if (proprietario !== 'nr33_hml_owner') {
    throw new Error('Banco deve pertencer a nr33_hml_owner.');
  }

  const objetos = await client.query(`
    SELECT
      (SELECT count(*)::integer
       FROM pg_namespace
       WHERE nspname <> 'information_schema'
         AND nspname <> 'public'
         AND left(nspname, 3) <> 'pg_') +
      (SELECT count(*)::integer
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind IN ('r','p','v','m','S','f')) +
      (SELECT count(*)::integer
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public') +
      (SELECT count(*)::integer
       FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public'
         AND t.typtype IN ('e','d','r','m')) +
      (SELECT count(*)::integer
       FROM pg_extension
       WHERE extname <> 'plpgsql') AS quantidade
  `);

  const quantidade = objetos.rows[0].quantidade;

  if (!Number.isInteger(quantidade) || quantidade !== 0) {
    throw new Error('Banco contem objetos, esquemas ou extensoes adicionais.');
  }

  return { banco, tipo, versao, proprietario, objetos: quantidade };
}

module.exports = { verificarBanco };
