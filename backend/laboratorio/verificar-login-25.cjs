// Homologação futura, SOMENTE após aprovação e aplicação manual da 023.
// Não lê .env, não cria estruturas e não consulta usuário/ambiente.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash, randomUUID } = require('node:crypto');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');

async function main() {
  const env = process.env;
  assert.equal(env.LOGIN_TEST_AUTORIZADO, 'PASSO25_ISOLADO');
  assert.equal(env.LOGIN_TEST_HOST, '127.0.0.1');
  assert.equal(env.LOGIN_TEST_DATABASE, 'inventario_nr33_login_test');
  assert.equal(env.LOGIN_TEST_USER, 'nr33_login_test_app');
  assert.match(env.LOGIN_TEST_PORT || '', /^[1-9][0-9]{0,4}$/);
  assert.ok(Number(env.LOGIN_TEST_PORT) <= 65535 && env.LOGIN_TEST_PASSWORD);
  // Driver só é carregado depois de validar o destino explicitamente isolado.
  const { Pool } = require('pg');
  const pool = new Pool({ host: env.LOGIN_TEST_HOST, port: Number(env.LOGIN_TEST_PORT),
    database: env.LOGIN_TEST_DATABASE, user: env.LOGIN_TEST_USER,
    password: env.LOGIN_TEST_PASSWORD, connectionTimeoutMillis: 5000,
    max: 24, options: '-c search_path=pg_catalog,public' });
  pool.on('error', () => {});
  const chaves = [];
  try {
    const { rows: [identidade] } = await pool.query(`SELECT current_database() AS banco, current_user AS papel,
      (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
        FROM pg_roles WHERE rolname = current_user) AS privilegiado`);
    assert.equal(identidade.banco, env.LOGIN_TEST_DATABASE);
    assert.equal(identidade.papel, env.LOGIN_TEST_USER);
    assert.equal(identidade.privilegiado, false);
    const { rows: tabelas } = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);
    assert.deepEqual(tabelas, [{ tablename: 'login_tentativa' }], 'Exige banco descartável só com a tabela 023');
    const fonte = fs.readFileSync(require.resolve('../src/repositories/loginTentativaRepository'), 'utf8');
    const modulo = { exports: {} };
    vm.runInThisContext(`(function(require,module,exports){${fonte}\n})`, { filename: 'loginTentativaRepository-isolado.js' })
      (nome => { assert.equal(nome, '../config/database'); return pool; }, modulo, modulo.exports);
    const repo = modulo.exports;
    const invalido = () => { throw Object.assign(Error('E-mail ou senha inválidos.'), { statusCode: 401 }); };
    const recusa = (promessa, statusCode) => assert.rejects(promessa, { statusCode });
    const nova = () => { const chave = createHash('sha256').update('PASSO25:' + randomUUID()).digest('hex'); chaves.push(chave); return chave; };
    if (process.argv[2] === '--persistencia') {
      const chave = process.argv[3]; assert.match(chave || '', /^[0-9a-f]{64}$/);
      await recusa(repo.autenticar(chave, async () => { throw Error('Não deve verificar senha restrita'); }), 429);
      console.log('Persistência entre processos aprovada.');
      return;
    }

    const chave = nova();
    for (let i = 0; i < 4; i++) await recusa(repo.autenticar(chave, invalido), 401);
    await recusa(repo.autenticar(chave, invalido), 429);
    const obter = async () => (await pool.query(`SELECT restrito_ate FROM public.login_tentativa WHERE tipo='identificador' AND chave_hash=$1`, [chave])).rows[0].restrito_ate.toISOString();
    const prazo = await obter();
    await recusa(repo.autenticar(chave, async () => { throw Error('Bcrypt não deve ocorrer'); }), 429);
    assert.equal(await obter(), prazo);
    // Novo processo, novo pool e módulo; mesma restrição no PostgreSQL.
    await promisify(execFile)(process.execPath, [__filename, '--persistencia', chave], { env, windowsHide: true, timeout: 15000 });

    // Somente registros sintéticos desta execução: simula passagem do tempo.
    await pool.query(`UPDATE public.login_tentativa SET restrito_ate=clock_timestamp()-interval '1 second',
      falhas=ARRAY[clock_timestamp()-interval '16 minutes'] WHERE tipo='identificador' AND chave_hash=$1`, [chave]);
    assert.deepEqual(await repo.autenticar(chave, async () => ({ sucesso: true })), { sucesso: true });
    assert.deepEqual((await pool.query(`SELECT falhas FROM public.login_tentativa WHERE tipo='identificador' AND chave_hash=$1`, [chave])).rows[0].falhas, []);

    const concorrente = nova(); let verificacoes = 0;
    const resultados = await Promise.allSettled(Array.from({ length: 20 }, () => repo.autenticar(concorrente, async () => {
      verificacoes++; await new Promise(resolve => setTimeout(resolve, 10)); invalido();
    })));
    assert.equal(verificacoes, 5);
    assert.equal(resultados.filter(r => r.reason?.statusCode === 401).length, 4);
    assert.equal(resultados.filter(r => r.reason?.statusCode === 429).length, 16);

    const movel = nova();
    await recusa(repo.autenticar(movel, invalido), 401);
    await pool.query(`UPDATE public.login_tentativa SET falhas=ARRAY[
      clock_timestamp()-interval '16 minutes', clock_timestamp()-interval '5 minutes',
      clock_timestamp()-interval '4 minutes', clock_timestamp()-interval '3 minutes']
      WHERE tipo='identificador' AND chave_hash=$1`, [movel]);
    await recusa(repo.autenticar(movel, invalido), 401);
    await recusa(repo.autenticar(movel, invalido), 429);

    const ip = nova();
    for (let i = 0; i < 100; i++) await repo.limitarIp(ip);
    await recusa(repo.limitarIp(ip), 429);
    await pool.query(`UPDATE public.login_tentativa SET restrito_ate=clock_timestamp()-interval '1 second'
      WHERE tipo='ip' AND chave_hash=$1`, [ip]);
    await repo.limitarIp(ip);
    const { rows: [estadoIp] } = await pool.query(`SELECT requisicoes, restrito_ate FROM public.login_tentativa WHERE tipo='ip' AND chave_hash=$1`, [ip]);
    assert.deepEqual(estadoIp, { requisicoes: 1, restrito_ate: null });
    console.log('APROVADO: SQL real, limite, janela móvel, expiração, prazo fixo, limpeza após sucesso, concorrência e persistência entre processos.');
  } finally {
    // Só chaves aleatórias criadas por esta execução; nunca usuários ou dados reais.
    try {
      if (chaves.length) await pool.query('DELETE FROM public.login_tentativa WHERE chave_hash = ANY($1::text[])', [chaves]);
    } finally {
      await pool.end();
    }
  }
}
if (require.main === module) main().catch(() => {
  console.error('Homologação isolada não aprovada. Confira destino, pré-requisitos e asserções; detalhes internos omitidos.');
  process.exitCode = 1;
});
