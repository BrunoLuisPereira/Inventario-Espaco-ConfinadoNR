'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { executarInstalacao } = require('./executor-transacional.cjs');

function criarClienteSimulado(opcoes = {}) {
  const comandos = [];

  return {
    comandos,

    async query(sql, parametros) {
      comandos.push({ sql, parametros });

      if (opcoes.falharEm &&
          sql.includes(opcoes.falharEm)) {
        throw new Error('Falha simulada');
      }

      if (sql.includes('session_user AS sessao')) {
        return {
          rows: [{
            sessao: opcoes.sessao ?? 'postgres',
            efetivo: opcoes.efetivo ?? 'postgres'
          }]
        };
      }

      if (sql.includes('has_schema_privilege(current_user')) {
        return {
          rows: [{
            usuario: opcoes.usuarioRole ?? 'nr33_hml_owner',
            pode_criar: opcoes.podeCriar ?? true
          }]
        };
      }

      if (sql.includes('current_database() AS banco')) {
        return {
          rows: [{
            banco: opcoes.banco ?? 'nr33_aws_teste_executor',
            versao: 170011,
            proprietario: opcoes.proprietario ?? 'nr33_hml_owner'
          }]
        };
      }

      if (sql.includes('AS quantidade')) {
        return {
          rows: [{
            quantidade: opcoes.objetos ?? 0
          }]
        };
      }

      return { rows: [] };
    }
  };
}

test('executa instalacao com transacao e bloqueio', async () => {
  const cliente = criarClienteSimulado();

  const resultado = await executarInstalacao(
    cliente,
    'nr33_aws_teste_executor'
  );

  assert.equal(resultado.concluido, true);
  assert.equal(resultado.migrations, 10);

  const comandos = cliente.comandos.map(c => c.sql);

  assert.equal(comandos[0], 'BEGIN');
  assert.ok(comandos.some(sql =>
    sql.includes('pg_advisory_xact_lock')
  ));

  assert.equal(comandos.at(-1), 'COMMIT');

  const indiceBloqueio = comandos.findIndex(sql =>
    sql.includes('pg_advisory_xact_lock')
  );

  const indiceVerificacao = comandos.findIndex(sql =>
    sql.includes('current_database() AS banco')
  );

  assert.ok(indiceBloqueio < indiceVerificacao);
});

test('recusa banco com proprietario incorreto', async () => {
  const cliente = criarClienteSimulado({
    proprietario: 'nr33_hml_app'
  });

  await assert.rejects(
    executarInstalacao(
      cliente,
      'nr33_aws_teste_executor'
    ),
    /Banco deve pertencer a nr33_hml_owner/
  );

  const comandos = cliente.comandos.map(c => c.sql);

  assert.equal(comandos.at(-1), 'ROLLBACK');
  assert.ok(!comandos.includes('COMMIT'));

  assert.ok(
    !comandos.some(sql => sql.includes('-- MIGRATION')),
    'Nenhuma migration pode ser executada.'
  );
});

test('recusa banco que contem objetos', async () => {
  const cliente = criarClienteSimulado({
    objetos: 1
  });

  await assert.rejects(
    executarInstalacao(
      cliente,
      'nr33_aws_teste_executor'
    ),
    /Banco contem objetos/
  );

  const comandos = cliente.comandos.map(c => c.sql);

  assert.equal(comandos.at(-1), 'ROLLBACK');
  assert.ok(!comandos.includes('COMMIT'));
});

test('executa rollback em falha SQL', async () => {
  const cliente = criarClienteSimulado({
    falharEm: '-- MIGRATION'
  });

  await assert.rejects(
    executarInstalacao(
      cliente,
      'nr33_aws_teste_executor'
    ),
    /Falha simulada/
  );

  const comandos = cliente.comandos.map(c => c.sql);

  assert.equal(comandos.at(-1), 'ROLLBACK');
  assert.ok(!comandos.includes('COMMIT'));
});

test('recusa homologacao sem autorizacao', async () => {
  const cliente = criarClienteSimulado();

  await assert.rejects(
    executarInstalacao(
      cliente,
      'inventario_nr33_homolog'
    )
  );

  assert.equal(cliente.comandos.length, 0);
});

test('aceita homologacao somente com autorizacao explicita', async () => {
  const cliente = criarClienteSimulado({
    banco: 'inventario_nr33_homolog'
  });

  const resultado = await executarInstalacao(
    cliente,
    'inventario_nr33_homolog',
    { permitirHomologacao: true }
  );

  assert.equal(resultado.banco, 'inventario_nr33_homolog');
  assert.equal(resultado.tipo, 'HOMOLOGACAO');
  assert.equal(resultado.migrations, 10);
  assert.equal(resultado.concluido, true);

  const comandos = cliente.comandos.map(c => c.sql);

  assert.equal(comandos.at(-1), 'COMMIT');
  assert.ok(comandos.some(sql => sql.includes('-- MIGRATION')));
});

test('homologacao com proprietario incorreto executa rollback', async () => {
  const cliente = criarClienteSimulado({
    banco: 'inventario_nr33_homolog',
    proprietario: 'nr33_hml_app'
  });

  await assert.rejects(
    executarInstalacao(
      cliente,
      'inventario_nr33_homolog',
      { permitirHomologacao: true }
    ),
    /Banco deve pertencer a nr33_hml_owner/
  );

  const comandos = cliente.comandos.map(c => c.sql);

  assert.equal(comandos.at(-1), 'ROLLBACK');
  assert.ok(!comandos.includes('COMMIT'));
  assert.ok(!comandos.some(sql => sql.includes('-- MIGRATION')));
});

test('recusa sessao que nao seja postgres', async () => {
  const cliente = criarClienteSimulado({
    sessao: 'nr33_hml_app',
    efetivo: 'nr33_hml_app'
  });

  await assert.rejects(
    executarInstalacao(cliente, 'nr33_aws_teste_executor'),
    /Instalacao exige sessao administrativa postgres/
  );

  const comandos = cliente.comandos.map(c => c.sql);

  assert.equal(comandos.at(-1), 'ROLLBACK');
  assert.ok(!comandos.includes('COMMIT'));
  assert.ok(!comandos.some(sql => sql.includes('-- MIGRATION')));
});

test('recusa role proprietaria sem permissao de criar', async () => {
  const cliente = criarClienteSimulado({
    podeCriar: false
  });

  await assert.rejects(
    executarInstalacao(cliente, 'nr33_aws_teste_executor'),
    /Role proprietaria sem permissao para instalar/
  );

  const comandos = cliente.comandos.map(c => c.sql);

  assert.ok(comandos.includes('SET LOCAL ROLE nr33_hml_owner'));
  assert.equal(comandos.at(-1), 'ROLLBACK');
  assert.ok(!comandos.includes('COMMIT'));
  assert.ok(!comandos.some(sql => sql.includes('-- MIGRATION')));
});
