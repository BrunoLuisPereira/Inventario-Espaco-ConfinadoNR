const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const respostas = { criterio_a: 'SIM', criterio_b: 'NAO', criterio_c: 'SIM', acesso_controlado: 'SIM', ventilacao_adequada: 'NAO', monitoramento_atmosferico: 'SIM', procedimento_emergencia: 'NAO' };
const dados = { id_local: 10, ...respostas, observacoes: 'Historico' };
const operacoes = [['POST', '/', 'criar'], ['GET', '/', 'listar'], ['GET', '/10', 'buscar'], ['PUT', '/10', 'atualizar'], ['PATCH', '/10/status', 'status']];

function preparar(t) {
  const estado = { usuarios: new Map(), campanhas: new Map(), locaisReais: new Map(), checklists: new Map(), globais: [], escritas: [], chamadas: [], identidades: [], logs: [], revogado: false, erro: null, iniciada: false, falhaEnvio: false };
  for (const [ambiente, base] of [[A, 10], [B, 20]]) {
    for (const [n, perfil] of [[1, 'ADMINISTRADOR'], [2, 'ENGENHEIRO_SEGURANCA'], [3, 'ENGENHEIRO_SEGURANCA']]) estado.usuarios.set(base + n, { id_usuario: base + n, id_ambiente: ambiente, perfil_acesso: perfil, ativo: true, ambienteAtivo: true });
    estado.campanhas.set(base, { id_campanha: base, id_ambiente: ambiente, id_usuario: base + 2 });
    estado.locaisReais.set(base, { id_local: base, id_campanha: base });
    estado.checklists.set(base, { id_checklist: base, id_local: base, id_usuario: base + 3, ...respostas, observacoes: 'Historico', status: 'PENDENTE' });
  }
  const falhar = () => { if (estado.aoConsultar) estado.aoConsultar(); if (estado.erro) throw estado.erro; };
  const permitido = (id, u) => {
    const local = estado.locaisReais.get(id);
    const c = estado.campanhas.get(local?.id_campanha), atual = estado.usuarios.get(u?.id_usuario);
    return !!(c && atual?.ativo && atual.ambienteAtivo && !estado.revogado && c.id_ambiente === u.id_ambiente && atual.id_ambiente === u.id_ambiente && (atual.perfil_acesso === 'ADMINISTRADOR' || c.id_usuario === atual.id_usuario));
  };
  const alterar = (id, d) => {
    const ch = estado.checklists.get(id);
    for (const campo of Object.keys(respostas)) if (d[campo] != null) ch[campo] = d[campo];
    if (d.observacoes != null) ch.observacoes = d.observacoes || null;
    return ch;
  };
  const repo = {
    async listarPermitidosNoAmbiente(u) { falhar(); estado.chamadas.push(['listar', u]); return [...estado.checklists.values()].filter(ch => permitido(ch.id_local, u)); },
    async buscarPermitidoPorIdNoAmbiente(id, u) { falhar(); estado.chamadas.push(['buscar', id, u]); const ch = estado.checklists.get(id); return ch && permitido(ch.id_local, u) ? ch : null; },
    async criarNoAmbiente(d, u, opcoes) { falhar(); assert.deepEqual(opcoes, { bloquearAutorizacao: true }); if (!permitido(d.id_local, u)) return null; if ([...estado.checklists.values()].some(ch => ch.id_local === d.id_local)) throw Object.assign(new Error('Este local já possui um checklist NR-33.'), { statusCode: 409 }); estado.escritas.push('INSERT'); const ch = { ...d, id_checklist: 99, id_usuario: u.id_usuario }; estado.checklists.set(99, ch); return ch; },
    async atualizarNoAmbiente(id, d, u, opcoes) { falhar(); assert.deepEqual(opcoes, { bloquearAutorizacao: true }); const ch = estado.checklists.get(id); if (!ch || !permitido(ch.id_local, u)) return null; estado.escritas.push('UPDATE'); return alterar(id, d); },
    async atualizarStatusNoAmbiente(id, status, u, opcoes) { falhar(); assert.deepEqual(opcoes, { bloquearAutorizacao: true }); const ch = estado.checklists.get(id); if (!ch || !permitido(ch.id_local, u)) return null; estado.escritas.push('UPDATE'); return Object.assign(ch, { status }); },
  };
  const legadoRepo = {
    async listarTodos() { falhar(); estado.globais.push('listar'); return [...estado.checklists.values()]; },
    async buscarPorId(id) { falhar(); estado.globais.push('buscar'); return estado.checklists.get(id) || null; },
    async buscarPorLocal(id) { estado.globais.push('buscarPorLocal'); return [...estado.checklists.values()].find(ch => ch.id_local === Number(id)) || null; },
    async criar(d) { falhar(); estado.escritas.push('INSERT GLOBAL'); return { id_checklist: 99, ...d }; },
    async atualizar(id, d) { falhar(); estado.escritas.push('UPDATE GLOBAL'); return alterar(id, d); },
    async atualizarStatus(id, status) { falhar(); estado.escritas.push('UPDATE GLOBAL'); return Object.assign(estado.checklists.get(id), { status }); },
  };
  const paths = Object.fromEntries(Object.entries({ router: '../src/routes/checklistRoutes', controller: '../src/controllers/checklistController', service: '../src/services/checklistMultiTenantService', legado: '../src/services/checklistService', auth: '../src/middlewares/autenticacaoMiddleware' }).map(([k,p]) => [k, require.resolve(p)]));
  const cache = new Map(Object.values(paths).map(p => [p, require.cache[p]]));
  const load = Module._load, mapas = new Map(), proibidas = [];
  const segredo = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'FICTICIO_LOCAIS';
  let router;
  try {
    for (const p of cache.keys()) delete require.cache[p];
    Module._load = function(request, parent, ...args) {
      // Utilitario puro real, restrito aos tres consumidores autorizados.
      if (request === '../utils/normalizarIdDominio' && ['middlewares/autenticacaoMiddleware', 'services/authService', 'services/relatorioMultiTenantService'].some(p => parent?.filename === require.resolve('../src/' + p))) return require('../src/utils/normalizarIdDominio');
      if (cache.has(parent?.filename)) {
        if (!mapas.get(parent.filename)?.has(request)) { proibidas.push(request); throw new Error('Dependência proibida: ' + request); }
        return mapas.get(parent.filename).get(request);
      }
      return load.call(this, request, parent, ...args);
    };
    mapas.set(paths.legado, new Map([['../repositories/checklistRepository', legadoRepo], ['../repositories/localRepository', { async buscarPorId(id) { return estado.locaisReais.get(Number(id)) || null; } }], ['../repositories/campanhaRepository', { async buscarPorId(id) { return estado.campanhas.get(id) || null; } }]]));
    const legado = require(paths.legado);
    mapas.set(paths.service, new Map([['../repositories/checklistMultiTenantRepository', repo]]));
    const service = require(paths.service);
    estado.argumentosServico = [];
    for (const nome of ['criarChecklist', 'listarChecklists', 'buscarChecklistPorId', 'atualizarChecklist', 'alterarStatusChecklist']) {
      const original = service[nome];
      t.mock.method(service, nome, (...args) => { estado.argumentosServico.push({ nome, args }); return original(...args); });
    }
    mapas.set(paths.controller, new Map([['../services/checklistService', legado], ['../services/checklistMultiTenantService', service]]));
    const controller = require(paths.controller);
    mapas.set(paths.auth, new Map([
      ['jsonwebtoken', { verify(token) { if (['invalido', 'adulterado'].includes(token)) throw new Error('JWT inválido'); return { sub: token, perfil: 'ADMINISTRADOR', id_ambiente: B }; } }],
      ['../repositories/usuarioRepository', { async buscarIdentidadeAutenticada(id) { estado.identidades.push(id); const u = estado.usuarios.get(id); return u?.ativo && u.ambienteAtivo ? u : null; } }],
    ]));
    const auth = require(paths.auth);
    mapas.set(paths.router, new Map([['express', express], ['../controllers/checklistController', controller], ['../middlewares/autenticacaoMiddleware', auth]]));
    router = require(paths.router);
  } finally {
    Module._load = load;
    for (const [p, anterior] of cache) { if (anterior) require.cache[p] = anterior; else delete require.cache[p]; }
  }
  t.mock.method(console, 'error', (...args) => estado.logs.push(args));
  t.after(() => { if (segredo === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = segredo; assert.deepEqual(proibidas, []); });
  async function solicitar(method, url, token = '11', body = { ...dados, status: 'CONCLUIDO' }) {
    // Por padrão POST usa um local sem checklist; duplicidade é cenário separado.
    // Locais/campanhas continuam existindo independentemente dos checklists.
    if (method === 'POST' && !estado.duplicado) {
      for (const [id, ch] of estado.checklists) if (ch.id_local === Number(body?.id_local)) estado.checklists.delete(id);
    }
    let concluir;
    const fim = new Promise(resolve => { concluir = resolve; });
    const req = { method, url, headers: token === null ? {} : { authorization: 'Bearer ' + token }, body, query: { id_usuario: 21, id_ambiente: B, perfil_acesso: 'ADMINISTRADOR' }, usuario: { id_usuario: 21, id_ambiente: B, perfil_acesso: 'ADMINISTRADOR' } };
    let envios = 0;
    const res = { headersSent: estado.iniciada, statusCode: 200, status(n) { this.statusCode = n; return this; }, json(value) { envios++; this.body = value; this.headersSent = true; concluir(); if (estado.falhaEnvio) throw new Error('Falha de transporte'); return this; } };
    if (estado.iniciada) Object.defineProperty(res, 'headersSent', { get() { concluir(); return true; } });
    estado.resAtual = res; estado.concluirResposta = concluir;
    const timer = setTimeout(concluir, 1000);
    router.handle(req, res, e => {
      if (res.headersSent) return concluir();
      const n = Number.isInteger(e?.statusCode) && e.statusCode >= 400 && e.statusCode <= 599 ? e.statusCode : e ? 500 : 404;
      try {
        return res.status(n).json({ status: 'error', message: n >= 500 ? 'Erro interno do servidor.' : e?.message || 'Rota não encontrada.' });
      } catch (erroEnvio) {
        if (!res.headersSent) throw erroEnvio;
        return concluir();
      }
    });
    await fim; await new Promise(resolve => setImmediate(resolve)); clearTimeout(timer);
    assert.equal(envios, estado.iniciada || estado.iniciadaDurante ? 0 : 1);
    if (!estado.iniciada && !estado.iniciadaDurante) assert.ok(res.body);
    return { req, res };
  }
  return { estado, solicitar };
}

for (const [method, url, nome] of operacoes) {
  for (const [token, id] of [['11', 10], ['21', 20], ['12', 10], ['22', 20]]) test(nome + ': acesso legítimo ' + token, async t => {
    const ctx = preparar(t);
    const { res, req } = await ctx.solicitar(method, url.replace('10', id), token, { ...dados, id_local: id, status: 'CONCLUIDO' });
    assert.equal(res.statusCode, nome === 'criar' ? 201 : 200);
    assert.equal(res.body.status, 'success');
    if (nome === 'listar') { assert.equal(res.body.total, 1); assert.deepEqual(res.body.data.map(l => l.id_local), [id]); }
    else { assert.equal(res.body.data.id_local, id); if (nome === 'criar') assert.equal(res.body.data.id_usuario, Number(token)); }
    assert.equal(req.usuario.id_ambiente, id === 10 ? A : B);
    assert.deepEqual(ctx.estado.identidades, [Number(token)]);
    assert.deepEqual(ctx.estado.globais, []);
  });
  for (const condicao of ['semJWT', 'invalido', 'adulterado', 'usuarioInativo', 'ambienteInativo', 'perfilRevogado', 'responsabilidadeRevogada']) test(nome + ': revalida ' + condicao, async t => {
    const ctx = preparar(t);
    if (condicao === 'usuarioInativo') ctx.estado.usuarios.get(11).ativo = false;
    if (condicao === 'ambienteInativo') ctx.estado.usuarios.get(11).ambienteAtivo = false;
    if (condicao === 'perfilRevogado') ctx.estado.usuarios.get(11).perfil_acesso = 'ENGENHEIRO_SEGURANCA';
    if (condicao === 'responsabilidadeRevogada') ctx.estado.campanhas.get(10).id_usuario = 13;
    const token = condicao === 'semJWT' ? null : ['invalido', 'adulterado'].includes(condicao) ? condicao : condicao === 'responsabilidadeRevogada' ? '12' : '11';
    const { res } = await ctx.solicitar(method, url, token);
    const revogacao = ['perfilRevogado', 'responsabilidadeRevogada'].includes(condicao);
    assert.equal(res.statusCode, revogacao ? nome === 'listar' ? 200 : 404 : 401);
    if (revogacao && nome === 'listar') assert.deepEqual(res.body.data, []);
    assert.deepEqual(ctx.estado.escritas, []);
  });
  test(nome + ': técnico não vira ausência/autorização', async t => {
    const ctx = preparar(t); ctx.estado.erro = new Error('SQL_TOKEN_SENHA_SENSIVEL');
    const { res } = await ctx.solicitar(method, url);
    assert.equal(res.statusCode, 500);
    assert.equal(JSON.stringify(res.body).includes('SQL_TOKEN_SENHA'), false);
  });
  test(nome + ': resposta iniciada não é sobrescrita', async t => {
    const ctx = preparar(t); ctx.estado.iniciada = true;
    await ctx.solicitar(method, url); assert.deepEqual(ctx.estado.escritas, []);
  });
}
for (const [method, url, nome] of operacoes.filter(o => o[2] !== 'listar')) {
  for (const token of ['21', '13']) test(nome + ': externo ou não responsável ' + token, async t => {
    const ctx = preparar(t); const { res } = await ctx.solicitar(method, url, token);
    assert.equal(res.statusCode, 404); assert.deepEqual(ctx.estado.escritas, []);
  });
}
for (const [method, url, nome] of operacoes.filter(o => !['criar', 'listar'].includes(o[2]))) {
  test(nome + ': externo e inexistente indistinguíveis', async t => {
    const ctx = preparar(t);
    const externa = await ctx.solicitar(method, url, '21');
    const ausente = await ctx.solicitar(method, url.replace('10', '999'), '21');
    assert.equal(externa.res.statusCode, 404); assert.deepEqual(externa.res.body, ausente.res.body);
  });
  test(nome + ': ID inseguro rejeitado', async t => {
    const ctx = preparar(t); assert.equal((await ctx.solicitar(method, url.replace('10', '9007199254740993'))).res.statusCode, 400); assert.deepEqual(ctx.estado.escritas, []);
  });
}
test('PUT parcial preserva respostas e vinculos apesar do corpo forjado', async t => {
  const ctx = preparar(t);
  const { res } = await ctx.solicitar('PUT', '/10', '12', { criterio_a: 'NAO', id_local: 20, id_usuario: 21, id_ambiente: B, perfil_acesso: 'ADMINISTRADOR', status: 'CONCLUIDO' });
  assert.equal(res.statusCode, 200); assert.equal(res.body.data.id_local, 10); assert.equal(res.body.data.id_usuario, 13); assert.equal(res.body.data.criterio_a, 'NAO'); assert.equal(res.body.data.criterio_b, 'NAO'); assert.equal(res.body.data.status, 'PENDENTE'); assert.equal(res.body.data.observacoes, 'Historico');
});
test('PUT vazio ou null preserva respostas e observacoes', async t => {
  const ctx = preparar(t); const { res } = await ctx.solicitar('PUT', '/10', '12', { criterio_a: null, observacoes: null });
  assert.equal(res.statusCode, 200); assert.equal(res.body.data.criterio_a, 'SIM'); assert.equal(res.body.data.observacoes, 'Historico');
});
test('Observacao vazia limpa sem apagar respostas omitidas', async t => {
  const ctx = preparar(t); const { res } = await ctx.solicitar('PUT', '/10', '12', { observacoes: '' });
  assert.equal(res.statusCode, 200); assert.equal(res.body.data.observacoes, null); assert.equal(res.body.data.criterio_a, 'SIM');
});
test('Falha do JSON após início não provoca segundo envio', async t => {
  const ctx = preparar(t); ctx.estado.falhaEnvio = true; await ctx.solicitar('POST', '/');
});
for (const [method, url, nome] of operacoes) {
  test(nome + ': encaminha identidade original e corpo sem reconstrução no controller', async t => {
    const ctx = preparar(t);
    const body = { ...dados, id_usuario: 21, id_ambiente: B, perfil_acesso: 'ADMINISTRADOR', status: 'CONCLUIDO' };
    const { req, res } = await ctx.solicitar(method, url, '12', body);
    assert.equal(res.statusCode, nome === 'criar' ? 201 : 200);
    assert.equal(ctx.estado.argumentosServico.length, 1);
    const args = ctx.estado.argumentosServico[0].args;
    assert.strictEqual(args.at(-1), req.usuario);
    if (['criar', 'atualizar', 'status'].includes(nome)) assert.strictEqual(args.at(-2), body);
    if (['buscar', 'atualizar', 'status'].includes(nome)) assert.equal(args[0], '10');
  });
  for (const statusCode of ['401', true, 599.5, 503]) test(nome + ': status e mensagem seguros ' + statusCode, async t => {
    const ctx = preparar(t); ctx.estado.erro = Object.assign(new Error('SQL_TOKEN_SENHA_SENSIVEL'), { statusCode });
    const { res } = await ctx.solicitar(method, url);
    assert.equal(res.statusCode, statusCode === 503 ? 503 : 500);
    assert.deepEqual(Object.keys(res.body).sort(), ['message', 'status']);
    assert.equal(JSON.stringify(res.body).includes('SQL_TOKEN_SENHA'), false);
  });
  test(nome + ': resposta iniciada durante consulta não é sobrescrita', async t => {
    const ctx = preparar(t);
    ctx.estado.aoConsultar = () => { ctx.estado.iniciadaDurante = true; ctx.estado.resAtual.headersSent = true; ctx.estado.concluirResposta(); };
    await ctx.solicitar(method, url);
  });
}
test('DELETE não está montado e não introduz exclusão em cascata', async t => {
  const ctx = preparar(t);
  const { res } = await ctx.solicitar('DELETE', '/10');
  assert.equal(res.statusCode, 404); assert.deepEqual(ctx.estado.escritas, []); assert.deepEqual(ctx.estado.globais, []);
});
for (const ambiente of [A, B]) {
  const id = ambiente === A ? 10 : 20;
  const token = ambiente === A ? '11' : '21';
  test('POST duplicado autorizado preserva 409 sem revelar dados: ' + ambiente, async t => {
    const ctx = preparar(t); ctx.estado.duplicado = true;
    const { res } = await ctx.solicitar('POST', '/', token, { ...dados, id_local: id });
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { status: 'error', message: 'Este local já possui um checklist NR-33.' });
    assert.deepEqual(ctx.estado.escritas, []); assert.deepEqual(ctx.estado.globais, []);
  });
}
for (const [method, url, nome] of operacoes.filter(o => o[2] !== 'listar')) {
  test(nome + ': responsabilidade cruzada não atravessa ambiente', async t => {
    const ctx = preparar(t);
    ctx.estado.campanhas.get(20).id_usuario = 12;
    const { res } = await ctx.solicitar(method, url.replace('10', '20'), '12', { ...dados, id_local: 20, status: 'CONCLUIDO' });
    assert.equal(res.statusCode, 404); assert.deepEqual(ctx.estado.escritas, []);
  });
  test(nome + ': local com campanha externa não usa IDs coincidentes como autorização', async t => {
    const ctx = preparar(t);
    ctx.estado.locaisReais.get(10).id_campanha = 20;
    const { res } = await ctx.solicitar(method, url, '11');
    assert.equal(res.statusCode, 404); assert.deepEqual(ctx.estado.escritas, []);
  });
}
for (const campo of Object.keys(respostas)) {
  test('POST/PUT validam resposta inválida sem escrita: ' + campo, async t => {
    const ctx = preparar(t);
    assert.equal((await ctx.solicitar('POST', '/', '11', { ...dados, [campo]: 'NAO_VALIDO' })).res.statusCode, 400);
    assert.equal((await ctx.solicitar('PUT', '/20', '21', { [campo]: 'NAO_VALIDO' })).res.statusCode, 400);
    assert.deepEqual(ctx.estado.escritas, []);
  });
}
test('Observações com espaços e todas as respostas NAO permanecem válidas', async t => {
  const ctx = preparar(t);
  const { res } = await ctx.solicitar('POST', '/', '12', { id_local: 10, ...Object.fromEntries(Object.keys(respostas).map(c => [c, 'NAO'])), observacoes: '   ' });
  assert.equal(res.statusCode, 201); assert.equal(res.body.data.status, 'PENDENTE'); assert.equal(res.body.data.observacoes, '   ');
  for (const campo of Object.keys(respostas)) assert.equal(res.body.data[campo], 'NAO');
});
