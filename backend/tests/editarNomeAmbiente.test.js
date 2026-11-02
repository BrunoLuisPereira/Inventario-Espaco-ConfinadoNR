const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
const jwt = require('jsonwebtoken');
const usuarios = require('../src/repositories/usuarioRepository');
const router = require('../src/routes/authRoutes');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function preparar(t, opcoes = {}) {
  const usuario = { id_usuario: 7, id_ambiente: A, perfil_acesso: 'ADMINISTRADOR', eh_fundador: true, ativo: true, ...opcoes.usuario };
  const nomes = { [A]: 'Empresa A', [B]: 'Empresa B' };
  const consultas = [];
  let transacao = false, nomePendente;
  const release = t.mock.fn();
  const query = async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    consultas.push({ sql: s, params });
    if (s === 'BEGIN') { transacao = true; return { rows: [] }; }
    if (s === 'ROLLBACK') { transacao = false; nomePendente = undefined; return { rows: [] }; }
    if (s === 'COMMIT') { assert.ok(transacao); nomes[usuario.id_ambiente] = nomePendente; transacao = false; return { rows: [] }; }
    if (s.startsWith('SELECT id_ambiente FROM ambiente')) {
      assert.ok(transacao); assert.match(s, /ativo = TRUE FOR UPDATE$/);
      assert.deepEqual(params, [usuario.id_ambiente]);
      return { rows: opcoes.ambienteInativo ? [] : [{ id_ambiente: params[0] }] };
    }
    if (s.startsWith('SELECT u.id_usuario FROM usuario AS u')) {
      assert.ok(transacao); assert.match(s, /u.id_usuario = \$1 AND u.id_ambiente = \$2 AND u.ativo = TRUE/);
      assert.match(s, /u.perfil_acesso = 'ADMINISTRADOR' AND u.eh_fundador = TRUE FOR SHARE OF u$/);
      assert.deepEqual(params, [7, usuario.id_ambiente]);
      if (opcoes.revogar) usuario.eh_fundador = false;
      return { rows: usuario.ativo && usuario.eh_fundador && usuario.perfil_acesso === 'ADMINISTRADOR' ? [{ id_usuario: 7 }] : [] };
    }
    if (s.startsWith('UPDATE ambiente SET')) {
      assert.ok(transacao); assert.match(s, /^UPDATE ambiente SET nome = \$3 WHERE id_ambiente = \$2 AND ativo = TRUE/);
      assert.match(s, /u.id_usuario = \$1 AND u.id_ambiente = ambiente.id_ambiente/);
      assert.match(s, /u.ativo = TRUE AND u.perfil_acesso = 'ADMINISTRADOR' AND u.eh_fundador = TRUE/);
      assert.deepEqual(params.slice(0, 2), [7, usuario.id_ambiente]);
      if (opcoes.falhar) throw new Error('SQL SEGREDO INTERNO');
      nomePendente = params[2];
      return { rows: [{ nome_ambiente: nomePendente }] };
    }
    if (s.startsWith('SELECT') && s.includes('a.nome AS nome_ambiente')) {
      assert.deepEqual(params, [7, usuario.id_ambiente]);
      return { rows: [{ ...usuario, nome_ambiente: nomes[usuario.id_ambiente] }] };
    }
    throw new Error('SQL não simulado: ' + s);
  };
  t.mock.method(pool, 'query', query);
  t.mock.method(pool, 'connect', async () => ({ query, release }));
  t.mock.method(usuarios, 'buscarIdentidadeAutenticada', async () => ({ ...usuario }));
  t.mock.method(jwt, 'verify', () => ({ sub: '7', perfil: 'ADMINISTRADOR', id_ambiente: B, eh_fundador: true }));
  t.mock.method(console, 'error', () => {});
  const anterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'segredo-exclusivo-de-teste';
  t.after(() => { if (anterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = anterior; });
  async function executar(body, method = 'put', path = '/ambiente', token = true) {
    const req = { body, params: { id_ambiente: B }, query: { id_ambiente: B }, headers: token ? { authorization: 'Bearer teste' } : {} };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
    const handlers = router.stack.find(l => l.route?.path === path && l.route.methods[method]).route.stack.map(l => l.handle);
    let i = 0;
    await handlers[i++](req, res, () => handlers[i++](req, res));
    return res;
  }
  return { executar, nomes, consultas, release };
}

test('fundador atualiza somente nome do próprio ambiente e perfil retorna nome atualizado', async t => {
  const c = preparar(t);
  const res = await c.executar({ nome_ambiente: '  Empresa renovada  ', id_ambiente: B, id_usuario: 999, eh_fundador: false });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, { nome_ambiente: 'Empresa renovada' });
  assert.deepEqual(c.nomes, { [A]: 'Empresa renovada', [B]: 'Empresa B' });
  assert.equal((await c.executar(null, 'get', '/perfil')).body.data.nome_ambiente, 'Empresa renovada');
  assert.equal(c.release.mock.callCount(), 1);
});

for (const usuario of [
  { eh_fundador: false },
  { eh_fundador: false, perfil_acesso: 'ENGENHEIRO_SEGURANCA' },
  { eh_fundador: true, perfil_acesso: 'VISUALIZADOR' },
]) test('nega papel não autorizado mesmo com corpo forjado: ' + JSON.stringify(usuario), async t => {
  const c = preparar(t, { usuario });
  const res = await c.executar({ nome_ambiente: 'Forjado', eh_fundador: true, perfil_acesso: 'ADMINISTRADOR', id_ambiente: B });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(c.nomes, { [A]: 'Empresa A', [B]: 'Empresa B' });
  assert.ok(!c.consultas.some(q => q.sql.startsWith('UPDATE')));
});

test('fundador de outro ambiente altera apenas o próprio vínculo, ignorando ambiente enviado', async t => {
  const c = preparar(t, { usuario: { id_ambiente: B } });
  assert.equal((await c.executar({ nome_ambiente: 'Novo B', id_ambiente: A })).statusCode, 200);
  assert.deepEqual(c.nomes, { [A]: 'Empresa A', [B]: 'Novo B' });
});

for (const nome_ambiente of [undefined, null, '', '   ', 123, {}, [], 'x'.repeat(181), 'Nome\nOutra linha', 'Nome\0', 'Nome\u200b']) {
  test('nome inválido é rejeitado: ' + JSON.stringify(nome_ambiente), async t => {
    const c = preparar(t);
    assert.equal((await c.executar({ nome_ambiente })).statusCode, 400);
    assert.equal(c.consultas.length, 0);
  });
}

test('limite de 180 caracteres é aceito', async t => {
  const c = preparar(t);
  assert.equal((await c.executar({ nome_ambiente: 'á'.repeat(180) })).statusCode, 200);
});

for (const opcoes of [{ revogar: true }, { ambienteInativo: true }, { falhar: true }]) {
  test('revalida titularidade e reverte falhas sem expor dados: ' + JSON.stringify(opcoes), async t => {
    const c = preparar(t, opcoes);
    const res = await c.executar({ nome_ambiente: 'Não persistir' });
    assert.equal(res.statusCode, opcoes.revogar ? 403 : opcoes.ambienteInativo ? 401 : 500);
    assert.doesNotMatch(JSON.stringify(res.body), /SQL|SEGREDO/);
    assert.equal(c.nomes[A], 'Empresa A');
    assert.equal(c.consultas.at(-1).sql, 'ROLLBACK');
    assert.equal(c.release.mock.callCount(), 1);
  });
}

test('sem autenticação não acessa banco nem altera ambiente', async t => {
  const c = preparar(t);
  assert.equal((await c.executar({ nome_ambiente: 'Negado' }, 'put', '/ambiente', false)).statusCode, 401);
  assert.equal(c.consultas.length, 0);
});
