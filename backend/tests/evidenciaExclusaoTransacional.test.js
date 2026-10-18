const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const usuario = { id_usuario: 11, id_ambiente: '11111111-1111-4111-8111-111111111111' };
function preparar(t, opcoes = {}) {
  const alvo = require.resolve('../src/repositories/evidenciaMultiTenantRepository');
  const anterior = require.cache[alvo];
  const load = Module._load;
  const eventos = [];
  const registro = { id_evidencia: 10, caminho_arquivo: 'uploads/evidencias/compartilhado.jpg' };
  let bloqueios = 0;
  const client = {
    async query(sql, params) {
      const texto = sql.replace(/\s+/g, ' ').trim();
      eventos.push({ sql: texto, params });
      if (texto.startsWith('BEGIN')) return { rows: [] };
      if (texto === 'COMMIT') return { rows: [] };
      if (texto === 'ROLLBACK') { if (opcoes.rollbackFalha) throw new Error('rollback falhou'); return { rows: [] }; }
      if (texto.startsWith('SELECT')) {
        bloqueios++;
        assert.deepEqual(params.slice(0, 3), [usuario.id_ambiente, 11, 10]);
        assert.match(texto, /c\.id_ambiente = \$1/);
        assert.match(texto, /solicitante\.ativo = TRUE/);
        assert.match(texto, /a\.ativo = TRUE/);
        assert.match(texto, /solicitante\.perfil_acesso = 'ADMINISTRADOR' OR c\.id_usuario = solicitante\.id_usuario/);
        if (opcoes.revogar === bloqueios) return { rows: [] };
        return { rows: [{ id_local: 20, id_campanha: 30 }] };
      }
      if (texto.startsWith('DELETE')) {
        assert.equal(bloqueios, 5, 'Não excluir antes dos cinco bloqueios autorizados');
        assert.match(texto, /c\.id_ambiente = \$1/);
        assert.match(texto, /RETURNING e\.\*/);
        if (opcoes.falha) throw new Error('falha técnica');
        return { rows: opcoes.vazio ? [] : [registro] };
      }
      throw new Error('SQL desconhecido no cliente transacional');
    },
    release(erro) { eventos.push({ release: erro || true }); },
  };
  let repo;
  try {
    delete require.cache[alvo];
    Module._load = function (request, parent, ...args) {
      if (parent?.filename === alvo) {
        assert.equal(request, '../config/database');
        return { query() { throw new Error('Fallback global proibido'); }, async connect() { eventos.push({ connect: true }); return client; } };
      }
      return load.call(this, request, parent, ...args);
    };
    repo = require(alvo);
  } finally {
    Module._load = load;
    if (anterior) require.cache[alvo] = anterior; else delete require.cache[alvo];
  }
  t.after(() => assert.equal(eventos.filter((e) => e.release).length, 1));
  return { repo, eventos, registro };
}
test('DELETE bloqueia ambiente, usuário, campanha, local e evidência antes de COMMIT', async (t) => {
  const ctx = preparar(t);
  assert.strictEqual(await ctx.repo.excluirNoAmbiente(10, usuario, { bloquearAutorizacao: true }), ctx.registro);
  const locks = ctx.eventos.filter((e) => e.sql?.startsWith('SELECT'));
  assert.deepEqual(locks.map((e) => e.sql.match(/FOR (?:SHARE|UPDATE) OF (\w+)/)[1]), ['a', 'solicitante', 'c', 'l', 'e']);
  assert.ok(ctx.eventos.findIndex((e) => e.sql?.startsWith('BEGIN')) < ctx.eventos.findIndex((e) => e.sql?.startsWith('SELECT')));
  assert.equal(ctx.eventos.at(-2).sql, 'COMMIT');
});
for (const revogar of [1, 2, 3, 4, 5]) {
  test('Revogação na fase ' + revogar + ' impede DELETE e faz rollback', async (t) => {
    const ctx = preparar(t, { revogar });
    assert.equal(await ctx.repo.excluirNoAmbiente(10, usuario, { bloquearAutorizacao: true }), null);
    assert.equal(ctx.eventos.some((e) => e.sql?.startsWith('DELETE')), false);
    assert.equal(ctx.eventos.at(-2).sql, 'ROLLBACK');
    assert.equal(ctx.eventos.some((e) => e.sql === 'COMMIT'), false);
  });
}
for (const opcoes of [{ falha: true }, { vazio: true }, { falha: true, rollbackFalha: true }]) {
  test('Falha transacional não vira sucesso: ' + JSON.stringify(opcoes), async (t) => {
    const ctx = preparar(t, opcoes);
    await assert.rejects(ctx.repo.excluirNoAmbiente(10, usuario, { bloquearAutorizacao: true }));
    assert.equal(ctx.eventos.some((e) => e.sql === 'COMMIT'), false);
    assert.ok(ctx.eventos.some((e) => e.sql === 'ROLLBACK'));
    if (opcoes.rollbackFalha) assert.ok(ctx.eventos.at(-1).release instanceof Error);
  });
}
