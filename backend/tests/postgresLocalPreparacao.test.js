const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { destinoLocal, validarAmbienteLocal, sqlInstalacaoLocal } = require('../laboratorio/postgresLocal.cjs');
const { arquivos } = require('../laboratorio/montar-sql.cjs');
const banco = 'inventario_nr33_multitenant_dev';
const fontes = arquivos.map(a => fs.readFileSync(path.resolve(__dirname,'../database',a),'utf8'));
const senha = 'x'.repeat(64);
const env = { DB_HOST:'127.0.0.1',DB_PORT:'5432',DB_NAME:banco,DB_USER:'nr33_dev_app',DB_PASSWORD:senha,JWT_SECRET:'s'.repeat(64),NR33_LOCAL_AUTORIZADO:'PASSO712',LOGIN_HMAC_SECRET:Buffer.alloc(32,7).toString('base64') };
for (const invalido of ['inventario_espacos_confinados','inventario_espacos_confinados_homolog','postgres','nr33_lab_20261018_702a9f', banco+'\n',banco+' ',banco.toUpperCase(),null,{},"x'; DROP DATABASE x;"]) {
  test('local recusa destino nao autorizado: '+String(invalido), () => {
    assert.throws(() => destinoLocal(invalido));
    assert.throws(() => sqlInstalacaoLocal(invalido,fontes,senha));
  });
}
test('local exige host, porta, papel e autorizacao exatos', () => {
  assert.deepEqual(validarAmbienteLocal(env), { banco,host:'127.0.0.1',porta:5432,papel:'nr33_dev_app',portaHTTP:3001 });
  for (const [campo,valor] of [['DB_HOST','localhost'],['DB_PORT','55432'],['DB_USER','postgres'],['NR33_LOCAL_AUTORIZADO','PASSO710'],['DB_PASSWORD','curta'],['JWT_SECRET',undefined]]) {
    assert.throws(() => validarAmbienteLocal({...env,[campo]:valor}));
  }
});
test('instalacao local preserva DDL e combina onze tabelas em transacao unica', () => {
  const originais=[...fontes], sql=sqlInstalacaoLocal(banco,fontes,senha);
  assert.deepEqual(fontes,originais);
  assert.equal((sql.match(/^CREATE TABLE /gm)||[]).length,11);
  assert.equal((sql.match(/^BEGIN;/gm)||[]).length,1);
  assert.equal((sql.match(/^COMMIT;/gm)||[]).length,1);
  assert.equal((sql.match(/IS DISTINCT FROM 'passo712'/g)||[]).length,3);
  assert.doesNotMatch(sql,/IS DISTINCT FROM 'passo710'|CREATE DATABASE|DROP DATABASE|ALTER DATABASE/);
  assert.match(sql,/server_version_num/);
  assert.match(sql,/Instalacao exige esquema vazio e papel novo/);
  assert.match(sql,/NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
  assert.match(sql,/REVOKE ALL ON DATABASE inventario_nr33_multitenant_dev FROM PUBLIC/);
  assert.doesNotMatch(sql,/ALTER ROLE|ALTER USER|ALTER DEFAULT PRIVILEGES/);
});
test('senha e fontes SQL adulteradas nao entram na instalacao', () => {
  for (const invalida of [null,{},'curta',senha+'\n',"x'.repeat(64)"]) assert.throws(() => sqlInstalacaoLocal(banco,fontes,invalida));
  assert.throws(() => sqlInstalacaoLocal(banco,[],senha));
  assert.throws(() => sqlInstalacaoLocal(banco,[fontes[0].replace('DO $seguranca$','DO $outro$'),...fontes.slice(1)],senha));
});
test('backend local recusa destino protegido antes de criar pool', async t => {
  const anterior=process.env.DB_NAME;
  t.after(() => { if (anterior===undefined) delete process.env.DB_NAME; else process.env.DB_NAME=anterior; });
  process.env.DB_NAME='inventario_espacos_confinados';
  const { iniciar } = require('../laboratorio/servidor-local.cjs');
  await assert.rejects(iniciar(), /Banco local nao autorizado/);
});
