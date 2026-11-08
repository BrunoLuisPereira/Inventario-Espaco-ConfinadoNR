const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { CAMPOS_NR33 } = require('../src/utils/adaptadorCamposNr33');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const usuario = { id_usuario: 11, id_ambiente: A };
const respostas = Object.fromEntries(['criterio_a', 'criterio_b', 'criterio_c', 'acesso_controlado',
  'ventilacao_adequada', 'monitoramento_atmosferico', 'procedimento_emergencia'].map(c => [c, 'SIM']));
const nulos = () => Object.fromEntries(CAMPOS_NR33.map(c => [c, null]));

function preparar({ ausentes = [], ambiente = A, faseErro, erro, status = 'PENDENTE', negadoEm } = {}) {
  const estado = { consultas: [], locks: [], escritas: 0, conexoes: 0, releases: [], callbacks: 0,
    aberta: false, row: { id_checklist: 50, id_local: 40, id_usuario: 99, ...respostas, ...nulos(), status,
      versao: 7, data_atualizacao: new Date('2026-01-01T00:00:00Z') } };
  ausentes.forEach(c => delete estado.row[c]);
  const client = {
    async query(texto, params = []) {
      const sql = texto.replace(/\s+/g, ' ').trim();
      estado.consultas.push({ sql, params: structuredClone(params) });
      if (sql.startsWith('BEGIN')) { estado.aberta = true; estado.antes = structuredClone(estado.row); return { rows: [] }; }
      if (sql === 'ROLLBACK') { estado.aberta = false; estado.row = structuredClone(estado.antes); return { rows: [] }; }
      if (sql === 'COMMIT') { assert.equal(estado.aberta, true); estado.aberta = false; return { rows: [] }; }
      assert.equal(estado.aberta, true);
      assert.equal(params[1], A); assert.equal(params[2], 11);
      assert.match(sql, /(?:a|c)\.id_ambiente = \$2/);
      assert.match(sql, /u\.id_usuario = \$3/);
      assert.match(sql, /u\.ativo = TRUE/); assert.match(sql, /a\.ativo = TRUE/);
      assert.match(sql, /u\.perfil_acesso IN/);
      assert.equal(sql.includes(A), false);
      assert.equal(sql.includes('information_schema'), false);
      assert.equal(sql.includes('pg_catalog'), false);
      const lock = /FOR (SHARE|UPDATE) OF (a|u|c|l|ch)$/.exec(sql);
      if (lock) {
        const alias = lock[2];
        assert.equal(lock[1], ['a', 'u'].includes(alias) ? 'SHARE' : 'UPDATE');
        if (params.length === 5) assert.deepEqual(params.slice(3), [10, 40]);
        const prova = sql.includes('LEFT JOIN checklist_nr33 AS estrutura_nr33 ON FALSE');
        if (prova) {
          assert.deepEqual(estado.locks, ['a', 'u', 'c']);
          assert.equal(alias, 'l');
          for (const c of CAMPOS_NR33) assert.match(sql, new RegExp(`estrutura_nr33\\.${c}\\b`));
          assert.equal((sql.match(/estrutura_nr33\./g) || []).length, 10);
          if (faseErro === 'prova') throw erro;
          if (ausentes.length) throw Object.assign(new Error('SQL_INTERNO_NAO_PUBLICAR'), { code: '42703' });
        }
        estado.locks.push(alias);
        if (ambiente !== A || negadoEm === alias) return { rows: [] };
        return { rows: [{ id_campanha: 10, id_local: 40, ...(prova ? nulos() : {}) }] };
      }
      if (sql.startsWith('SELECT ch.*')) {
        assert.deepEqual(estado.locks, ['a', 'u', 'c', 'l', 'ch']);
        assert.deepEqual(params, [50, A, 11, 10, 40]);
        assert.match(sql, /c\.id_campanha = \$4 AND l\.id_local = \$5/);
        return { rows: [estado.row] };
      }
      assert.match(sql, /^(INSERT INTO|UPDATE) checklist_nr33 AS ch/);
      assert.equal(ambiente, A);
      if (faseErro === 'escrita') throw erro;
      assert.deepEqual(estado.locks, sql.startsWith('INSERT') ? ['a', 'u', 'c', 'l'] : ['a', 'u', 'c', 'l', 'ch']);
      estado.escritas++;
      estado.row.versao++; estado.row.data_atualizacao = new Date('2026-11-08T00:00:00Z');
      return { rows: [structuredClone(estado.row)] };
    },
    release(erro) { estado.releases.push(erro); },
  };
  const paths = [require.resolve('../src/config/database'), require.resolve('../src/repositories/checklistMultiTenantRepository')];
  const anteriores = paths.map(p => require.cache[p]);
  const modulo = new Module(paths[0]); modulo.loaded = true;
  modulo.exports = {
    async query() { throw new Error('Consulta fora da transacao proibida'); },
    async connect() { estado.conexoes++; return client; },
  };
  let repo;
  try { require.cache[paths[0]] = modulo; delete require.cache[paths[1]]; repo = require(paths[1]); }
  finally { paths.forEach((p, i) => { if (anteriores[i]) require.cache[p] = anteriores[i]; else delete require.cache[p]; }); }
  return { repo, estado };
}
function operar(ctx, op, opcoes = { exigirEsquemaNr33: true }, dados = {}) {
  if (op === 'POST') return ctx.repo.criarNoAmbiente({ id_local: 40, ...respostas, ...dados }, usuario, opcoes);
  if (op === 'PUT') return ctx.repo.atualizarNoAmbiente(50, { observacoes: 'Novo', ...dados }, usuario, opcoes);
  return ctx.repo.atualizarStatusNoAmbiente(50, 'CONCLUIDO', usuario, opcoes);
}
function terminou(ctx, sucesso, dmlTentado = false) {
  assert.equal(ctx.estado.aberta, false);
  assert.equal(ctx.estado.conexoes, 1);
  assert.deepEqual(ctx.estado.releases, [undefined]);
  assert.equal(ctx.estado.consultas.at(-1).sql, sucesso ? 'COMMIT' : 'ROLLBACK');
  if (!sucesso) {
    assert.equal(ctx.estado.escritas, 0);
    assert.equal(ctx.estado.consultas.some(c => /^(INSERT INTO|UPDATE)/.test(c.sql)), dmlTentado);
    assert.equal(ctx.estado.consultas.some(c => c.sql === 'COMMIT'), false);
    assert.deepEqual(ctx.estado.row, ctx.estado.antes);
  }
}
for (const op of ['POST', 'PUT', 'PATCH']) {
  test(`${op}: opcao isolada abre transacao, aceita dez NULLs e escreve somente apos prova`, async () => {
    const ctx = preparar();
    const r = await operar(ctx, op);
    assert.equal(r.id_checklist, 50); assert.equal(ctx.estado.escritas, 1);
    assert.equal(Object.hasOwn(r, 'avaliacao_nr33'), false);
    terminou(ctx, true);
    assert.equal(ctx.estado.consultas.length, op === 'POST' ? 7 : 9);
  });
  for (const campo of CAMPOS_NR33) test(`${op}: ausencia de ${campo} rejeita antes do DML/callback`, async () => {
    const ctx = preparar({ ausentes: [campo] });
    const opcoes = { exigirEsquemaNr33: true, validarEstado() { ctx.estado.callbacks++; throw Error('Nao deveria executar'); } };
    await assert.rejects(operar(ctx, op, opcoes), e => {
      assert.equal(e.statusCode, 503); assert.equal(e.code, 'NR33_ESQUEMA_INCOMPATIVEL');
      assert.equal(e.message, 'Avaliação NR-33 temporariamente indisponível.');
      assert.equal(Object.hasOwn(e, 'detail'), false); return true;
    });
    assert.equal(ctx.estado.callbacks, 0); terminou(ctx, false);
  });
  test(`${op}: ambiente externo nao prova esquema nem entrega snapshot`, async () => {
    const ctx = preparar({ ambiente: B, ausentes: CAMPOS_NR33 });
    assert.equal(await operar(ctx, op, { exigirEsquemaNr33: true, validarEstado() { throw Error('Vazamento'); } }), null);
    assert.equal(ctx.estado.consultas.some(c => c.sql.includes('estrutura_nr33.')), false);
    terminou(ctx, false);
  });
  test(`${op}: flag falsa no payload nao desativa opcao interna`, async () => {
    const ctx = preparar({ ausentes: ['atmosfera_oxigenio'] });
    await assert.rejects(operar(ctx, op, { exigirEsquemaNr33: true }, { exigirEsquemaNr33: false }),
      { statusCode: 503, code: 'NR33_ESQUEMA_INCOMPATIVEL' });
    terminou(ctx, false);
  });
  test(`${op}: callback autorizado nao desativa exigencia capturada`, async () => {
    const ctx = preparar();
    const opcoes = { exigirEsquemaNr33: true, validarEstado({ estadoAtual, dadosPropostos }) {
      ctx.estado.callbacks++;
      opcoes.exigirEsquemaNr33 = false;
      assert.deepEqual(ctx.estado.locks, op === 'POST' ? ['a','u','c','l'] : ['a','u','c','l','ch']);
      if (estadoAtual) { delete estadoAtual.atmosfera_oxigenio; assert.equal(ctx.estado.row.atmosfera_oxigenio, null); }
      return dadosPropostos;
    } };
    await operar(ctx, op, opcoes);
    assert.equal(ctx.estado.callbacks, 1); terminou(ctx, true);
  });
  test(`${op}: opcao ausente e false preservam consultas e parametros antigos`, async () => {
    const a = preparar({ ausentes: CAMPOS_NR33 }), b = preparar({ ausentes: CAMPOS_NR33 });
    await operar(a, op, { bloquearAutorizacao: true });
    await operar(b, op, { bloquearAutorizacao: true, exigirEsquemaNr33: false });
    assert.deepEqual(a.estado.consultas, b.estado.consultas);
    assert.equal(a.estado.consultas.some(c => c.sql.includes('estrutura_nr33.')), false);
    assert.equal(a.estado.consultas.some(c => c.sql.startsWith('SELECT ch.*')), false);
    terminou(a, true); terminou(b, true);
  });
}
test('PATCH NO-OP verifica esquema antes de decidir e preserva versao/timestamp', async () => {
  const ctx = preparar({ status: 'CONCLUIDO' });
  const antes = structuredClone(ctx.estado.row);
  const r = await operar(ctx, 'PATCH', { exigirEsquemaNr33: true,
    validarEstado({ estadoAtual }) { assert.equal(estadoAtual.status, 'CONCLUIDO'); return ctx.repo.statusConcluidoSemAlteracao(); } });
  assert.deepEqual(r, antes); assert.equal(ctx.estado.escritas, 0);
  r.versao = 99; assert.equal(ctx.estado.row.versao, 7); terminou(ctx, true);
});
test('PATCH concluido repetido sem esquema rejeita antes do callback NO-OP', async () => {
  const ctx = preparar({ status: 'CONCLUIDO', ausentes: ['possui_placa_identificacao'] });
  await assert.rejects(operar(ctx, 'PATCH', { exigirEsquemaNr33: true,
    validarEstado() { throw Error('Nao deve decidir NO-OP antes da prova'); } }),
  { statusCode: 503, code: 'NR33_ESQUEMA_INCOMPATIVEL' });
  terminou(ctx, false);
});
test('POST: erro inesperado na prova permanece interno e causa rollback', async () => {
  const erro = Object.assign(new Error('INTERNO'), { code: 'XX000' });
  const ctx = preparar({ faseErro: 'prova', erro });
  await assert.rejects(operar(ctx, 'POST'), e => e === erro); terminou(ctx, false);
});
test('POST: undefined_column fora da prova nao e convertido em 503', async () => {
  const erro = Object.assign(new Error('INTERNO'), { code: '42703' });
  const ctx = preparar({ faseErro: 'escrita', erro });
  await assert.rejects(operar(ctx, 'POST'), e => e === erro); terminou(ctx, false, true);
});
test('POST: negacao posterior de autorizacao nao chega ao INSERT', async () => {
  const ctx = preparar({ negadoEm: 'l' });
  assert.equal(await operar(ctx, 'POST'), null); terminou(ctx, false);
});
