const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");

// Router, controller, serviço, repositório e middlewares são reais. Somente as
// dependências externas são substituídas ANTES de carregar os módulos testados.
// Não usa app.js, HTTP, portas, dotenv, banco ou arquivos físicos.
const CAMINHOS = Object.fromEntries(Object.entries({
  router: "../src/routes/usuarioRoutes",
  controller: "../src/controllers/usuarioController",
  service: "../src/services/usuarioService",
  repository: "../src/repositories/usuarioRepository",
  autenticacao: "../src/middlewares/autenticacaoMiddleware",
  autorizacao: "../src/middlewares/autorizacaoMiddleware",
}).map(([nome, caminho]) => [nome, require.resolve(caminho)]));
const AMBIENTE_A = "11111111-1111-4111-8111-111111111111";
const AMBIENTE_B = "22222222-2222-4222-8222-222222222222";
const SEGREDO_SIMULADO = "SEGREDO_FICTICIO_EXCLUSIVO_DO_TESTE";
const TECNICO = "SQL_CREDENCIAL_TOKEN_CAMINHO_SIMULADOS_NAO_PUBLICAR";
const COLUNAS_PUBLICAS = [
  "id_usuario", "nome", "email", "perfil_acesso", "ativo", "data_criacao", "data_atualizacao",
];
const SELECAO_PUBLICA = "SELECT " + COLUNAS_PUBLICAS.join(", ") + " FROM usuario";
const SQL_IDENTIDADE = "SELECT u.id_usuario, u.id_ambiente, u.nome, u.email, u.perfil_acesso FROM usuario AS u INNER JOIN ambiente AS a ON a.id_ambiente = u.id_ambiente WHERE u.id_usuario = $1 AND u.ativo = TRUE AND a.ativo = TRUE LIMIT 1";
const CONTEXTOS = [
  { nome: "A", ambiente: AMBIENTE_A, outroAmbiente: AMBIENTE_B, admin: 11, outroAdmin: 22, alvo: 101, externo: 202, token: "admin-a" },
  { nome: "B", ambiente: AMBIENTE_B, outroAmbiente: AMBIENTE_A, admin: 22, outroAdmin: 11, alvo: 202, externo: 101, token: "admin-b" },
];
const ENDPOINTS = [
  { nome: "GET /api/usuarios", caminho: "/", operacao: "listar", generico: "Erro interno ao listar usuários." },
  { nome: "GET /api/usuarios/:id", caminho: "/101", operacao: "buscarPorId", generico: "Erro interno ao buscar usuário." },
];

function publico(usuario) {
  return Object.fromEntries(COLUNAS_PUBLICAS.map((coluna) => [coluna, usuario[coluna]]));
}

function preparar(t) {
  const ambientes = new Map([
    [AMBIENTE_A, { ativo: true }], [AMBIENTE_B, { ativo: true }],
  ]);
  const usuarios = [
    [11, "Administrador A", AMBIENTE_A, "ADMINISTRADOR"],
    [22, "Administrador B", AMBIENTE_B, "ADMINISTRADOR"],
    [33, "Engenheiro A", AMBIENTE_A, "ENGENHEIRO_SEGURANCA"],
    [101, "Usuário A", AMBIENTE_A, "ENGENHEIRO_SEGURANCA"],
    [202, "Usuário B", AMBIENTE_B, "ENGENHEIRO_SEGURANCA"],
  ].map(([id_usuario, nome, id_ambiente, perfil_acesso]) => ({
    id_usuario, nome, id_ambiente, perfil_acesso, ativo: true,
    email: "usuario" + id_usuario + "@example.invalid",
    data_criacao: "2026-01-01T00:00:00.000Z", data_atualizacao: "2026-01-01T00:00:00.000Z",
  }));
  const estado = {
    ambientes, usuarios, consultas: [], identidades: [], leituras: [], jwt: [],
    inesperadas: [], conexoes: 0, erroIdentidade: null, erroLeitura: null, logs: [],
    // Relação de usuários exibíveis, independente da identidade autenticadora.
    // Permite representar listagem vazia sem inventar administrador inexistente.
    resultados: usuarios,
  };
  for (const nome of ["error", "warn", "log", "info"]) {
    t.mock.method(console, nome, (...args) => estado.logs.push(args));
  }
  const tokens = new Map([
    ["admin-a", { sub: "11", perfil: "ADMINISTRADOR" }],
    ["admin-b", { sub: "22", perfil: "ADMINISTRADOR" }],
    ["engenheiro-a", { sub: "33", perfil: "ENGENHEIRO_SEGURANCA" }],
  ]);
  const jwt = {
    verify(token, segredo, opcoes) {
      estado.jwt.push(token);
      assert.equal(segredo, SEGREDO_SIMULADO);
      assert.deepEqual(opcoes.algorithms, ["HS256"]);
      if (!tokens.has(token)) throw Object.assign(new Error("Token simulado inválido"), { name: "JsonWebTokenError" });
      return { ...tokens.get(token) };
    },
  };
  const pool = {
    async query(texto, params = []) {
      const sql = texto.replace(/\s+/g, " ").trim();
      estado.consultas.push({ sql, params: [...params] });
      if (sql === SQL_IDENTIDADE) {
        assert.equal(params.length, 1);
        estado.identidades.push(params[0]);
        if (estado.erroIdentidade) throw estado.erroIdentidade;
        const usuario = usuarios.find((u) => u.id_usuario === params[0]);
        const rows = usuario?.ativo === true && ambientes.get(usuario.id_ambiente)?.ativo === true
          ? [{ id_usuario: usuario.id_usuario, id_ambiente: usuario.id_ambiente,
            nome: usuario.nome, email: usuario.email, perfil_acesso: usuario.perfil_acesso }]
          : [];
        return { rows, rowCount: rows.length };
      }
      // Consultas legadas efetivas: sem filtro não há isolamento automático no
      // mock. O SELECT global retorna A e B, tornando o vazamento observável.
      if (sql === SELECAO_PUBLICA + " ORDER BY nome ASC") {
        assert.deepEqual(params, []);
        estado.leituras.push("listar");
        if (estado.erroLeitura) throw estado.erroLeitura;
        const rows = [...estado.resultados].sort((a, b) => a.nome.localeCompare(b.nome)).map(publico);
        return { rows, rowCount: rows.length };
      }
      if (sql === SELECAO_PUBLICA + " WHERE id_usuario = $1 LIMIT 1") {
        assert.equal(params.length, 1);
        estado.leituras.push("buscarPorId");
        if (estado.erroLeitura) throw estado.erroLeitura;
        const usuario = estado.resultados.find((u) => u.id_usuario === params[0]);
        const rows = usuario ? [publico(usuario)] : [];
        return { rows, rowCount: rows.length };
      }
      if (sql === SELECAO_PUBLICA + " WHERE id_ambiente = $1 ORDER BY nome ASC") {
        assert.equal(params.length, 1);
        assert.equal(typeof params[0], "string");
        assert.match(params[0], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        estado.leituras.push("listar");
        if (estado.erroLeitura) throw estado.erroLeitura;
        // Usa o parâmetro efetivamente enviado, nunca o tenant esperado pelo
        // teste. Um ambiente forjado ou trocado permanece detectável.
        const rows = estado.resultados.filter((u) => u.id_ambiente === params[0])
          .sort((a, b) => a.nome.localeCompare(b.nome)).map(publico);
        return { rows, rowCount: rows.length };
      }
      if (sql === SELECAO_PUBLICA + " WHERE id_usuario = $1 AND id_ambiente = $2 LIMIT 1") {
        assert.equal(params.length, 2);
        assert.equal(Number.isSafeInteger(params[0]), true);
        assert.ok(params[0] > 0);
        assert.equal(typeof params[1], "string");
        assert.match(params[1], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        estado.leituras.push("buscarPorId");
        if (estado.erroLeitura) throw estado.erroLeitura;
        const usuario = estado.resultados.find((u) =>
          u.id_usuario === params[0] && u.id_ambiente === params[1]);
        const rows = usuario ? [publico(usuario)] : [];
        return { rows, rowCount: rows.length };
      }
      // Reconhecimento exato dos SQLs revisados. Consultas diferentes exigem
      // adaptação explícita; nenhuma consulta desconhecida recebe sucesso.
      estado.inesperadas.push(sql);
      throw new Error("Consulta não contemplada pelo simulador");
    },
    connect() { estado.conexoes += 1; throw new Error("Conexão real ou transacional proibida nestas consultas"); },
  };
  const bcrypt = new Proxy({}, { get() { throw new Error("Bcrypt não deve ser usado por GET"); } });
  const cacheAnterior = new Map(Object.values(CAMINHOS).map((caminho) => [caminho, require.cache[caminho]]));
  const load = Module._load;
  const modulos = {};
  const dependencias = new Map();
  const proibidas = [];
  const segredoAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SEGREDO_SIMULADO;
  t.after(() => {
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
    assert.strictEqual(Module._load, load);
    for (const [caminho, anterior] of cacheAnterior) assert.strictEqual(require.cache[caminho], anterior);
    assert.deepEqual(proibidas, []);
    assert.deepEqual(estado.inesperadas, [], "SQL desconhecido não pode parecer erro de negócio esperado");
    assert.equal(estado.conexoes, 0);
  });
  try {
    for (const caminho of cacheAnterior.keys()) delete require.cache[caminho];
    Module._load = function (request, parent, ...resto) {
      if (cacheAnterior.has(parent?.filename)) {
        const permitidas = dependencias.get(parent.filename);
        if (!permitidas?.has(request)) {
          proibidas.push(request);
          throw new Error("Dependência real proibida: " + request);
        }
        return permitidas.get(request);
      }
      return load.call(this, request, parent, ...resto);
    };
    dependencias.set(CAMINHOS.repository, new Map([["../config/database", pool]]));
    modulos.repository = require(CAMINHOS.repository);
    dependencias.set(CAMINHOS.service, new Map([["bcryptjs", bcrypt], ["../repositories/usuarioRepository", modulos.repository]]));
    modulos.service = require(CAMINHOS.service);
    dependencias.set(CAMINHOS.controller, new Map([["../services/usuarioService", modulos.service]]));
    modulos.controller = require(CAMINHOS.controller);
    dependencias.set(CAMINHOS.autenticacao, new Map([["jsonwebtoken", jwt], ["../repositories/usuarioRepository", modulos.repository]]));
    modulos.autenticacao = require(CAMINHOS.autenticacao);
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
    for (const [caminho, anterior] of cacheAnterior) {
      if (anterior) require.cache[caminho] = anterior;
      else delete require.cache[caminho];
    }
  }

  // Chama o Router Express real com req/res simulados. baseUrl representa a
  // montagem /api/usuarios, sem carregar app.js e sem criar servidor HTTP.
  async function consultar(caminho, token = "admin-a", forjados = {}) {
    const headers = token === null ? {} : { authorization: "Bearer " + token };
    const req = {
      method: "GET", url: caminho, originalUrl: "/api/usuarios" + caminho,
      baseUrl: "/api/usuarios", headers, body: forjados.body || {},
      query: forjados.query || {}, params: forjados.params || {}, usuario: forjados.usuario,
    };
    let concluir;
    let rejeitar;
    const enviada = new Promise((resolve, reject) => { concluir = resolve; rejeitar = reject; });
    const res = { statusCode: 200, headersSent: false, body: undefined, respostas: 0 };
    res.status = t.mock.fn((codigo) => { res.statusCode = codigo; return res; });
    res.json = t.mock.fn((body) => {
      res.respostas += 1;
      res.body = body;
      res.headersSent = true;
      concluir(res);
      return res;
    });
    modulos.router.handle(req, res, (erro) => rejeitar(erro || new Error("Endpoint GET não atendido")));
    await enviada;
    assert.equal(res.respostas, 1);
    assert.equal(res.status.mock.callCount(), 1);
    assert.equal(res.json.mock.callCount(), 1);
    return { req, res };
  }
  return { ...modulos, estado, consultar };
}

function esperados(estado, ambiente) {
  return estado.resultados.filter((u) => u.id_ambiente === ambiente)
    .sort((a, b) => a.nome.localeCompare(b.nome)).map(publico);
}

function verificarErro(res, codigo) {
  assert.equal(res.statusCode, codigo);
  assert.deepEqual(Object.keys(res.body).sort(), ["message", "status"]);
  assert.equal(res.body.status, "error");
  assert.equal(typeof res.body.message, "string");
  assert.equal(JSON.stringify(res.body).includes(TECNICO), false);
}

for (const contexto of CONTEXTOS) {
  test("[isolamento] administrador " + contexto.nome + " lista somente seu ambiente, mantendo JSON e total", async (t) => {
    const { consultar, estado } = preparar(t);
    const { res } = await consultar("/", contexto.token);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { status: "success", total: esperados(estado, contexto.ambiente).length, data: esperados(estado, contexto.ambiente) });
  });

  test("[contrato] administrador " + contexto.nome + " consulta usuário do próprio ambiente por ID", async (t) => {
    const { consultar, estado } = preparar(t);
    const { res } = await consultar("/" + contexto.alvo, contexto.token);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { status: "success", data: publico(estado.usuarios.find((u) => u.id_usuario === contexto.alvo)) });
  });

  test("[isolamento] administrador " + contexto.nome + " não consulta ID de outro ambiente", async (t) => {
    const { consultar } = preparar(t);
    const { res } = await consultar("/" + contexto.externo, contexto.token);
    verificarErro(res, 404);
  });

  test("[isolamento] administrador " + contexto.nome + ": externo e inexistente têm resposta indistinguível", async (t) => {
    const { consultar } = preparar(t);
    const externo = await consultar("/" + contexto.externo, contexto.token);
    const inexistente = await consultar("/999999", contexto.token);
    verificarErro(inexistente.res, 404);
    verificarErro(externo.res, 404);
    assert.deepEqual(externo.res.body, inexistente.res.body);
  });

  test("[identidade] administrador " + contexto.nome + ": corpo, query, params e contexto forjados não mudam listagem", async (t) => {
    const { consultar, estado } = preparar(t);
    const forjada = { id_usuario: contexto.outroAdmin, id_ambiente: contexto.outroAmbiente, perfil_acesso: "ADMINISTRADOR" };
    const { res, req } = await consultar("/", contexto.token, {
      body: { ...forjada, usuario: forjada }, query: { ...forjada }, params: { ...forjada }, usuario: forjada,
    });
    assert.equal(req.usuario.id_usuario, contexto.admin);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.data, esperados(estado, contexto.ambiente));
    assert.equal(res.body.total, esperados(estado, contexto.ambiente).length);
  });

  test("[identidade] administrador " + contexto.nome + ": ambiente forjado não autoriza busca externa", async (t) => {
    const { consultar } = preparar(t);
    const forjada = { id_usuario: contexto.outroAdmin, id_ambiente: contexto.outroAmbiente, perfil_acesso: "ADMINISTRADOR" };
    const { res, req } = await consultar("/" + contexto.externo, contexto.token, {
      body: forjada, query: forjada, params: forjada, usuario: forjada,
    });
    assert.equal(req.usuario.id_usuario, contexto.admin);
    verificarErro(res, 404);
  });

  test("[isolamento] listagem vazia de " + contexto.nome + " não inclui os resultados existentes no outro ambiente", async (t) => {
    const { consultar, estado } = preparar(t);
    // Identidade continua válida; a fonte de resultados só contém o outro tenant.
    estado.resultados = estado.usuarios.filter((u) => u.id_ambiente === contexto.outroAmbiente);
    assert.ok(estado.resultados.length > 0);
    const { res } = await consultar("/", contexto.token);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { status: "success", total: 0, data: [] });
  });
}

for (const endpoint of ENDPOINTS) {
  test(endpoint.nome + ": ausência de JWT retorna 401 mesmo com identidade forjada", async (t) => {
    const { consultar, estado } = preparar(t);
    const forjada = { id_usuario: 11, id_ambiente: AMBIENTE_A, perfil_acesso: "ADMINISTRADOR" };
    const { res } = await consultar(endpoint.caminho, null, { body: forjada, query: forjada, usuario: forjada });
    verificarErro(res, 401);
    assert.equal(estado.consultas.length, 0);
  });

  test(endpoint.nome + ": JWT inválido retorna 401 sem consultar usuários", async (t) => {
    const { consultar, estado } = preparar(t);
    const { res } = await consultar(endpoint.caminho, "token-invalido");
    verificarErro(res, 401);
    assert.equal(estado.consultas.length, 0);
  });

  test(endpoint.nome + ": perfil administrativo no cliente não promove engenheiro ativo", async (t) => {
    const { consultar, estado } = preparar(t);
    const forjada = { id_usuario: 11, id_ambiente: AMBIENTE_B, perfil_acesso: "ADMINISTRADOR" };
    const { res } = await consultar(endpoint.caminho, "engenheiro-a", { body: forjada, query: forjada, params: forjada, usuario: forjada });
    verificarErro(res, 403);
    assert.equal(estado.leituras.length, 0);
  });

  test(endpoint.nome + ": administrador no JWT, mas engenheiro no banco, recebe 403", async (t) => {
    const { consultar, estado } = preparar(t);
    estado.usuarios.find((u) => u.id_usuario === 11).perfil_acesso = "ENGENHEIRO_SEGURANCA";
    const { res } = await consultar(endpoint.caminho);
    verificarErro(res, 403);
    assert.equal(estado.leituras.length, 0);
    assert.deepEqual(estado.identidades, [11]);
  });

  test(endpoint.nome + ": administrador inativo no banco recebe 401", async (t) => {
    const { consultar, estado } = preparar(t);
    estado.usuarios.find((u) => u.id_usuario === 11).ativo = false;
    const { res } = await consultar(endpoint.caminho);
    verificarErro(res, 401);
    assert.equal(estado.leituras.length, 0);
  });

  test(endpoint.nome + ": ambiente inativo recebe 401 apesar do JWT administrativo válido", async (t) => {
    const { consultar, estado } = preparar(t);
    estado.ambientes.get(AMBIENTE_A).ativo = false;
    const { res } = await consultar(endpoint.caminho);
    verificarErro(res, 401);
    assert.equal(estado.leituras.length, 0);
  });

  test(endpoint.nome + ": falha técnica ao consultar identidade retorna 500, não autorização falsa", async (t) => {
    const { consultar, estado } = preparar(t);
    estado.erroIdentidade = Object.assign(new Error(TECNICO), { code: "XX000" });
    const { res } = await consultar(endpoint.caminho);
    verificarErro(res, 500);
    assert.deepEqual(estado.identidades, [11]);
    assert.equal(estado.leituras.length, 0);
  });

  test(endpoint.nome + ": falha técnica na consulta do recurso mantém 500 genérico", async (t) => {
    const { consultar, estado } = preparar(t);
    estado.erroLeitura = Object.assign(new Error(TECNICO), { code: "XX000" });
    const { res } = await consultar(endpoint.caminho);
    verificarErro(res, 500);
    assert.deepEqual(res.body, { status: "error", message: endpoint.generico });
    assert.deepEqual(estado.leituras, [endpoint.operacao]);
  });
}

// Limitações: não verifica assinatura criptográfica (jwt.verify é mock), RLS,
// constraints, concorrência ou SQL no PostgreSQL real. A cadeia HTTP usa agora
// a identidade revalidada e os filtros efetivos de ambiente. Os testes antigos
// de usuarioController que exigem chamadas sem identidade continuam pendentes
// de revisão autorizada; este arquivo não altera suas expectativas.
// Novos SQLs exigirão adaptação explícita do mock.
