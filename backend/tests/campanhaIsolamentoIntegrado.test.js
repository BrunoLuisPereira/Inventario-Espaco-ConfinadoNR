const politicaRbac723 = require('../src/utils/permissoes');
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const DADOS = { nome_campanha: 'Campanha', empresa: 'Empresa', responsavel: 'Responsável descritivo', data_inicio: '2026-10-17' };
const operacoes = [['POST', '/', 'criar'], ['GET', '/', 'listar'], ['GET', '/10', 'buscar'], ['PUT', '/10', 'atualizar'], ['PATCH', '/10/status', 'status']];
function preparar(t) {
  const estado = { usuarios: new Map(), campanhas: new Map(), escritas: [], globais: [], identidades: [], chamadas: [], logs: [], falha: false, revogado: false, falhaResposta: false, iniciada: false };
  for (const [ambiente, base] of [[A, 10], [B, 20]]) {
    for (const [offset, perfil] of [[1, 'ADMINISTRADOR'], [2, 'ENGENHEIRO_SEGURANCA'], [3, 'ENGENHEIRO_SEGURANCA']]) estado.usuarios.set(base + offset, { id_usuario: base + offset, id_ambiente: ambiente, eh_fundador: perfil === "ADMINISTRADOR", perfil_acesso: perfil, ativo: true, ambienteAtivo: true });
    estado.campanhas.set(base, { ...DADOS, id_campanha: base, id_ambiente: ambiente, id_usuario: base + 2, status: 'EM ANDAMENTO', nome_campanha: 'EXCLUSIVO_' + ambiente });
  }
  const permitido = (c, u) => {
    const atual = estado.usuarios.get(u?.id_usuario);
    return !!(c && atual?.ativo && atual.ambienteAtivo && !estado.revogado && c.id_ambiente === u.id_ambiente && atual.id_ambiente === u.id_ambiente && ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR','SUPERVISOR','AUDITOR','VISUALIZADOR'].includes(atual.perfil_acesso));
  };
  const falhar = () => { if (estado.falha) throw Object.assign(new Error('SQL_TOKEN_CAMINHO_SENSIVEL'), { statusCode: estado.statusErro === undefined ? 500 : estado.statusErro }); };
  const legadoRepo = {
    async criar(d) { falhar(); estado.escritas.push(['criar', d]); return { ...d, id_campanha: 99, id_usuario: d.idUsuario }; },
    async listarTodas() { falhar(); estado.globais.push('listar'); return [...estado.campanhas.values()]; },
    async buscarPorId(id) { falhar(); estado.globais.push(id); return estado.campanhas.get(id) || null; },
    async atualizar(id, d) { falhar(); estado.escritas.push(['atualizar', id]); return Object.assign(estado.campanhas.get(id), d); },
    async atualizarStatus(id, status) { falhar(); estado.escritas.push(['status', id]); return Object.assign(estado.campanhas.get(id), { status }); },
  };
  const repo = {
    async listarPermitidasNoAmbiente(u) { falhar(); estado.chamadas.push(['listar', u]); return [...estado.campanhas.values()].filter((c) => permitido(c, u)); },
    async buscarPermitidaPorIdNoAmbiente(id, u) { falhar(); estado.chamadas.push(['buscar', id, u]); return permitido(estado.campanhas.get(id), u) ? estado.campanhas.get(id) : null; },
    async criarNoAmbiente(d, ambiente, opcoes) { falhar(); assert.deepEqual(opcoes, { bloquearAutorizacao: true }); const atual = estado.usuarios.get(d.idUsuario); if (estado.revogado || !atual?.ativo || !atual.ambienteAtivo || atual.id_ambiente !== ambiente) return null; estado.escritas.push(['criar', d, ambiente]); return { ...DADOS, status: d.status, id_campanha: 99, id_usuario: atual.id_usuario, id_ambiente: ambiente }; },
    async atualizarNoAmbiente(id, d, u, opcoes) { falhar(); assert.deepEqual(opcoes, { bloquearAutorizacao: true }); if (!permitido(estado.campanhas.get(id), u)) return null; estado.escritas.push(['atualizar', id]); const c = estado.campanhas.get(id); Object.assign(c, { nome_campanha: d.nomeCampanha, empresa: d.empresa, responsavel: d.responsavel, data_inicio: d.dataInicio }); return c; },
    async atualizarStatusNoAmbiente(id, status, u, opcoes) { falhar(); assert.deepEqual(opcoes, { bloquearAutorizacao: true }); if (!permitido(estado.campanhas.get(id), u)) return null; estado.escritas.push(['status', id]); return Object.assign(estado.campanhas.get(id), { status }); },
  };
  const paths = Object.fromEntries(Object.entries({ router: '../src/routes/campanhaRoutes', controller: '../src/controllers/campanhaController', controllerMt: '../src/controllers/campanhaMultiTenantController', legado: '../src/services/campanhaService', service: '../src/services/campanhaMultiTenantService', auth: '../src/middlewares/autenticacaoMiddleware' }).map(([k, p]) => [k, require.resolve(p)]));
  const cache = new Map(Object.values(paths).map((p) => [p, require.cache[p]]));
  const load = Module._load;
  const maps = new Map();
  const proibidas = [];
  const segredo = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'FICTICIO_CAMPANHAS';
  let router;
  try {
    for (const p of cache.keys()) delete require.cache[p];
    Module._load = function (request, parent, ...args) {
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (request === '../utils/permissoes') return politicaRbac723;
      // Utilitario puro real, restrito aos tres consumidores autorizados.
      if (request === '../utils/normalizarIdDominio' && ['middlewares/autenticacaoMiddleware', 'services/authService', 'services/relatorioMultiTenantService'].some(p => parent?.filename === require.resolve('../src/' + p))) return require('../src/utils/normalizarIdDominio');
      if (cache.has(parent?.filename)) {
        if (!maps.get(parent.filename)?.has(request)) { proibidas.push(request); throw new Error('Dependência inesperada: ' + request); }
        return maps.get(parent.filename).get(request);
      }
      return load.call(this, request, parent, ...args);
    };
    maps.set(paths.legado, new Map([['../repositories/campanhaRepository', legadoRepo]]));
    const legado = require(paths.legado);
    maps.set(paths.service, new Map([['../repositories/campanhaMultiTenantRepository', repo]]));
    const service = require(paths.service);
    maps.set(paths.controllerMt, new Map([['../services/campanhaMultiTenantService', service]]));
    const controllerMt = require(paths.controllerMt);
    maps.set(paths.controller, new Map([['../services/campanhaService', legado], ['../services/campanhaMultiTenantService', service], ['./campanhaMultiTenantController', controllerMt]]));
    const controller = require(paths.controller);
    maps.set(paths.auth, new Map([
      ['jsonwebtoken', { verify(token) { if (['invalido', 'adulterado'].includes(token)) throw new Error('JWT inválido'); return { sub: token, perfil: 'ADMINISTRADOR', id_ambiente: B }; } }],
      ['../repositories/usuarioRepository', { async buscarIdentidadeAutenticada(id) { estado.identidades.push(id); const u = estado.usuarios.get(id); return u?.ativo && u.ambienteAtivo ? u : null; } }],
    ]));
    const auth = require(paths.auth);
    maps.set(paths.router, new Map([['express', express], ['../controllers/campanhaController', controller], ['../middlewares/autenticacaoMiddleware', auth]]));
    router = require(paths.router);
  } finally {
    Module._load = load;
    for (const [p, anterior] of cache) { if (anterior) require.cache[p] = anterior; else delete require.cache[p]; }
  }
  t.mock.method(console, 'error', (...args) => estado.logs.push(args));
  t.after(() => { if (segredo === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = segredo; assert.deepEqual(proibidas, []); });
  async function solicitar(method, url, token = '11', body = { ...DADOS, status: 'CONCLUIDO' }) {
    let concluir;
    const fim = new Promise((resolve) => { concluir = resolve; });
    let envios = 0;
    const req = { method, url, headers: token === null ? {} : { authorization: 'Bearer ' + token }, body, query: { id_usuario: 21, id_ambiente: B, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR' }, usuario: { id_usuario: 21, id_ambiente: B, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR' } };
    const res = { headersSent: estado.iniciada, statusCode: 200, status(n) { this.statusCode = n; return this; }, json(value) { envios++; this.body = value; this.headersSent = true; concluir(); if (estado.falhaResposta) throw new Error('envio interrompido'); return this; } };
    if (estado.iniciada) Object.defineProperty(res, 'headersSent', { get() { concluir(); return true; } });
    const timer = setTimeout(concluir, 1000);
    router.handle(req, res, (e) => res.status(e?.statusCode || 500).json({ status: 'error', message: 'Erro interno.' }));
    await fim;
    await new Promise((resolve) => setImmediate(resolve));
    clearTimeout(timer);
    assert.equal(envios, estado.iniciada ? 0 : 1, 'Resposta única');
    if (!estado.iniciada) assert.ok(res.body, 'Rota deve responder');
    return { req, res };
  }
  return { estado, solicitar };
}
for (const [method, url, nome] of operacoes) {
  for (const [token, id] of [['11', 10], ['21', 20], ['12', 10], ['22', 20]]) {
    test(nome + ': acesso legítimo ' + token, async (t) => {
      const ctx = preparar(t);
      const { res, req } = await ctx.solicitar(method, url.replace(/10/g, String(id)), token);
      assert.equal(res.statusCode, nome === 'criar' ? 201 : 200);
      assert.equal(res.body.status, 'success');
      const ambiente = id === 10 ? A : B;
      if (nome === 'listar') { assert.ok(res.body.data.every((c) => c.id_ambiente === ambiente)); assert.equal(res.body.total, res.body.data.length); }
      else { assert.equal(res.body.data.id_ambiente, ambiente); if (nome === 'criar') assert.equal(res.body.data.id_usuario, Number(token)); }
      assert.deepEqual(ctx.estado.identidades, [Number(token)]);
      assert.equal(req.usuario.id_ambiente, ambiente);
      assert.deepEqual(ctx.estado.globais, []);
    });
  }
  for (const condicao of ['semJWT', 'invalido', 'adulterado', 'usuarioInativo', 'ambienteInativo', 'perfilRevogado']) {
    test(nome + ': revalida ' + condicao, async (t) => {
      const ctx = preparar(t);
      if (condicao === 'usuarioInativo') ctx.estado.usuarios.get(11).ativo = false;
      if (condicao === 'ambienteInativo') ctx.estado.usuarios.get(11).ambienteAtivo = false;
      if (condicao === 'perfilRevogado') ctx.estado.usuarios.get(12).perfil_acesso = 'AUDITOR';
      const { res } = await ctx.solicitar(method, url, condicao === 'semJWT' ? null : ['invalido', 'adulterado'].includes(condicao) ? condicao : condicao === 'perfilRevogado' ? '12' : '11');
    if (['perfilRevogado','responsavelAlterado'].includes(condicao)) {
      assert.equal(res.statusCode, condicao === 'perfilRevogado' ? method === 'GET' ? 200 : 403 : nome === 'criar' ? 201 : 200);
      if (nome === 'listar') assert.equal(res.body.data.length, 1);
      if (condicao === 'perfilRevogado') assert.deepEqual(ctx.estado.escritas, []);
      return;
    }
      const esperado = 401;
      assert.equal(res.statusCode, esperado);
      if (esperado >= 400) assert.deepEqual(ctx.estado.escritas, []);
    });
  }
  test(nome + ': falha técnica não expõe mensagem', async (t) => {
    const ctx = preparar(t); ctx.estado.falha = true;
    const { res } = await ctx.solicitar(method, url);
    assert.equal(res.statusCode, 500);
    assert.equal(JSON.stringify(res.body).includes('SQL_TOKEN_CAMINHO'), false);
    assert.equal(JSON.stringify(ctx.estado.logs).includes('SQL_TOKEN_CAMINHO'), false);
  });
  test(nome + ': headersSent evita segunda resposta', async (t) => {
    const ctx = preparar(t); ctx.estado.iniciada = true;
    await ctx.solicitar(method, url);
    assert.deepEqual(ctx.estado.escritas, []);
  });
}
for (const [method, url, nome] of operacoes.filter((o) => !['criar', 'listar'].includes(o[2]))) {
  for (const token of ['21', '13']) {
    test(nome + ": recurso conforme ambiente e capacidade " + token, async (t) => {
      const ctx = preparar(t);
      const { res } = await ctx.solicitar(method, url, token);
    if (token === '13') {
      assert.equal(res.statusCode, nome === 'criar' ? 201 : 200);
      assert.deepEqual(ctx.estado.identidades, [13]);
      return;
    }
      assert.equal(res.statusCode, 404);
      assert.equal(res.body.message, 'Campanha não encontrada.');
      assert.deepEqual(ctx.estado.escritas, []);
    });
  }
  test(nome + ': inexistente e externo indistinguíveis', async (t) => {
    const ctx = preparar(t);
    const externa = await ctx.solicitar(method, url, '21');
    const ausente = await ctx.solicitar(method, url.replace('10', '999'), '21');
    assert.equal(externa.res.statusCode, 404);
    assert.deepEqual(externa.res.body, ausente.res.body);
  });
  test(nome + ': ID acima do limite seguro recebe 400', async (t) => {
    const ctx = preparar(t);
    assert.equal((await ctx.solicitar(method, url.replace('10', '9007199254740993'))).res.statusCode, 400);
    assert.deepEqual(ctx.estado.escritas, []);
  });
}
test('PUT não transfere ambiente nem responsável por campos forjados', async (t) => {
  const ctx = preparar(t);
  const { res } = await ctx.solicitar('PUT', '/10', '12', { ...DADOS, id_ambiente: B, id_usuario: 21, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.id_ambiente, A);
  assert.equal(res.body.data.id_usuario, 12);
});
test('POST ignora identidade do corpo e mantém responsabilidade do criador', async (t) => {
  const ctx = preparar(t);
  const { res } = await ctx.solicitar('POST', '/', '12', { ...DADOS, id_usuario: 21, id_ambiente: B, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR' });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.id_usuario, 12);
  assert.equal(res.body.data.id_ambiente, A);
});
test('Falha após envio JSON não causa segunda resposta', async (t) => {
  const ctx = preparar(t); ctx.estado.falhaResposta = true;
  await ctx.solicitar('POST', '/');
});

for (const [method, url, nome] of operacoes) {
  for (const status of ['401', true, [], {}, 401.5, 399, 600, NaN, Infinity, null]) {
    test(nome + ': status inválido não sofre coerção ' + String(status), async (t) => {
      const ctx = preparar(t); ctx.estado.falha = true; ctx.estado.statusErro = status;
      const { res } = await ctx.solicitar(method, url);
      assert.equal(res.statusCode, 500);
      assert.equal(res.body.status, 'error');
      assert.equal(JSON.stringify(res.body).includes('SQL_TOKEN_CAMINHO'), false);
      assert.equal(JSON.stringify(ctx.estado.logs).includes('SQL_TOKEN_CAMINHO'), false);
    });
  }
  test(nome + ': erro 503 mantém status válido e mensagem genérica', async (t) => {
    const ctx = preparar(t); ctx.estado.falha = true; ctx.estado.statusErro = 503;
    const { res } = await ctx.solicitar(method, url);
    assert.equal(res.statusCode, 503);
    assert.equal(JSON.stringify(res.body).includes('SQL_TOKEN_CAMINHO'), false);
  });
}
for (const [method, url, nome] of operacoes.filter((o) => o[2] !== 'criar')) {
  test(nome + ': troca de responsavel preserva acesso do engenheiro', async (t) => {
    const ctx = preparar(t);
    ctx.estado.campanhas.get(10).id_usuario = 13;
    const { res } = await ctx.solicitar(method, url, '12');
    assert.equal(res.statusCode, nome === 'criar' ? 201 : 200);
    if (nome === 'listar') assert.equal(res.body.data.length, 1);

  });
}
