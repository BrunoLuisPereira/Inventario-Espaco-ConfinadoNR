const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const dados = { nome_local: 'Tanque', id_campanha: 10, latitude: 0, longitude: 0 };
const operacoes = [['POST', '/', 'criar'], ['GET', '/', 'listar'], ['GET', '/10', 'buscar'], ['PUT', '/10', 'atualizar'], ['PATCH', '/10/status', 'status']];

function preparar(t) {
  const estado = { usuarios: new Map(), campanhas: new Map(), locais: new Map(), globais: [], escritas: [], chamadas: [], identidades: [], logs: [], revogado: false, erro: null, iniciada: false, falhaEnvio: false };
  for (const [ambiente, base] of [[A, 10], [B, 20]]) {
    for (const [n, perfil] of [[1, 'ADMINISTRADOR'], [2, 'ENGENHEIRO_SEGURANCA'], [3, 'ENGENHEIRO_SEGURANCA']]) estado.usuarios.set(base + n, { id_usuario: base + n, id_ambiente: ambiente, perfil_acesso: perfil, ativo: true, ambienteAtivo: true });
    estado.campanhas.set(base, { id_campanha: base, id_ambiente: ambiente, id_usuario: base + 2 });
    estado.locais.set(base, { id_local: base, id_campanha: base, nome_local: 'EXCLUSIVO_' + base, setor: 'Setor preservado', latitude: 0, longitude: 0, status: 'ATIVO' });
  }
  const falhar = () => { if (estado.aoConsultar) estado.aoConsultar(); if (estado.erro) throw estado.erro; };
  const permitido = (id, u) => {
    const c = estado.campanhas.get(id), atual = estado.usuarios.get(u?.id_usuario);
    return !!(c && atual?.ativo && atual.ambienteAtivo && !estado.revogado && c.id_ambiente === u.id_ambiente && atual.id_ambiente === u.id_ambiente && (atual.perfil_acesso === 'ADMINISTRADOR' || c.id_usuario === atual.id_usuario));
  };
  const alterar = (id, d) => {
    const local = estado.locais.get(id);
    for (const [origem, destino] of [['nomeLocal', 'nome_local'], ['setor', 'setor'], ['descricao', 'descricao'], ['endereco', 'endereco'], ['latitude', 'latitude'], ['longitude', 'longitude']]) if (Object.hasOwn(d, origem)) local[destino] = d[origem];
    return local;
  };
  const repo = {
    async listarPermitidosNoAmbiente(u) { falhar(); estado.chamadas.push(['listar', u]); return [...estado.locais.values()].filter(l => permitido(l.id_campanha, u)); },
    async buscarPermitidoPorIdNoAmbiente(id, u) { falhar(); estado.chamadas.push(['buscar', id, u]); const l = estado.locais.get(id); return l && permitido(l.id_campanha, u) ? l : null; },
    async criarNoAmbiente(d, u, opcoes) { falhar(); assert.deepEqual(opcoes, { bloquearAutorizacao: true }); if (!permitido(d.idCampanha, u)) return null; estado.escritas.push('INSERT'); return { id_local: 99, id_campanha: d.idCampanha, nome_local: d.nomeLocal, latitude: d.latitude, longitude: d.longitude }; },
    async atualizarNoAmbiente(id, d, u, opcoes) { falhar(); assert.deepEqual(opcoes, { bloquearAutorizacao: true }); const l = estado.locais.get(id); if (!l || !permitido(l.id_campanha, u)) return null; estado.escritas.push('UPDATE'); return alterar(id, d); },
    async atualizarStatusNoAmbiente(id, status, u, opcoes) { falhar(); assert.deepEqual(opcoes, { bloquearAutorizacao: true }); const l = estado.locais.get(id); if (!l || !permitido(l.id_campanha, u)) return null; estado.escritas.push('UPDATE'); return Object.assign(l, { status }); },
  };
  const legadoRepo = {
    async listarTodos() { falhar(); estado.globais.push('listar'); return [...estado.locais.values()]; },
    async buscarPorId(id) { falhar(); estado.globais.push('buscar'); return estado.locais.get(id) || null; },
    async criar(d) { falhar(); estado.escritas.push('INSERT GLOBAL'); return { id_local: 99, ...d }; },
    async atualizar(id, d) { falhar(); estado.escritas.push('UPDATE GLOBAL'); return alterar(id, d); },
    async atualizarStatus(id, status) { falhar(); estado.escritas.push('UPDATE GLOBAL'); return Object.assign(estado.locais.get(id), { status }); },
  };
  const paths = Object.fromEntries(Object.entries({ router: '../src/routes/localRoutes', controller: '../src/controllers/localController', service: '../src/services/localMultiTenantService', legado: '../src/services/localService', auth: '../src/middlewares/autenticacaoMiddleware' }).map(([k,p]) => [k, require.resolve(p)]));
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
    mapas.set(paths.legado, new Map([['../repositories/localRepository', legadoRepo], ['../repositories/campanhaRepository', { async buscarPorId(id) { return estado.campanhas.get(id) || null; } }]]));
    const legado = require(paths.legado);
    mapas.set(paths.service, new Map([['../repositories/localMultiTenantRepository', repo]]));
    const service = require(paths.service);
    estado.argumentosServico = [];
    for (const nome of ['criarLocal', 'listarLocais', 'buscarLocalPorId', 'atualizarLocal', 'alterarStatusLocal']) {
      const original = service[nome];
      t.mock.method(service, nome, (...args) => { estado.argumentosServico.push({ nome, args }); return original(...args); });
    }
    mapas.set(paths.controller, new Map([['../services/localService', legado], ['../services/localMultiTenantService', service], ['../services/excelService', { gerarExcelLocais() { throw new Error('Excel tem suíte própria'); } }]]));
    const controller = require(paths.controller);
    mapas.set(paths.auth, new Map([
      ['jsonwebtoken', { verify(token) { if (['invalido', 'adulterado'].includes(token)) throw new Error('JWT inválido'); return { sub: token, perfil: 'ADMINISTRADOR', id_ambiente: B }; } }],
      ['../repositories/usuarioRepository', { async buscarIdentidadeAutenticada(id) { estado.identidades.push(id); const u = estado.usuarios.get(id); return u?.ativo && u.ambienteAtivo ? u : null; } }],
    ]));
    const auth = require(paths.auth);
    mapas.set(paths.router, new Map([['express', express], ['../controllers/localController', controller], ['../middlewares/autenticacaoMiddleware', auth]]));
    router = require(paths.router);
  } finally {
    Module._load = load;
    for (const [p, anterior] of cache) { if (anterior) require.cache[p] = anterior; else delete require.cache[p]; }
  }
  t.mock.method(console, 'error', (...args) => estado.logs.push(args));
  t.after(() => { if (segredo === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = segredo; assert.deepEqual(proibidas, []); });
  async function solicitar(method, url, token = '11', body = { ...dados, status: 'INATIVO' }) {
    let concluir;
    const fim = new Promise(resolve => { concluir = resolve; });
    const req = { method, url, headers: token === null ? {} : { authorization: 'Bearer ' + token }, body, query: { id_usuario: 21, id_ambiente: B, perfil_acesso: 'ADMINISTRADOR' }, usuario: { id_usuario: 21, id_ambiente: B, perfil_acesso: 'ADMINISTRADOR' } };
    let envios = 0;
    const res = { headersSent: estado.iniciada, statusCode: 200, status(n) { this.statusCode = n; return this; }, json(value) { envios++; this.body = value; this.headersSent = true; concluir(); if (estado.falhaEnvio) throw new Error('Falha de transporte'); return this; } };
    if (estado.iniciada) Object.defineProperty(res, 'headersSent', { get() { concluir(); return true; } });
    estado.resAtual = res; estado.concluirResposta = concluir;
    const timer = setTimeout(concluir, 1000);
    router.handle(req, res, e => res.status(e?.statusCode || 404).json({ status: 'error', message: 'Rota não encontrada.' }));
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
    const { res, req } = await ctx.solicitar(method, url.replace('10', id), token, { ...dados, id_campanha: id, status: 'INATIVO' });
    assert.equal(res.statusCode, nome === 'criar' ? 201 : 200);
    assert.equal(res.body.status, 'success');
    if (nome === 'listar') { assert.equal(res.body.total, 1); assert.deepEqual(res.body.data.map(l => l.id_campanha), [id]); }
    else assert.equal(res.body.data.id_campanha, id);
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
    assert.equal(JSON.stringify([res.body, ctx.estado.logs]).includes('SQL_TOKEN_SENHA'), false);
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
test('PUT preserva campos omitidos, zeros e vínculo apesar do corpo forjado', async t => {
  const ctx = preparar(t);
  const { res } = await ctx.solicitar('PUT', '/10', '12', { nome_local: 'Novo', id_campanha: 20, id_usuario: 21, id_ambiente: B, perfil_acesso: 'ADMINISTRADOR' });
  assert.equal(res.statusCode, 200); assert.equal(res.body.data.id_campanha, 10); assert.equal(res.body.data.setor, 'Setor preservado'); assert.equal(res.body.data.latitude, 0); assert.equal(res.body.data.longitude, 0);
});
test('PUT permite limpeza explícita sem apagar coordenadas omitidas', async t => {
  const ctx = preparar(t); const { res } = await ctx.solicitar('PUT', '/10', '12', { nome_local: 'Novo', setor: null });
  assert.equal(res.statusCode, 200); assert.equal(res.body.data.setor, null); assert.equal(res.body.data.latitude, 0);
});
test('Falha do JSON após início não provoca segundo envio', async t => {
  const ctx = preparar(t); ctx.estado.falhaEnvio = true; await ctx.solicitar('POST', '/');
});
for (const [method, url, nome] of operacoes) {
  test(nome + ': encaminha identidade original e corpo sem reconstrução no controller', async t => {
    const ctx = preparar(t);
    const body = { ...dados, id_usuario: 21, id_ambiente: B, perfil_acesso: 'ADMINISTRADOR', status: 'INATIVO' };
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
    assert.equal(JSON.stringify([res.body, ctx.estado.logs]).includes('SQL_TOKEN_SENHA'), false);
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
