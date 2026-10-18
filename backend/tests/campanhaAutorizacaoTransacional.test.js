const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const dados = { nomeCampanha: "Texto ' $1 -- literal", empresa: 'Empresa', responsavel: 'Nome descritivo', dataInicio: '2026-10-17', status: 'EM ANDAMENTO', idUsuario: 11 };
function preparar(t, opcoes = {}) {
  const estado = { eventos: [], bloqueios: 0, escritas: [], liberacoes: [], inesperadas: [], autorizado: true, modificado: false };
  const registro = { id_campanha: 30, id_ambiente: A, id_usuario: 12, nome_campanha: dados.nomeCampanha };
  const usuario = { id_usuario: 11, id_ambiente: A, perfil_acesso: 'ADMINISTRADOR' };
  const tecnico = Object.assign(new Error('ERRO_SQL_INTERNO'), { code: 'XX000' });
  const rows = (lista) => ({ rows: lista });
  function pode(ambiente, id, campanha) {
    if (opcoes.inativo || opcoes.ambienteInativo || !estado.autorizado || ambiente !== A || ![11, 12, 13].includes(id)) return false;
    const admin = id === 11 && !opcoes.perfilRevogado;
    return campanha === undefined ? true : campanha === 30 && (admin || id === 12);
  }
  async function query(sql, params = []) {
    const texto = sql.replace(/\s+/g, ' ').trim();
    estado.eventos.push({ sql: texto, params: [...params] });
    if (texto.startsWith('BEGIN')) { if (opcoes.beginFalha) throw tecnico; return rows([]); }
    if (texto === 'COMMIT') { if (opcoes.commitFalha) throw tecnico; return rows([]); }
    if (texto === 'ROLLBACK') { if (opcoes.rollbackFalha) throw new Error('ROLLBACK indisponível'); return rows([]); }
    if (texto.startsWith('SELECT u.id_usuario') && /FOR (SHARE|UPDATE) OF (a|u|c)$/.test(texto)) {
      estado.bloqueios++;
      assert.match(texto, /a\.id_ambiente = \$1 AND u\.id_usuario = \$2/);
      assert.match(texto, /u\.ativo = TRUE AND a\.ativo = TRUE/);
      assert.match(texto, /u\.id_ambiente = a\.id_ambiente/);
      if (params.length === 3) {
        assert.match(texto, /c\.id_ambiente = a\.id_ambiente/);
        assert.match(texto, /c\.id_campanha = \$3/);
        assert.match(texto, /u\.perfil_acesso = 'ADMINISTRADOR' OR c\.id_usuario = u\.id_usuario/);
      } else assert.match(texto, /u\.perfil_acesso IN \('ADMINISTRADOR', 'ENGENHEIRO_SEGURANCA'\)/);
      if (opcoes.revogar === estado.bloqueios) estado.autorizado = false;
      return rows(pode(...params) ? [{ id_usuario: params[1], id_campanha: 30 }] : []);
    }
    if (texto.startsWith('INSERT INTO campanha') || texto.startsWith('UPDATE campanha AS c')) {
      const criar = texto.startsWith('INSERT');
      assert.equal(estado.bloqueios, criar ? 2 : 3, 'Não escrever sem adquirir todos os bloqueios');
      const status = !criar && params.length === 4;
      const identidade = criar ? [params[6], params[5]] : status ? [params[2], params[3], params[1]] : [params[5], params[6], params[4]];
      assert.equal(pode(...identidade), true, 'Escrita não autorizada deve ser detectada mesmo se a exceção for capturada');
      assert.match(texto, criar ? /u\.id_ambiente = \$7/ : status ? /c\.id_ambiente = \$3/ : /c\.id_ambiente = \$6/);
      assert.match(texto, /u\.ativo = TRUE/);
      assert.match(texto, /a\.ativo = TRUE/);
      if (!criar) {
        const set = texto.split(' SET ')[1].split(' WHERE ')[0];
        assert.doesNotMatch(set, /\b(?:id_ambiente|id_usuario)\s*=/);
      }
      assert.equal(texto.includes(dados.nomeCampanha), false, 'Dados devem permanecer nos parâmetros');
      estado.escritas.push({ sql: texto, params });
      if (opcoes.falha) throw tecnico;
      if (opcoes.vazio) return rows([]);
      estado.modificado = true;
      return rows([registro]);
    }
    estado.inesperadas.push(texto);
    throw new Error('SQL não reconhecido');
  }
  const client = { query, release(erro) { estado.liberacoes.push(erro || true); } };
  const pool = { async connect() { if (opcoes.connectFalha) throw tecnico; estado.eventos.push({ connect: true }); return client; },
    async query(sql, params) {
      const texto = sql.replace(/\s+/g, ' ').trim();
      if (!texto.startsWith('SELECT c.*') || !texto.includes('FROM campanha AS c') || !texto.includes('AND EXISTS')) {
        estado.inesperadas.push(texto); throw new Error('Consulta global/fallback proibida');
      }
      estado.eventos.push({ sql: texto, params });
      assert.match(texto, /c\.id_ambiente = \$1/);
      assert.match(texto, /solicitante\.id_usuario = \$2/);
      assert.match(texto, /solicitante\.id_ambiente = c\.id_ambiente/);
      assert.match(texto, /solicitante\.ativo = TRUE AND a\.ativo = TRUE/);
      assert.match(texto, /u\.id_ambiente = c\.id_ambiente/);
      assert.match(texto, /solicitante\.perfil_acesso = 'ADMINISTRADOR' OR c\.id_usuario = solicitante\.id_usuario/);
      return rows(pode(params[0], params[1], params.length === 3 ? params[2] : 30) ? [registro] : []);
    },
  };
  const alvo = require.resolve('../src/repositories/campanhaMultiTenantRepository');
  const anterior = require.cache[alvo];
  const load = Module._load;
  let repo;
  try {
    delete require.cache[alvo];
    Module._load = function (request, parent, ...args) {
      if (parent?.filename === alvo) { assert.equal(request, '../config/database'); return pool; }
      return load.call(this, request, parent, ...args);
    };
    repo = require(alvo);
  } finally { Module._load = load; if (anterior) require.cache[alvo] = anterior; else delete require.cache[alvo]; }
  t.after(() => assert.deepEqual(estado.inesperadas, []));
  const executar = (nome, u = usuario, id = 30) => nome === 'criar'
    ? repo.criarNoAmbiente({ ...dados, idUsuario: u.id_usuario }, u.id_ambiente, { bloquearAutorizacao: true })
    : nome === 'atualizar' ? repo.atualizarNoAmbiente(id, dados, u, { bloquearAutorizacao: true })
      : repo.atualizarStatusNoAmbiente(id, 'CONCLUIDO', u, { bloquearAutorizacao: true });
  return { repo, estado, registro, usuario, tecnico, executar };
}
for (const nome of ['criar', 'atualizar', 'status']) {
  test(nome + ': locks ordenados, parâmetros e COMMIT', async (t) => {
    const ctx = preparar(t);
    assert.strictEqual(await ctx.executar(nome), ctx.registro);
    const locks = ctx.estado.eventos.filter((e) => e.sql?.startsWith('SELECT u.id_usuario'));
    assert.deepEqual(locks.map((e) => e.sql.match(/FOR (?:SHARE|UPDATE) OF (\w+)$/)[1]), nome === 'criar' ? ['a', 'u'] : ['a', 'u', 'c']);
    assert.ok(ctx.estado.eventos.findIndex((e) => e.sql?.startsWith('BEGIN')) < ctx.estado.eventos.findIndex((e) => e.sql?.startsWith('SELECT')));
    assert.equal(ctx.estado.eventos.at(-1).sql, 'COMMIT');
    assert.deepEqual(ctx.estado.liberacoes, [true]);
  });
  for (const revogar of nome === 'criar' ? [1, 2] : [1, 2, 3]) {
    test(nome + ': revogação na fase ' + revogar + ' impede tentativa de escrita', async (t) => {
      const ctx = preparar(t, { revogar });
      assert.equal(await ctx.executar(nome), null);
      assert.deepEqual(ctx.estado.escritas, []);
      assert.equal(ctx.estado.eventos.at(-1).sql, 'ROLLBACK');
      assert.deepEqual(ctx.estado.liberacoes, [true]);
    });
  }
  for (const opcoes of [{ falha: true }, { vazio: true }, { commitFalha: true }, { falha: true, rollbackFalha: true }, { beginFalha: true }, { connectFalha: true }]) {
    test(nome + ': falha técnica é propagada ' + JSON.stringify(opcoes), async (t) => {
      const ctx = preparar(t, opcoes);
      await assert.rejects(ctx.executar(nome), (erro) => opcoes.vazio ? erro.statusCode === 500 : erro === ctx.tecnico);
      assert.equal(ctx.estado.liberacoes.length, opcoes.connectFalha ? 0 : 1);
      if (opcoes.rollbackFalha || opcoes.beginFalha) assert.ok(ctx.estado.liberacoes[0] instanceof Error);
      if (!opcoes.beginFalha && !opcoes.connectFalha) assert.ok(ctx.estado.eventos.some((e) => e.sql === 'ROLLBACK'));
    });
  }
  for (const opcoes of [{ inativo: true }, { ambienteInativo: true }]) {
    test(nome + ': recusa estado inativo na transação ' + JSON.stringify(opcoes), async (t) => {
      const ctx = preparar(t, opcoes);
      assert.equal(await ctx.executar(nome), null);
      assert.deepEqual(ctx.estado.escritas, []);
    });
  }
}
for (const nome of ['atualizar', 'status']) {
  for (const [idUsuario, ambiente, id] of [[13, A, 30], [11, B, 30], [11, A, 40]]) {
    test(nome + ': recurso externo/não responsável não chega ao UPDATE ' + idUsuario + '/' + ambiente + '/' + id, async (t) => {
      const ctx = preparar(t);
      assert.equal(await ctx.executar(nome, { id_usuario: idUsuario, id_ambiente: ambiente }, id), null);
      assert.deepEqual(ctx.estado.escritas, []);
    });
  }
  test(nome + ': engenheiro responsável tem escrita legítima', async (t) => {
    const ctx = preparar(t);
    assert.strictEqual(await ctx.executar(nome, { id_usuario: 12, id_ambiente: A }), ctx.registro);
  });
}
for (const [idUsuario, ambiente, permitido] of [[11, A, true], [12, A, true], [13, A, false], [11, B, false]]) {
  test('Leituras usam SQL autorizado para ' + idUsuario + '/' + ambiente, async (t) => {
    const ctx = preparar(t);
    const u = { id_usuario: idUsuario, id_ambiente: ambiente };
    assert.deepEqual(await ctx.repo.listarPermitidasNoAmbiente(u), permitido ? [ctx.registro] : []);
    assert.equal(await ctx.repo.buscarPermitidaPorIdNoAmbiente(30, u), permitido ? ctx.registro : null);
    assert.deepEqual(ctx.estado.eventos[0].params, [ambiente, idUsuario]);
    assert.deepEqual(ctx.estado.eventos[1].params, [ambiente, idUsuario, 30]);
  });
}
test('Leitura rejeita identidade e IDs inválidos antes do pool', async (t) => {
  const ctx = preparar(t);
  for (const u of [null, [], { id_usuario: true, id_ambiente: A }, { id_usuario: Number.MAX_SAFE_INTEGER + 1, id_ambiente: A }]) await assert.rejects(ctx.repo.listarPermitidasNoAmbiente(u));
  for (const id of [0, -1, true, [], Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(ctx.repo.buscarPermitidaPorIdNoAmbiente(id, ctx.usuario), { statusCode: 400 });
  assert.deepEqual(ctx.estado.eventos, []);
});
