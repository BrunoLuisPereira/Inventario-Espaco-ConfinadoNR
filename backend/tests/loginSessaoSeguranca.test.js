const politicaRbac723 = require('../src/utils/permissoes');
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const jwt = require('jsonwebtoken');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const SECRET = 'segredo-ficticio-exclusivo-passo-659';
const issuer = 'inventario-espacos-confinados-api';
const audience = 'inventario-espacos-confinados-pwa';
const caminhos = ['controllers/authController', 'services/authService',
  'repositories/autenticacaoMultiTenantRepository', 'middlewares/autenticacaoMiddleware']
  .map(p => require.resolve('../src/' + p));

function preparar(t, opcoes = {}) {
  let usuario = { id_usuario: 10, id_ambiente: A, nome: 'Conta simulada', email: 'conta@example.invalid',
    senha_hash: 'hash-correto', eh_fundador: true, perfil_acesso: 'ADMINISTRADOR', ativo: true, ambiente_ativo: true, ...opcoes.usuario };
  const consultas = [], logs = [], proibidos = [], comparacoes = [], errosSimulador = [];
  const ambienteAnterior = {};
  for (const chave of ['JWT_SECRET', 'JWT_ISSUER', 'JWT_AUDIENCE', 'JWT_EXPIRES_IN']) {
    ambienteAnterior[chave] = process.env[chave]; delete process.env[chave];
  }
  process.env.JWT_SECRET = SECRET;
  t.after(() => {
    for (const [chave, valor] of Object.entries(ambienteAnterior)) {
      if (valor === undefined) delete process.env[chave]; else process.env[chave] = valor;
    }
    assert.deepEqual(proibidos, []);
    assert.deepEqual(errosSimulador, []);
  });
  t.mock.method(console, 'error', (...args) => logs.push(args));
  const pool = {
    async query(sql, params) {
      consultas.push({ sql, params });
      try {
      assert.match(sql, /FROM usuario AS u/); assert.match(sql, /LEFT JOIN ambiente AS a/);
      assert.match(sql, /a.id_ambiente = u.id_ambiente/);
      assert.match(sql, /WHERE LOWER\(u.email\) = \$1/);
      assert.deepEqual(params, ['conta@example.invalid']);
      } catch (erro) { errosSimulador.push(erro.message); throw erro; }
      if (opcoes.falhaConsulta) throw new Error('SQL TOKEN SENHA /caminho/interno');
      if (opcoes.aoConsultar) opcoes.aoConsultar(consultas.filter(c => c.sql).length, usuario);
      return { rows: opcoes.inexistente || !usuario ? [] : [{ ...usuario }] };
    },
    connect() { proibidos.push('connect'); throw new Error('Conexão real proibida'); },
  };
  const usuarioRepository = {
    // Existe apenas para reproduzir a implementação antiga; a regressão
    // de uso exclusivo multi-tenant observa separadamente estas chamadas.
    async buscarPorEmail() { consultas.push({ legado: true }); return opcoes.inexistente ? null : { ...usuario }; },
    async buscarIdentidadeAutenticada(id) {
      consultas.push({ identidade: id });
      if (opcoes.falhaIdentidade) throw new Error('SQL TOKEN SENHA /caminho/interno');
      if (!usuario || !usuario.ativo || !usuario.ambiente_ativo) return null;
      return { id_usuario: usuario.id_usuario, id_ambiente: usuario.id_ambiente, eh_fundador: usuario.eh_fundador === true, perfil_acesso: usuario.perfil_acesso };
    },
  };
  const bcrypt = { async compare(senha, hash) {
    comparacoes.push([senha, hash]);
    if (opcoes.duranteCompare) opcoes.duranteCompare(usuario);
    return senha === 'senha-correta' && hash === 'hash-correto';
  } };
  const anteriores = caminhos.map(p => [p, require.cache[p]]);
  const load = Module._load;
  let controller, service, middleware, repository;
  try {
    for (const p of caminhos) delete require.cache[p];
    Module._load = function (request, parent, ...args) {
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (request === '../utils/permissoes') return politicaRbac723;
      // Utilitario puro real, restrito aos tres consumidores autorizados.
      if (request === '../utils/normalizarIdDominio' && ['middlewares/autenticacaoMiddleware', 'services/authService', 'services/relatorioMultiTenantService'].some(p => parent?.filename === require.resolve('../src/' + p))) return require('../src/utils/normalizarIdDominio');
      if (caminhos.includes(parent?.filename)) {
        if (request === '../config/database') return pool;
        if (request === '../repositories/usuarioRepository') return usuarioRepository;
        if (request === 'bcryptjs') return bcrypt;
        if (request === 'jsonwebtoken' || request === '../services/authService' || request === '../repositories/autenticacaoMultiTenantRepository') return load.call(this, request, parent, ...args);
        proibidos.push(request); throw new Error('Dependência proibida: ' + request);
      }
      return load.call(this, request, parent, ...args);
    };
    repository = require(caminhos[2]);
    controller = require(caminhos[0]); service = require(caminhos[1]); middleware = require(caminhos[3]);
  } finally {
    Module._load = load;
    for (const [p, anterior] of anteriores) { if (anterior) require.cache[p] = anterior; else delete require.cache[p]; }
  }
  // A dependência carregada dinamicamente pelo serviço permanece simulada.
  t.mock.method(Module, '_load', function (request, parent, ...args) {
    if (parent?.filename === caminhos[1] && request === './loginProtecaoService') {
      // Esta suíte verifica credenciais/JWT; limitador real tem suíte própria.
      return { executar: async (_email, _ip, verificar) => verificar() };
    }
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (request === '../utils/permissoes') return politicaRbac723;
    if (parent?.filename === caminhos[1] && request === '../repositories/autenticacaoMultiTenantRepository') {
      return repository;
    }
    return load.call(this, request, parent, ...args);
  });
  const res = { headersSent: false, envios: 0, statusCode: 200,
    status(code) { assert.equal(this.headersSent, false); this.statusCode = code; return this; },
    json(body) { assert.equal(this.headersSent, false); this.envios++; this.headersSent = true; this.body = body; if (opcoes.jsonFalha) throw new Error('TRANSPORTE INTERNO'); return this; },
  };
  async function login(body = { email: ' CONTA@example.invalid ', senha: 'senha-correta' }) {
    await controller.login({ body }, res); return res;
  }
  const token = (claims = {}, options = {}) => jwt.sign({ perfil: 'ADMINISTRADOR', ...claims }, SECRET,
    { subject: '10', issuer, audience, algorithm: 'HS256', expiresIn: '8h', ...options });
  async function sessao(valor = token()) {
    const req = { headers: valor === null ? {} : { authorization: 'Bearer ' + valor },
      body: { id_usuario: 999, id_ambiente: B, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR' } };
    let next = 0;
    await middleware.autenticarMultiTenant(req, res, () => { next++; });
    return { req, next };
  }
  return { login, sessao, token, res, service, consultas, logs, comparacoes,
    get usuario() { return usuario; }, remover() { usuario = null; } };
}

test('login montado recusa ambiente inativo', async t => {
  const c = preparar(t, { usuario: { ambiente_ativo: false } }); await c.login();
  assert.equal(c.res.statusCode, 401); assert.equal(c.res.body.status, 'error');
});
test('login não emite privilégios anteriores à revogação durante bcrypt', async t => {
  const c = preparar(t, { duranteCompare: u => { u.perfil_acesso = 'ENGENHEIRO_SEGURANCA'; } });
  await c.login(); assert.equal(c.res.statusCode, 200);
  assert.equal(c.res.body.data.usuario.perfil_acesso, 'ENGENHEIRO_SEGURANCA');
  assert.equal(jwt.verify(c.res.body.data.token, SECRET).perfil, 'ENGENHEIRO_SEGURANCA');
});
test('login recusa desativação durante bcrypt', async t => {
  const c = preparar(t, { duranteCompare: u => { u.ativo = false; } }); await c.login();
  assert.equal(c.res.statusCode, 401); assert.equal(c.res.body.status, 'error');
});

for (const ambiente of [A, B]) for (const perfil of ['ADMINISTRADOR', 'ENGENHEIRO_SEGURANCA']) {
  test(`login legítimo ${ambiente} ${perfil}: HTTP, JSON e JWT preservados`, async t => {
    const c = preparar(t, { usuario: { id_ambiente: ambiente, eh_fundador: perfil === "ADMINISTRADOR", perfil_acesso: perfil } });
    await c.login({ email: ' CONTA@example.invalid ', senha: 'senha-correta', id_usuario: 999,
      id_ambiente: ambiente === A ? B : A, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR' });
    assert.equal(c.res.statusCode, 200); assert.equal(c.res.envios, 1);
    assert.equal(c.res.body.status, 'success'); assert.equal(c.res.body.message, 'Login realizado com sucesso.');
    const data = c.res.body.data;
    assert.deepEqual(Object.keys(data).sort(), ['expiraEm', 'tipo', 'token', 'usuario']);
    assert.equal(data.tipo, 'Bearer'); assert.equal(data.expiraEm, '8h');
    assert.deepEqual(data.usuario, { id_usuario: 10, nome: 'Conta simulada', email: 'conta@example.invalid', eh_fundador: perfil === "ADMINISTRADOR", perfil_acesso: perfil });
    const claims = jwt.verify(data.token, SECRET, { algorithms: ['HS256'], issuer, audience });
    assert.equal(claims.sub, '10'); assert.equal(claims.perfil, perfil); assert.equal(claims.id_ambiente, undefined);
    assert.equal(claims.exp - claims.iat, 8 * 3600);
    assert.equal(c.consultas.length, 2); assert.equal(c.consultas.some(c => c.legado), false);
    assert.deepEqual(c.comparacoes, [['senha-correta', 'hash-correto']]);
  });
}
for (const tipo of ['senha', 'inexistente']) {
  test(`credenciais inválidas indistinguíveis: ${tipo}`, async t => {
    const c = preparar(t, { inexistente: tipo === 'inexistente' });
    await c.login({ email: 'conta@example.invalid', senha: tipo === 'senha' ? 'errada' : 'senha-correta' });
    assert.equal(c.res.statusCode, 401); assert.equal(c.res.envios, 1);
    assert.deepEqual(c.res.body, { status: 'error', message: 'E-mail ou senha inválidos.' });
    assert.equal(c.consultas.some(c => c.legado), false);
  });
}
for (const [usuario, status, message] of [
  [{ ativo: false }, 401, 'E-mail ou senha inválidos.'],
  [{ ambiente_ativo: false }, 401, 'E-mail ou senha inválidos.'],
  [{ id_ambiente: null }, 401, 'E-mail ou senha inválidos.'],
  [{ id_ambiente: 'nao-uuid' }, 401, 'E-mail ou senha inválidos.'],
  [{ perfil_acesso: 'PERFIL_INVALIDO' }, 401, 'E-mail ou senha inválidos.'],
  [{ id_usuario: Number.MAX_SAFE_INTEGER + 1 }, 401, 'E-mail ou senha inválidos.'],
]) {
  test('identidade de login inválida: ' + JSON.stringify(usuario), async t => {
    const c = preparar(t, { usuario }); await c.login();
    assert.equal(c.res.statusCode, status); assert.deepEqual(c.res.body, { status: 'error', message });
  });
}
for (const dados of [undefined, null, [], {}, { email: '', senha: 'x' }, { email: 1, senha: 'x' },
  { email: 'conta@example.invalid', senha: '' }, { email: 'conta@example.invalid', senha: true }]) {
  test('entrada inválida retorna 400 sem SQL: ' + JSON.stringify(dados), async t => {
    const c = preparar(t); await c.login(dados === undefined ? {} : dados);
    assert.equal(c.res.statusCode, 400); assert.equal(c.consultas.length, 0); assert.equal(c.res.envios, 1);
  });
}
for (const alteracao of ['ambiente', 'hash', 'identidade', 'ambienteOrigem']) {
  test('alteração concorrente durante bcrypt: ' + alteracao, async t => {
    const c = preparar(t, { duranteCompare: u => {
      if (alteracao === 'ambiente') u.ambiente_ativo = false;
      if (alteracao === 'hash') u.senha_hash = 'hash-alterado';
      if (alteracao === 'identidade') u.id_usuario = 20;
      if (alteracao === 'ambienteOrigem') u.id_ambiente = B;
    } });
    await c.login();
    assert.equal(c.res.statusCode, 401);
    assert.equal(c.res.body.status, 'error'); assert.equal(c.res.body.data, undefined);
  });
}
test('falha da segunda consulta não retorna token parcial', async t => {
  const c = preparar(t, { aoConsultar: n => { if (n === 2) throw new Error('SQL TOKEN SENHA'); } });
  await c.login(); assert.equal(c.res.statusCode, 500);
  assert.deepEqual(c.res.body, { status: 'error', message: 'Erro interno ao realizar login.' });
  assert.equal(JSON.stringify([c.logs, c.res.body]).includes('SQL TOKEN'), false);
});
test('falha técnica inicial é segura', async t => {
  const c = preparar(t, { falhaConsulta: true }); await c.login();
  assert.equal(c.res.statusCode, 500); assert.equal(c.res.envios, 1);
  assert.equal(JSON.stringify([c.logs, c.res.body]).includes('SQL TOKEN SENHA'), false);
});
test('configuração JWT ausente é 500 sem SQL nem mensagem técnica', async t => {
  const c = preparar(t); delete process.env.JWT_SECRET; await c.login();
  assert.equal(c.res.statusCode, 500); assert.equal(c.consultas.length, 0);
  assert.equal(JSON.stringify([c.logs, c.res.body]).includes('.env'), false);
});
test('expiração configurada permanece preservada', async t => {
  const c = preparar(t); process.env.JWT_EXPIRES_IN = '2h'; await c.login();
  const data = c.res.body.data; const claims = jwt.verify(data.token, SECRET);
  assert.equal(data.expiraEm, '2h'); assert.equal(claims.exp - claims.iat, 7200);
});
test('falha JSON após início não produz segunda resposta', async t => {
  const c = preparar(t, { jsonFalha: true }); await c.login();
  assert.equal(c.res.envios, 1); assert.equal(c.res.statusCode, 200);
});
test('resposta iniciada durante bcrypt não é sobrescrita', async t => {
  let c; c = preparar(t, { duranteCompare: () => { c.res.headersSent = true; } });
  await c.login(); assert.equal(c.res.envios, 0);
});

for (const valor of ['ausente', 'invalido', 'expirado', 'assinatura', 'perfilAdulterado', 'ambienteAdulterado']) {
  test('JWT recusado: ' + valor, async t => {
    const c = preparar(t);
    let token = c.token();
    if (valor === 'ausente') token = null;
    if (valor === 'invalido') token = 'invalido';
    if (valor === 'expirado') token = c.token({}, { expiresIn: -1 });
    if (valor === 'assinatura') token = jwt.sign({ sub: '10', perfil: 'ADMINISTRADOR' }, 'outro-segredo', { issuer, audience });
    if (valor === 'perfilAdulterado' || valor === 'ambienteAdulterado') {
      const partes = token.split('.'); const payload = JSON.parse(Buffer.from(partes[1], 'base64url'));
      if (valor === 'perfilAdulterado') payload.perfil = 'ENGENHEIRO_SEGURANCA'; else payload.id_ambiente = B;
      partes[1] = Buffer.from(JSON.stringify(payload)).toString('base64url'); token = partes.join('.');
    }
    const sessao = await c.sessao(token);
    assert.equal(sessao.next, 0); assert.equal(c.res.statusCode, 401); assert.equal(c.res.envios, 1);
    assert.equal(c.consultas.length, 0);
  });
}
for (const ambiente of [A, B]) {
  test('claims assinadas antigas não substituem banco: ' + ambiente, async t => {
    const c = preparar(t, { usuario: { id_ambiente: ambiente, eh_fundador: false, perfil_acesso: 'ENGENHEIRO_SEGURANCA' } });
    const sessao = await c.sessao(c.token({ perfil: 'ADMINISTRADOR', id_ambiente: ambiente === A ? B : A }));
    assert.equal(sessao.next, 1);
    assert.deepEqual(sessao.req.usuario, { id_usuario: 10, id_ambiente: ambiente, eh_fundador: false, perfil_acesso: 'ENGENHEIRO_SEGURANCA' });
    assert.deepEqual(c.consultas, [{ identidade: 10 }]);
    assert.equal(c.res.envios, 0);
  });
}
for (const motivo of ['usuario', 'ambiente', 'perfil', 'removido']) {
  test('sessão recusa estado atual inválido: ' + motivo, async t => {
    const c = preparar(t); const token = c.token();
    if (motivo === 'usuario') c.usuario.ativo = false;
    if (motivo === 'ambiente') c.usuario.ambiente_ativo = false;
    if (motivo === 'perfil') c.usuario.perfil_acesso = 'INVALIDO';
    if (motivo === 'removido') c.remover();
    const sessao = await c.sessao(token);
    assert.equal(sessao.next, 0); assert.equal(c.res.statusCode, motivo === 'perfil' ? 403 : 401);
    assert.equal(c.res.envios, 1);
  });
}
test('sessão posterior respeita revogação depois de emitir JWT', async t => {
  const c = preparar(t); const token = c.token({ perfil: 'ADMINISTRADOR' });
  c.usuario.perfil_acesso = 'ENGENHEIRO_SEGURANCA';
  const sessao = await c.sessao(token);
  assert.equal(sessao.next, 1); assert.equal(sessao.req.usuario.perfil_acesso, 'ENGENHEIRO_SEGURANCA');
});
test('falha técnica da sessão não vira autorização nem ausência', async t => {
  const c = preparar(t, { falhaIdentidade: true }); const sessao = await c.sessao();
  assert.equal(sessao.next, 0); assert.equal(c.res.statusCode, 500);
  assert.equal(JSON.stringify([c.logs, c.res.body]).includes('SQL TOKEN SENHA'), false);
});
test('limite: desativação após última leitura é recusada na sessão seguinte', async t => {
  const c = preparar(t); const sign = jwt.sign;
  t.mock.method(jwt, 'sign', function (...args) { c.usuario.ambiente_ativo = false; return sign.apply(this, args); });
  await c.login(); assert.equal(c.res.statusCode, 200);
  const token = c.res.body.data.token;
  c.res.headersSent = false; c.res.envios = 0;
  const sessao = await c.sessao(token);
  assert.equal(sessao.next, 0); assert.equal(c.res.statusCode, 401);
});
