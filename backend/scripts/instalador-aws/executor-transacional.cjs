'use strict';

const { verificarBanco } = require('./verificar-banco.cjs');
const { montarInstalacao } = require('./montar-instalacao.cjs');

async function executarInstalacao(client, banco, opcoes = {}) {
  const permitirHomologacao = opcoes.permitirHomologacao === true;
  const instalacao = montarInstalacao(banco, { permitirHomologacao });

  let transacaoAberta = false;

  try {
    await client.query('BEGIN');
    transacaoAberta = true;

    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query("SET LOCAL lock_timeout = '10s'");

    // Bloqueio exclusivo por banco durante a instalacao.
    await client.query(
      'SELECT pg_advisory_xact_lock($1::integer, $2::integer)',
      [330033, 2026]
    );

    const identidade = await client.query(
      'SELECT session_user AS sessao, current_user AS efetivo'
    );

    if (
      identidade.rows.length !== 1 ||
      identidade.rows[0].sessao !== 'postgres' ||
      identidade.rows[0].efetivo !== 'postgres'
    ) {
      throw new Error('Instalacao exige sessao administrativa postgres.');
    }

    const verificacao = await verificarBanco(
      client, banco, permitirHomologacao
    );

    await client.query('SET LOCAL ROLE nr33_hml_owner');

    const permissao = await client.query(
      "SELECT current_user AS usuario, has_schema_privilege(current_user, 'public', 'CREATE') AS pode_criar"
    );

    if (
      permissao.rows.length !== 1 ||
      permissao.rows[0].usuario !== 'nr33_hml_owner' ||
      permissao.rows[0].pode_criar !== true
    ) {
      throw new Error('Role proprietaria sem permissao para instalar.');
    }

    // O SQL gerado ja possui BEGIN/COMMIT externos.
    // Retiramos apenas esses delimitadores para manter
    // o controle da transacao neste executor.
    const sql = instalacao.sql
      .replace(/^BEGIN;\s*/, '')
      .replace(/\s*COMMIT;\s*$/, '');

    await client.query(sql);

    await client.query('COMMIT');
    transacaoAberta = false;

    return {
      banco,
      tipo: verificacao.tipo,
      migrations: instalacao.migrations,
      concluido: true
    };
  } catch (erro) {
    if (transacaoAberta) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // A conexao deve ser descartada pelo chamador.
      }
    }

    throw erro;
  }
}

module.exports = { executarInstalacao };
