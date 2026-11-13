'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { montarInstalacao } = require('./montar-instalacao.cjs');

test('gera dez migrations para banco descartavel', () => {
  const resultado = montarInstalacao('nr33_aws_teste_instalacao');

  assert.equal(resultado.tipo, 'TESTE');
  assert.equal(resultado.migrations, 10);
  assert.match(resultado.sql, /^BEGIN;/);
  assert.match(resultado.sql.trimEnd(), /COMMIT;$/);
});

test('bloqueia geracao para homologacao', () => {
  assert.throws(
    () => montarInstalacao('inventario_nr33_homolog')
  );
});

test('bloqueia bancos nao autorizados', () => {
  assert.throws(
    () => montarInstalacao('postgres')
  );
});

test('remove dependencias historicas de desenvolvimento', () => {
  const { sql } = montarInstalacao('nr33_aws_teste_instalacao');

  assert.doesNotMatch(sql, /nr33_dev_app/);
  assert.doesNotMatch(sql, /inventario_nr33_multitenant_dev/);
  assert.doesNotMatch(sql, /nr33\.laboratorio/);
  assert.doesNotMatch(sql, /a9cdba4a-fd68-4b3e-bfd0-d86a9281bb66/);
  assert.doesNotMatch(sql, /021ae9c9-7c37-4be0-ab2b-306ebb0a3004/);
});

test('preserva protecoes de fundador, convites e auditoria', () => {
  const { sql } = montarInstalacao('nr33_aws_teste_instalacao');

  assert.match(sql, /nr33_proteger_usuario_perfil/);
  assert.match(sql, /nr33_proteger_convite_perfil/);
  assert.match(sql, /nr33_auditar_perfil/);
});

test('mantem delimitadores externos de transacao', () => {
  const { sql } = montarInstalacao('nr33_aws_teste_instalacao');

  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
});
