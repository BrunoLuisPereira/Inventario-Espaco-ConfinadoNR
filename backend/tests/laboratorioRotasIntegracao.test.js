const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const politica = require('../src/utils/permissoes');
const normalizarId = require('../src/utils/normalizarIdDominio');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const falha = (statusCode, message) => Object.assign(new Error(message), { statusCode });

function carregar(arquivo, deps) {
  const filename = path.resolve(__dirname, arquivo);
  const modulo = { exports: {} };
  const executar = vm.runInThisContext('(function(require,module,exports,__dirname) {\n' +
    fs.readFileSync(filename, 'utf8') + '\n})', { filename });
  executar(nome => {
    assert.ok(Object.hasOwn(deps, nome), 'Dependência não simulada: ' + nome);
    return deps[nome];
  }, modulo, modulo.exports, path.dirname(filename));
  return modulo.exports;
}

async function preparar(t) {
  const anteriores = Object.fromEntries(['JWT_SECRET', 'JWT_ISSUER', 'JWT_AUDIENCE'].map(k => [k, process.env[k]]));
  Object.assign(process.env, { JWT_SECRET: 'SEGREDO_EXCLUSIVAMENTE_SINTETICO_PASSO6', JWT_ISSUER: 'teste-passo6', JWT_AUDIENCE: 'teste-loopback' });
  t.after(() => { for (const [k, v] of Object.entries(anteriores)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  t.mock.method(console, 'error', () => {});
  const estado = { consultas: [], verificacoes: 0, escritas: [], fisicas: [], cadastros: [], convites: [], falhaSQL: false };
  const usuarios = new Map();
  for (const [i, perfil] of politica.perfis.entries()) usuarios.set(i + 1, {
    id_usuario: i + 1, id_ambiente: A, perfil_acesso: perfil, eh_fundador: perfil === 'ADMINISTRADOR', ativo: true, ambienteAtivo: true,
  });
  usuarios.set(20, { ...usuarios.get(1), id_usuario: 20, id_ambiente: B });
  const locais = new Map([[10, A], [20, B], [11, A]]);
  const evidencias = [{ id_evidencia: 10, id_local: 10, descricao: 'EXCLUSIVO_A' }, { id_evidencia: 20, id_local: 20, descricao: 'EXCLUSIVO_B' }];
  const auth = carregar('../src/middlewares/autenticacaoMiddleware.js', {
    jsonwebtoken: { verify(...args) { estado.verificacoes++; return jwt.verify(...args); } },
    '../utils/permissoes': politica,
    '../utils/normalizarIdDominio': normalizarId,
    '../repositories/usuarioRepository': { async buscarIdentidadeAutenticada(id) {
      estado.consultas.push(id); const u = usuarios.get(id);
      return u?.ativo && u.ambienteAtivo ? u : null;
    } },
  });
  const localPermitido = (id, u) => locais.has(id) && locais.get(id) === u.id_ambiente;
  const repoEvidencia = {
    async buscarLocalAutorizadoNoAmbiente(id, u) {
      if (estado.falhaSQL) throw Object.assign(new Error('SQL SEGREDO'), { code: '42703' });
      return localPermitido(id, u) ? { id_local: id } : null;
    },
    async listarPorLocalEAmbiente(id, u) { assert.ok(localPermitido(id, u)); return evidencias.filter(e => e.id_local === id); },
    async listarPermitidasNoAmbiente(u) { return evidencias.filter(e => localPermitido(e.id_local, u)); },
    async criarNoAmbiente(dados, u) {
      assert.ok(localPermitido(dados.id_local, u)); estado.escritas.push(['evidencia', dados, u]);
      return { ...dados, id_evidencia: 30, id_usuario: u.id_usuario };
    },
  };
  const serviceEvidencia = carregar('../src/services/evidenciaMultiTenantService.js', {
    '../repositories/evidenciaMultiTenantRepository': repoEvidencia,
  });
  // Validação de assinatura/extensão real; qualquer I/O físico incidental falha.
  const fsProibido = new Proxy({}, { get() { throw new Error('Filesystem proibido neste teste'); } });
  const util = carregar('../src/utils/evidenciaArquivoUtils.js', { fs: fsProibido, path, crypto: require('node:crypto') });
  const controllerEvidencia = carregar('../src/controllers/evidenciaController.js', {
    '../services/evidenciaMultiTenantService': serviceEvidencia,
    '../utils/evidenciaArquivoUtils': {
      validarUpload: util.validarUpload,
      async persistirUploadAutorizado(file, u, id) {
        assert.ok(localPermitido(id, u)); estado.fisicas.push([u.id_ambiente, id]);
        return { caminho_arquivo: 'uploads/evidencias/SINTETICO.jpg' };
      },
    },
  });
  const upload = carregar('../src/middlewares/uploadEvidenciaMiddleware.js', { multer });
  const routerEvidencia = carregar('../src/routes/evidenciaRoutes.js', {
    express, '../utils/permissoes': politica, '../controllers/evidenciaController': controllerEvidencia,
    '../middlewares/autenticacaoMiddleware': auth, '../middlewares/uploadEvidenciaMiddleware': upload,
  });
  const repoSync = {
    async listar(_filtro, u) { return [{ id_sincronizacao: 1, id_ambiente: u.id_ambiente }]; },
    async registrar(dados, u) {
      // Simula a fronteira de autorização do repositório, não comprova SQL real.
      if (!localPermitido(dados.id_entidade, u)) throw falha(404, 'Registro de sincronização ou entidade não encontrado.');
      estado.escritas.push(['sync', dados, u]); return { ...dados, id_sincronizacao: 1, status: 'PENDENTE', id_ambiente: u.id_ambiente };
    },
  };
  const serviceSync = carregar('../src/services/sincronizacaoMultiTenantService.js', { '../repositories/sincronizacaoMultiTenantRepository': repoSync });
  const controllerSync = carregar('../src/controllers/sincronizacaoController.js', { '../services/sincronizacaoMultiTenantService': serviceSync });
  const routerSync = carregar('../src/routes/sincronizacaoRoutes.js', {
    express, '../utils/permissoes': politica, '../controllers/sincronizacaoController': controllerSync,
    '../middlewares/autenticacaoMiddleware': auth,
  });
  const controllerCadastro = carregar('../src/controllers/cadastroController.js', {
    '../services/cadastroService': { async cadastrarAmbiente(d) { estado.cadastros.push(d); return { id_ambiente: A }; } },
  });
  const controllerConvite = carregar('../src/controllers/conviteController.js', {
    '../services/conviteService': {
      async emitirConvite(id, d) { estado.convites.push(['emitir', id, d]); return { id_convite: 1 }; },
      async aceitarConvite(token, d) { estado.convites.push(['aceitar', token, d]); return { id_usuario: 30 }; },
    },
  });
  const routerCadastro = carregar('../src/routes/cadastroRoutes.js', { express, '../controllers/cadastroController': controllerCadastro });
  const routerConvite = carregar('../src/routes/conviteRoutes.js', {
    express, '../utils/permissoes': politica, '../controllers/conviteController': controllerConvite,
    '../middlewares/autenticacaoMiddleware': auth, '../middlewares/autorizacaoMiddleware': require('../src/middlewares/autorizacaoMiddleware'),
  });
  const deps = { express, './config.cjs': carregar('../laboratorio/config.cjs', {}) };
  for (const nome of ['auth', 'usuario', 'campanha', 'local', 'checklist', 'dadosTecnicos', 'relatorio']) {
    deps['../src/routes/' + nome + 'Routes'] = express.Router();
  }
  Object.assign(deps, {
    '../src/routes/evidenciaRoutes': routerEvidencia, '../src/routes/sincronizacaoRoutes': routerSync,
    '../src/routes/cadastroRoutes': routerCadastro, '../src/routes/conviteRoutes': routerConvite,
  });
  const app = carregar('../laboratorio/app.cjs', deps).criarApp('inventario_nr33_multitenant_dev');
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())));
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  async function solicitar(url, { id = 1, method = 'GET', body, multipart } = {}) {
    const headers = {};
    if (id !== null) headers.Authorization = 'Bearer ' + (id === 'invalido' ? id : jwt.sign(
      { perfil: 'ADMINISTRADOR', id_ambiente: B }, process.env.JWT_SECRET,
      { subject: String(id), algorithm: 'HS256', issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, expiresIn: '1m' },
    ));
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch('http://127.0.0.1:' + server.address().port + url, {
      method, headers, body: multipart ?? (body ? JSON.stringify(body) : undefined),
    });
    return { status: res.status, body: await res.json() };
  }
  return { estado, usuarios, solicitar };
}

for (const url of ['/api/evidencias/local/10', '/api/sincronizacao', '/api/sincronizacoes']) {
  for (const condicao of ['semJWT', 'invalido', 'inativo', 'ambienteInativo']) {
    test(url + ': rejeita ' + condicao, async t => {
      const c = await preparar(t);
      if (condicao === 'inativo') c.usuarios.get(1).ativo = false;
      if (condicao === 'ambienteInativo') c.usuarios.get(1).ambienteAtivo = false;
      const r = await c.solicitar(url, { id: condicao === 'semJWT' ? null : condicao === 'invalido' ? 'invalido' : 1 });
      assert.equal(r.status, 401); assert.equal(r.body.status, 'error');
      assert.deepEqual(c.estado.escritas, []); assert.deepEqual(c.estado.fisicas, []);
      assert.equal(c.estado.verificacoes, condicao === 'semJWT' ? 0 : 1);
      assert.equal(c.estado.consultas.length, ['inativo', 'ambienteInativo'].includes(condicao) ? 1 : 0);
    });
  }
}
for (const [i, perfil] of politica.perfis.entries()) {
  test('Evidências: consulta permitida ao perfil atual ' + perfil, async t => {
    const c = await preparar(t); const r = await c.solicitar('/api/evidencias/local/10', { id: i + 1 });
    assert.equal(r.status, 200); assert.equal(r.body.total, 1); assert.equal(r.body.data[0].descricao, 'EXCLUSIVO_A');
    assert.equal(c.estado.consultas.length, 1); assert.equal(c.estado.verificacoes, 1);
  });
  test('Sincronização: RBAC atual ' + perfil + ' prevalece sobre JWT administrativo', async t => {
    const c = await preparar(t); const r = await c.solicitar('/api/sincronizacao', { id: i + 1 });
    assert.equal(r.status, politica.pode(c.usuarios.get(i + 1), 'sincronizacao.consultar') ? 200 : 403);
    assert.equal(c.estado.consultas.length, 1); assert.equal(c.estado.verificacoes, 1);
  });
}
test('Evidências: A/B, local vazio, externo e inexistente preservam contratos', async t => {
  const c = await preparar(t);
  const a = await c.solicitar('/api/evidencias/local/10?id_ambiente=' + B);
  const b = await c.solicitar('/api/evidencias/local/20', { id: 20 });
  assert.equal(a.body.data[0].descricao, 'EXCLUSIVO_A'); assert.equal(b.body.data[0].descricao, 'EXCLUSIVO_B');
  const externo = await c.solicitar('/api/evidencias/local/20');
  assert.deepEqual(externo, await c.solicitar('/api/evidencias/local/999'));
  assert.equal(externo.status, 404);
  assert.deepEqual(await c.solicitar('/api/evidencias/local/11'), { status: 200, body: { status: 'success', total: 0, data: [] } });
});
for (const url of ['/api/sincronizacao', '/api/sincronizacoes']) {
  test(url + ': nenhuma escrita externa e identidade vem da autenticação', async t => {
    const c = await preparar(t);
    const body = { entidade: 'LOCAL', operacao: 'ATUALIZAR', id_entidade: 20, versao_cliente: 1, id_ambiente: B, id_usuario: 20, perfil_acesso: 'ADMINISTRADOR', dados_cliente: { nome_local: 'Sintético' } };
    const r = await c.solicitar(url, { method: 'POST', body });
    assert.equal(r.status, 404); assert.deepEqual(c.estado.escritas, []);
    const ok = await c.solicitar(url, { method: 'POST', body: { ...body, id_entidade: 10 } });
    assert.equal(ok.status, 201); assert.equal(ok.body.data.id_ambiente, A);
    assert.deepEqual(c.estado.escritas[0][2], { id_usuario: 1, id_ambiente: A });
    assert.equal(c.estado.verificacoes, 2); assert.equal(c.estado.consultas.length, 2);
  });
}
test('Leitor não pode criar evidência nem registrar sincronização', async t => {
  const c = await preparar(t); const id = politica.perfis.indexOf('VISUALIZADOR') + 1;
  for (const url of ['/api/evidencias', '/api/sincronizacao']) {
    assert.equal((await c.solicitar(url, { id, method: 'POST', body: { id_local: 10 } })).status, 403);
  }
  assert.deepEqual(c.estado.escritas, []); assert.deepEqual(c.estado.fisicas, []);
});
function formulario({ mime = 'image/jpeg', nome = 'teste.jpg', tamanho, campo = 'arquivo', local = '10', conteudo } = {}) {
  const form = new FormData(); form.set('id_local', local);
  form.set(campo, new Blob([conteudo ?? (tamanho ? Buffer.alloc(tamanho) : Buffer.from([255, 216, 255, 217]))], { type: mime }), nome);
  return form;
}
for (const [nome, opcoes, esperado] of [
  ['válido em memória', {}, 201],
  ['local externo', { local: '20' }, 404],
  ['MIME inválido', { mime: 'text/plain' }, 400],
  ['assinatura inválida', { conteudo: Buffer.from('FALSO_JPEG') }, 400],
  ['limite de 10 MiB', { tamanho: 10 * 1024 * 1024 + 1 }, 500],
  ['campo inesperado', { campo: 'outro' }, 500],
]) {
  test('Upload real Multer e validação: ' + nome, async t => {
    const c = await preparar(t);
    const r = await c.solicitar('/api/evidencias/upload', { method: 'POST', multipart: formulario(opcoes) });
    assert.equal(r.status, esperado);
    assert.equal(c.estado.fisicas.length, esperado === 201 ? 1 : 0);
    assert.equal(c.estado.escritas.length, esperado === 201 ? 1 : 0);
    if (esperado === 500) assert.deepEqual(r.body, { status: 'error', message: 'Erro interno do servidor.' });
  });
}
test('Upload sem JWT ou sem capacidade não chega à persistência', async t => {
  const c = await preparar(t);
  for (const [id, status] of [[null, 401], [politica.perfis.indexOf('VISUALIZADOR') + 1, 403]]) {
    assert.equal((await c.solicitar('/api/evidencias/upload', { id, method: 'POST', multipart: formulario() })).status, status);
  }
  assert.deepEqual(c.estado.fisicas, []); assert.deepEqual(c.estado.escritas, []);
});
test('Cadastro e aceite continuam públicos; emissão de convite exige fundador', async t => {
  const c = await preparar(t);
  assert.equal((await c.solicitar('/api/cadastro/ambiente', { id: null, method: 'POST', body: { nome: 'Sintético' } })).status, 201);
  assert.equal((await c.solicitar('/api/convites/aceitar', { id: null, method: 'POST', body: { token: 'SINTETICO', nome: 'Convidado', senha: 'SOMENTE_FIXTURE' } })).status, 201);
  assert.equal((await c.solicitar('/api/convites', { method: 'POST', body: { email: 'fixture@example.invalid' } })).status, 201);
  assert.equal((await c.solicitar('/api/convites', { id: 2, method: 'POST', body: {} })).status, 403);
  assert.equal(c.estado.cadastros.length, 1); assert.equal(c.estado.convites.length, 2);
});
test('Falha SQL pelo módulo montado mantém 500 sanitizado do PASSO 5', async t => {
  const c = await preparar(t); c.estado.falhaSQL = true;
  assert.deepEqual(await c.solicitar('/api/evidencias/local/10'), {
    status: 500, body: { status: 'error', message: 'Erro interno do servidor.' },
  });
});
