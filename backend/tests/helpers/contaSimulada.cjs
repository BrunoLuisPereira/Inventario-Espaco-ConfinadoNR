const politicaRbac723 = require('../../src/utils/permissoes');
const assert = require('node:assert/strict');
const Module = require('node:module');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const perfis = ['ADMINISTRADOR', 'ENGENHEIRO_SEGURANCA'];
const arquivos = [
  'routes/authRoutes', 'services/contaMultiTenantService', 'repositories/contaMultiTenantRepository',
  'repositories/usuarioRepository', 'repositories/emailLockRepository', 'repositories/conviteRepository',
  'middlewares/autenticacaoMiddleware',
].map(nome => require.resolve('../../src/' + nome));

function preparar(t, opcoes = {}) {
  const usuario = { id_usuario: 1, id_ambiente: A, nome: 'Original', email: 'original@example.invalid',
    eh_fundador: true, perfil_acesso: 'ADMINISTRADOR', ativo: true, senha_hash: 'hash:antiga123', data_criacao: 'data1', data_atualizacao: 'data2', ...opcoes.usuario };
  const estado = { usuario, ambienteAtivo: true, outroEmail: null, reservado: false, ...opcoes.estado };
  const eventos = [], desconhecidos = [], logs = [], bcryptChamadas = [], errosSimulador = [];
  const publico = u => {
    const { id_usuario, nome, email, perfil_acesso, eh_fundador, ativo, data_criacao, data_atualizacao } = u;
    return { id_usuario, nome, email, perfil_acesso, eh_fundador, ativo, data_criacao, data_atualizacao };
  };
  const resultado = (...rows) => ({ rows, rowCount: rows.length });
  const sqlNormal = sql => sql.replace(/\s+/g, ' ').trim();
  let pendente, transacao = false, bloqueado = false, emailBloqueado;
  async function consultar(sql, params = [], cliente = false) {
    const texto = sqlNormal(sql);
    eventos.push({ sql: texto, params: [...params], cliente });
    if (opcoes.falhar && opcoes.falhar(texto)) throw opcoes.erro || new Error('SQL TOKEN SENHA /diretorio/interno');
    if (texto === 'BEGIN') { assert.equal(transacao, false); transacao = true; pendente = { ...estado.usuario }; return resultado(); }
    if (texto === 'ROLLBACK') { transacao = false; pendente = null; return resultado(); }
    if (texto === 'COMMIT') {
      assert.ok(transacao); estado.usuario = pendente; transacao = false;
      if (opcoes.aoCommit) opcoes.aoCommit();
      return resultado();
    }
    if (/pg_advisory_xact_lock\( hashtextextended/.test(texto)) {
      assert.ok(transacao && cliente); assert.equal(bloqueado, false);
      emailBloqueado = params[0]; return resultado();
    }
    if (texto.startsWith('SELECT id_ambiente FROM ambiente')) {
      assert.ok(transacao && cliente); assert.match(texto, /FOR SHARE$/);
      assert.equal(params[0], estado.usuario.id_ambiente);
      if (opcoes.antesAmbiente) opcoes.antesAmbiente(estado);
      return estado.ambienteAtivo ? resultado({ id_ambiente: params[0] }) : resultado();
    }
    if (texto.startsWith('SELECT') && texto.includes('FROM usuario AS u') && texto.endsWith('FOR UPDATE')) {
      assert.ok(transacao && cliente);
      assert.ok(eventos.some(e => e.sql?.endsWith('FOR SHARE')));
      if (opcoes.antesUsuario) opcoes.antesUsuario(estado);
      pendente = { ...estado.usuario }; bloqueado = true;
      assert.deepEqual(params, [estado.usuario.id_usuario, estado.usuario.id_ambiente]);
      assert.match(texto, /u.id_usuario = \$1 AND u.id_ambiente = \$2/);
      return resultado({ ...pendente });
    }
    if (texto.startsWith('SELECT 1 FROM usuario')) {
      assert.ok(bloqueado && transacao); assert.equal(params[0], emailBloqueado);
      assert.deepEqual(params, [emailBloqueado, estado.usuario.id_usuario]);
      assert.match(texto, /LOWER\(BTRIM\(email\)\).*id_usuario <> \$2/);
      return estado.outroEmail === params[0] ? resultado({ '?column?': 1 }) : resultado();
    }
    if (texto.startsWith('SELECT EXISTS') && texto.includes('FROM convite')) {
      assert.ok(bloqueado && transacao); assert.deepEqual(params, [emailBloqueado]);
      assert.match(texto, /data_aceite IS NULL/); assert.match(texto, /data_cancelamento IS NULL/);
      assert.match(texto, /data_expiracao > clock_timestamp\(\)/);
      return resultado({ existe: estado.reservado });
    }
    if (texto.startsWith('UPDATE usuario AS u SET')) {
      assert.ok(bloqueado && transacao && cliente);
      assert.equal(estado.usuario.ativo, true); assert.equal(estado.ambienteAtivo, true);
      assert.ok(perfis.includes(estado.usuario.perfil_acesso));
      assert.deepEqual(params.slice(0, 2), [estado.usuario.id_usuario, estado.usuario.id_ambiente]);
      const set = texto.split(' WHERE ')[0];
      assert.doesNotMatch(set, /\b(?:perfil_acesso|id_usuario|id_ambiente|ativo)\s*=/);
      assert.match(texto, /u.ativo = TRUE/); assert.match(texto, /a.ativo = TRUE/);
      assert.match(texto, /u.id_usuario = \$1 AND u.id_ambiente = \$2/);
      if (opcoes.updateVazio) return resultado();
      if (set.includes('senha_hash = $3')) pendente.senha_hash = params[2];
      else {
        assert.match(set, /CASE WHEN \$3 THEN \$4 ELSE u.nome END/);
        assert.match(set, /CASE WHEN \$5 THEN \$6 ELSE u.email END/);
        if (params[2]) pendente.nome = params[3];
        if (params[4]) { assert.equal(params[5], emailBloqueado); pendente.email = params[5]; }
      }
      return resultado(publico(pendente));
    }
    if (texto.startsWith('SELECT') && texto.includes('FROM usuario AS u') && texto.includes('JOIN ambiente AS a')) {
      assert.equal(cliente, false);
      assert.equal(params[0], estado.usuario.id_usuario);
      assert.match(texto, /u.ativo = TRUE/); assert.match(texto, /a.ativo = TRUE/);
      if (opcoes.duranteIdentidade) opcoes.duranteIdentidade();
      if (!estado.usuario.ativo || !estado.ambienteAtivo) return resultado();
      if (params.length === 1) return resultado({ ...estado.usuario });
      if (opcoes.durantePerfil) opcoes.durantePerfil(estado);
      assert.deepEqual(params, [estado.usuario.id_usuario, estado.usuario.id_ambiente]);
      assert.match(texto, /u.id_ambiente = \$2/);
      if (!estado.usuario.ativo || !estado.ambienteAtivo) return resultado();
      return resultado(publico(estado.usuario));
    }
    desconhecidos.push(texto);
    throw new Error('SQL desconhecido: ' + texto);
  }
  const client = {
    query: async (sql, params) => {
      try { return await consultar(sql, params, true); }
      catch (erro) { if (erro.code === 'ERR_ASSERTION') errosSimulador.push(erro); throw erro; }
    },
    release: (...args) => { eventos.push({ release: args }); },
  };
  const pool = {
    query: (sql, params) => consultar(sql, params),
    connect: async () => { eventos.push({ connect: true }); if (opcoes.falhaConnect) throw new Error('CONEXAO SENSIVEL'); return client; },
  };
  const bcrypt = {
    compare: async (senha, hash) => { assert.ok(bloqueado && transacao); bcryptChamadas.push(['compare', senha, hash]); return hash === 'hash:' + senha; },
    hash: async (senha, rounds) => { assert.ok(bloqueado && transacao); assert.equal(rounds, 12); bcryptChamadas.push(['hash', senha, rounds]); return 'hash:' + senha; },
  };
  const anteriores = arquivos.map(p => [p, require.cache[p]]);
  const carregar = Module._load;
  const jwtAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'segredo-somente-simulado';
  t.after(() => { if (jwtAnterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = jwtAnterior; assert.deepEqual(desconhecidos, []); if (errosSimulador.length) throw errosSimulador[0]; });
  t.mock.method(console, 'error', (...args) => logs.push(args));
  let router, service, repository;
  try {
    for (const p of arquivos) delete require.cache[p];
    Module._load = function (request, parent, ...resto) {
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (request === '../utils/permissoes') return politicaRbac723;
      // Utilitario puro real, restrito aos tres consumidores autorizados.
      if (request === '../utils/normalizarIdDominio' && ['middlewares/autenticacaoMiddleware', 'services/authService', 'services/relatorioMultiTenantService'].some(p => parent?.filename === require.resolve('../../src/' + p))) return require('../../src/utils/normalizarIdDominio');
      if (parent && arquivos.includes(parent.filename)) {
        if (request === '../config/database') return pool;
        if (request === 'bcryptjs') return bcrypt;
        if (request === 'jsonwebtoken') return { verify(token, secret, config) {
          assert.equal(secret, process.env.JWT_SECRET); assert.deepEqual(config.algorithms, ['HS256']);
          if (token !== 'valido') throw Object.assign(new Error('TOKEN INTERNO'), { name: token === 'expirado' ? 'TokenExpiredError' : 'JsonWebTokenError' });
          return { sub: String(estado.usuario.id_usuario), perfil: 'ADMINISTRADOR', id_ambiente: B };
        } };
        if (request === '../controllers/authController') return { login: function loginPreservado() {} };
        if (request === 'express' || request.startsWith('./') || request.startsWith('../repositories/') ||
            request.startsWith('../services/conta') || request.startsWith('../middlewares/')) return carregar.call(this, request, parent, ...resto);
        throw new Error('Dependência externa inesperada: ' + request);
      }
      return carregar.call(this, request, parent, ...resto);
    };
    router = require(arquivos[0]); service = require(arquivos[1]); repository = require(arquivos[2]);
  } finally {
    Module._load = carregar;
    for (const [p, anterior] of anteriores) { if (anterior) require.cache[p] = anterior; else delete require.cache[p]; }
  }
  const res = { headersSent: false, envios: 0, statusCode: 200,
    status(code) { assert.equal(this.headersSent, false); this.statusCode = code; return this; },
    json(body) { assert.equal(this.headersSent, false); this.envios++; this.body = body; this.headersSent = true; if (opcoes.jsonFalha) throw new Error('TRANSPORTE SENSIVEL'); return this; },
  };
  async function executar(method, caminho, body, token = 'valido') {
    const layer = router.stack.find(l => l.route?.path === caminho && l.route.methods[method]);
    assert.ok(layer);
    const req = { body, params: { id_usuario: 999, id_ambiente: B }, query: { id_ambiente: B, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR' },
      headers: token === null ? {} : { authorization: 'Bearer ' + token } };
    const handlers = layer.route.stack.map(s => s.handle);
    let indice = 0;
    const proximo = () => handlers[indice++]?.(req, res, proximo);
    await proximo();
    return { req, res };
  }
  return { estado, eventos, logs, bcryptChamadas, executar, res, service, repository, publico, router,
    identidade: () => ({ id_usuario: estado.usuario.id_usuario, id_ambiente: estado.usuario.id_ambiente, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR' }) };
}
module.exports = { preparar, A, B };
