const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');
const { criarBanco } = require('./helpers/loginBancoSimulado.cjs');
const politica = require('../src/utils/permissoes');
const normalizarId = require('../src/utils/normalizarIdDominio');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const INVALIDO = 'E-mail ou senha inválidos.';
const ESPERA = 'Muitas tentativas de login. Aguarde antes de tentar novamente.';
const IP = '192.0.2.1';

function preparar(t, banco = criarBanco()) {
  const deps = new Map(), anteriores = new Map(), load = Module._load;
  const comparacoes = [], consultasUsuario = [], logs = [];
  let usuario = { id_usuario: 10, id_ambiente: A, nome: 'Conta sintética',
    email: 'pessoa@example.invalid', senha_hash: 'hash-sintetico',
    ativo: true, ambiente_ativo: true, perfil_acesso: 'ADMINISTRADOR', eh_fundador: true };
  for (const [nome, valor] of [['LOGIN_HMAC_SECRET', Buffer.alloc(32, 7).toString('base64')], ['JWT_SECRET', 'segredo-ficticio-apenas-teste-25']]) {
    const anterior = process.env[nome]; process.env[nome] = valor;
    t.after(() => { if (anterior === undefined) delete process.env[nome]; else process.env[nome] = anterior; });
  }
  t.mock.method(console, 'error', (...args) => logs.push(args));
  t.mock.method(Module, '_load', function (nome, parent, ...args) {
    const mapa = deps.get(parent?.filename);
    if (mapa && Object.hasOwn(mapa, nome)) return mapa[nome];
    if (mapa && !nome.startsWith('node:')) throw Error('Import não simulado: ' + nome);
    return load.call(this, nome, parent, ...args);
  });
  function carregar(nome, mapa) {
    const caminho = require.resolve('../src/' + nome);
    if (!anteriores.has(caminho)) anteriores.set(caminho, require.cache[caminho]);
    deps.set(caminho, mapa); delete require.cache[caminho];
    return require(caminho);
  }
  t.after(() => { for (const [p, anterior] of anteriores) { if (anterior) require.cache[p] = anterior; else delete require.cache[p]; } });
  function reiniciar() {
    const repo = carregar('repositories/loginTentativaRepository', { '../config/database': banco.pool });
    const protecao = carregar('services/loginProtecaoService', { '../repositories/loginTentativaRepository': repo,
      '../utils/loginHmac': require('../src/utils/loginHmac') });
    const service = carregar('services/authService', {
      bcryptjs: { async compare(senha, hash) { comparacoes.push({ senha, hash }); return senha === 'senha-correta-sintetica' && hash === 'hash-sintetico'; } },
      jsonwebtoken: jwt, '../utils/permissoes': politica, '../utils/normalizarIdDominio': normalizarId,
      '../repositories/usuarioRepository': {}, './loginProtecaoService': protecao,
      '../repositories/autenticacaoMultiTenantRepository': { async buscarPorEmailComAmbiente(email, client) {
        assert.ok(client, 'Consulta deve usar o cliente da transação'); consultasUsuario.push(email);
        return usuario && email === usuario.email ? { ...usuario } : null;
      } },
    });
    const controller = carregar('controllers/authController', { '../services/authService': service });
    return { repo, protecao, service, controller };
  }
  let componentes = reiniciar();
  return { banco, comparacoes, consultasUsuario, logs,
    get componentes() { return componentes; },
    get usuario() { return usuario; }, remover() { usuario = null; },
    reiniciar() { componentes = reiniciar(); },
    login(senha = 'errada-sintetica', email = 'pessoa@example.invalid', ip = IP) {
      return componentes.service.login({ email, senha }, ip);
    },
  };
}
async function recusa(promise, statusCode, message = statusCode === 429 ? ESPERA : INVALIDO) {
  await assert.rejects(promise, { statusCode, message });
}

test('1–4 falhas, quinta restringe, sexta não valida bcrypt; prazo fixo e liberação exata', async t => {
  const c = preparar(t);
  for (let i = 1; i <= 4; i++) await recusa(c.login(), 401);
  await recusa(c.login(), 429);
  const r = [...c.banco.estado.values()].find(r => r.tipo === 'identificador');
  assert.equal(r.restrito, 900000);
  await recusa(c.login('senha-correta-sintetica'), 429);
  assert.equal(c.comparacoes.length, 5);
  c.banco.avancar(899999); await recusa(c.login(), 429);
  assert.equal([...c.banco.estado.values()].find(r => r.tipo === 'identificador').restrito, 900000);
  c.banco.avancar(1); assert.ok((await c.login('senha-correta-sintetica')).token);
});

test('janela móvel: exclui falhas antigas, preserva falhas recentes', async t => {
  const c = preparar(t);
  await recusa(c.login(), 401);
  c.banco.avancar(600000);
  for (let i = 0; i < 3; i++) await recusa(c.login(), 401);
  c.banco.avancar(300001);
  await recusa(c.login(), 401);
  await recusa(c.login(), 429);
});

test('sucesso limpa identificador; não limpa contador do IP nem altera usuário', async t => {
  const c = preparar(t), anterior = { ...c.usuario };
  for (let i = 0; i < 4; i++) await recusa(c.login(), 401);
  await c.login('senha-correta-sintetica');
  const registros = [...c.banco.estado.values()];
  assert.deepEqual(registros.find(r => r.tipo === 'identificador').falhas, []);
  assert.equal(registros.find(r => r.tipo === 'ip').requisicoes, 5);
  await recusa(c.login(), 401); assert.deepEqual(c.usuario, anterior);
});

test('20 falhas concorrentes de IPs distintos: somente cinco verificações de senha', async t => {
  const c = preparar(t);
  const resultados = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => c.login(undefined, undefined, `192.0.2.${i + 1}`)));
  assert.equal(resultados.filter(r => r.reason?.statusCode === 401).length, 4);
  assert.equal(resultados.filter(r => r.reason?.statusCode === 429).length, 16);
  assert.equal(c.comparacoes.length, 5);
});

test('quinta falha concorrente impede senha correta enfileirada de emitir JWT', async t => {
  const c = preparar(t);
  for (let i = 0; i < 4; i++) await recusa(c.login(), 401);
  const resultados = await Promise.allSettled([c.login(), c.login('senha-correta-sintetica')]);
  assert.ok(resultados.every(r => r.status === 'rejected' && r.reason.statusCode === 429));
});

test('recarregar módulos não remove restrição persistida; normalização não contorna limite', async t => {
  const c = preparar(t);
  for (let i = 0; i < 4; i++) await recusa(c.login(), 401);
  await recusa(c.login(undefined, ' PESSOA@EXAMPLE.INVALID '), 429);
  c.reiniciar(); await recusa(c.login('senha-correta-sintetica'), 429);
  assert.equal(c.comparacoes.length, 5);
});

for (const caso of ['inexistente', 'usuario-inativo', 'ambiente-inativo']) {
  test(caso + ': mesma política e mensagem, sem JWT ou reativação', async t => {
    const c = preparar(t);
    if (caso === 'inexistente') c.remover();
    else c.usuario[caso === 'usuario-inativo' ? 'ativo' : 'ambiente_ativo'] = false;
    for (let i = 0; i < 4; i++) await recusa(c.login('senha-correta-sintetica'), 401);
    await recusa(c.login('senha-correta-sintetica'), 429);
    await recusa(c.login(), 429);
    assert.equal(c.comparacoes.length, 5);
    if (caso === 'inexistente') assert.ok(c.comparacoes.every(c => c.hash.startsWith('$2b$12$')));
    else assert.equal(c.usuario[caso === 'usuario-inativo' ? 'ativo' : 'ambiente_ativo'], false);
  });
}

test('rede compartilhada: 100 logins legítimos permitidos, 101 restringe IP por 15 minutos', async t => {
  const c = preparar(t);
  for (let i = 0; i < 100; i++) await c.login('senha-correta-sintetica');
  await recusa(c.login('senha-correta-sintetica', 'outra@example.invalid'), 429);
  assert.equal(c.comparacoes.length, 100);
  c.banco.avancar(899999); await recusa(c.login('senha-correta-sintetica'), 429);
  c.banco.avancar(1); await c.login('senha-correta-sintetica');
});

test('IP independente do identificador: alternar e-mails não contorna excesso', async t => {
  const c = preparar(t);
  for (let i = 0; i < 100; i++) await recusa(c.login(undefined, `pessoa${i}@example.invalid`), 401);
  await recusa(c.login('senha-correta-sintetica'), 429);
  assert.ok((await c.login('senha-correta-sintetica', undefined, '192.0.2.2')).token);
});

test('IP só usa socket; X-Forwarded-For e req.ip falsificados não chegam à proteção', async t => {
  const c = preparar(t);
  const service = c.componentes.service;
  t.mock.method(service, 'login', async (_body, ip) => { assert.equal(ip, IP); return { token: 'sintetico' }; });
  const res = { status() { return this; }, json() { return this; } };
  await c.componentes.controller.login({ body: {}, socket: { remoteAddress: IP }, ip: '198.51.100.1', headers: { 'x-forwarded-for': '198.51.100.2' } }, res);
});

test('canonização IPv4 e IPv6 /64; variações não contornam contador', async t => {
  const c = preparar(t), normalizar = c.componentes.protecao.normalizarIp;
  assert.equal(normalizar('::ffff:192.0.2.1'), normalizar('192.0.2.1'));
  assert.equal(normalizar('::ffff:c000:201'), normalizar('192.0.2.1'));
  assert.equal(normalizar('2001:db8:0:1::1'), normalizar('2001:0db8:0000:0001:0000:0000:0000:9999'));
  assert.notEqual(normalizar('2001:db8:0:1::1'), normalizar('2001:db8:0:2::1'));
  for (const ip of [undefined, '', 'cabecalho-forjado']) await recusa(c.login(undefined, undefined, ip || null), 503, 'Login temporariamente indisponível. Tente novamente.');
});

for (const falha of ['conexao', 'commit', 'login:lock', 'login:estado', 'login:ip', 'login:sucesso', 'login:falha']) {
  test('armazenamento falha em ' + falha + ': sem token e HTTP 503 genérico', async t => {
    const c = preparar(t);
    if (['conexao', 'commit'].includes(falha)) c.banco.falhas[falha] = true;
    else c.banco.falhas.sql = falha;
    await recusa(c.login(falha === 'login:falha' ? undefined : 'senha-correta-sintetica'), 503, 'Login temporariamente indisponível. Tente novamente.');
  });
}

test('rollback falha descarta conexão; falha não é convertida em login livre', async t => {
  const c = preparar(t);
  c.banco.falhas.sql = 'login:ip'; c.banco.falhas.rollback = true;
  await recusa(c.login(), 503, 'Login temporariamente indisponível. Tente novamente.');
  assert.deepEqual(c.banco.liberacoes, [true]);
});

test('COMMIT do identificador falha: não retorna JWT nem perde falhas anteriores', async t => {
  const c = preparar(t);
  for (let i = 0; i < 4; i++) await recusa(c.login(), 401);
  c.banco.falhas.commitTipo = 'identificador';
  await recusa(c.login('senha-correta-sintetica'), 503, 'Login temporariamente indisponível. Tente novamente.');
  assert.equal([...c.banco.estado.values()].find(r => r.tipo === 'identificador').falhas.length, 4);
  delete c.banco.falhas.commitTipo;
  await recusa(c.login(), 429);
});

test('falha de assinatura não limpa contador e não conta como senha incorreta', async t => {
  const c = preparar(t);
  await recusa(c.login(), 401);
  t.mock.method(jwt, 'sign', () => { throw Error('SEGREDO_NAO_PUBLICAR'); });
  await recusa(c.login('senha-correta-sintetica'), 503, 'Login temporariamente indisponível. Tente novamente.');
  assert.equal([...c.banco.estado.values()].find(r => r.tipo === 'identificador').falhas.length, 1);
});

test('101 requisições concorrentes com identificadores distintos mantêm teto por IP', async t => {
  const c = preparar(t);
  const resultados = await Promise.allSettled(Array.from({ length: 101 }, (_, i) => c.login(undefined, `conta${i}@example.invalid`)));
  assert.equal(resultados.filter(r => r.reason?.statusCode === 401).length, 100);
  assert.equal(resultados.filter(r => r.reason?.statusCode === 429).length, 1);
});

test('JWT emitido antes da restrição continua criptograficamente válido', async t => {
  const c = preparar(t), dados = await c.login('senha-correta-sintetica');
  for (let i = 0; i < 4; i++) await recusa(c.login(), 401);
  await recusa(c.login(), 429);
  assert.equal(jwt.verify(dados.token, process.env.JWT_SECRET).sub, '10');
});

test('ambiente forjado no corpo não reinicia contador nem modifica vínculo multi-tenant', async t => {
  const c = preparar(t);
  for (let i = 0; i < 4; i++) await recusa(c.login(), 401);
  await recusa(c.componentes.service.login({ email: 'pessoa@example.invalid', senha: 'errada-sintetica', id_ambiente: B, eh_fundador: false }, IP), 429);
  assert.equal(c.usuario.id_ambiente, A);
  assert.equal(c.usuario.eh_fundador, true);
});

test('identificadores diferentes não compartilham restrição na mesma rede', async t => {
  const c = preparar(t);
  for (let i = 0; i < 4; i++) await recusa(c.login(), 401);
  await recusa(c.login(), 429);
  Object.assign(c.usuario, { email: 'outra@example.invalid', id_ambiente: B });
  assert.ok((await c.login('senha-correta-sintetica', 'outra@example.invalid')).token);
});

test('503 e logs do controller não expõem erro PostgreSQL ou credenciais', async t => {
  const c = preparar(t); c.banco.falhas.conexao = true;
  const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await c.componentes.controller.login({ body: { email: 'pessoa@example.invalid', senha: 'senha-correta-sintetica' }, socket: { remoteAddress: IP } }, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { status: 'error', message: 'Erro interno ao realizar login.' });
  assert.deepEqual(c.logs, [['Erro ao realizar login.', { statusCode: 503 }]]);
});

test('hash fictício usado em contas inexistentes tem formato bcrypt válido e custo 12', async () => {
  const bcrypt = require('bcryptjs');
  const hash = '$2b$12$' + '.'.repeat(53);
  assert.equal(bcrypt.getRounds(hash), 12);
  assert.equal(await bcrypt.compare('entrada-sintetica-sem-conta', hash), false);
});

test('configuração ausente ou inválida não consulta banco nem revela segredo', async t => {
  const c = preparar(t);
  for (const valor of ['', 'curto', Buffer.alloc(32, 7).toString('base64').replace(/=$/, '!')]) {
    process.env.LOGIN_HMAC_SECRET = valor;
    await recusa(c.login(), 503, 'Login temporariamente indisponível. Tente novamente.');
  }
  assert.equal(c.banco.consultas.length, 0);
});

for (const ambiente of [A, B]) for (const perfil of politica.perfis) {
  test(`regressão JWT/RBAC: ${ambiente} ${perfil}`, async t => {
    const c = preparar(t);
    Object.assign(c.usuario, { id_ambiente: ambiente, perfil_acesso: perfil, eh_fundador: perfil === 'ADMINISTRADOR' });
    const dados = await c.login('senha-correta-sintetica');
    const payload = jwt.verify(dados.token, process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'inventario-espacos-confinados-api', audience: 'inventario-espacos-confinados-pwa' });
    assert.equal(payload.sub, '10'); assert.equal(payload.perfil, perfil);
    assert.equal(payload.id_ambiente, undefined); assert.equal(dados.usuario.id_ambiente, undefined);
    assert.equal(dados.usuario.eh_fundador, perfil === 'ADMINISTRADOR');
  });
}

test('chaves persistidas e parâmetros de controle não contêm e-mail, IP, senha ou JWT', async t => {
  const c = preparar(t);
  await c.login('senha-correta-sintetica');
  for (const chave of c.banco.estado.keys()) assert.match(chave, /^(identificador|ip):[0-9a-f]{64}$/);
  const sql = JSON.stringify(c.banco.consultas);
  for (const valor of [IP, 'pessoa@example.invalid', 'senha-correta-sintetica', process.env.LOGIN_HMAC_SECRET]) assert.ok(!sql.includes(valor));
  assert.deepEqual(c.logs, []);
});

test('migration 023 isolada e SQL de controle usam relógio PostgreSQL e locks', () => {
  const migration = fs.readFileSync(require.resolve('../database/023_controle_tentativas_login.sql'), 'utf8');
  const repo = fs.readFileSync(require.resolve('../src/repositories/loginTentativaRepository.js'), 'utf8');
  assert.match(migration, /PRIMARY KEY \(tipo, chave_hash\)/);
  assert.match(migration, /idx_login_tentativa_limpeza/);
  assert.doesNotMatch(migration, /ALTER TABLE|DROP TABLE|UPDATE (?:public\.)?usuario|senha_hash|id_usuario/);
  assert.match(repo, /ON CONFLICT \(tipo, chave_hash\) DO UPDATE/);
  assert.match(repo, /clock_timestamp\(\)/); assert.doesNotMatch(repo, /Date\.now|new Date/);
  assert.match(repo, /f > agora.instante - INTERVAL '15 minutes'/);
});
