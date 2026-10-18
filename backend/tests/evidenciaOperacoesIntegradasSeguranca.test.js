const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const chave = '33333333-3333-4333-8333-333333333333';
const gps = { latitude: '0', longitude: '0', precisao_gps: null, origem_coordenadas: 'MANUAL', data_captura_gps: null };
const erro = (statusCode, code) => Object.assign(new Error('SEGREDO_SQL_CAMINHO'), { statusCode, code });
function preparar(t) {
  const estado = { usuarios: new Map(), registros: new Map(), eventos: [], fisicas: [], escritas: [], falha: false, revogado: false, conflito: false };
  for (const [ambiente, base] of [[A, 10], [B, 20]]) {
    for (const [i, perfil] of [[1, 'ADMINISTRADOR'], [2, 'ENGENHEIRO_SEGURANCA'], [3, 'ENGENHEIRO_SEGURANCA']]) estado.usuarios.set(base + i, { id_usuario: base + i, id_ambiente: ambiente, perfil_acesso: perfil, ativo: true, ambienteAtivo: true });
    estado.registros.set(base, { id_evidencia: base, id_local: base, id_usuario: base + 3, ambiente, responsavel: base + 2, tipo: 'FOTO', descricao: 'EXCLUSIVO_' + ambiente, caminho_arquivo: 'uploads/evidencias/legado-' + base + '.jpg', latitude: 0, longitude: 0, estado_gps: { ...gps } });
  }
  function permitido(registro, usuario) {
    const atual = estado.usuarios.get(usuario?.id_usuario);
    return !!(registro && atual?.ativo && atual.ambienteAtivo && !estado.revogado && registro.ambiente === usuario.id_ambiente && atual.id_ambiente === usuario.id_ambiente && (atual.perfil_acesso === 'ADMINISTRADOR' || registro.responsavel === atual.id_usuario));
  }
  const repository = {
    async listarPermitidasNoAmbiente(u) { estado.eventos.push(['listar', u]); if (estado.falha) throw erro(500); return [...estado.registros.values()].filter((e) => permitido(e, u)); },
    async buscarPorIdEAmbiente(id, u, opcoes) { estado.eventos.push(['buscar', id, u, opcoes]); if (estado.falha) throw erro(500); const registro = permitido(estado.registros.get(id), u) ? { ...estado.registros.get(id) } : null; if (estado.revogarAposLeitura) estado.revogado = true; return registro; },
    async buscarLocalAutorizadoNoAmbiente(id, u) { estado.eventos.push(['local', id, u]); if (estado.falha) throw erro(500); return permitido(estado.registros.get(id), u) ? { id_local: id } : null; },
    async listarPorLocalEAmbiente(id, u) { estado.eventos.push(['porLocal', id, u]); return permitido(estado.registros.get(id), u) ? [estado.registros.get(id)] : []; },
    async buscarPorOperacaoClienteNoAmbiente(op, id, u) { estado.eventos.push(['operacao', op, id, u]); const e = estado.registros.get(id); return permitido(e, u) && e.id_operacao_cliente === op ? e : null; },
    async criarNoAmbiente(dados, u) { estado.eventos.push(['criar', dados, u]); if (!permitido(estado.registros.get(dados.id_local), u)) return null; if (estado.falha || estado.falhaCriar) throw erro(500); return { ...dados, id_evidencia: 99, id_usuario: u.id_usuario }; },
    async atualizarNoAmbiente(id, patch, u, opcoes) { estado.eventos.push(['update', id, patch, u, opcoes]); if (!permitido(estado.registros.get(id), u)) return null; if (estado.falha) throw erro(500); if (estado.conflito) throw erro(409, 'CONFLITO_GPS'); assert.deepEqual(opcoes, { gpsEsperado: gps }); estado.escritas.push(id); Object.assign(estado.registros.get(id), patch); return estado.registros.get(id); },
    async excluirNoAmbiente(id, u) { estado.eventos.push(['delete', id, u]); if (!permitido(estado.registros.get(id), u)) return null; if (estado.falha) throw erro(500); const e = estado.registros.get(id); estado.registros.delete(id); estado.escritas.push(id); return e; },
  };
  const legado = {
    listarEvidencias: async () => [...estado.registros.values()],
    buscarEvidenciaPorId: async (id) => estado.registros.get(Number(id)),
    listarEvidenciasPorLocal: async (id) => [estado.registros.get(Number(id))],
    atualizarEvidencia: async (id, patch) => { estado.escritas.push(Number(id)); return Object.assign(estado.registros.get(Number(id)), patch); },
    excluirEvidencia: async (id) => { const e = estado.registros.get(Number(id)); estado.registros.delete(Number(id)); estado.escritas.push(Number(id)); estado.fisicas.push('unlink legado'); return e; },
    criarEvidencia: async (dados) => ({ ...dados, id_evidencia: 99 }),
  };
  const arquivos = {
    validarUpload(file) {
      estado.eventos.push(['validarArquivo']);
      if (file?.mimetype === 'application/pdf' && file.buffer?.equals(Buffer.from('PDF_VALIDO'))) return { extensao: '.pdf', tipo: 'DOCUMENTO' };
      if (file?.mimetype !== 'image/jpeg' || !file.buffer?.equals(Buffer.from('JPEG_VALIDO'))) throw erro(400);
      return { extensao: '.jpg', tipo: 'FOTO' };
    },
    async persistirUploadAutorizado(file, u, local) { estado.eventos.push(['persistir', u.id_ambiente, local]); if (estado.falhaPersistir) throw erro(500); return { caminho_arquivo: 'uploads/evidencias/novo-gerenciado' + (file.mimetype === 'application/pdf' ? '.pdf' : '.jpg') }; },
    removerArquivo() { estado.fisicas.push('unlink'); throw erro(500); },
  };
  const caminhos = Object.fromEntries(['controller', 'service', 'router', 'auth'].map((nome) => [nome, require.resolve({ controller: '../src/controllers/evidenciaController', service: '../src/services/evidenciaMultiTenantService', router: '../src/routes/evidenciaRoutes', auth: '../src/middlewares/autenticacaoMiddleware' }[nome])]));
  const cache = new Map(Object.values(caminhos).map((p) => [p, require.cache[p]]));
  const original = Module._load;
  const maps = new Map();
  const segredo = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'FICTICIO';
  const proibidas = [];
  let router;
  try {
    for (const p of cache.keys()) delete require.cache[p];
    Module._load = function (request, parent, ...args) {
      if (cache.has(parent?.filename)) {
        if (!maps.get(parent.filename)?.has(request)) { proibidas.push(request); throw new Error('Dependência não simulada: ' + request); }
        return maps.get(parent.filename).get(request);
      }
      return original.call(this, request, parent, ...args);
    };
    maps.set(caminhos.service, new Map([['../repositories/evidenciaMultiTenantRepository', repository]]));
    const service = require(caminhos.service);
    maps.set(caminhos.controller, new Map([['../services/evidenciaService', legado], ['../services/evidenciaMultiTenantService', service], ['../utils/evidenciaArquivoUtils', arquivos]]));
    const controller = require(caminhos.controller);
    maps.set(caminhos.auth, new Map([
      ['jsonwebtoken', { verify(token) { if (token === 'invalido') throw new Error('JWT'); return { sub: token, perfil: 'ADMINISTRADOR', id_ambiente: B }; } }],
      ['../repositories/usuarioRepository', { async buscarIdentidadeAutenticada(id) { const u = estado.usuarios.get(id); return u?.ativo && u.ambienteAtivo ? u : null; } }],
    ]));
    const auth = require(caminhos.auth);
    maps.set(caminhos.router, new Map([['express', express], ['../controllers/evidenciaController', controller], ['../middlewares/autenticacaoMiddleware', auth], ['../middlewares/uploadEvidenciaMiddleware', { uploadEvidencia: { single: () => (req, _res, next) => { estado.eventos.push(['multipart']); next(); } } }]]));
    router = require(caminhos.router);
  } finally {
    Module._load = original;
    for (const [p, anterior] of cache) { if (anterior) require.cache[p] = anterior; else delete require.cache[p]; }
  }
  t.mock.method(console, 'error', () => {});
  t.after(() => { if (segredo === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = segredo; assert.deepEqual(proibidas, []); });
  async function solicitar(method, url, body = {}, token = '11', file) {
    const req = { method, url, headers: token === null ? {} : { authorization: 'Bearer ' + token }, body, query: { id_ambiente: B, perfil_acesso: 'ADMINISTRADOR' }, file };
    let terminar;
    const fim = new Promise((resolve) => { terminar = resolve; });
    let envios = 0;
    const res = { headersSent: false, statusCode: 200, status(n) { this.statusCode = n; return this; }, json(data) { envios++; this.body = data; this.headersSent = true; terminar(); if (estado.falhaResposta) throw new Error('Transporte após persistência'); return this; } };
    const timer = setTimeout(() => terminar(), 1000);
    router.handle(req, res, (e) => { res.status(Number.isInteger(e?.statusCode) ? e.statusCode : 500).json({ status: 'error', message: e?.statusCode < 500 ? e.message : 'Erro interno do servidor.' }); });
    await fim;
    clearTimeout(timer);
    assert.ok(res.body, 'Handler deve concluir a resposta');
    assert.equal(envios, 1, 'A resposta não pode ser reenviada');
    return res;
  }
  return { estado, solicitar };
}
const operacoes = [['GET', '/', 'listar'], ['GET', '/10', 'buscar'], ['GET', '/local/10', 'porLocal'], ['PUT', '/10', 'update'], ['DELETE', '/10', 'delete']];
for (const [method, url, nome] of operacoes) {
  for (const [token, esperado] of [['11', 200], ['12', 200], ['13', nome === 'listar' ? 200 : 404], ['21', nome === 'listar' ? 200 : 404]]) {
    test(nome + ': autorização e resposta para usuário ' + token, async (t) => {
      const ctx = preparar(t);
      const res = await ctx.solicitar(method, url, { descricao: 'Nova', id_ambiente: B }, token);
      assert.equal(res.statusCode, esperado);
      if (nome === 'listar') {
        const lista = res.body.data;
        assert.ok(Array.isArray(lista));
        const ambiente = token === '21' ? B : A;
        assert.ok(lista.every((e) => e.ambiente === ambiente));
        assert.equal(res.body.total, lista.length);
        if (token === '13') assert.equal(lista.length, 0);
      }
      if (esperado === 404) assert.deepEqual(ctx.estado.escritas, []);
      assert.deepEqual(ctx.estado.fisicas, [], 'DELETE de legado/compartilhado não remove bytes');
    });
  }
  for (const condicao of ['semJWT', 'invalido', 'usuarioInativo', 'ambienteInativo', 'perfilRevogado']) {
    test(nome + ': revalida ' + condicao, async (t) => {
      const ctx = preparar(t);
      if (condicao === 'usuarioInativo') ctx.estado.usuarios.get(11).ativo = false;
      if (condicao === 'ambienteInativo') ctx.estado.usuarios.get(11).ambienteAtivo = false;
      if (condicao === 'perfilRevogado') ctx.estado.usuarios.get(11).perfil_acesso = 'ENGENHEIRO_SEGURANCA';
      const res = await ctx.solicitar(method, url, {}, condicao === 'semJWT' ? null : condicao === 'invalido' ? 'invalido' : '11');
      assert.equal(res.statusCode, condicao === 'perfilRevogado' ? (nome === 'listar' ? 200 : 404) : 401);
      if (condicao === 'perfilRevogado' && nome === 'listar') assert.deepEqual(res.body.data, []);
      assert.deepEqual(ctx.estado.escritas, []);
    });
  }
  test(nome + ': falha técnica continua 500 seguro', async (t) => {
    const ctx = preparar(t); ctx.estado.falha = true;
    const res = await ctx.solicitar(method, url);
    assert.equal(res.statusCode, 500);
    assert.equal(JSON.stringify(res.body).includes('SEGREDO'), false);
  });
}
test('PUT usa GPS esperado, preserva zero e não envia campos antigos omitidos', async (t) => {
  const ctx = preparar(t);
  const res = await ctx.solicitar('PUT', '/10', { descricao: 'Nova' });
  assert.equal(res.statusCode, 200);
  const chamada = ctx.estado.eventos.find((e) => e[0] === 'update');
  assert.deepEqual(chamada[2], { descricao: 'Nova' });
  assert.deepEqual(chamada[4], { gpsEsperado: gps });
  assert.equal(res.body.data.latitude, 0);
});
test('PUT conserva CONFLITO_GPS sem nova tentativa', async (t) => {
  const ctx = preparar(t); ctx.estado.conflito = true;
  assert.equal((await ctx.solicitar('PUT', '/10', { descricao: 'Nova' })).statusCode, 409);
  assert.deepEqual(ctx.estado.escritas, []);
});
test('PUT não associa caminho externo', async (t) => {
  const ctx = preparar(t);
  assert.equal((await ctx.solicitar('PUT', '/10', { caminho_arquivo: 'uploads/evidencias/legado-20.jpg' })).statusCode, 400);
  assert.deepEqual(ctx.estado.escritas, []);
});
test('POST JSON não aceita caminho bruto', async (t) => {
  const ctx = preparar(t);
  assert.equal((await ctx.solicitar('POST', '/', { id_local: 10, tipo: 'FOTO', caminho_arquivo: 'uploads/evidencias/legado-20.jpg' })).statusCode, 400);
  assert.equal(ctx.estado.eventos.some((e) => e[0] === 'criar'), false);
});
for (const token of ['11', '21', '13']) {
  test('Upload valida local antes de persistir para usuário ' + token, async (t) => {
    const ctx = preparar(t);
    const res = await ctx.solicitar('POST', '/upload', { id_local: 10 }, token, { buffer: Buffer.from('JPEG_VALIDO'), mimetype: 'image/jpeg', originalname: 'foto.jpg' });
    assert.equal(res.statusCode, token === '11' ? 201 : 404);
    if (token !== '11') assert.equal(ctx.estado.eventos.some((e) => e[0] === 'persistir'), false);
    else assert.ok(ctx.estado.eventos.findIndex((e) => e[0] === 'local') < ctx.estado.eventos.findIndex((e) => e[0] === 'persistir'));
    assert.deepEqual(ctx.estado.fisicas, []);
  });
}
test('Upload inválido não persiste arquivo', async (t) => {
  const ctx = preparar(t);
  const res = await ctx.solicitar('POST', '/upload', { id_local: 10 }, '11', { buffer: Buffer.from('FALSO'), mimetype: 'image/jpeg', originalname: 'foto.jpg' });
  assert.equal(res.statusCode, 400);
  assert.equal(ctx.estado.eventos.some((e) => e[0] === 'persistir'), false);
});
test('Upload repetido retorna 200 antes de persistência física', async (t) => {
  const ctx = preparar(t); ctx.estado.registros.get(10).id_operacao_cliente = chave;
  const res = await ctx.solicitar('POST', '/upload', { id_local: 10, id_operacao_cliente: chave }, '11', { buffer: Buffer.from('JPEG_VALIDO'), mimetype: 'image/jpeg', originalname: 'foto.jpg' });
  assert.equal(res.statusCode, 200);
  assert.equal(ctx.estado.eventos.some((e) => e[0] === 'persistir'), false);
  assert.deepEqual(ctx.estado.fisicas, []);
});

for (const [method, url, nome] of operacoes) {
  for (const token of ['21', '22']) {
    test(nome + ': acesso legítimo do ambiente B/' + token, async (t) => {
      const ctx = preparar(t);
      const res = await ctx.solicitar(method, url.replace(/10/g, '20'), { descricao: 'Nova B' }, token);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.status, 'success');
      if (Array.isArray(res.body.data)) assert.ok(res.body.data.every((e) => e.ambiente === B));
      else assert.equal(res.body.data.id_evidencia, 20);
      assert.deepEqual(ctx.estado.fisicas, []);
    });
  }
}
test('PUT com revogação entre leitura e escrita retorna 404 sem alteração', async (t) => {
  const ctx = preparar(t); ctx.estado.revogarAposLeitura = true;
  assert.equal((await ctx.solicitar('PUT', '/10', { descricao: 'Indevida' })).statusCode, 404);
  assert.deepEqual(ctx.estado.escritas, []);
});
test('PUT ignora identidade e perfil forjados e preserva caminho igual sem reenviá-lo', async (t) => {
  const ctx = preparar(t);
  const res = await ctx.solicitar('PUT', '/10', { descricao: 'Nova', caminho_arquivo: 'uploads/evidencias/legado-10.jpg', id_usuario: 21, id_ambiente: B, perfil_acesso: 'ADMINISTRADOR' });
  assert.equal(res.statusCode, 200);
  const escrita = ctx.estado.eventos.find((e) => e[0] === 'update');
  assert.deepEqual(escrita[2], { descricao: 'Nova' });
  assert.deepEqual(escrita[3], { id_usuario: 11, id_ambiente: A });
});
test('DELETE mantém arquivo compartilhado e registro externo intactos', async (t) => {
  const ctx = preparar(t);
  ctx.estado.registros.get(20).caminho_arquivo = ctx.estado.registros.get(10).caminho_arquivo;
  assert.equal((await ctx.solicitar('DELETE', '/10')).statusCode, 200);
  assert.equal(ctx.estado.registros.has(10), false);
  assert.equal(ctx.estado.registros.has(20), true);
  assert.deepEqual(ctx.estado.fisicas, []);
});
for (const condicao of ['semJWT', 'invalido', 'usuarioInativo', 'ambienteInativo', 'perfilRevogado']) {
  test('Upload revalida ' + condicao + ' antes de gravar', async (t) => {
    const ctx = preparar(t);
    if (condicao === 'usuarioInativo') ctx.estado.usuarios.get(11).ativo = false;
    if (condicao === 'ambienteInativo') ctx.estado.usuarios.get(11).ambienteAtivo = false;
    if (condicao === 'perfilRevogado') ctx.estado.usuarios.get(11).perfil_acesso = 'ENGENHEIRO_SEGURANCA';
    const res = await ctx.solicitar('POST', '/upload', { id_local: 10 }, condicao === 'semJWT' ? null : condicao === 'invalido' ? 'invalido' : '11', { buffer: Buffer.from('JPEG_VALIDO'), mimetype: 'image/jpeg', originalname: 'foto.jpg' });
    assert.equal(res.statusCode, condicao === 'perfilRevogado' ? 404 : 401);
    assert.equal(ctx.estado.eventos.some((e) => e[0] === 'persistir'), false);
    if (condicao !== 'perfilRevogado') assert.equal(ctx.estado.eventos.some((e) => e[0] === 'multipart'), false);
  });
}
for (const falha of ['falhaPersistir', 'falhaCriar', 'falhaResposta']) {
  test('Upload protege arquivos diante de ' + falha, async (t) => {
    const ctx = preparar(t); ctx.estado[falha] = true;
    const res = await ctx.solicitar('POST', '/upload', { id_local: 10 }, '11', { buffer: Buffer.from('JPEG_VALIDO'), mimetype: 'image/jpeg', originalname: 'foto.jpg' });
    assert.equal(res.statusCode, falha === 'falhaResposta' ? 201 : 500);
    assert.deepEqual(ctx.estado.fisicas, [], 'Falha não comprova que um arquivo pode ser removido');
    if (falha === 'falhaPersistir') assert.equal(ctx.estado.eventos.some((e) => e[0] === 'criar'), false);
  });
}

for (const caminho of ['uploads/evidencias/legado-20.jpg', '../../fora.jpg', 'C:\\privado\\externo.jpg']) {
  for (const method of ['POST', 'PUT']) {
    test(method + ': rejeita caminho arbitrário preservando todos os registros legados: ' + caminho, async (t) => {
      const ctx = preparar(t);
      const antes = structuredClone([...ctx.estado.registros]);
      const res = await ctx.solicitar(method, method === 'POST' ? '/' : '/10', {
        id_local: 10, tipo: 'FOTO', descricao: 'Não persistir', latitude: 0, longitude: 0,
        caminho_arquivo: caminho,
      });
      assert.equal(res.statusCode, 400);
      assert.deepEqual([...ctx.estado.registros], antes);
      assert.deepEqual(ctx.estado.escritas, []);
      assert.deepEqual(ctx.estado.fisicas, []);
      assert.equal(ctx.estado.eventos.some((e) => ['criar', 'update', 'persistir'].includes(e[0])), false);
      assert.equal(JSON.stringify(res.body).includes(caminho), false);
    });
  }
}
for (const valor of [undefined, null, '']) {
  test('POST JSON preserva cadastro sem associação física: ' + String(valor), async (t) => {
    const ctx = preparar(t);
    const antes = structuredClone([...ctx.estado.registros]);
    const body = { id_local: 10, tipo: 'TEXTO', descricao: 'Sem arquivo', latitude: 0, longitude: 0 };
    if (valor !== undefined) body.caminho_arquivo = valor;
    const res = await ctx.solicitar('POST', '/', body);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.caminho_arquivo, null);
    assert.equal(res.body.data.latitude, 0);
    assert.equal(res.body.data.longitude, 0);
    assert.deepEqual([...ctx.estado.registros], antes);
    assert.deepEqual(ctx.estado.fisicas, []);
  });
}
for (const [tipo, mimetype, buffer, originalname, extensao] of [
  ['FOTO', 'image/jpeg', Buffer.from('JPEG_VALIDO'), 'foto.jpg', '.jpg'],
  ['DOCUMENTO', 'application/pdf', Buffer.from('PDF_VALIDO'), 'documento.pdf', '.pdf'],
]) {
  test('Política de caminhos preserva upload gerenciado de ' + tipo + ' e GPS zero', async (t) => {
    const ctx = preparar(t);
    const antes = structuredClone([...ctx.estado.registros]);
    const res = await ctx.solicitar('POST', '/upload', {
      id_local: 10, latitude: 0, longitude: 0, origem_coordenadas: 'GPS', precisao_gps: 0,
      data_captura_gps: '2026-10-15T12:00:00.000Z', caminho_arquivo: 'uploads/evidencias/legado-20.jpg',
    }, '12', { mimetype, buffer, originalname });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.tipo, tipo);
    assert.equal(res.body.data.id_usuario, 12);
    assert.equal(res.body.data.caminho_arquivo, 'uploads/evidencias/novo-gerenciado' + extensao);
    assert.equal(res.body.data.latitude, 0);
    assert.equal(res.body.data.longitude, 0);
    assert.equal(res.body.data.precisao_gps, 0);
    assert.deepEqual([...ctx.estado.registros], antes);
    assert.deepEqual(ctx.estado.fisicas, []);
  });
}
