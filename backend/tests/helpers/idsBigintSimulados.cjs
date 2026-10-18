const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const UUID = '33333333-3333-4333-8333-333333333333';
const SECRET = 'segredo-ficticio-regressoes-bigint';
const PDF = Buffer.from('%PDF-1.7\nPDF inteiramente simulado\n%%EOF');

function preparar(t, opcoes = {}) {
  const inesperados = [], consultas = [], fisico = [], logs = [], liberacoes = [];
  const usuarios = [
    { id_usuario: opcoes.idA ?? '10', id_ambiente: A, nome: 'Pessoa A', email: 'a@example.invalid', perfil_acesso: 'ADMINISTRADOR', ativo: true, senha_hash: 'hash:antiga123' },
    { id_usuario: opcoes.idB ?? 20, id_ambiente: B, nome: 'Pessoa B', email: 'b@example.invalid', perfil_acesso: 'ADMINISTRADOR', ativo: true, senha_hash: 'hash:antiga123' },
  ];
  const ativo = { [A]: true, [B]: true };
  const relatorios = [A, B].map((env, i) => ({ id_relatorio: i ? 8 : opcoes.idRelatorio ?? '7',
    id_local: i ? 50 : opcoes.idLocal ?? '40', id_ambiente: env,
    caminho_pdf: `uploads/relatorios/relatorio-${i ? 8 : 7}-${env}_${UUID}.pdf`,
    hash_pdf: crypto.createHash('sha256').update(PDF).digest('hex'),
    evidencias: [{ id_evidencia: i ? 200 : 100, tipo: 'FOTO', caminho_arquivo: `uploads/evidencias/${env}_${i ? 50 : 40}_${UUID}.jpg` }],
  }));
  const sincronizacoes = [A, B].map((env, i) => ({ id_sincronizacao: i ? 61 : '60', id_ambiente: env,
    id_usuario: usuarios[i].id_usuario, entidade: 'LOCAL', id_entidade: i ? 50 : '40', operacao: 'ATUALIZAR',
    status: 'CONFLITO', versao_cliente: 1, versao_servidor: 2,
    id_operacao_cliente: UUID, id_registro_cliente: null,
    dados_cliente: { id_local: i ? 50 : '40', id_campanha: i ? 31 : '30' },
    dados_servidor: { id_local: i ? 50 : '40', id_campanha: i ? 31 : '30' }, dados_resolvidos: null }));
  const igual = (a, b) => a != null && b != null && String(a) === String(b);
  const publico = u => { const { senha_hash, ...r } = u; return r; };
  const row = (...rows) => ({ rows, rowCount: rows.length });
  const proibido = nome => { inesperados.push(nome); throw new Error('Operação não simulada: ' + nome); };
  let aberta = false, antes;
  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim(); consultas.push({ sql: s, params });
    try {
      if (s.startsWith('BEGIN')) { assert.equal(aberta, false); aberta = true; antes = usuarios.map(u => ({ ...u })); return row(); }
      if (s === 'COMMIT') { assert.ok(aberta); aberta = false; return row(); }
      if (s === 'ROLLBACK') { assert.ok(aberta); usuarios.splice(0, usuarios.length, ...antes); aberta = false; return row(); }
      if (s.includes('pg_advisory_xact_lock')) { assert.ok(aberta); return row(); }
      if (s.startsWith('SELECT EXISTS') && s.includes('FROM convite')) { assert.ok(aberta); return row({ existe: false }); }
      if (s.startsWith('SELECT EXISTS') && s.includes('FROM usuario')) { assert.ok(aberta); return row({ existe: false }); }
      if (s.startsWith('SELECT 1 FROM usuario')) { assert.ok(aberta); return row(); }
      if (s.startsWith('SELECT') && s.includes('FROM ambiente') && !s.includes('JOIN local')) {
        assert.ok(aberta); assert.match(s, /FOR SHARE/); assert.match(s, /ativo = TRUE/);
        return ativo[params[0]] ? row({ id_ambiente: params[0] }) : row();
      }
      if (/^SELECT (?:(?! FROM ).)* FROM usuario AS u\b/.test(s)) {
        if (s.includes('WHERE LOWER(u.email) = $1')) {
          assert.match(s, /LEFT JOIN ambiente AS a/);
          const n = consultas.filter(c => c.sql.includes('WHERE LOWER(u.email)')).length;
          const u = usuarios.find(u => u.email === params[0]);
          if (!u) return row();
          return row({ ...u, id_usuario: opcoes.loginIds ? opcoes.loginIds[Math.min(n - 1, 1)] : u.id_usuario, ambiente_ativo: ativo[u.id_ambiente] });
        }
        assert.match(s, /u.id_usuario = \$1/);
        const u = usuarios.find(u => igual(u.id_usuario, params[0]));
        const env = params[1] ?? u?.id_ambiente;
        if (params.length > 1) assert.match(s, /u.id_ambiente = \$2/);
        if (s.includes('FOR UPDATE') || s.includes('FOR SHARE')) assert.ok(aberta);
        if (!u || u.id_ambiente !== env || !ativo[env] || !u.ativo) return row();
        if (s.includes("u.perfil_acesso = 'ADMINISTRADOR'") && u.perfil_acesso !== 'ADMINISTRADOR') return row();
        return row(s.includes('senha_hash') ? { ...u } : publico(u));
      }
      if (s.startsWith('SELECT') && s.includes('WHERE id_usuario = $1 OR')) {
        assert.ok(aberta); assert.match(s, /ORDER BY id_usuario FOR UPDATE/);
        return { rows: usuarios.filter(u => igual(u.id_usuario, params[0]) || igual(u.id_usuario, params[1]) && u.id_ambiente === params[2]).map(u => ({ ...u })) };
      }
      if (/^SELECT (?:(?! FROM ).)* FROM usuario\b/.test(s) && !s.includes(' AS u')) {
        assert.match(s, /id_ambiente = \$[12]/);
        const individual = s.includes('id_usuario = $1');
        const env = params[individual ? 1 : 0];
        return { rows: usuarios.filter(u => u.id_ambiente === env && (!individual || igual(u.id_usuario, params[0]))).map(publico) };
      }
      if (s.startsWith('UPDATE usuario AS u SET')) {
        assert.ok(aberta); assert.match(s, /u.id_usuario = \$1 AND u.id_ambiente = \$2/);
        assert.match(s, /u.ativo = TRUE/); assert.match(s, /a.ativo = TRUE/);
        const u = usuarios.find(u => igual(u.id_usuario, params[0]) && u.id_ambiente === params[1]);
        if (!u || !u.ativo || !ativo[u.id_ambiente]) return row();
        if (s.includes('senha_hash = $3')) u.senha_hash = params[2];
        else { if (params[2]) u.nome = params[3]; if (params[4]) u.email = params[5]; }
        return row(publico(u));
      }
      if (s.startsWith('UPDATE usuario AS alvo')) {
        assert.ok(aberta); assert.match(s, /alvo.id_usuario = \$1 AND alvo.id_ambiente = \$2/);
        assert.match(s, /administrador.id_usuario = \$3/);
        const admin = usuarios.find(u => igual(u.id_usuario, params[2]) && u.id_ambiente === params[1] && u.ativo && u.perfil_acesso === 'ADMINISTRADOR');
        const alvo = usuarios.find(u => igual(u.id_usuario, params[0]) && u.id_ambiente === params[1]);
        if (!admin || !ativo[params[1]] || !alvo) return row();
        if (s.includes('SET ativo = $4')) alvo.ativo = params[3];
        else { alvo.nome = params[3]; alvo.email = params[4]; alvo.perfil_acesso = params[5]; }
        return row(publico(alvo));
      }
      if (s.startsWith('INSERT INTO convite')) {
        assert.ok(aberta);
        return row({ id_convite: UUID, id_ambiente: params[0], email: params[1], perfil_acesso: params[2], id_usuario_convite: params[4] });
      }
      if (s.startsWith('SELECT EXISTS') && s.includes('FROM usuario')) { assert.ok(aberta); return row({ existe: false }); }
      if (s.startsWith('SELECT') && s.includes('FROM local l') && s.includes('LEFT JOIN evidencia e')) {
        assert.match(s, /c.id_ambiente = \$1/); assert.match(s, /u.id_usuario = \$2/);
        const u = usuarios.find(u => igual(u.id_usuario, params[1]) && u.id_ambiente === params[0]);
        if (!u || !u.ativo || !ativo[u.id_ambiente]) return row();
        const r = relatorios.find(r => r.id_ambiente === params[0]);
        return row({ id_local: r.id_local, nome_campanha: params[0] === A ? 'CAMPANHA_A' : 'CAMPANHA_B', nome_local: params[0] === A ? 'LOCAL_A' : 'LOCAL_B', status: 'ATIVO', id_evidencia: null,
          latitude_local: null, longitude_local: null, latitude_foto: null, longitude_foto: null, precisao_gps: null });
      }
      if (s.startsWith('SELECT') && (s.includes('FROM relatorio') || s.includes('JOIN relatorio AS r'))) {
        const [id, env, uid] = params;
        assert.match(s, /(?:c|a).id_ambiente = \$2/); assert.match(s, /u.id_usuario = \$3/);
        const u = usuarios.find(u => igual(u.id_usuario, uid) && u.id_ambiente === env);
        const r = relatorios.find(r => igual(r.id_relatorio, id) && r.id_ambiente === env);
        if (!u || !u.ativo || !ativo[env] || !r) return row();
        if (s.includes('FOR ')) { assert.ok(aberta); return row({ id_local: r.id_local, id_campanha: env === A ? '30' : 31 }); }
        return row({ ...r });
      }
      if (s.startsWith('UPDATE relatorio AS r SET caminho_pdf')) {
        assert.ok(aberta); assert.match(s, /c.id_ambiente = \$2/);
        const r = relatorios.find(r => igual(r.id_relatorio, params[0]) && r.id_ambiente === params[1]);
        assert.ok(r); r.caminho_pdf = params[3]; r.hash_pdf = params[4]; return row({ ...r });
      }
      if (s.startsWith('SELECT s.* FROM sincronizacao s')) {
        assert.match(s, /s.id_ambiente = \$1/); assert.match(s, /solicitante.id_usuario = \$2/);
        const u = usuarios.find(u => igual(u.id_usuario, params[1]) && u.id_ambiente === params[0]);
        if (!u || !u.ativo || !ativo[u.id_ambiente]) return row();
        return { rows: sincronizacoes.filter(s => s.id_ambiente === params[0] &&
          (!sql.includes('s.id_sincronizacao = $3') || igual(s.id_sincronizacao, params[2]))) };
      }
      return proibido(s);
    } catch (e) { if (e.code === 'ERR_ASSERTION') inesperados.push(e.message); throw e; }
  }
  const pool = { query, connect: async () => ({ query, release: (...args) => liberacoes.push(args) }) };
  const dependencias = new Map();
  const load = Module._load;
  t.mock.method(Module, '_load', function (r, parent, ...args) {
    const deps = dependencias.get(parent?.filename);
    if (deps) return Object.hasOwn(deps, r) ? deps[r] : proibido('import ' + r);
    return load.call(this, r, parent, ...args);
  });
  function carregar(nome, deps) {
    if (['services/authService', 'middlewares/autenticacaoMiddleware', 'services/relatorioMultiTenantService'].includes(nome)) {
      deps['../utils/normalizarIdDominio'] = require('../../src/utils/normalizarIdDominio');
    }
    const alvo = require.resolve('../../src/' + nome), anterior = require.cache[alvo];
    dependencias.set(alvo, deps);
    delete require.cache[alvo];
    t.after(() => { if (anterior) require.cache[alvo] = anterior; else delete require.cache[alvo]; });
    return require(alvo);
  }
  const segredoAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  t.after(() => { if (segredoAnterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = segredoAnterior; assert.deepEqual(inesperados, []); });
  t.mock.method(console, 'error', (...args) => logs.push(args));
  const bcrypt = { compare: async (senha, hash) => hash === 'hash:' + senha, hash: async (senha, rounds) => { assert.equal(rounds, 12); return 'hash:' + senha; } };
  const email = carregar('repositories/emailLockRepository', {});
  const convites = carregar('repositories/conviteRepository', {});
  const usuarioRepo = carregar('repositories/usuarioRepository', { '../config/database': pool, './emailLockRepository': email, './conviteRepository': convites });
  const middleware = carregar('middlewares/autenticacaoMiddleware', { jsonwebtoken: jwt, '../repositories/usuarioRepository': usuarioRepo });
  const authRepo = carregar('repositories/autenticacaoMultiTenantRepository', { '../config/database': pool });
  const authService = carregar('services/authService', { bcryptjs: bcrypt, jsonwebtoken: jwt, '../repositories/usuarioRepository': usuarioRepo, '../repositories/autenticacaoMultiTenantRepository': authRepo });
  const authController = carregar('controllers/authController', { '../services/authService': authService });
  const contaRepo = carregar('repositories/contaMultiTenantRepository', { '../config/database': pool, './emailLockRepository': email, './conviteRepository': convites });
  const contaService = carregar('services/contaMultiTenantService', { '../repositories/contaMultiTenantRepository': contaRepo, bcryptjs: bcrypt });
  const usuarioService = carregar('services/usuarioService', { '../repositories/usuarioRepository': usuarioRepo, bcryptjs: bcrypt });
  const administrador = carregar('repositories/administradorRepository', {});
  const ambiente = carregar('repositories/ambienteRepository', {});
  const convidado = carregar('repositories/usuarioConvidadoRepository', {});
  const conviteService = carregar('services/conviteService', { crypto, '../config/database': pool, bcryptjs: bcrypt,
    '../repositories/usuarioConvidadoRepository': convidado, '../repositories/administradorRepository': administrador,
    '../repositories/ambienteRepository': ambiente, '../repositories/conviteRepository': convites, '../repositories/emailLockRepository': email });
  const conviteController = carregar('controllers/conviteController', { '../services/conviteService': conviteService });
  const localRepo = carregar('repositories/localRepository', { '../config/database': pool });
  const excel = carregar('services/excelService', { exceljs: ExcelJS, '../repositories/localRepository': localRepo });
  const syncRepo = carregar('repositories/sincronizacaoMultiTenantRepository', { '../config/database': pool });
  const sync = carregar('services/sincronizacaoMultiTenantService', { '../repositories/sincronizacaoMultiTenantRepository': syncRepo });

  // Somente filesystem fictício. Nenhuma função fs real é encaminhada.
  const raiz = path.resolve(__dirname, '../../uploads'), pdfs = path.join(raiz, 'relatorios'), fotos = path.join(raiz, 'evidencias');
  const arquivos = new Map(relatorios.map(r => [path.join(raiz, '..', r.caminho_pdf), PDF]));
  for (const r of relatorios) arquivos.set(path.join(raiz, '..', r.evidencias[0].caminho_arquivo), Buffer.from('foto-simulada'));
  const stat = (ino, tamanho, pasta = false) => ({ dev: 1n, ino: BigInt(ino), nlink: 1n, size: BigInt(tamanho), mtimeMs: 1000n, mtimeNs: 1000n, ctimeNs: 1000n,
    isFile: () => !pasta, isDirectory: () => pasta, isSymbolicLink: () => false });
  const fs = { constants: { O_RDONLY: 0, O_NOFOLLOW: 0 }, promises: {
    async realpath(p) { fisico.push(['realpath', p]); return p; },
    async lstat(p) { fisico.push(['lstat', p]); if ([raiz, pdfs, fotos].includes(p)) return stat(p === raiz ? 1 : 2, 0, true);
      if (!arquivos.has(p)) return proibido('lstat não simulado ' + p); return stat(3, arquivos.get(p).length); },
    async mkdir(p) { assert.equal(p, pdfs); throw Object.assign(new Error('pasta simulada'), { code: 'EEXIST' }); },
    async open(p, flags) {
      fisico.push(['open', p, flags]); assert.ok([pdfs, fotos].includes(path.dirname(p)));
      if (flags === 'wx') { assert.equal(arquivos.has(p), false); arquivos.set(p, Buffer.alloc(0)); }
      assert.ok(arquivos.has(p));
      return { stat: async () => stat(3, arquivos.get(p).length), readFile: async () => Buffer.from(arquivos.get(p)),
        writeFile: async b => arquivos.set(p, Buffer.from(b)), sync: async () => {}, close: async () => fisico.push(['close', p]) };
    },
  } };
  const utils = carregar('utils/relatorioArquivoUtils', { fs, path, crypto: { ...crypto, randomUUID: () => '44444444-4444-4444-8444-444444444444' } });
  const relatorioRepo = carregar('repositories/relatorioMultiTenantRepository', { '../config/database': pool });
  const pdf = { gerarPdfRelatorio: async (dados, opcoes) => { assert.equal(opcoes.somenteBuffer, true); assert.ok(dados.id_local); return PDF; } };
  const relatorio = carregar('services/relatorioMultiTenantService', { '../repositories/relatorioMultiTenantRepository': relatorioRepo, './pdfService': pdf, '../utils/relatorioArquivoUtils': utils });
  function resposta() { return { headersSent: false, envios: 0, status(code) { assert.equal(this.headersSent, false); this.statusCode = code; return this; },
    json(body) { assert.equal(this.headersSent, false); this.envios++; this.headersSent = true; this.body = body; return this; } }; }
  async function autenticar(env = A, executar = async () => {}) {
    const usuario = usuarios.find(u => u.id_ambiente === env);
    const token = jwt.sign({ perfil: 'ADMINISTRADOR', id_ambiente: env === A ? B : A }, SECRET, {
      subject: String(usuario.id_usuario), algorithm: 'HS256', expiresIn: '1h', issuer: process.env.JWT_ISSUER || 'inventario-espacos-confinados-api', audience: process.env.JWT_AUDIENCE || 'inventario-espacos-confinados-pwa' });
    const req = { headers: { authorization: 'Bearer ' + token }, body: {}, params: {}, query: { id_ambiente: env === A ? B : A } }, res = resposta();
    let avancou = false;
    await middleware.autenticarMultiTenant(req, res, () => { avancou = true; });
    if (avancou) await executar(req, res);
    return { req, res, avancou };
  }
  return { carregar, usuarios, ativo, relatorios, sincronizacoes, consultas, fisico, logs, liberacoes,
    authService, authController, middleware, contaRepo, contaService, usuarioService, usuarioRepo, conviteController,
    excel, sync, relatorio, utils, resposta, autenticar, ExcelJS };
}
module.exports = { preparar, A, B, UUID, PDF };
