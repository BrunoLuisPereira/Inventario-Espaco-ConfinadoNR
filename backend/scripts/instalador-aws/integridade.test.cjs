'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const hashesPath = require.resolve('./hashes.cjs');
const leitorPath = require.resolve('./ler-migrations.cjs');

test('todas as migrations possuem hashes validos', () => {
  const { lerMigrations } = require(leitorPath);
  const migrations = lerMigrations();

  assert.equal(migrations.length, 10);
});

test('migration com hash divergente e bloqueada', () => {
  const { HASHES } = require(hashesPath);
  const falso = { ...HASHES };

  falso['000_baseline_homolog_observado.sql'] = '0'.repeat(64);

  const original = require.cache[hashesPath].exports;

  try {
    require.cache[hashesPath].exports = { HASHES: falso };
    delete require.cache[leitorPath];

    const { lerMigrations } = require(leitorPath);

    assert.throws(
      () => lerMigrations(),
      /Integridade SHA256 divergente: 000_baseline_homolog_observado.sql/
    );
  } finally {
    require.cache[hashesPath].exports = original;
    delete require.cache[leitorPath];
  }
});
