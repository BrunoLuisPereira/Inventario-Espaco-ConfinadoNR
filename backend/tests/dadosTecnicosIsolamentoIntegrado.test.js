const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const dados = { id_local: 10, pressao_atmosferica: 0, oxigenio: '20.90', ventilacao: 'NATURAL', observacoes: 'Historico' };
const operacoes = [['POST', '/', 'criar'], ['GET', '/', 'listar'], ['GET', '/10', 'buscar'], ['GET', '/local/10', 'buscarLocal'], ['PUT', '/10', 'atualizar'], ['DELETE', '/10', 'excluir']];

function preparar(t) {
  const estado = { usuarios: new Map(), campanhas: new Map(), locaisReais: new Map(), registros: new Map(), globais: [], escritas: [], chamadas: [], identidades: [], logs: [], revogado: false, erro: null, iniciada: false, falhaEnvio: false };
  for (const [ambiente, base] of [[A, 10], [B, 20]]) {
    for (const [n, perfil] of [[1, 'ADMINISTRADOR'], [2, 'ENGENHEIRO_SEGURANCA'], [3, 'ENGENHEIRO_SEGURANCA']]) estado.usuarios.set(base + n, { id_usuario: base + n, id_ambiente: ambiente, perfil_acesso: perfil, ativo: true, ambienteAtivo: true });
    estado.campanhas.set(base, { id_campanha: base, id_ambiente: ambiente, id_usuario: base + 2 });
    estado.locaisReais.set(base, { id_local: base, id_campanha: base });
    estado.registros.set(base, { id_dados: base, id_local: base, id_usuario: base + 3, pressao_atmosferica: 0, oxigenio: '20.90', temperatura: 0, ventilacao: 'NATURAL', observacoes: 'Historico', status: 'PENDENTE' });
  }
  const falhar = () => { if (estado.aoConsultar) estado.aoConsultar(); if (estado.erro) throw estado.erro; };
  const permitido = (id, u) => {
    const local = estado.locaisReais.get(id);
    const c = estado.campanhas.get(local?.id_campanha), atual = estado.usuarios.get(u?.id_usuario);
    return !!(c && atual?.ativo && atual.ambienteAtivo && !estado.revogado && c.id_ambiente === u.id_ambiente && atual.id_ambiente === u.id_ambiente && (atual.perfil_acesso === 'ADMINISTRADOR' || c.id_usuario === atual.id_usuario));
  };
  const alterar = (id, d) => Object.assign(estado.registros.get(id), d);
  const repo = {
    async listarPermitidosNoAmbiente(u) { falhar(); return [...estado.registros.values()].filter(d => permitido(d.id_local, u)); },
    async buscarPorIdNoAmbiente(id, u) { falhar(); const d = estado.registros.get(id); return d && permitido(d.id_local, u) ? d : null; },
    async buscarPorLocalNoAmbiente(id, u) { falhar(); return [...estado.registros.values()].find(d => d.id_local === id && permitido(id, u)) || null; },
    async buscarLocalAutorizadoNoAmbiente(id, u) { falhar(); return permitido(id, u) ? { id_local: id } : null; },
    async criarNoAmbiente(d, u) { falhar(); if (!permitido(d.id_local, u)) return null; if ([...estado.registros.values()].some(r => r.id_local === d.id_local)) throw Object.assign(new Error('Este local j\u00e1 possui dados t\u00e9cnicos cadastrados.'), { statusCode: 409 }); estado.escritas.push('INSERT'); const r = { ...d, id_dados: 99, id_usuario: u.id_usuario }; estado.registros.set(99, r); return r; },
    async atualizarNoAmbiente(id, d, u) { falhar(); const r = estado.registros.get(id); if (!r || !permitido(r.id_local, u)) return null; estado.escritas.push('UPDATE'); return alterar(id, d); },
    async excluirNoAmbiente(id, u) { falhar(); const r = estado.registros.get(id); if (!r || !permitido(r.id_local, u)) return null; estado.escritas.push('DELETE'); estado.registros.delete(id); return r; },
  };
  const legadoRepo = {
    async listarTodos() { falhar(); estado.globais.push('listar'); return [...estado.registros.values()]; },
    async buscarPorId(id) { falhar(); estado.globais.push('buscar'); return estado.registros.get(id) || null; },
    async buscarPorLocal(id) { falhar(); estado.globais.push('buscarPorLocal'); return [...estado.registros.values()].find(d => d.id_local === id) || null; },
    async criar(d) { falhar(); estado.escritas.push('INSERT GLOBAL'); return { id_dados: 99, ...d }; },
    async atualizar(id, d) { falhar(); estado.escritas.push('UPDATE GLOBAL'); return alterar(id, d); },
    async excluir(id) { falhar(); estado.escritas.push('DELETE GLOBAL'); const d = estado.registros.get(id); estado.registros.delete(id); return d; },
  };
  const paths = Object.fromEntries(Object.entries({ router: '../src/routes/dadosTecnicosRoutes', controller: '../src/controllers/dadosTecnicosController', legado: '../src/services/dadosTecnicosService', auth: '../src/middlewares/autenticacaoMiddleware' }).map(([k,p]) => [k, require.resolve(p)]));
  paths.service = require('node:path').resolve(__dirname, '../src/services/dadosTecnicosMultiTenantService.js');
  const cache = new Map(Object.values(paths).map(p => [p, require.cache[p]]));
  const load = Module._load, mapas = new Map(), proibidas = [];
  const segredo = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'FICTICIO_DADOS_TECNICOS';
  let router;
  try {
    for (const p of cache.keys()) delete require.cache[p];
    Module._load = function(request, parent, ...args) {
      if (cache.has(parent?.filename)) {
        if (!mapas.get(parent.filename)?.has(request)) { proibidas.push(request); throw new Error('Dependência proibida: ' + request); }
        return mapas.get(parent.filename).get(request);
      }
      return load.call(this, request, parent, ...args);
    };
    mapas.set(paths.legado, new Map([['../repositories/dadosTecnicosRepository', legadoRepo], ['../repositories/localRepository', { async buscarPorId(id) { return estado.locaisReais.get(Number(id)) || null; } }], ['../repositories/campanhaRepository', { async buscarPorId(id) { return estado.campanhas.get(id) || null; } }]]));
    const legado = require(paths.legado);
    let service;
    if (require('node:fs').existsSync(paths.service)) {
      mapas.set(paths.service, new Map([['../repositories/dadosTecnicosMultiTenantRepository', repo]]));
      service = require(paths.service);
    }
    estado.argumentosServico = [];
    for (const alvo of [legado, service].filter(Boolean)) for (const nome of ['criarDadosTecnicos', 'listarDadosTecnicos', 'buscarDadosTecnicosPorId', 'buscarDadosTecnicosPorLocal', 'atualizarDadosTecnicos', 'excluirDadosTecnicos']) {
      const original = alvo[nome];
      t.mock.method(alvo, nome, (...args) => { estado.argumentosServico.push({ nome, args }); return original(...args); });
    }
    mapas.set(paths.controller, new Map([['../services/dadosTecnicosService', legado], ['../services/dadosTecnicosMultiTenantService', service]]));
    const controller = require(paths.controller);
    mapas.set(paths.auth, new Map([
      ['jsonwebtoken', { verify(token) { if (['invalido', 'adulterado'].includes(token)) throw new Error('JWT inválido'); return { sub: token, perfil: 'ADMINISTRADOR', id_ambiente: B }; } }],
      ['../repositories/usuarioRepository', { async buscarIdentidadeAutenticada(id) { estado.identidades.push(id); const u = estado.usuarios.get(id); return u?.ativo && u.ambienteAtivo ? u : null; } }],
    ]));
    const auth = require(paths.auth);
    mapas.set(paths.router, new Map([['express', express], ['../controllers/dadosTecnicosController', controller], ['../middlewares/autenticacaoMiddleware', auth]]));
    router = require(paths.router);
  } finally {
    Module._load = load;
    for (const [p, anterior] of cache) { if (anterior) require.cache[p] = anterior; else delete require.cache[p]; }
  }
  t.mock.method(console, 'error', (...args) => estado.logs.push(args));
  t.after(() => { if (segredo === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = segredo; assert.deepEqual(proibidas, []); });
  async function solicitar(method, url, token = '11', body = { ...dados, status: 'CONCLUIDO' }) {
    // Por padrão POST usa um local sem dadosTecnicos; duplicidade é cenário separado.
    // Locais/campanhas continuam existindo independentemente dos registros.
    if (method === 'POST' && !estado.duplicado) {
      for (const [id, ch] of estado.registros) if (ch.id_local === Number(body?.id_local)) estado.registros.delete(id);
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
    const { res, req } = await ctx.solicitar(method, url.replace('10', id), token, { ...dados, id_local: id });
    assert.equal(res.statusCode, nome === 'criar' ? 201 : 200); assert.equal(res.body.status, 'success');
    const mensagens = { criar: 'Dados técnicos cadastrados com sucesso.', atualizar: 'Dados técnicos atualizados com sucesso.', excluir: 'Dados técnicos excluídos com sucesso.' };
    assert.deepEqual(Object.keys(res.body).sort(), nome === 'listar' ? ['data', 'status', 'total'] : Object.hasOwn(mensagens, nome) ? ['data', 'message', 'status'] : ['data', 'status']);
    if (Object.hasOwn(mensagens, nome)) assert.equal(res.body.message, mensagens[nome]);
    if (nome === 'listar') { assert.equal(res.body.total, 1); assert.deepEqual(res.body.data.map(d => d.id_local), [id]); }
    else assert.equal(res.body.data.id_local, id);
    assert.equal(req.usuario.id_ambiente, id === 10 ? A : B); assert.deepEqual(ctx.estado.identidades, [Number(token)]); assert.deepEqual(ctx.estado.globais, []);
    assert.equal(ctx.estado.argumentosServico.length, 1);
    const args = ctx.estado.argumentosServico.at(-1).args; assert.strictEqual(args.at(-1), req.usuario);
    if (['criar', 'atualizar'].includes(nome)) assert.strictEqual(args.at(-2), req.body);
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
    if (revogacao && nome === 'listar') assert.deepEqual(res.body.data, []); assert.deepEqual(ctx.estado.escritas, []);
  });
  test(nome + ': erro técnico é 500 seguro', async t => {
    const ctx = preparar(t); ctx.estado.erro = new Error('SQL_TOKEN_SENSIVEL'); const { res } = await ctx.solicitar(method, url);
    assert.equal(res.statusCode, 500); assert.equal(JSON.stringify(res.body).includes('SQL_TOKEN'), false);
  });
  test(nome + ': resposta iniciada não é sobrescrita', async t => { const ctx = preparar(t); ctx.estado.iniciada = true; await ctx.solicitar(method, url); assert.deepEqual(ctx.estado.escritas, []); });
}
for (const [method, url, nome] of operacoes.filter(o => o[2] !== 'listar')) {
  for (const token of ['21', '13']) test(nome + ': externo/não responsável/criador ' + token, async t => { const ctx = preparar(t); assert.equal((await ctx.solicitar(method, url, token)).res.statusCode, 404); assert.deepEqual(ctx.estado.escritas, []); });
  test(nome + ': responsabilidade não atravessa ambiente', async t => { const ctx = preparar(t); ctx.estado.campanhas.get(20).id_usuario = 12; assert.equal((await ctx.solicitar(method, url.replace('10', '20'), '12', { ...dados, id_local: 20 })).res.statusCode, 404); assert.deepEqual(ctx.estado.escritas, []); });
}
for (const [method, url, nome] of operacoes.filter(o => !['criar', 'listar'].includes(o[2]))) {
  test(nome + ': externo e inexistente indistinguíveis', async t => {
    const ctx = preparar(t); const externa = await ctx.solicitar(method, url, '21'); const ausente = await ctx.solicitar(method, url.replace('10', '999'), '21');
    assert.equal(externa.res.statusCode, 404); assert.deepEqual(externa.res.body, ausente.res.body);
  });
  test(nome + ': ID inseguro rejeitado', async t => { const ctx = preparar(t); assert.equal((await ctx.solicitar(method, url.replace('10', '9007199254740993'))).res.statusCode, 400); assert.deepEqual(ctx.estado.escritas, []); });
}
test('PUT parcial mantém zero, histórico e vínculos apesar de dados forjados', async t => {
  const ctx = preparar(t); const { res } = await ctx.solicitar('PUT', '/10', '12', { oxigenio: 0, id_local: 20, id_usuario: 21, id_ambiente: B, perfil_acesso: 'ADMINISTRADOR' });
  assert.equal(res.statusCode, 200); assert.equal(res.body.data.id_local, 10); assert.equal(res.body.data.id_usuario, 13); assert.equal(res.body.data.oxigenio, 0); assert.equal(res.body.data.temperatura, 0); assert.equal(res.body.data.observacoes, 'Historico');
});
test('PUT null preserva e observação vazia continua texto vazio', async t => {
  const ctx = preparar(t); const { res } = await ctx.solicitar('PUT', '/10', '12', { oxigenio: null, ventilacao: null, observacoes: '' });
  assert.equal(res.statusCode, 200); assert.equal(res.body.data.oxigenio, '20.90'); assert.equal(res.body.data.ventilacao, 'NATURAL'); assert.equal(res.body.data.observacoes, '');
});
for (const [method, url, nome] of operacoes) {
  test(nome + ': resposta iniciada durante consulta não é sobrescrita', async t => {
    const ctx = preparar(t);
    ctx.estado.aoConsultar = () => { ctx.estado.iniciadaDurante = true; ctx.estado.resAtual.headersSent = true; ctx.estado.concluirResposta(); };
    await ctx.solicitar(method, url);
  });
  test(nome + ': falha do JSON depois de iniciar não gera segunda resposta', async t => {
    const ctx = preparar(t); ctx.estado.falhaEnvio = true;
    const { res } = await ctx.solicitar(method, url);
    assert.equal(res.statusCode, nome === 'criar' ? 201 : 200);
  });
}
for (const [ambiente, token, local] of [[A, '11', 10], [B, '21', 20]]) {
  test('POST repetido autorizado mantém 409 seguro: ' + ambiente, async t => {
    const ctx = preparar(t); ctx.estado.duplicado = true;
    const { res } = await ctx.solicitar('POST', '/', token, { ...dados, id_local: local, id_usuario: 999, id_ambiente: ambiente === A ? B : A });
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { status: 'error', message: 'Este local já possui dados técnicos cadastrados.' });
    assert.deepEqual(ctx.estado.escritas, []); assert.deepEqual(ctx.estado.globais, []);
  });
}

