const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const { criarBanco } = require('./helpers/loginBancoSimulado.cjs');
const script = require.resolve('../laboratorio/verificar-login-25.cjs');
const fabrica = require.resolve('../src/repositories/loginTentativaRepositoryFactory');

test('execução CLI sem autorização termina com recusa sanitizada', () => {
  const env = {};
  for (const nome of ['PATH', 'SystemRoot']) if (process.env[nome]) env[nome] = process.env[nome];
  const resultado = spawnSync(process.execPath, [script], { env, encoding: 'utf8', timeout: 5000, windowsHide: true });
  assert.ifError(resultado.error);
  assert.equal(resultado.status, 1);
  assert.equal(resultado.stdout, '');
  assert.match(resultado.stderr, /^Homologação isolada não aprovada\./);
  assert.doesNotMatch(resultado.stderr, /AssertionError|password|senha|postgres/i);
});

function ambiente(t, alteracoes = {}) {
  const valores = {
    LOGIN_TEST_AUTORIZADO: 'PASSO25_ISOLADO', LOGIN_TEST_HOST: '127.0.0.1',
    LOGIN_TEST_DATABASE: 'inventario_nr33_login_test', LOGIN_TEST_USER: 'nr33_login_test_app',
    LOGIN_TEST_PORT: '5432', LOGIN_TEST_PASSWORD: 'credencial-exclusivamente-sintetica',
    ...alteracoes,
  };
  for (const [nome, valor] of Object.entries(valores)) {
    const anterior = process.env[nome];
    if (valor === undefined) delete process.env[nome]; else process.env[nome] = valor;
    t.after(() => { if (anterior === undefined) delete process.env[nome]; else process.env[nome] = anterior; });
  }
}

function carregar(t, Pool) {
  const load = Module._load;
  const anteriores = [script, fabrica].map(p => [p, require.cache[p]]);
  for (const [p] of anteriores) delete require.cache[p];
  t.after(() => { for (const [p, anterior] of anteriores) { if (anterior) require.cache[p] = anterior; else delete require.cache[p]; } });
  let drivers = 0;
  t.mock.method(Module, '_load', function (nome, parent, ...args) {
    if (nome === 'pg') {
      drivers++;
      assert.equal(parent.filename, script);
      assert.ok(Pool, 'Driver real proibido no teste');
      return { Pool };
    }
    assert.ok(!/config[\\/]database|dotenv/.test(nome), 'Configuração real proibida no laboratório');
    assert.ok(!['vm', 'node:vm'].includes(nome), 'Execução dinâmica proibida');
    return load.call(this, nome, parent, ...args);
  });
  const laboratorio = require(script);
  const { criarLoginTentativaRepository } = require(fabrica);
  assert.equal(drivers, 0, 'Importar os módulos não deve carregar o driver');
  return { ...laboratorio, criarLoginTentativaRepository, drivers: () => drivers };
}

for (const [nome, valor] of [
  ['LOGIN_TEST_AUTORIZADO', undefined], ['LOGIN_TEST_AUTORIZADO', 'incorreto'],
  ['LOGIN_TEST_HOST', 'banco-producao.invalid'], ['LOGIN_TEST_HOST', 'localhost'],
  ['LOGIN_TEST_DATABASE', 'outro_banco'], ['LOGIN_TEST_USER', 'postgres'],
  ['LOGIN_TEST_PORT', '0'], ['LOGIN_TEST_PORT', '65536'], ['LOGIN_TEST_PORT', '5432texto'],
  ['LOGIN_TEST_PASSWORD', undefined],
]) {
  test(`laboratório recusa ${nome} inadequado antes de carregar pg`, async t => {
    ambiente(t, { [nome]: valor });
    const c = carregar(t);
    await assert.rejects(c.main(), { code: 'ERR_ASSERTION' });
    assert.equal(c.drivers(), 0);
  });
}

for (const caso of ['banco', 'papel', 'privilegiado', 'tabelas']) {
  test(`laboratório encerra pool simulado ao recusar ${caso} e não executa DML`, async t => {
    ambiente(t);
    const consultas = [];
    let encerrado = false;
    const c = carregar(t, class {
      on() {}
      async end() { encerrado = true; }
      async query(sql) {
        consultas.push(sql);
        assert.match(sql, /^SELECT/);
        if (sql.includes('current_database')) return { rows: [{
          banco: caso === 'banco' ? 'outro' : 'inventario_nr33_login_test',
          papel: caso === 'papel' ? 'outro' : 'nr33_login_test_app', privilegiado: caso === 'privilegiado',
        }] };
        assert.equal(caso, 'tabelas');
        return { rows: [{ tablename: 'usuario' }] };
      }
    });
    await assert.rejects(c.main(), { code: 'ERR_ASSERTION' });
    assert.equal(encerrado, true);
    assert.equal(consultas.length, caso === 'tabelas' ? 2 : 1);
  });
}

test('laboratório injeta somente o pool isolado após verificar destino e identidade', async t => {
  ambiente(t);
  const banco = criarBanco();
  let encerrado = false;
  const c = carregar(t, class {
    constructor(opcoes) {
      assert.equal(opcoes.host, '127.0.0.1');
      assert.equal(opcoes.database, 'inventario_nr33_login_test');
      assert.equal(opcoes.user, 'nr33_login_test_app');
      assert.equal(opcoes.options, '-c search_path=pg_catalog,public');
      assert.equal(opcoes.max, 24);
      assert.equal(opcoes.connectionTimeoutMillis, 5000);
    }
    on() {}
    connect() { return banco.pool.connect(); }
    async end() { encerrado = true; }
    async query(sql) {
      if (sql.includes('current_database')) return { rows: [{ banco: 'inventario_nr33_login_test', papel: 'nr33_login_test_app', privilegiado: false }] };
      assert.match(sql, /SELECT tablename/);
      return { rows: [{ tablename: 'login_tentativa' }] };
    }
  });
  const chave = 'a'.repeat(64);
  const repo = c.criarLoginTentativaRepository(banco.pool);
  const invalido = async () => { throw Object.assign(new Error('Sintético'), { statusCode: 401 }); };
  for (let i = 0; i < 5; i++) await assert.rejects(repo.autenticar(chave, invalido), { statusCode: i < 4 ? 401 : 429 });
  const argv = process.argv;
  process.argv = [process.execPath, script, '--persistencia', chave];
  t.after(() => { process.argv = argv; });
  t.mock.method(console, 'log', () => {});
  await c.main();
  assert.equal(c.drivers(), 1);
  assert.equal(encerrado, true);
  assert.equal([...banco.estado.values()][0].falhas.length, 5);
});

test('fábrica exige pool explícito e mantém instâncias independentes', async t => {
  const { criarLoginTentativaRepository } = carregar(t);
  for (const pool of [undefined, null, {}]) assert.throws(() => criarLoginTentativaRepository(pool), TypeError);
  const a = criarBanco(), b = criarBanco();
  const repoA = criarLoginTentativaRepository(a.pool), repoB = criarLoginTentativaRepository(b.pool);
  const verificar = async () => { throw Object.assign(new Error('Sintético'), { statusCode: 401 }); };
  for (let i = 0; i < 5; i++) await assert.rejects(repoA.autenticar('chave', verificar), { statusCode: i < 4 ? 401 : 429 });
  assert.deepEqual(await repoB.autenticar('chave', async () => ({ sucesso: true })), { sucesso: true });
  assert.equal([...a.estado.values()][0].falhas.length, 5);
  assert.deepEqual([...b.estado.values()][0].falhas, []);
});
