const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/evidenciaIsolamentoPreload.cjs');
const pg = require('pg');

test('preload preserva parsers puros de arrays e BIGINT sem perder precisao', () => {
  assert.equal(typeof pg.types.getTypeParser(1003)('{id_usuario,id_ambiente}'), 'string');
  assert.deepEqual(pg.types.getTypeParser(1009)('{id_usuario,id_ambiente}'), ['id_usuario', 'id_ambiente']);
  assert.equal(pg.types.getTypeParser(20)('9223372036854775807'), '9223372036854775807');
});

test('preload continua bloqueando Pool e Client mesmo com parsers disponiveis', () => {
  const pool = new pg.Pool();
  const client = new pg.Client();
  for (const alvo of [pool, client]) {
    assert.throws(() => alvo.connect(), /Acesso real ao PostgreSQL proibido/);
    assert.throws(() => alvo.query('SELECT 1'), /Acesso real ao PostgreSQL proibido/);
  }
});

test('preload mantem dotenv e leituras de arquivos reais bloqueados', () => {
  assert.deepEqual(require('dotenv').config(), { parsed: {} });
  const fs = require('node:fs');
  for (const arquivo of ['.env', 'uploads/nao-abrir.jpg', 'nao-abrir.pdf']) {
    assert.throws(() => fs.readFileSync(arquivo), /Arquivo real/);
  }
});
