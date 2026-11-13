'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MIGRATIONS, validarDestino } = require('./config.cjs');

test('sequencia de migrations esperada', () => {
  assert.equal(MIGRATIONS.length, 10);
  assert.equal(MIGRATIONS[0], '000_baseline_homolog_observado.sql');
  assert.equal(MIGRATIONS.at(-1), '028_geracoes_pdf_idioma.sql');
  assert.equal(new Set(MIGRATIONS).size, MIGRATIONS.length);
});

test('aceita banco descartavel de teste', () => {
  assert.equal(validarDestino('nr33_aws_teste_validacao'), 'TESTE');
});

test('bloqueia homologacao por padrao', () => {
  assert.throws(() => validarDestino('inventario_nr33_homolog'));
});

test('exige autorizacao explicita para homologacao', () => {
  assert.equal(
    validarDestino('inventario_nr33_homolog', true),
    'HOMOLOGACAO'
  );
});

test('rejeita bancos nao autorizados', () => {
  for (const banco of [
    'postgres',
    'template1',
    'inventario_espacos_confinados',
    'nr33_aws_teste_',
    'nr33_aws_teste_validacao-extra',
    '',
  ]) {
    assert.throws(() => validarDestino(banco), `Banco: ${banco}`);
  }
});
