'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MIGRATIONS } = require('./config.cjs');
const { HASHES } = require('./hashes.cjs');
const { validarCorpoSQL } = require('../../laboratorio/validar-corpo-sql.cjs');

const DIRETORIO_SQL = path.resolve(__dirname, '../../database');

function lerMigrations() {
  return MIGRATIONS.map((nome) => {
    if (!/^[0-9]{3}_[a-z0-9_]+\.sql$/.test(nome)) {
      throw new Error('Nome de migration invalido.');
    }

    const arquivo = path.join(DIRETORIO_SQL, nome);
    const sql = fs.readFileSync(arquivo, 'utf8').replace(/\r\n/g, '\n');

    const match = /^((?:\s|--[^\n]*(?:\n|$))*)BEGIN;([\s\S]*)COMMIT;\s*$/.exec(sql);

    if (!match) {
      throw new Error('Delimitadores invalidos: ' + nome);
    }

    const hash = crypto.createHash('sha256').update(sql).digest('hex');
    if (HASHES[nome] !== hash) {
      throw new Error('Integridade SHA256 divergente: ' + nome);
    }

    const corpo = match[2];
    validarCorpoSQL(corpo);

    return {
      nome,
      sha256: hash,
      corpo,
    };
  });
}

module.exports = { lerMigrations };
