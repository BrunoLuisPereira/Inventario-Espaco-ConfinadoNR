const test = require('node:test');
const assert = require('node:assert/strict');
const { verificar } = require('../laboratorio/verificar-inicio-recuperacao.cjs');
function simular(opcoes = {}) {
  const comandos = [];
  return { comandos, criarClient(config) {
    assert.equal(config.host, '127.0.0.1'); assert.equal(config.port, 5432);
    assert.equal(config.database, 'inventario_nr33_multitenant_dev'); assert.equal(config.user, 'nr33_dev_app');
    return { async connect() { if (opcoes.senhaInvalida) throw Object.assign(Error('detalhe privado'), { code: '28P01' }); },
      async query(sql) {
        comandos.push(sql);
        if (sql.includes('current_database')) return { rows: [{ banco: 'inventario_nr33_multitenant_dev', papel: 'nr33_dev_app', versao: opcoes.versao || 17 }] };
        if (sql.includes('recuperacao_envio')) {
          if (opcoes.semMigration) throw Object.assign(Error('detalhe privado'), { code: '42P01' });
          return { rows: [{ pendente: !!opcoes.pendente }] };
        }
        return { rows: [] };
      }, async end() { comandos.push('END_CONNECTION'); } };
  } };
}
test('pré-check somente leitura, sem worker, envio, migration ou alteração de dados', async () => {
  const c = simular(); await verificar('s'.repeat(32), c.criarClient);
  assert.equal(c.comandos[0], 'BEGIN READ ONLY');
  assert.ok(c.comandos.every(sql => /^(BEGIN READ ONLY|SET LOCAL|SELECT|COMMIT|END_CONNECTION)/.test(sql)));
  assert.equal(c.comandos.at(-1), 'END_CONNECTION');
});
for (const [opcoes, codigo] of [[{ pendente: true }, 'FILA_PENDENTE'], [{ versao: 16 }, 'DESTINO_POSTGRES'],
  [{ semMigration: true }, 'MIGRATION024_OU_PERMISSOES'], [{ senhaInvalida: true }, 'CREDENCIAL_POSTGRES']]) {
  test('recusa segura: ' + codigo, async () => {
    const c = simular(opcoes);
    await assert.rejects(verificar('s'.repeat(32), c.criarClient), { message: codigo });
    assert.equal(c.comandos.at(-1), 'END_CONNECTION');
  });
}
test('senha inválida é recusada sem criar conexão', async () => {
  await assert.rejects(verificar('', () => assert.fail()), { message: 'CREDENCIAL_POSTGRES' });
});
