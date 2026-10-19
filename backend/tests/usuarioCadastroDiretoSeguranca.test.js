const politicaRbac723 = require('../src/utils/permissoes');
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");

const CAMINHOS = Object.fromEntries(Object.entries({
  repository: "../src/repositories/usuarioRepository",
  service: "../src/services/usuarioService",
  controller: "../src/controllers/usuarioController",
  autenticacao: "../src/middlewares/autenticacaoMiddleware",
  autorizacao: "../src/middlewares/autorizacaoMiddleware",
  router: "../src/routes/usuarioRoutes",
}).map(([nome, caminho]) => [nome, require.resolve(caminho)]));
// Contrato público proposto para a futura correção, ainda não implementada.
const MENSAGEM = "Cadastro direto de usuários desativado. Utilize o fluxo de convites.";
const SENSIVEL = "SENHA_TOKEN_DADOS_FICTICIOS_NAO_REFLETIR";
const SEGREDO = "SEGREDO_FICTICIO_TESTE_BLOQUEIO_POST";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const CONTEXTOS = [
  { nome: "A", ambiente: A, outro: B, id: 11, token: "admin-a" },
  { nome: "B", ambiente: B, outro: A, id: 22, token: "admin-b" },
];
const ENDPOINTS = [
  { metodo: "GET", caminho: "/", controller: "listar", service: "listarUsuarios" },
  { metodo: "GET", caminho: "/101", controller: "buscarPorId", service: "buscarUsuarioPorId" },
  { metodo: "PUT", caminho: "/101", controller: "atualizar", service: "atualizarUsuario",
    mensagem: "Usuário atualizado com sucesso." },
  { metodo: "PATCH", caminho: "/101/status", controller: "alterarStatus", service: "alterarStatusUsuario",
    mensagem: "Usuário desativado com sucesso." },
];
const SQL_IDENTIDADE = "SELECT u.id_usuario, u.id_ambiente, u.nome, u.email, u.perfil_acesso, u.eh_fundador FROM usuario AS u INNER JOIN ambiente AS a ON a.id_ambiente = u.id_ambiente WHERE u.id_usuario = $1 AND u.ativo = TRUE AND a.ativo = TRUE LIMIT 1";
const SQL_EMAIL = "SELECT id_usuario, nome, email, senha_hash, perfil_acesso, ativo, data_criacao, data_atualizacao FROM usuario WHERE LOWER(email) = LOWER($1) LIMIT 1";

function preparar(t) {
  const estado = { criarController: 0, criarService: 0, hashing: 0, inserts: [],
    escritas: [], conexoes: 0, inesperadas: [], proibidas: [], externas: [],
    autenticacoes: [], consultas: [], servicos: [], controllers: [], logs: [] };
  const usuarios = new Map([
    [11, { id_usuario: 11, id_ambiente: A, eh_fundador: true, perfil_acesso: "ADMINISTRADOR", ativo: true }],
    [22, { id_usuario: 22, id_ambiente: B, eh_fundador: true, perfil_acesso: "ADMINISTRADOR", ativo: true }],
    [33, { id_usuario: 33, id_ambiente: A, eh_fundador: false, perfil_acesso: "ENGENHEIRO_SEGURANCA", ativo: true }],
  ]);
  const ambientes = new Map([[A, true], [B, true]]);
  const tokens = new Map([
    ["admin-a", { sub: "11", perfil: "ADMINISTRADOR" }],
    ["admin-b", { sub: "22", perfil: "ADMINISTRADOR" }],
    ["engenheiro", { sub: "33", perfil: "ENGENHEIRO_SEGURANCA" }],
  ]);
  for (const nome of ["error", "warn", "info", "log"]) {
    t.mock.method(console, nome, (...args) => estado.logs.push(args));
  }
  const jwt = { verify(token, segredo, opcoes) {
    assert.equal(segredo, SEGREDO);
    assert.deepEqual(opcoes.algorithms, ["HS256"]);
    if (!tokens.has(token)) throw Object.assign(new Error("JWT inválido simulado"), { name: "JsonWebTokenError" });
    return { ...tokens.get(token) };
  } };
  const pool = {
    async query(texto, parametros = []) {
      const sql = texto.replace(/\s+/g, " ").trim();
      estado.consultas.push({ sql, parametros: [...parametros] });
      if (/^INSERT\b/i.test(sql)) {
        estado.inserts.push(sql);
        estado.escritas.push(sql);
        throw new Error("INSERT proibido: tentativa registrada sem executar SQL");
      }
      if (/^(UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql)) {
        estado.escritas.push(sql);
        throw new Error("Escrita proibida");
      }
      if (sql === SQL_IDENTIDADE) {
        assert.equal(parametros.length, 1);
        const usuario = usuarios.get(parametros[0]);
        const rows = usuario?.ativo === true && ambientes.get(usuario.id_ambiente) === true
          ? [{ id_usuario: usuario.id_usuario, id_ambiente: usuario.id_ambiente,
            eh_fundador: usuario.eh_fundador === true, perfil_acesso: usuario.perfil_acesso, nome: "Administrador simulado", email: "admin@example.invalid" }]
          : [];
        return { rows, rowCount: rows.length };
      }
      // Deixa o fluxo legado inseguro avançar até os sentinelas de hash/INSERT;
      // não inventa erro de duplicidade para ocultar a ausência de bloqueio.
      if (sql === SQL_EMAIL) {
        assert.equal(parametros.length, 1);
        assert.equal(typeof parametros[0], "string");
        return { rows: [], rowCount: 0 };
      }
      estado.inesperadas.push(sql);
      throw new Error("SQL desconhecido no teste de bloqueio do POST");
    },
    connect() { estado.conexoes++; throw new Error("Conexão transacional não autorizada neste teste"); },
  };
  const externo = (nome) => new Proxy(Object.create(null), { get(_alvo, propriedade) {
    estado.externas.push(nome + "." + String(propriedade));
    throw new Error("Operação externa proibida no router de usuários");
  } });
  const bcrypt = { async hash() { estado.hashing++; return "HASH_FICTICIO_SEM_CRIPTOGRAFIA_REAL"; } };
  const cache = new Map(Object.values(CAMINHOS).map((p) => [p, require.cache[p]]));
  const load = Module._load;
  const dependencias = new Map();
  const modulos = {};
  const segredoAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SEGREDO;
  t.after(() => {
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
    assert.strictEqual(Module._load, load);
    for (const [p, anterior] of cache) assert.strictEqual(require.cache[p], anterior);
    assert.deepEqual(estado.proibidas, []);
    assert.deepEqual(estado.inesperadas, []);
    assert.deepEqual(estado.externas, []);
    assert.equal(estado.conexoes, 0);
    // Sentinelas independentes do HTTP: catch não pode esconder criação.
    assert.equal(estado.criarController, 0, "POST bloqueado não pode alcançar controller.criar");
    assert.equal(estado.criarService, 0, "POST bloqueado não pode alcançar service.criarUsuario");
    assert.equal(estado.hashing, 0);
    assert.deepEqual(estado.inserts, []);
    assert.deepEqual(estado.escritas, []);
  });
  try {
    for (const p of cache.keys()) delete require.cache[p];
    Module._load = function (request, parent, ...resto) {
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (request === '../utils/permissoes') return politicaRbac723;
      if (request === '../controllers/usuarioPermissoesController') return new Proxy({}, { get(_t,k) { return () => { estado.inesperadas.push('permissoes.'+String(k)); throw new Error('Operacao fora do escopo deste teste'); }; } });
      // Utilitario puro real, restrito aos tres consumidores autorizados.
      if (request === '../utils/normalizarIdDominio' && ['middlewares/autenticacaoMiddleware', 'services/authService', 'services/relatorioMultiTenantService'].some(p => parent?.filename === require.resolve('../src/' + p))) return require('../src/utils/normalizarIdDominio');
      if (cache.has(parent?.filename)) {
        const permitidas = dependencias.get(parent.filename);
        if (!permitidas?.has(request)) {
          estado.proibidas.push(request);
          throw new Error("Dependência real proibida no teste de cadastro direto");
        }
        return permitidas.get(request);
      }
      return load.call(this, request, parent, ...resto);
    };
    dependencias.set(CAMINHOS.repository, new Map([
      ["../config/database", pool], ["./emailLockRepository", externo("emailLock")],
      ["./conviteRepository", externo("convite")],
    ]));
    modulos.repository = require(CAMINHOS.repository);
    dependencias.set(CAMINHOS.service, new Map([["bcryptjs", bcrypt], ["../repositories/usuarioRepository", modulos.repository]]));
    modulos.service = require(CAMINHOS.service);
    const criarService = modulos.service.criarUsuario;
    t.mock.method(modulos.service, "criarUsuario", async (...args) => {
      estado.criarService++;
      return criarService(...args);
    });
    for (const endpoint of ENDPOINTS) {
      t.mock.method(modulos.service, endpoint.service, async (...args) => {
        const identidade = args[endpoint.controller === "listar" ? 0 : endpoint.controller === "buscarPorId" ? 1 : 2];
        const registro = { id_usuario: 101, id_ambiente: identidade.id_ambiente, nome: "Alvo simulado", ativo: false };
        const resultado = endpoint.controller === "listar" ? [registro] : registro;
        estado.servicos.push({ nome: endpoint.service, args, resultado });
        return resultado;
      });
    }
    dependencias.set(CAMINHOS.controller, new Map([["../services/usuarioService", modulos.service]]));
    modulos.controller = require(CAMINHOS.controller);
    for (const nome of ["criar", ...ENDPOINTS.map((e) => e.controller)]) {
      const original = modulos.controller[nome];
      t.mock.method(modulos.controller, nome, (...args) => {
        estado.controllers.push(nome);
        if (nome === "criar") estado.criarController++;
        return original(...args);
      });
    }
    dependencias.set(CAMINHOS.autenticacao, new Map([["jsonwebtoken", jwt], ["../repositories/usuarioRepository", modulos.repository]]));
    modulos.autenticacao = require(CAMINHOS.autenticacao);
    for (const nome of ["autenticar", "autenticarMultiTenant"]) {
      const original = modulos.autenticacao[nome];
      t.mock.method(modulos.autenticacao, nome, (...args) => {
        estado.autenticacoes.push(nome);
        return original(...args);
      });
    }
    dependencias.set(CAMINHOS.autorizacao, new Map());
    modulos.autorizacao = require(CAMINHOS.autorizacao);
    dependencias.set(CAMINHOS.router, new Map([
      ["express", express], ["../controllers/usuarioController", modulos.controller],
      ["../middlewares/autenticacaoMiddleware", modulos.autenticacao],
      ["../middlewares/autorizacaoMiddleware", modulos.autorizacao],
    ]));
    modulos.router = require(CAMINHOS.router);
  } finally {
    Module._load = load;
    for (const [p, anterior] of cache) {
      if (anterior) require.cache[p] = anterior;
      else delete require.cache[p];
    }
  }

  async function requisitar({ metodo = "POST", caminho = "/", token = "admin-a", body,
    query = {}, params = {}, usuario, iniciada = false } = {}) {
    const corpoPadrao = metodo === "PATCH" ? { ativo: false } : metodo === "GET" ? {} : {
      nome: "Pessoa simulada", email: "novo@example.invalid", eh_fundador: false, perfil_acesso: "ENGENHEIRO_SEGURANCA",
      ...(metodo === "POST" ? { senha: SENSIVEL } : {}),
    };
    const req = { method: metodo, url: caminho, originalUrl: "/api/usuarios" + caminho,
      baseUrl: "/api/usuarios", headers: token === null ? {} : { authorization: "Bearer " + token },
      body: body === undefined ? corpoPadrao : body, query, params, usuario };
    let concluir;
    let rejeitar;
    const fim = new Promise((resolve, reject) => { concluir = resolve; rejeitar = reject; });
    const anterior = Object.freeze({ resposta: "Já iniciada" });
    let enviada = iniciada;
    const res = { statusCode: iniciada ? 202 : 200, body: iniciada ? anterior : undefined };
    Object.defineProperty(res, "headersSent", {
      get() { if (iniciada) concluir(); return enviada; },
    });
    res.status = t.mock.fn((codigo) => { res.statusCode = codigo; return res; });
    res.json = t.mock.fn((dados) => { res.body = dados; enviada = true; concluir(); return res; });
    for (const nome of ["send", "end", "write", "redirect", "sendFile", "download", "setHeader"]) {
      res[nome] = t.mock.fn(() => { concluir(); return res; });
    }
    let temporizador;
    try {
      const prazo = new Promise((_resolve, reject) => {
        temporizador = setTimeout(() => reject(new Error("Router não concluiu a requisição simulada")), 1000);
      });
      modulos.router.handle(req, res, (erro) => rejeitar(erro || new Error("Endpoint não atendido")));
      await Promise.race([fim, prazo]);
      // Drena as promises dos mocks sem abrir servidor ou porta HTTP.
      await new Promise((resolve) => setImmediate(resolve));
    } finally { clearTimeout(temporizador); }
    for (const nome of ["send", "end", "write", "redirect", "sendFile", "download", "setHeader"]) {
      assert.equal(res[nome].mock.callCount(), 0);
    }
    if (iniciada) {
      assert.equal(res.status.mock.callCount(), 0);
      assert.equal(res.json.mock.callCount(), 0);
      assert.strictEqual(res.body, anterior);
      assert.equal(res.statusCode, 202);
    } else {
      assert.equal(res.status.mock.callCount(), 1);
      assert.equal(res.json.mock.callCount(), 1);
    }
    return { req, res };
  }
  return { estado, usuarios, ambientes, requisitar, router: modulos.router };
}

function verificarBloqueio(res) {
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { status: "error", message: MENSAGEM });
  assert.equal(JSON.stringify(res.body).includes(SENSIVEL), false);
}

for (const contexto of CONTEXTOS) {
  for (const perfil of ["ADMINISTRADOR", "ENGENHEIRO_SEGURANCA"]) {
    test("POST: administrador " + contexto.nome + " não cadastra diretamente perfil " + perfil, async (t) => {
      const ctx = preparar(t);
      const { res } = await ctx.requisitar({ token: contexto.token, body: {
        nome: "Pessoa simulada", email: "novo@example.invalid", senha: SENSIVEL, eh_fundador: perfil === "ADMINISTRADOR", perfil_acesso: perfil,
      } });
      verificarBloqueio(res);
    });
  }
  for (const modo of ["corpo", "query/params/contexto", "token de convite"]) {
    test("POST: " + contexto.nome + " permanece bloqueado com " + modo + " forjado", async (t) => {
      const ctx = preparar(t);
      const forjada = { id_usuario: 777, id_ambiente: contexto.outro, eh_fundador: true, perfil_acesso: "ADMINISTRADOR" };
      const body = { nome: "Pessoa simulada", email: "novo@example.invalid", senha: SENSIVEL,
        eh_fundador: false, perfil_acesso: "ENGENHEIRO_SEGURANCA" };
      const entradas = { token: contexto.token, body };
      if (modo === "corpo") Object.assign(body, forjada, { usuario: forjada });
      if (modo === "query/params/contexto") Object.assign(entradas, { query: forjada, params: forjada, usuario: forjada });
      if (modo === "token de convite") Object.assign(body, { token: "a".repeat(64), token_convite: "b".repeat(64) });
      const { res } = await ctx.requisitar(entradas);
      verificarBloqueio(res);
      assert.deepEqual(ctx.estado.controllers, []);
      assert.deepEqual(ctx.estado.servicos, []);
    });
  }
  test("POST: " + contexto.nome + " retorna mensagem fixa sem refletir dados sensíveis", async (t) => {
    const ctx = preparar(t);
    const { res } = await ctx.requisitar({ token: contexto.token, body: {
      nome: SENSIVEL, email: "sensivel@example.invalid", senha: SENSIVEL,
      eh_fundador: true, perfil_acesso: "ADMINISTRADOR", message: SENSIVEL, token: SENSIVEL,
    } });
    verificarBloqueio(res);
    for (const args of ctx.estado.logs) assert.equal(JSON.stringify(args).includes(SENSIVEL), false);
  });
  test("POST: " + contexto.nome + " não envia outra resposta quando headersSent é verdadeiro", async (t) => {
    const ctx = preparar(t);
    await ctx.requisitar({ token: contexto.token, iniciada: true });
  });
}

for (const [nome, token, codigo] of [
  ["sem JWT", null, 401], ["JWT inválido", "invalido", 401], ["engenheiro", "engenheiro", 403],
]) {
  test("POST: " + nome + " continua rejeitado sem alcançar criação", async (t) => {
    const ctx = preparar(t);
    const { res } = await ctx.requisitar({ token, usuario: { id_usuario: 11, eh_fundador: true, perfil_acesso: "ADMINISTRADOR", id_ambiente: A } });
    assert.equal(res.statusCode, codigo);
    assert.deepEqual(Object.keys(res.body).sort(), ["message", "status"]);
    assert.equal(res.body.status, "error");
    assert.equal(typeof res.body.message, "string");
    assert.equal(JSON.stringify(res.body).includes(SENSIVEL), false);
    assert.deepEqual(ctx.estado.controllers, []);
    assert.deepEqual(ctx.estado.servicos, []);
  });
}

for (const endpoint of ENDPOINTS) {
  for (const contexto of CONTEXTOS) {
    test(endpoint.metodo + " " + endpoint.caminho + ": contrato e identidade " + contexto.nome + " preservados", async (t) => {
      const ctx = preparar(t);
      const { req, res } = await ctx.requisitar({ metodo: endpoint.metodo, caminho: endpoint.caminho, token: contexto.token });
      assert.deepEqual(ctx.estado.autenticacoes, ["autenticarMultiTenant"]);
      assert.deepEqual(ctx.estado.controllers, [endpoint.controller]);
      assert.equal(ctx.estado.servicos.length, 1);
      const chamada = ctx.estado.servicos[0];
      assert.equal(chamada.nome, endpoint.service);
      const esperados = endpoint.controller === "listar" ? [req.usuario]
        : endpoint.controller === "buscarPorId" ? ["101", req.usuario] : ["101", req.body, req.usuario];
      assert.deepEqual(chamada.args, esperados);
      for (let i = 0; i < esperados.length; i++) assert.strictEqual(chamada.args[i], esperados[i]);
      assert.equal(req.usuario.id_usuario, contexto.id);
      assert.equal(req.usuario.id_ambiente, contexto.ambiente);
      assert.equal(res.statusCode, 200);
      const esperado = { status: "success", data: chamada.resultado };
      if (endpoint.controller === "listar") esperado.total = chamada.resultado.length;
      if (endpoint.mensagem) esperado.message = endpoint.mensagem;
      assert.deepEqual(res.body, esperado);
      assert.strictEqual(res.body.data, chamada.resultado);
    });
  }
  for (const [nome, token, alterar, codigo] of [
    ["sem JWT", null, () => {}, 401],
    ["engenheiro", "engenheiro", () => {}, 403],
    ["perfil revogado", "admin-a", (ctx) => { ctx.usuarios.get(11).perfil_acesso = "ENGENHEIRO_SEGURANCA"; }, 403],
    ["usuário inativo", "admin-a", (ctx) => { ctx.usuarios.get(11).ativo = false; }, 401],
    ["ambiente inativo", "admin-a", (ctx) => { ctx.ambientes.set(A, false); }, 401],
  ]) {
    test(endpoint.metodo + " " + endpoint.caminho + ": proteção preservada para " + nome, async (t) => {
      const ctx = preparar(t);
      alterar(ctx);
      const { res } = await ctx.requisitar({ metodo: endpoint.metodo, caminho: endpoint.caminho, token });
      assert.deepEqual(ctx.estado.autenticacoes, ["autenticarMultiTenant"]);
      assert.equal(res.statusCode, codigo);
      assert.equal(res.body.status, "error");
      assert.deepEqual(ctx.estado.controllers, []);
      assert.deepEqual(ctx.estado.servicos, []);
    });
  }
}

test("Router de usuários mantém somente os cinco endpoints sem incorporar cadastro ou aceite", (t) => {
  const ctx = preparar(t);
  const rotas = ctx.router.stack.filter((camada) => camada.route).map(({ route }) => ({
    caminho: route.path, metodos: Object.keys(route.methods).filter((m) => route.methods[m]),
  }));
  assert.deepEqual(rotas, [
    { caminho: "/auditoria/entidades", metodos: ["get"] }, { caminho: "/auditoria/perfis", metodos: ["get"] }, { caminho: "/:id/permissoes", metodos: ["patch"] },
    { caminho: "/", metodos: ["get"] }, { caminho: "/:id", metodos: ["get"] },
    { caminho: "/:id", metodos: ["put"] }, { caminho: "/:id/status", metodos: ["patch"] },
    { caminho: "/", metodos: ["post"] },
  ]);
});

// Limitações: os outros métodos do serviço são mocks para verificar o contrato
// router/controller; autorização SQL e transações de PUT/PATCH são cobertas em
// seus testes próprios. Cadastro/convites não são carregados nem ativados: a
// lista estrita de imports e a ausência de redirect verificam esta fronteira,
// mas não substituem regressões internas daqueles módulos. JWT e banco são
// simulados; nenhum teste valida constraints, criptografia ou PostgreSQL real.
