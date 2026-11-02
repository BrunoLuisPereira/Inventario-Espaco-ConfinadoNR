require('./helpers/evidenciaIsolamentoPreload.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { criarServico, hashToken, mensagem } = require('../src/services/recuperacaoSenhaService');
const { criarServicoEmail, emailService } = require('../src/services/emailService');
const { criarTransporteMemoria } = require('./helpers/emailMemoria.cjs');
const { criarController } = require('../src/controllers/recuperacaoSenhaController');
const middleware = require('../src/middlewares/autenticacaoMiddleware');
const usuarioRepo = require('../src/repositories/usuarioRepository');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ip = '127.0.0.1';
const senha = { novaSenha: 'SenhaNova123!', confirmarSenha: 'SenhaNova123!' };

function preparar(opcoes = {}) {
  let agora = 0;
  const usuarios = [{ id: 1, ambiente: A, email: 'a@example.invalid', versao: 0, ativo: true },
    { id: 2, ambiente: B, email: 'b@example.invalid', versao: 0, ativo: true }];
  const tokens = new Map(), limites = new Map();
  const fila = [];
  const transporte = criarTransporteMemoria();
  const email = criarServicoEmail({ transporte, urlPublica: 'http://127.0.0.1:5173' });
  const repo = {
    async enfileirar(email) { fila.push({ id_envio: String(fila.length + 1), email, reserva: 'reserva-sintetica' }); },
    async reivindicar() { return fila.shift() || null; },
    async finalizar() {},
    async ativar(hash) {
      const t = tokens.get(hash), u = usuarios.find(u => u.id === t?.id);
      if (!t || t.invalidado || t.usado || t.expira <= agora || t.versao !== u?.versao) return false;
      t.ativo = true; return true;
    },
    async limitar(chave, maximo) {
      let l = limites.get(chave);
      if (!l || agora - l.inicio >= 900000) { l = { inicio: agora, total: 0 }; limites.set(chave, l); }
      if (l.total >= maximo) return false;
      l.total++; return true;
    },
    async emitir(endereco, hash) {
      const u = usuarios.find(u => u.email === endereco && u.ativo);
      if (!u) return null;
      for (const t of tokens.values()) if (t.id === u.id) t.invalidado = true;
      tokens.set(hash, { id: u.id, ambiente: u.ambiente, email: u.email, versao: u.versao, expira: agora + 1800000 });
      return { email: u.email };
    },
    async invalidar(hash) { tokens.get(hash).invalidado = true; },
    async consumir(hash, prepararHash) {
      const t = tokens.get(hash), u = usuarios.find(u => u.id === t?.id);
      if (!t || !t.ativo || t.usado || t.invalidado || t.expira <= agora || !u?.ativo ||
          u.ambiente !== t.ambiente || u.email !== t.email || u.versao !== t.versao) return false;
      // Reserva síncrona simula o lock; o repositório SQL é testado separadamente.
      t.usado = true;
      u.hash = await prepararHash(); u.versao++;
      return true;
    },
  };
  const service = criarServico({ repo, email, segredo: () => Buffer.alloc(32, 7).toString('base64'),
    hashSenha: async s => 'hash:' + s, ...opcoes });
  const token = () => new URL(transporte.mensagens.at(-1).texto.match(/http\S+/)[0]).hash.slice(7);
  return { service, repo, email, transporte, usuarios, tokens, token, fila, avancar: ms => { agora += ms; } };
}
async function solicitarEProcessar(c, dados, ip) {
  const resposta = await c.service.solicitar(dados, ip);
  await c.service.processarProximo();
  return resposta;
}

test('conta existente e inexistente têm respostas públicas idênticas e sem token', async () => {
  const c = preparar();
  assert.deepEqual(await solicitarEProcessar(c, { email: ' A@EXAMPLE.INVALID ' }, ip),
    await solicitarEProcessar(c, { email: 'ausente@example.invalid' }, ip));
  assert.deepEqual(await solicitarEProcessar(c, { email: 'outro@example.invalid' }, ip), { mensagem });
  assert.equal(c.transporte.mensagens.length, 1);
  assert.equal(c.token().length, 64);
  assert.ok(c.tokens.has(hashToken(c.token())));
  assert.ok(!JSON.stringify([...c.tokens]).includes(c.token()));
});
test('token válido atualiza bcrypt custo 12 e revoga versão anterior', async () => {
  const c = preparar({ hashSenha: s => bcrypt.hash(s, 12) });
  await solicitarEProcessar(c, { email: 'a@example.invalid' }, ip);
  await c.service.redefinir({ ...senha, token: c.token(), id_ambiente: B, id_usuario: 2 }, ip);
  assert.ok(await bcrypt.compare(senha.novaSenha, c.usuarios[0].hash));
  assert.equal(bcrypt.getRounds(c.usuarios[0].hash), 12);
  assert.equal(c.usuarios[0].versao, 1);
  assert.equal(c.usuarios[1].hash, undefined);
});
for (const tipo of ['malformado', 'desconhecido', 'expirado', 'reutilizado', 'substituido', 'inativo', 'email-alterado', 'ambiente-alterado']) {
  test('rejeita token ' + tipo, async () => {
    const c = preparar();
    await solicitarEProcessar(c, { email: 'a@example.invalid' }, ip);
    let token = c.token();
    if (tipo === 'malformado') token = 'x';
    if (tipo === 'desconhecido') token = 'f'.repeat(64);
    if (tipo === 'expirado') c.avancar(1800000);
    if (tipo === 'reutilizado') await c.service.redefinir({ ...senha, token }, ip);
    if (tipo === 'substituido') await solicitarEProcessar(c, { email: 'a@example.invalid' }, ip);
    if (tipo === 'inativo') c.usuarios[0].ativo = false;
    if (tipo === 'email-alterado') c.usuarios[0].email = 'outro@example.invalid';
    if (tipo === 'ambiente-alterado') c.usuarios[0].ambiente = B;
    const antes = structuredClone(c.usuarios);
    await assert.rejects(c.service.redefinir({ ...senha, token }, ip), { statusCode: 400 });
    assert.deepEqual(c.usuarios, antes);
  });
}
test('limite por email é genérico, por IP retorna 429 e janela é renovada', async () => {
  const c = preparar();
  for (let i = 0; i < 20; i++) assert.deepEqual(await solicitarEProcessar(c, { email: 'a@example.invalid' }, ip), { mensagem });
  assert.equal(c.transporte.mensagens.length, 5);
  await assert.rejects(solicitarEProcessar(c, { email: 'ausente@example.invalid' }, ip), { statusCode: 429 });
  c.avancar(900000);
  await solicitarEProcessar(c, { email: 'a@example.invalid' }, ip);
  assert.equal(c.transporte.mensagens.length, 6);
});
test('solicitações concorrentes só permitem consumo único', async () => {
  const c = preparar();
  await solicitarEProcessar(c, { email: 'b@example.invalid' }, ip);
  const r = await Promise.allSettled(Array.from({ length: 8 }, () => c.service.redefinir({ ...senha, token: c.token() }, ip)));
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(c.usuarios[1].versao, 1);
  assert.equal(c.usuarios[0].hash, undefined);
});
test('token inválido não calcula bcrypt; limite também protege redefinição', async () => {
  let calculos = 0;
  const c = preparar({ hashSenha: async () => { calculos++; } });
  for (let i = 0; i < 30; i++) await assert.rejects(c.service.redefinir({ ...senha, token: 'a'.repeat(64) }, ip), { statusCode: 400 });
  await assert.rejects(c.service.redefinir({ ...senha, token: 'a'.repeat(64) }, ip), { statusCode: 429 });
  assert.equal(calculos, 0);
});
test('valida email, confirmação e limite de bytes bcrypt', async () => {
  const c = preparar();
  await assert.rejects(solicitarEProcessar(c, { email: 'invalido' }, ip), { statusCode: 400 });
  for (const entrada of [{ novaSenha: 'curta' }, { confirmarSenha: 'diferente' },
    { novaSenha: 'á'.repeat(37), confirmarSenha: 'á'.repeat(37) }]) {
    await assert.rejects(c.service.redefinir({ ...senha, token: 'a'.repeat(64), ...entrada }, ip), { statusCode: 400 });
  }
});
test('envio indisponível é igual para todas as contas e não emite tokens', async () => {
  const c = preparar({ email: emailService });
  for (const email of ['a@example.invalid', 'ausente@example.invalid']) {
    await assert.rejects(solicitarEProcessar(c, { email }, ip), { statusCode: 503 });
  }
  assert.equal(c.tokens.size, 0);
});
test('falha do transporte invalida token e mantém resposta genérica', async () => {
  const c = preparar();
  c.email.enviarRecuperacao = async () => { throw new Error('detalhe privado'); };
  assert.deepEqual(await solicitarEProcessar(c, { email: 'a@example.invalid' }, ip), { mensagem });
  assert.equal([...c.tokens.values()][0].invalidado, true);
});
test('transporte em memória recebe template e fragmento; URL e token inválidos são recusados', async () => {
  const c = preparar();
  await c.email.enviarRecuperacao('a@example.invalid', 'a'.repeat(64));
  assert.equal(c.transporte.mensagens[0].para, 'a@example.invalid');
  assert.match(c.transporte.mensagens[0].html, /30 minutos/);
  assert.match(c.transporte.mensagens[0].texto, /redefinir-senha#token=/);
  assert.equal(emailService.disponivel(), false);
  for (const urlPublica of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/?token=x', 'https://example.com/path']) {
    assert.equal(criarServicoEmail({ transporte: c.transporte, urlPublica }).disponivel(), false);
  }
  await assert.rejects(c.email.enviarRecuperacao('a@example.invalid', '<invalido>'));
});

function resposta() {
  return { headers: {}, set(k, v) { this.headers[k] = v; return this; },
    status(codigo) { this.codigo = codigo; return this; }, json(body) { this.body = body; return this; } };
}
test('controller não expõe token, usa no-store e Retry-After, oculta falha técnica', async () => {
  const c = preparar(), controller = criarController(c.service);
  const respostas = [];
  for (const email of ['a@example.invalid', 'ausente@example.invalid']) {
    const res = resposta(); await controller.solicitar({ body: { email }, ip }, res);
    respostas.push(res.body); assert.equal(res.codigo, 202); assert.equal(res.headers['Cache-Control'], 'no-store');
  }
  assert.deepEqual(respostas[0], respostas[1]);
  const tecnico = criarController({ solicitar: async () => { throw new Error('segredo SQL'); } });
  const res = resposta(); await tecnico.solicitar({ body: {}, ip }, res);
  assert.equal(res.codigo, 503); assert.ok(!res.body.message.includes('SQL'));
  const bloqueado = criarController({ solicitar: async () => { throw Object.assign(new Error('Aguarde.'), { statusCode: 429, publicoRecuperacao: true }); } });
  await bloqueado.solicitar({ body: {}, ip }, res); assert.equal(res.headers['Retry-After'], '900');
});

for (const nome of ['autenticar', 'autenticarMultiTenant']) {
  test(nome + ': JWT anterior recusado, novo aceito e perfis atuais preservados', async t => {
    const segredoTeste = 'segredo-sintetico-recuperacao';
    const anterior = process.env.JWT_SECRET; process.env.JWT_SECRET = segredoTeste;
    t.after(() => { if (anterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = anterior; });
    t.mock.method(usuarioRepo, 'buscarIdentidadeAutenticada', async () => ({ id_usuario: 1,
      id_ambiente: A, perfil_acesso: 'VISUALIZADOR', sessao_versao: 1 }));
    for (const versao of [undefined, 0, 1, 2, -1]) {
      const token = jwt.sign({ perfil: 'VISUALIZADOR', ...(versao === undefined ? {} : { sv: versao }) }, segredoTeste,
        { subject: '1', issuer: 'inventario-espacos-confinados-api', audience: 'inventario-espacos-confinados-pwa', expiresIn: '1h' });
      const res = resposta(); let next = false;
      await middleware[nome]({ headers: { authorization: 'Bearer ' + token } }, res, () => { next = true; });
      assert.equal(next, versao === 1);
      if (!next) assert.equal(res.codigo, 401);
    }
  });
}
test('login emite versão persistida sem expor o campo no perfil público', async t => {
  const anterior = process.env.JWT_SECRET; process.env.JWT_SECRET = 'segredo-sintetico-login';
  t.after(() => { if (anterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = anterior; });
  t.mock.method(require('../src/services/loginProtecaoService'), 'executar', async (_email, _ip, f) => f());
  t.mock.method(require('../src/repositories/autenticacaoMultiTenantRepository'), 'buscarPorEmailComAmbiente', async () => ({
    id_usuario: 1, id_ambiente: A, email: 'a@example.invalid', senha_hash: bcrypt.hashSync('Senha123!', 4),
    perfil_acesso: 'VISUALIZADOR', ativo: true, ambiente_ativo: true, sessao_versao: 3 }));
  // Hash estável entre as duas consultas exigidas pelo login.
  const usuario = await require('../src/repositories/autenticacaoMultiTenantRepository').buscarPorEmailComAmbiente();
  t.mock.method(require('../src/repositories/autenticacaoMultiTenantRepository'), 'buscarPorEmailComAmbiente', async () => usuario);
  const r = await require('../src/services/authService').loginMultiTenant({ email: usuario.email, senha: 'Senha123!' }, ip);
  assert.equal(jwt.verify(r.token, process.env.JWT_SECRET).sv, 3);
  assert.equal(r.usuario.sessao_versao, undefined);
});

test('rotas HTTP públicas: solicitação equivalente e redefinição sem JWT', async t => {
  const c = preparar();
  const controller = require('../src/controllers/recuperacaoSenhaController');
  const injetado = criarController(c.service);
  t.mock.method(controller, 'solicitar', injetado.solicitar);
  t.mock.method(controller, 'redefinir', injetado.redefinir);
  const caminhoRouter = require.resolve('../src/routes/authRoutes');
  const cacheAnterior = require.cache[caminhoRouter];
  delete require.cache[caminhoRouter];
  t.after(() => { if (cacheAnterior) require.cache[caminhoRouter] = cacheAnterior; else delete require.cache[caminhoRouter]; });
  const express = require('express');
  const app = express(); app.use(express.json());
  app.use('/api/auth', require(caminhoRouter));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  async function post(rota, body) {
    const r = await fetch(base + rota, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { codigo: r.status, cache: r.headers.get('cache-control'), body: await r.json() };
  }
  const existente = await post('/recuperacao-senha', { email: 'a@example.invalid', id_ambiente: B });
  const ausente = await post('/recuperacao-senha', { email: 'ausente@example.invalid' });
  assert.deepEqual(existente, ausente); assert.equal(existente.codigo, 202);
  assert.equal(existente.cache, 'no-store'); assert.deepEqual(Object.keys(existente.body).sort(), ['message', 'status']);
  await c.service.processarProximo();
  const token = c.token();
  assert.equal((await post('/redefinir-senha', { ...senha, token })).codigo, 200);
  assert.equal((await post('/redefinir-senha', { ...senha, token })).codigo, 400);
  assert.equal(c.usuarios[0].versao, 1); assert.equal(c.usuarios[1].versao, 0);
});

test('fila separa resposta pública de lookup e SMTP, mesmo com transporte bloqueado', async () => {
  const c = preparar();
  let consultas = 0;
  const emitir = c.repo.emitir;
  c.repo.emitir = async (...args) => { consultas++; return emitir(...args); };
  let liberar;
  c.email.enviarRecuperacao = () => new Promise(resolve => { liberar = resolve; });
  const a = await c.service.solicitar({ email: 'a@example.invalid' }, ip);
  const b = await c.service.solicitar({ email: 'ausente@example.invalid' }, ip);
  assert.deepEqual(a, b); assert.equal(consultas, 0); assert.equal(c.fila.length, 2);
  const processamento = c.service.processarProximo();
  while (!liberar) await new Promise(resolve => setImmediate(resolve));
  const hash = [...c.tokens.keys()][0];
  assert.equal(await c.repo.consumir(hash, async () => 'nao-pode'), false);
  // A solicitação de outra conta não espera a confirmação do transporte.
  assert.deepEqual(await c.service.solicitar({ email: 'b@example.invalid' }, ip), a);
  liberar(); await processamento;
  assert.equal(c.tokens.get(hash).ativo, true);
});
test('falha simultânea de envio e revogação nunca ativa o token', async () => {
  const c = preparar();
  c.email.enviarRecuperacao = async () => { throw Error('SMTP sintético'); };
  c.repo.invalidar = async () => { throw Error('banco sintético'); };
  await c.service.solicitar({ email: 'a@example.invalid' }, ip);
  await c.service.processarProximo();
  const hash = [...c.tokens.keys()][0];
  assert.equal(c.tokens.get(hash).ativo, undefined);
  assert.equal(await c.repo.consumir(hash, async () => 'nao-pode'), false);
  assert.equal(c.usuarios[0].versao, 0);
});
test('revogação durante envio impede ativação após confirmação tardia', async () => {
  const c = preparar();
  c.email.enviarRecuperacao = async () => { c.usuarios[0].versao++; };
  await solicitarEProcessar(c, { email: 'a@example.invalid' }, ip);
  assert.notEqual([...c.tokens.values()][0].ativo, true);
});
