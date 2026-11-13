const politicaRbac723 = require('../src/utils/permissoes');
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const dados = { id_local: 10, nome_responsavel_tecnico: 'Tecnico', crea: 'CREA', numero_art: 'ART', data_art: '2026-10-18' };
const operacoes = [['POST', '/', 'criar'], ['GET', '/', 'listar'], ['GET', '/10', 'buscar'], ['GET', '/local/10', 'buscarLocal'], ['PUT', '/10', 'atualizar'], ['DELETE', '/10', 'excluir'], ['GET', '/10/completo', 'completo'], ['POST', '/10/gerar-pdf', 'gerar'], ['GET', '/10/pdf', 'pdf']];

function preparar(t) {
  const estado = { usuarios: new Map(), campanhas: new Map(), locaisReais: new Map(), registros: new Map(), globais: [], escritas: [], chamadas: [], identidades: [], logs: [], revogado: false, erro: null, iniciada: false, falhaEnvio: false };
  for (const [ambiente, base] of [[A, 10], [B, 20]]) {
    for (const [n, perfil] of [[1, 'ADMINISTRADOR'], [2, 'ENGENHEIRO_SEGURANCA'], [3, 'ENGENHEIRO_SEGURANCA']]) estado.usuarios.set(base + n, { id_usuario: base + n, id_ambiente: ambiente, eh_fundador: perfil === "ADMINISTRADOR", perfil_acesso: perfil, ativo: true, ambienteAtivo: true });
    estado.campanhas.set(base, { id_campanha: base, id_ambiente: ambiente, id_usuario: base + 2 });
    estado.locaisReais.set(base, { id_local: base, id_campanha: base });
    estado.registros.set(base, { id_relatorio: base, id_local: base, id_usuario_responsavel: base + 3, nome_responsavel_tecnico: 'Historico', crea: 'CREA', numero_art: 'ART', data_art: '2026-10-18', status: 'RASCUNHO', caminho_pdf: 'uploads/relatorios/relatorio-' + base + '-123.pdf', hash_pdf: 'a'.repeat(64) });
  }
  const falhar = () => { if (estado.aoConsultar) estado.aoConsultar(); if (estado.erro) throw estado.erro; };
  const permitido = (id, u) => {
    const local = estado.locaisReais.get(id);
    const c = estado.campanhas.get(local?.id_campanha), atual = estado.usuarios.get(u?.id_usuario);
    return !!(c && atual?.ativo && atual.ambienteAtivo && !estado.revogado && c.id_ambiente === u.id_ambiente && atual.id_ambiente === u.id_ambiente && ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR','SUPERVISOR','AUDITOR','VISUALIZADOR'].includes(atual.perfil_acesso));
  };
  estado.fisico = [];
  estado.geracoes = new Map();
  estado.arquivos = new Map();
  const completo = r => ({ ...r, nome_local: 'LOCAL_' + r.id_local, nome_campanha: 'CAMPANHA_' + r.id_local, criterio_a: 'SIM', oxigenio: 0, evidencias: [{ id_evidencia: r.id_local * 10, tipo: 'FOTO', caminho_arquivo: 'uploads/evidencias/foto-' + r.id_local + '.jpg', latitude: 0, longitude: 0 }] });
  const autorizado = (id, u) => { falhar(); const r = estado.registros.get(id); return r && permitido(r.id_local, u) ? r : null; };
  const repo = {
    async listarPermitidosNoAmbiente(u) { falhar(); return [...estado.registros.values()].filter(r => permitido(r.id_local, u)); },
    async buscarPorIdNoAmbiente(id, u) { return autorizado(id, u); },
    async buscarPorLocalNoAmbiente(id, u) { falhar(); return [...estado.registros.values()].find(r => r.id_local === id && permitido(id, u)) || null; },
    async buscarLocalAutorizadoNoAmbiente(id, u) { falhar(); return permitido(id, u) ? { id_local: id } : null; },
    async criarNoAmbiente(d, u) { falhar(); if (!permitido(d.id_local, u)) return null; estado.escritas.push('INSERT'); return { ...d, id_relatorio: 99, id_usuario_responsavel: u.id_usuario }; },
    async atualizarNoAmbiente(id, d, u) { const r = autorizado(id, u); if (!r) return null; estado.escritas.push('UPDATE'); return Object.assign(r, d); },
    async excluirNoAmbiente(id, u) { const r = autorizado(id, u); if (!r) return null; estado.escritas.push('DELETE'); estado.registros.delete(id); return r; },
    async buscarCompletoNoAmbiente(id, u) { const r = autorizado(id, u); return r ? completo(r) : null; },
    async gerarNoAmbiente(id, u, gerar) {
      const r = autorizado(id, u); if (!r) return null;
      const arquivo = await gerar({ ...completo(r), idioma_solicitante: estado.usuarios.get(u.id_usuario).idioma });
      const geracao = { id_geracao: arquivo.idGeracao, id_relatorio: id, id_ambiente: u.id_ambiente, id_solicitante: u.id_usuario,
        idioma: arquivo.idioma, caminho_pdf: arquivo.caminhoRelativo, hash_pdf: arquivo.hash, versao_template: 'nr33-i18n-1' };
      estado.geracoes.set(geracao.id_geracao, geracao);
      estado.escritas.push('PDF');
      return { relatorio: Object.assign(r, { status: 'GERADO' }), geracao, arquivo: { caminho: arquivo.caminhoRelativo, hash_sha256: arquivo.hash } };
    },
    async listarGeracoesNoAmbiente(id, u, idioma) {
      const r = autorizado(id, u); if (!r) return null;
      return { geracoes: [...estado.geracoes.values()].filter(g => g.id_relatorio === id && g.id_ambiente === u.id_ambiente && g.idioma === idioma),
        legado: r.caminho_pdf ? { legado: true, idioma: null } : null };
    },
    async comGeracaoAutorizada(id, u, uuid, executar) {
      const r = autorizado(id, u); if (!r) return null;
      const g = estado.geracoes.get(uuid);
      if (!g || g.id_relatorio !== id || g.id_ambiente !== u.id_ambiente) throw Object.assign(Error('Geração PDF não encontrada.'), { statusCode: 404 });
      return executar(g, r);
    },
    async comRelatorioAutorizado(id, u, executar) { const r = autorizado(id, u); return r ? executar(r) : null; },
  };
  const legadoRepo = {
    async listarTodos() { falhar(); estado.globais.push('listar'); return [...estado.registros.values()]; },
    async listarPorUsuarioResponsavel(id) { falhar(); estado.globais.push('listarResponsavel'); return [...estado.registros.values()].filter(r => estado.campanhas.get(r.id_local)?.id_usuario === id); },
    async buscarPorId(id) { falhar(); estado.globais.push('buscar'); return estado.registros.get(id) || null; },
    async buscarPorLocal(id) { falhar(); estado.globais.push('buscarLocal'); return [...estado.registros.values()].find(r => r.id_local === id) || null; },
    async buscarDadosCompletos(id) { falhar(); estado.globais.push('completo'); const r = estado.registros.get(id); return r ? completo(r) : null; },
    async criar(d) { falhar(); estado.escritas.push('INSERT GLOBAL'); return { id_relatorio: 99, ...d }; },
    async atualizar(id, d) { falhar(); estado.escritas.push('UPDATE GLOBAL'); return Object.assign(estado.registros.get(id), d); },
    async excluir(id) { falhar(); estado.escritas.push('DELETE GLOBAL'); const r = estado.registros.get(id); estado.registros.delete(id); return r; },
  };
  const pdf = { async gerarPdfRelatorio(d, opcoes) { estado.fisico.push(['renderizar', d.id_local]); estado.idiomaRenderizado = opcoes.idioma; estado.statusRenderizado = d.status; if (estado.falhaRender) throw estado.falhaRender; if (opcoes?.somenteBuffer) return Buffer.from('%PDF-1.7 ' + opcoes.idioma + ' ' + d.nome_local + ' %%EOF'); return { caminhoRelativo: 'uploads/relatorios/gerado.pdf', hash: 'a'.repeat(64) }; } };
  const arquivos = {
    async lerFoto(e) { estado.fisico.push(['foto', e.id_evidencia]); return Buffer.from('IMAGEM'); },
    async persistirPdf(buffer, u, id) {
      estado.fisico.push(['persistir', id, u.id_ambiente]); if (estado.falhaPersistir) throw estado.falhaPersistir;
      const idGeracao = require('crypto').randomUUID();
      const caminhoRelativo = `uploads/relatorios/relatorio-${id}-${u.id_ambiente}_${idGeracao}.pdf`;
      estado.arquivos.set(caminhoRelativo, Buffer.from(buffer));
      return { idGeracao, caminhoRelativo, hash: require('crypto').createHash('sha256').update(buffer).digest('hex') };
    },
    async lerPdf(r) {
      estado.fisico.push(['ler', r.id_relatorio]); if (estado.falhaArquivo) throw estado.falhaArquivo;
      return { buffer: estado.arquivos.get(r.caminho_pdf) || Buffer.from('%PDF-1.7 LOCAL_' + r.id_local + ' %%EOF'), modificado: new Date('2026-10-18T00:00:00Z') };
    },
  };
  const paths = Object.fromEntries(Object.entries({ router: '../src/routes/relatorioRoutes', controller: '../src/controllers/relatorioController', legado: '../src/services/relatorioService', auth: '../src/middlewares/autenticacaoMiddleware' }).map(([k,p]) => [k, require.resolve(p)]));
  paths.service = require('node:path').resolve(__dirname, '../src/services/relatorioMultiTenantService.js');
  const cache = new Map(Object.values(paths).map(p => [p, require.cache[p]]));
  const load = Module._load, mapas = new Map(), proibidas = [];
  const segredo = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'FICTICIO_DADOS_TECNICOS';
  let router;
  try {
    for (const p of cache.keys()) delete require.cache[p];
    Module._load = function(request, parent, ...args) {
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (request === '../utils/permissoes') return politicaRbac723;
      if (request === '../utils/idiomaPdf') return require('../src/utils/idiomaPdf');
      // Utilitario puro real, restrito aos tres consumidores autorizados.
      if (request === '../utils/normalizarIdDominio' && ['middlewares/autenticacaoMiddleware', 'services/authService', 'services/relatorioMultiTenantService'].some(p => parent?.filename === require.resolve('../src/' + p))) return require('../src/utils/normalizarIdDominio');
      if (cache.has(parent?.filename)) {
        if (!mapas.get(parent.filename)?.has(request)) { proibidas.push(request); throw new Error('Dependência proibida: ' + request); }
        return mapas.get(parent.filename).get(request);
      }
      return load.call(this, request, parent, ...args);
    };
    mapas.set(paths.legado, new Map([['../repositories/relatorioRepository', legadoRepo], ['../repositories/localRepository', { async buscarPorId(id) { return estado.locaisReais.get(Number(id)) || null; } }], ['../repositories/campanhaRepository', { async buscarPorId(id) { return estado.campanhas.get(id) || null; } }], ['./pdfService', pdf]]));
    const legado = require(paths.legado);
    let service;
    if (require('node:fs').existsSync(paths.service)) {
      mapas.set(paths.service, new Map([['../repositories/relatorioMultiTenantRepository', repo], ['./pdfService', pdf], ['../utils/relatorioArquivoUtils', arquivos]]));
      service = require(paths.service);
    }
    estado.argumentosServico = [];
    for (const alvo of [legado, service].filter(Boolean)) for (const nome of ['criarRelatorio', 'listarRelatorios', 'buscarRelatorioPorId', 'buscarRelatorioPorLocal', 'atualizarRelatorio', 'excluirRelatorio', 'buscarRelatorioCompleto', 'gerarPdfRelatorio', 'obterPdfParaDownload']) {
      const original = alvo[nome];
      t.mock.method(alvo, nome, (...args) => { estado.argumentosServico.push({ nome, args }); return original(...args); });
    }
    mapas.set(paths.controller, new Map([['../services/relatorioService', legado], ['../services/relatorioMultiTenantService', service], ['fs', { existsSync(p) { estado.fisico.push(['exists', p]); return true; } }], ['path', require('node:path')]]));
    const controller = require(paths.controller);
    mapas.set(paths.auth, new Map([
      ['jsonwebtoken', { verify(token) { if (['invalido', 'adulterado'].includes(token)) throw new Error('JWT inválido'); return { sub: token, perfil: 'ADMINISTRADOR', id_ambiente: B }; } }],
      ['../repositories/usuarioRepository', { async buscarIdentidadeAutenticada(id) { estado.identidades.push(id); const u = estado.usuarios.get(id); return u?.ativo && u.ambienteAtivo ? u : null; } }],
    ]));
    const auth = require(paths.auth);
    mapas.set(paths.router, new Map([['express', express], ['../controllers/relatorioController', controller], ['../middlewares/autenticacaoMiddleware', auth]]));
    router = require(paths.router);
  } finally {
    Module._load = load;
    for (const [p, anterior] of cache) { if (anterior) require.cache[p] = anterior; else delete require.cache[p]; }
  }
  t.mock.method(console, 'error', (...args) => estado.logs.push(args));
  t.after(() => { if (segredo === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = segredo; assert.deepEqual(proibidas, []); });
  async function solicitar(method, url, token = '11', body = { ...dados, status: 'RASCUNHO' }) {
    // Por padrão POST usa um local sem relatorio; duplicidade é cenário separado.
    // Locais/campanhas continuam existindo independentemente dos registros.
    if (method === 'POST' && url === '/' && !estado.duplicado) {
      for (const [id, ch] of estado.registros) if (ch.id_local === Number(body?.id_local)) estado.registros.delete(id);
    }
    let concluir;
    const fim = new Promise(resolve => { concluir = resolve; });
    const req = { method, url, headers: token === null ? {} : { authorization: 'Bearer ' + token }, body, query: { id_usuario: 21, id_ambiente: B, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR', ...Object.fromEntries(new URL(url, 'http://teste').searchParams) }, usuario: { id_usuario: 21, id_ambiente: B, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR' } };
    if (estado.range !== undefined) req.range = () => estado.range;
    let envios = 0;
    const res = { headersSent: estado.iniciada, statusCode: 200, status(n) { this.statusCode = n; return this; }, json(value) { envios++; this.body = value; this.headersSent = true; concluir(); if (estado.falhaEnvio) throw new Error('Falha de transporte'); return this; } };
    if (estado.iniciada) Object.defineProperty(res, 'headersSent', { get() { concluir(); return true; } });
    res.headers = {}; res.setHeader = (k,v) => { res.headers[k.toLowerCase()] = v; }; res.send = b => { envios++; res.body = b; res.headersSent = true; concluir(); if (estado.falhaEnvio) throw new Error('Falha de transporte'); return res; }; res.end = () => { envios++; res.headersSent = true; concluir(); return res; }; res.download = (p,n) => { estado.fisico.push(['download', p]); return res.send(Buffer.from('%PDF_LEGADO')); };
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
    if (!estado.iniciada && !estado.iniciadaDurante && res.statusCode !== 416 && method !== 'HEAD') assert.ok(res.body);
    return { req, res };
  }
  return { estado, solicitar };
}

test('primeiro PDF recebe status GERADO', async t => {
  const ctx = preparar(t);
  const registro = ctx.estado.registros.get(10);

  assert.equal(registro.status, 'RASCUNHO');

  const { res } = await ctx.solicitar(
    'POST', '/10/gerar-pdf', '11'
  );

  assert.equal(res.statusCode, 200);
  assert.equal(ctx.estado.statusRenderizado, 'GERADO');
  assert.equal(registro.status, 'GERADO');
  assert.equal(res.body.data.relatorio.status, 'GERADO');
});

for (const [method, url, nome] of operacoes) {
  for (const [token, id] of [['11', 10], ['21', 20], ['12', 10], ['22', 20]]) test(nome + ': legítimo ' + token, async t => {
    const ctx = preparar(t); const { res, req } = await ctx.solicitar(method, url.replace('10', id), token, { ...dados, id_local: id });
    assert.equal(res.statusCode, nome === 'criar' ? 201 : 200);
    if (nome === 'pdf') { assert.ok(Buffer.isBuffer(res.body)); assert.ok(res.body.toString().includes('LOCAL_' + id)); assert.equal(res.headers['content-type'], 'application/pdf'); }
    else if (nome === 'listar') { assert.equal(res.body.total, 1); assert.deepEqual(res.body.data.map(r => r.id_local), [id]); }
    else if (nome === 'gerar') assert.equal(res.body.data.relatorio.id_local, id);
    else assert.equal(res.body.data.id_local, id);
    assert.deepEqual(ctx.estado.identidades, [Number(token)]); assert.deepEqual(ctx.estado.globais, []);
    assert.ok(ctx.estado.argumentosServico.at(-1).args.includes(req.usuario));
  });
  for (const condicao of ['semJWT', 'invalido', 'adulterado', 'usuarioInativo', 'ambienteInativo', 'perfilRevogado', 'responsavelAlterado']) test(nome + ': revalida ' + condicao, async t => {
    const ctx = preparar(t);
    if (condicao === 'usuarioInativo') ctx.estado.usuarios.get(11).ativo = false;
    if (condicao === 'ambienteInativo') ctx.estado.usuarios.get(11).ambienteAtivo = false;
    if (condicao === 'perfilRevogado') ctx.estado.usuarios.get(12).perfil_acesso = 'AUDITOR';
    if (condicao === 'responsavelAlterado') ctx.estado.campanhas.get(10).id_usuario = 13;
    const token = condicao === 'semJWT' ? null : ['invalido', 'adulterado'].includes(condicao) ? condicao : ['perfilRevogado','responsavelAlterado'].includes(condicao) ? '12' : '11';
    const { res } = await ctx.solicitar(method, url, token);
    if (['perfilRevogado','responsavelAlterado'].includes(condicao)) {
      assert.equal(res.statusCode, condicao === 'perfilRevogado' ? method === 'GET' ? 200 : 403 : nome === 'criar' ? 201 : 200);
      if (nome === 'listar') assert.equal(res.body.data.length, 1);
      if (condicao === 'perfilRevogado') assert.deepEqual(ctx.estado.escritas, []);
      return;
    }
    assert.equal(res.statusCode, 401);
    assert.deepEqual(ctx.estado.escritas, []); assert.deepEqual(ctx.estado.fisico, []);
  });
  test(nome + ': falha técnica segura sem arquivo', async t => {
    const ctx = preparar(t); ctx.estado.erro = new Error('SQL_TOKEN_CAMINHO_SENSIVEL'); const { res } = await ctx.solicitar(method, url);
    assert.equal(res.statusCode, 500); assert.equal(JSON.stringify(res.body).includes('SQL_TOKEN'), false); assert.deepEqual(ctx.estado.fisico, []);
  });
  test(nome + ': headersSent impede segunda resposta', async t => { const ctx = preparar(t); ctx.estado.iniciada = true; await ctx.solicitar(method, url); assert.deepEqual(ctx.estado.escritas, []); assert.deepEqual(ctx.estado.fisico, []); });
}
for (const [method, url, nome] of operacoes.filter(o => o[2] !== 'listar')) for (const token of ['21', '13']) test(nome + ": recurso conforme ambiente e capacidade " + token, async t => {
  const ctx = preparar(t); const { res } = await ctx.solicitar(method, url, token);
    if (token === '13') {
      assert.equal(res.statusCode, nome === 'criar' ? 201 : 200);
      assert.deepEqual(ctx.estado.identidades, [13]);
      return;
    }
  assert.equal(res.statusCode, 404); assert.deepEqual(ctx.estado.escritas, []); assert.deepEqual(ctx.estado.fisico, []);
});
test('PUT omitido preserva ART e campos gerenciados apesar do corpo forjado', async t => {
  const ctx = preparar(t); const { res } = await ctx.solicitar('PUT', '/10', '12', { crea: '', id_local: 20, id_ambiente: B, id_usuario_responsavel: 21, caminho_pdf: '../../externo.pdf', hash_pdf: 'forjado' });
  assert.equal(res.statusCode, 200); assert.equal(res.body.data.crea, null); assert.equal(res.body.data.numero_art, 'ART'); assert.equal(res.body.data.id_local, 10); assert.equal(res.body.data.caminho_pdf, 'uploads/relatorios/relatorio-10-123.pdf');
});

for (const [method, url, nome] of operacoes) {
  test(nome + ': resposta iniciada durante consulta não é sobrescrita', async t => {
    const ctx = preparar(t); ctx.estado.aoConsultar = () => {
      ctx.estado.iniciadaDurante = true; ctx.estado.resAtual.headersSent = true; ctx.estado.concluirResposta();
    };
    const { res } = await ctx.solicitar(method, url); assert.equal(res.body, undefined);
    // Operações já autorizadas podem concluir; nunca enviar outra resposta.
    assert.deepEqual(ctx.estado.globais, []);
  });
  test(nome + ': falha de envio após headers não provoca segundo envio', async t => {
    const ctx = preparar(t); ctx.estado.falhaEnvio = true;
    const { res } = await ctx.solicitar(method, url); assert.equal(res.headersSent, true);
  });
}
for (const [code, status] of [['ENOENT', 404], ['EACCES', 500], ['EIO', 500]]) test('download: erro físico seguro ' + code, async t => {
  const ctx = preparar(t); ctx.estado.falhaArquivo = Object.assign(new Error('SEGREDO SQL TOKEN /arquivo/interno'), { code });
  const { res } = await ctx.solicitar('GET', '/10/pdf'); assert.equal(res.statusCode, status);
  assert.equal(res.body.status, 'error'); assert.doesNotMatch(JSON.stringify(res.body), /SEGREDO|SQL|TOKEN|\/arquivo\/interno/);
});
for (const campo of ['falhaRender', 'falhaPersistir']) test('geração: falha segura em ' + campo, async t => {
  const ctx = preparar(t); const anterior = { ...ctx.estado.registros.get(10) };
  ctx.estado[campo] = new Error('SEGREDO /arquivo/interno'); const { res } = await ctx.solicitar('POST', '/10/gerar-pdf');
  assert.equal(res.statusCode, 500); assert.deepEqual(ctx.estado.registros.get(10), anterior); assert.deepEqual(ctx.estado.escritas, []);
  if (campo === 'falhaRender') assert.ok(!ctx.estado.fisico.some(c => c[0] === 'persistir'));
});
test('download: preserva Range e cabeçalhos sem reabrir arquivo por caminho', async t => {
  const ctx = preparar(t); ctx.estado.range = Object.assign([{ start: 0, end: 4 }], { type: 'bytes' });
  const { res } = await ctx.solicitar('GET', '/10/pdf'); assert.equal(res.statusCode, 206); assert.equal(res.body.toString(), '%PDF-');
  assert.equal(res.headers['content-length'], 5); assert.equal(res.headers['content-disposition'], 'attachment; filename="relatorio-10.pdf"');
  assert.equal(res.headers['cache-control'], 'private, no-store'); assert.equal(res.headers['accept-ranges'], 'bytes'); assert.match(res.headers['content-range'], /^bytes 0-4\//);
  assert.deepEqual(ctx.estado.fisico, [['ler', 10]]);
});
test('download: Range fora do arquivo retorna 416 sem conteúdo', async t => {
  const ctx = preparar(t); ctx.estado.range = -1; const { res } = await ctx.solicitar('GET', '/10/pdf');
  assert.equal(res.statusCode, 416); assert.equal(res.body, undefined); assert.match(res.headers['content-range'], /^bytes \*\//);
});


for (const valor of ['en', 'pt-BR', 'fr', null, undefined]) test('idioma efetivo e solicitante autenticado: ' + String(valor), async t => {
  const c = preparar(t);
  c.estado.usuarios.get(12).idioma = 'en';
  const anterior = { ...c.estado.registros.get(10) };
  const body = { id_ambiente: B, id_usuario: 21, ...(valor === undefined ? {} : { idioma: valor }) };
  const { res } = await c.solicitar('POST', '/10/gerar-pdf', '12', body);
  assert.equal(res.statusCode, 200);
  const g = res.body.data.geracao;
  assert.equal(g.idioma, valor === undefined || valor === 'en' ? 'en' : 'pt-BR');
  assert.equal(c.estado.idiomaRenderizado, g.idioma);
  assert.equal(g.id_solicitante, 12); assert.equal(g.id_ambiente, A);
  assert.notEqual(g.id_solicitante, anterior.id_usuario_responsavel);
  assert.equal(c.estado.registros.get(10).caminho_pdf, anterior.caminho_pdf);
  assert.equal(c.estado.registros.get(10).hash_pdf, anterior.hash_pdf);
});

test('POST sempre cria geração única; GET/HEAD exatos não geram e não misturam idiomas', async t => {
  const c = preparar(t), geracoes = [];
  for (const idioma of ['en', 'pt-BR', 'en']) {
    const { res } = await c.solicitar('POST', '/10/gerar-pdf', '12', { idioma });
    assert.equal(res.statusCode, 200); geracoes.push(res.body.data.geracao);
  }
  assert.equal(new Set(geracoes.map(g => g.id_geracao)).size, 3);
  assert.equal(new Set(geracoes.map(g => g.caminho_pdf)).size, 3);
  const escritas = c.estado.escritas.length;
  for (const g of geracoes) for (const method of ['GET', 'HEAD']) {
    const url = `/10/geracoes-pdf/${g.id_geracao}/pdf?idioma=${g.idioma}`;
    const { res } = await c.solicitar(method, url, '13');
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-language'], g.idioma);
    assert.equal(res.headers['x-pdf-geracao'], g.id_geracao);
    assert.equal(res.headers['cache-control'], 'private, no-store');
    if (method === 'GET') assert.ok(res.body.toString().includes(g.idioma)); else assert.equal(res.body, undefined);
  }
  const g = geracoes[0];
  assert.equal((await c.solicitar('GET', `/10/geracoes-pdf/${g.id_geracao}/pdf?idioma=pt-BR`)).res.statusCode, 409);
  assert.equal((await c.solicitar('GET', `/20/geracoes-pdf/${g.id_geracao}/pdf?idioma=en`, '21')).res.statusCode, 404);
  assert.equal((await c.solicitar('GET', `/10/geracoes-pdf/${g.id_geracao}/pdf?idioma=en`, '21')).res.statusCode, 404);
  assert.equal((await c.solicitar('GET', `/10/geracoes-pdf/${g.id_geracao}/pdf`, null)).res.statusCode, 401);
  assert.equal(c.estado.escritas.length, escritas);
  const { res } = await c.solicitar('GET', '/10/geracoes-pdf?idioma=en', '13');
  assert.deepEqual(res.body.data.geracoes.map(g => g.idioma), ['en', 'en']);
  assert.equal(res.body.data.legado.idioma, null);
  assert.equal((await c.solicitar('GET', '/10/pdf?idioma=en')).res.statusCode, 404);
  assert.equal((await c.solicitar('HEAD', '/10/pdf')).res.statusCode, 200);
});
