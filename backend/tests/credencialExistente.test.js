const test = require('node:test');
const assert = require('node:assert/strict');
const { senhaExistenteValida } = require('../laboratorio/senha-existente.cjs');
const { verificar } = require('../laboratorio/verificar-credencial-aplicacao.cjs');
const { sincronizar, CONFIRMACAO } = require('../laboratorio/sincronizar-credencial-aplicacao.cjs');
test('credencial existente aceita símbolos, Unicode e tamanho diferente da criação', () => {
  for (const s of ['curta', ' espaço!#á ', 'x'.repeat(256)]) assert.equal(senhaExistenteValida(s), true);
  for (const s of ['', null, {}, 'a\0b', 'x'.repeat(4097)]) assert.equal(senhaExistenteValida(s), false);
});
test('verificação de credencial só consulta identidade com transação READ ONLY', async () => {
  const comandos = [];
  const r = await verificar('existente#', () => ({ connect: async () => {}, end: async () => {}, query: async sql => {
    comandos.push(sql); return { rows: [{ banco: 'inventario_nr33_multitenant_dev', papel: 'nr33_dev_app', versao: 17 }] };
  } }));
  assert.equal(r.autenticada, true); assert.equal(comandos[0], 'BEGIN READ ONLY');
  assert.ok(comandos.every(s => /^(BEGIN READ ONLY|SELECT|COMMIT)/.test(s)));
});
test('sincronização exige autorização antes de conectar', async () => {
  await assert.rejects(sincronizar({ senha: 'existente#', admin: 'admin#' }, () => assert.fail()));
});
test('administrador recusado não altera senha e retorna somente código seguro', async () => {
  const comandos = [];
  await assert.rejects(sincronizar({ confirmacao: CONFIRMACAO, senha: 'existente#', admin: 'admin-sintetico' }, () => ({
    connect: async () => { throw Object.assign(Error('detalhe privado'), { code: '28P01' }); },
    end: async () => {}, query: async sql => { comandos.push(sql); return { rows: [] }; },
  })), { message: 'ADMIN_AUTENTICACAO_RECUSADA' });
  assert.ok(!comandos.some(s => s.startsWith('ALTER')));
});
test('sincronização altera somente PASSWORD com verificador SCRAM, preserva atributos e confirma autenticação', async () => {
  const comandos = [], senha = 'existente#á'; let autenticada = false;
  const papel = { rolname: 'nr33_dev_app', rolcanlogin: true, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false, rolvaliduntil: null };
  const r = await sincronizar({ confirmacao: CONFIRMACAO, senha, admin: 'admin-sintetico' }, () => ({
    connect: async () => {}, end: async () => {}, query: async sql => {
      comandos.push(sql);
      if (sql.startsWith('SELECT current_database')) return { rows: [{ banco: 'inventario_nr33_multitenant_dev', papel: 'postgres', sessao: 'postgres', host: '127.0.0.1', porta: 5432, versao: 17 }] };
      return { rows: [papel] };
    },
  }), async s => { assert.equal(s, senha); autenticada = true; });
  assert.equal(r.sincronizada, true); assert.equal(autenticada, true);
  const alters = comandos.filter(s => s.startsWith('ALTER'));
  assert.equal(alters.length, 1); assert.match(alters[0], /^ALTER ROLE nr33_dev_app PASSWORD 'SCRAM-SHA-256\$4096:/);
  assert.ok(!comandos.some(s => s.includes(senha)));
  assert.ok(comandos.every(s => !/^(CREATE|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE)/.test(s)));
});
