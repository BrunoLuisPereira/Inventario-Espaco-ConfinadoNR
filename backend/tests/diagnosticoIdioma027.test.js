const test = require('node:test');
const assert = require('node:assert/strict');
const { diagnosticar } = require('../laboratorio/diagnosticar-idioma027.cjs');
const destino = { banco: 'inventario_nr33_multitenant_dev', usuario: 'nr33_dev_app',
  usuario_sessao: 'nr33_dev_app', host: '127.0.0.1', porta: 5432, somente_leitura: 'on', superusuario: false };
function simular(alteracoes = {}, coluna = null, propriedade = {}) {
  const consultas = [];
  return { consultas, async query(sql) {
    consultas.push(sql);
    assert.match(sql, /^(BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY|SELECT|ROLLBACK)/);
    if (sql.startsWith('SELECT current_database')) return { rows: [{ ...destino, ...alteracoes }] };
    if (sql.includes('to_regclass')) return { rows: [{ existe: true }] };
    if (sql.includes('FROM pg_catalog.pg_class c')) return { rows: [{ proprietario: 'dono_sintetico',
      proprietario_direto: false, membro_da_funcao_proprietaria: false,
      privilegios_proprietario_efetivos: false, pode_assumir_funcao_proprietaria: false,
      uso_schema: true, ...propriedade }] };
    if (sql.includes('LEFT JOIN pg_catalog.pg_attrdef')) return { rows: coluna ? [coluna] : [] };
    if (sql.includes('pg_catalog.pg_constraint')) return { rows: [{ nome: 'usuario_idioma_permitido', tipo: 'c', validada: true, definicao: "CHECK (idioma IN ('pt-BR', 'en'))" }] };
    return { rows: [] };
  } };
}
test('coluna ausente informa migration pendente, sem consultar registros', async () => {
  const db = simular();
  const r = await diagnosticar(db);
  assert.equal(r.coluna_existe, false);
  assert.equal(r.estado, 'MIGRATION_027_PENDENTE_COLUNA_AUSENTE');
  assert.equal(db.consultas.at(-1), 'ROLLBACK');
  assert.equal(db.consultas.length, 6);
});
test('coluna existente informa tipo, default, NOT NULL e constraints', async () => {
  const coluna = { coluna: 'idioma', tipo: 'character varying(5)', nao_nulo: true, valor_padrao: "'pt-BR'::character varying" };
  const r = await diagnosticar(simular({}, coluna));
  assert.deepEqual(r.coluna, coluna);
  assert.equal(r.coluna_existe, true);
  assert.equal(r.restricoes[0].nome, 'usuario_idioma_permitido');
});
for (const divergencia of [{ banco: 'outro' }, { usuario: 'postgres' }, { usuario_sessao: 'postgres' },
  { host: '127.0.0.2' }, { porta: 55432 }, { somente_leitura: 'off' }, { superusuario: true }]) {
  test(`destino divergente interrompe antes de ler schema: ${JSON.stringify(divergencia)}`, async () => {
    const db = simular(divergencia);
    await assert.rejects(diagnosticar(db), /DESTINO_INVALIDO/);
    assert.equal(db.consultas.length, 3);
    assert.equal(db.consultas.at(-1), 'ROLLBACK');
  });
}
test('membro sem herança efetiva não recebe autorização implícita para migration', async () => {
  const r = await diagnosticar(simular({}, null, { membro_da_funcao_proprietaria: true,
    pode_assumir_funcao_proprietaria: true, privilegios_proprietario_efetivos: false }));
  assert.equal(r.autorizacao.autorizado_na_sessao_atual, false);
});
test('privilégios efetivos do proprietário e uso do schema autorizam DDL sem executá-lo', async () => {
  const r = await diagnosticar(simular({}, null, { privilegios_proprietario_efetivos: true }));
  assert.equal(r.autorizacao.autorizado_na_sessao_atual, true);
});
test('sem uso do schema a autorização não é confirmada', async () => {
  const r = await diagnosticar(simular({}, null, { privilegios_proprietario_efetivos: true, uso_schema: false }));
  assert.equal(r.autorizacao.autorizado_na_sessao_atual, false);
});
