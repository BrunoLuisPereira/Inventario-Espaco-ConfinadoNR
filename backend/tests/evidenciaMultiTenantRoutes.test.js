const politicaRbac723 = require('../src/utils/permissoes');
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const http = require("node:http");
const express = require("express");

const AMBIENTE_A = "11111111-1111-4111-8111-111111111111";
const AMBIENTE_B = "22222222-2222-4222-8222-222222222222";
const USUARIO_A = Object.freeze({
  id_usuario: 10, id_ambiente: AMBIENTE_A, eh_fundador: false, perfil_acesso: "ENGENHEIRO_SEGURANCA",
});
const USUARIO_B = Object.freeze({
  id_usuario: 20, id_ambiente: AMBIENTE_B, eh_fundador: false, perfil_acesso: "ENGENHEIRO_SEGURANCA",
});
const ROTAS = [
  { metodo: "POST", caminho: "/", url: "/", handler: "criar", codigo: 201 },
  { metodo: "GET", caminho: "/", url: "/", handler: "listar", codigo: 200 },
  { metodo: "GET", caminho: "/local/:idLocal", url: "/local/40", handler: "listarPorLocal", parametro: "idLocal", valor: "40", codigo: 200 },
  { metodo: "GET", caminho: "/:id", url: "/50", handler: "buscarPorId", parametro: "id", valor: "50", codigo: 200 },
  { metodo: "PUT", caminho: "/:id", url: "/50", handler: "atualizar", parametro: "id", valor: "50", codigo: 200 },
  { metodo: "DELETE", caminho: "/:id", url: "/50", handler: "excluir", parametro: "id", valor: "50", codigo: 200 },
];
const CENARIOS = [
  { nome: "sem JWT", usuario: USUARIO_A, semToken: true, recusado: true },
  { nome: "JWT inválido", usuario: USUARIO_A, jwtInvalido: true, recusado: true },
  { nome: "usuário inativo", usuario: USUARIO_A, usuarioInativo: true, recusado: true },
  { nome: "ambiente inativo", usuario: USUARIO_A, ambienteInativo: true, recusado: true },
  { nome: "usuário e ambiente A ativos", usuario: USUARIO_A },
  { nome: "usuário e ambiente B ativos", usuario: USUARIO_B },
];
const DETALHE_INTERNO = "SQL_TOKEN_CAMINHO_DADO_EXTERNO_NAO_PUBLICAR";
const ROTER_PATH = require.resolve("../src/routes/evidenciaMultiTenantRoutes");
const MIDDLEWARE_PATH = require.resolve("../src/middlewares/autenticacaoMiddleware");
const APP_PATH = require.resolve("../src/app");

// Recarrega apenas o módulo indicado, com dependências explicitamente
// substituídas. Não importa controller/service reais, pool, dotenv ou legados.
function carregarIsolado(caminho, substituicoes, imports) {
  const anterior = require.cache[caminho];
  const carregar = Module._load;
  try {
    delete require.cache[caminho];
    Module._load = function (request, parent, ...resto) {
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (request === '../utils/permissoes') return politicaRbac723;
      if (parent && parent.filename === caminho) {
        imports.push(request);
        if (!Object.hasOwn(substituicoes, request)) {
          throw new Error("Dependência não autorizada: " + request);
        }
        return substituicoes[request];
      }
      return carregar.call(this, request, parent, ...resto);
    };
    return require(caminho);
  } finally {
    Module._load = carregar;
    if (anterior) require.cache[caminho] = anterior;
    else delete require.cache[caminho];
  }
}

async function preparar(t, cenario = {}) {
  cenario = { usuario: USUARIO_A, ...cenario };
  const segredoAnterior = process.env.JWT_SECRET;
  // Valor fictício apenas em memória; nenhum arquivo .env é lido.
  process.env.JWT_SECRET = "segredo-ficticio-rotas-evidencias";
  t.after(() => {
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
  });
  t.mock.method(console, "error", () => {});
  const eventos = [];
  const identidades = new WeakMap();
  const importsMiddleware = [];
  const importsRouter = [];
  const verificarJwt = t.mock.fn((token, segredo, opcoes) => {
    eventos.push("jwt");
    assert.equal(token, "jwt-ficticio");
    assert.equal(segredo, "segredo-ficticio-rotas-evidencias");
    assert.deepEqual(opcoes.algorithms, ["HS256"]);
    if (cenario.jwtInvalido || cenario.jwtExpirado) {
      throw Object.assign(new Error(DETALHE_INTERNO), {
        name: cenario.jwtExpirado ? "TokenExpiredError" : "JsonWebTokenError",
      });
    }
    return {
      sub: String(cenario.usuario.id_usuario), perfil: "ADMINISTRADOR",
      id_usuario: 999,
      id_ambiente: cenario.usuario.id_ambiente === AMBIENTE_A ? AMBIENTE_B : AMBIENTE_A,
    };
  });
  const consultaIdentidade = t.mock.fn(async (id) => {
    eventos.push("identidade");
    assert.equal(id, cenario.usuario.id_usuario);
    if (cenario.falhaConsulta) throw new Error(DETALHE_INTERNO);
    // Simula ausência após os filtros do repositório de identidade. O SQL
    // desse repositório não é executado nem validado por estes testes de rotas.
    if (cenario.usuarioInativo || cenario.ambienteInativo) return null;
    return { ...cenario.usuario };
  });
  const middleware = carregarIsolado(MIDDLEWARE_PATH, {
    "../utils/normalizarIdDominio": require("../src/utils/normalizarIdDominio"),
    jsonwebtoken: { verify: verificarJwt },
    "../repositories/usuarioRepository": { buscarIdentidadeAutenticada: consultaIdentidade },
  }, importsMiddleware);
  const autenticarReal = middleware.autenticarMultiTenant;
  const autenticarMultiTenant = t.mock.fn(async (req, res, next) => {
    eventos.push("autenticacao");
    return autenticarReal(req, res, () => {
      identidades.set(req, req.usuario);
      return next();
    });
  });
  const autenticarLegado = t.mock.fn(() => {
    throw new Error("Middleware legado proibido");
  });

  const controllers = {};
  for (const rota of ROTAS) {
    controllers[rota.handler] = t.mock.fn((req, res) => {
      eventos.push(rota.handler);
      assert.ok(identidades.has(req));
      assert.strictEqual(req.usuario, identidades.get(req));
      const corpo = cenario.respostaController || {
        status: "success", data: { endpoint: rota.handler },
      };
      return res.status(cenario.codigoController || rota.codigo).json(corpo);
    });
  }
  const router = carregarIsolado(ROTER_PATH, {
    express,
    "../controllers/evidenciaMultiTenantController": controllers,
    "../middlewares/autenticacaoMiddleware": {
      autenticarMultiTenant, autenticar: autenticarLegado,
    },
  }, importsRouter);

  assert.deepEqual(importsMiddleware, ["jsonwebtoken", "../utils/normalizarIdDominio", "../repositories/usuarioRepository"]);
  assert.deepEqual(importsRouter, [
    "express", "../controllers/evidenciaMultiTenantController", "../middlewares/autenticacaoMiddleware",
  ]);
  assert.deepEqual(router.stack.filter((layer) => layer.route).map((layer) => ({
    caminho: layer.route.path,
    metodos: Object.keys(layer.route.methods).filter((nome) => layer.route.methods[nome]),
    handlers: layer.route.stack.map((item) => item.handle),
  })), ROTAS.map((rota) => ({
    caminho: rota.caminho, metodos: [rota.metodo.toLowerCase()], handlers: [controllers[rota.handler]],
  })));
  const camadaAutenticacao = router.stack.findIndex((layer) => layer.handle === autenticarMultiTenant);
  assert.ok(camadaAutenticacao >= 0);
  for (const [indice, layer] of router.stack.entries()) {
    if (layer.route) assert.ok(indice > camadaAutenticacao);
  }
  assert.equal(router.stack.some((layer) => layer.handle === autenticarLegado), false);

  const respostas = [];
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    // Simula contexto anterior não confiável; autenticação deve substituí-lo.
    const forjada = { id_usuario: 999, id_ambiente: AMBIENTE_B, eh_fundador: true, perfil_acesso: "ADMINISTRADOR" };
    req.usuario = { ...forjada };
    req.params = { ...forjada };
    const json = res.json;
    res.json = function (corpo) {
      respostas.push({ codigo: res.statusCode, corpo });
      return json.call(this, corpo);
    };
    next();
  });
  app.use("/isolado/evidencias", router);
  app.use((_req, res) => res.status(404).json({ status: "error", message: "Rota não encontrada." }));
  assert.equal(require.cache[APP_PATH], undefined);
  t.after(() => {
    assert.equal(autenticarLegado.mock.callCount(), 0);
    assert.equal(require.cache[APP_PATH], undefined);
  });

  // Servidor efêmero exclusivamente da aplicação de teste, quando o usuário
  // autorizar a execução futura. Nada é iniciado ao carregar este arquivo.
  const servidor = await new Promise((resolve, reject) => {
    const instancia = app.listen(0, "127.0.0.1", () => resolve(instancia));
    instancia.once("error", reject);
  });
  t.after(async () => {
    await new Promise((resolve, reject) => {
      servidor.close((erro) => erro ? reject(erro) : resolve());
      servidor.closeAllConnections();
    });
  });

  async function requisitar(metodo, url, opcoes = {}) {
    const outroAmbiente = cenario.usuario.id_ambiente === AMBIENTE_A ? AMBIENTE_B : AMBIENTE_A;
    const body = {
      id_usuario: 999, id_ambiente: outroAmbiente, eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
      usuario: { id_usuario: 999, id_ambiente: outroAmbiente, eh_fundador: true, perfil_acesso: "ADMINISTRADOR" },
      id: "999", idLocal: "999", tipo: "TEXTO", descricao: "Corpo simulado",
    };
    const texto = JSON.stringify(body);
    const headers = { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(texto) };
    if (!cenario.semToken) headers.Authorization = opcoes.authorization || "Bearer jwt-ficticio";
    const query = new URLSearchParams({
      id: "999", idLocal: "999", id_usuario: "999", id_ambiente: outroAmbiente,
      eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
    });
    const resposta = await new Promise((resolve, reject) => {
      // http.request permite exercitar JSON também em GET sem alterar o router.
      const request = http.request({
        hostname: "127.0.0.1", port: servidor.address().port, method: metodo,
        path: "/isolado/evidencias" + url + "?" + query.toString(), headers,
      }, (response) => {
        const partes = [];
        response.on("data", (parte) => partes.push(parte));
        response.on("error", reject);
        response.on("end", () => {
          try {
            resolve({
              codigo: response.statusCode, headers: response.headers,
              corpo: JSON.parse(Buffer.concat(partes).toString("utf8")),
            });
          } catch (erro) { reject(erro); }
        });
      });
      request.on("error", reject);
      request.end(texto);
    });
    return { ...resposta, body, outroAmbiente };
  }
  return {
    router, requisitar, respostas, eventos, identidades, controllers,
    verificarJwt, consultaIdentidade, autenticarMultiTenant, autenticarLegado,
  };
}

function verificarController(mocks, rota, permitido) {
  for (const item of ROTAS) {
    assert.equal(mocks.controllers[item.handler].mock.callCount(), permitido && item.handler === rota.handler ? 1 : 0);
  }
}

function verificarRespostaUnica(mocks, resposta) {
  assert.equal(mocks.respostas.length, 1);
  assert.deepEqual(mocks.respostas[0], { codigo: resposta.codigo, corpo: resposta.corpo });
  assert.match(resposta.headers["content-type"], /^application\/json\b/i);
}

for (const rota of ROTAS) {
  for (const cenario of CENARIOS) {
    test(rota.metodo + " " + rota.caminho + ": " + cenario.nome, async (t) => {
      const mocks = await preparar(t, cenario);
      const resposta = await mocks.requisitar(rota.metodo, rota.url);
      verificarRespostaUnica(mocks, resposta);
      assert.equal(mocks.autenticarMultiTenant.mock.callCount(), 1);
      assert.equal(mocks.verificarJwt.mock.callCount(), cenario.semToken ? 0 : 1);
      assert.equal(mocks.consultaIdentidade.mock.callCount(), cenario.semToken || cenario.jwtInvalido ? 0 : 1);
      verificarController(mocks, rota, !cenario.recusado);
      if (cenario.recusado) {
        assert.equal(resposta.codigo, 401);
        const message = cenario.semToken ? "Token de autenticação não informado."
          : cenario.jwtInvalido ? "Token inválido."
            : "Usuário ou ambiente inválido ou desativado. Realize o login novamente.";
        assert.deepEqual(resposta.corpo, { status: "error", message });
        assert.equal(JSON.stringify(resposta.corpo).includes(DETALHE_INTERNO), false);
        const eventos = ["autenticacao"];
        if (!cenario.semToken) eventos.push("jwt");
        if (!cenario.semToken && !cenario.jwtInvalido) eventos.push("identidade");
        assert.deepEqual(mocks.eventos, eventos);
        return;
      }
      assert.equal(resposta.codigo, rota.codigo);
      assert.deepEqual(resposta.corpo, { status: "success", data: { endpoint: rota.handler } });
      assert.deepEqual(mocks.eventos, ["autenticacao", "jwt", "identidade", rota.handler]);
      const [req] = mocks.controllers[rota.handler].mock.calls[0].arguments;
      assert.strictEqual(req.usuario, mocks.identidades.get(req));
      assert.deepEqual(req.usuario, cenario.usuario);
      assert.equal(req.usuario.perfil_acesso, "ENGENHEIRO_SEGURANCA");
      assert.deepEqual(req.body, resposta.body);
      assert.notStrictEqual(req.usuario, req.body.usuario);
      assert.equal(req.query.id_ambiente, resposta.outroAmbiente);
      assert.notEqual(req.query.id_usuario, String(req.usuario.id_usuario));
      assert.deepEqual({ ...req.params }, rota.parametro ? { [rota.parametro]: rota.valor } : {});
      if (rota.handler === "listarPorLocal") assert.equal(mocks.controllers.buscarPorId.mock.callCount(), 0);
    });
  }

  test(rota.metodo + " " + rota.caminho + ": falha de consulta retorna 500 seguro sem controller", async (t) => {
    const mocks = await preparar(t, { falhaConsulta: true });
    const resposta = await mocks.requisitar(rota.metodo, rota.url);
    assert.equal(resposta.codigo, 500);
    assert.deepEqual(resposta.corpo, { status: "error", message: "Erro interno ao validar a autenticação." });
    assert.equal(JSON.stringify(resposta.corpo).includes(DETALHE_INTERNO), false);
    assert.deepEqual(mocks.eventos, ["autenticacao", "jwt", "identidade"]);
    verificarController(mocks, rota, false);
    verificarRespostaUnica(mocks, resposta);
  });

  test(rota.metodo + " " + rota.caminho + ": JWT expirado retorna 401 sem consulta nem controller", async (t) => {
    const mocks = await preparar(t, { jwtExpirado: true });
    const resposta = await mocks.requisitar(rota.metodo, rota.url);
    assert.equal(resposta.codigo, 401);
    assert.deepEqual(resposta.corpo, { status: "error", message: "Token expirado. Realize o login novamente." });
    assert.equal(mocks.consultaIdentidade.mock.callCount(), 0);
    verificarController(mocks, rota, false);
    verificarRespostaUnica(mocks, resposta);
  });

  test(rota.metodo + " " + rota.caminho + ": erro público do controller não é reescrito pelo router", async (t) => {
    const corpo = { status: "error", message: "Conflito público simulado." };
    const mocks = await preparar(t, { codigoController: 409, respostaController: corpo });
    const resposta = await mocks.requisitar(rota.metodo, rota.url);
    assert.equal(resposta.codigo, 409);
    assert.deepEqual(resposta.corpo, corpo);
    assert.deepEqual(mocks.eventos, ["autenticacao", "jwt", "identidade", rota.handler]);
    verificarController(mocks, rota, true);
    verificarRespostaUnica(mocks, resposta);
  });
}

const NAO_PREVISTAS = [
  ["PATCH", "/"], ["DELETE", "/"], ["PUT", "/"],
  ["POST", "/50"], ["PATCH", "/50"],
  ["POST", "/local/40"], ["PUT", "/local/40"], ["DELETE", "/local/40"],
  ["POST", "/upload"], ["GET", "/50/arquivo"],
];
for (const [metodo, url] of NAO_PREVISTAS) {
  test(metodo + " " + url + ": endpoint não definido não aciona nenhum controller", async (t) => {
    const mocks = await preparar(t);
    const resposta = await mocks.requisitar(metodo, url);
    assert.equal(resposta.codigo, 404);
    assert.deepEqual(resposta.corpo, { status: "error", message: "Rota não encontrada." });
    for (const mock of Object.values(mocks.controllers)) assert.equal(mock.mock.callCount(), 0);
    verificarRespostaUnica(mocks, resposta);
  });
}

test("Router preserva HTTP 200 da recuperação idempotente fornecido pelo controller", async (t) => {
  const corpo = { status: "success", data: { id_evidencia: 50 } };
  const mocks = await preparar(t, { codigoController: 200, respostaController: corpo });
  const resposta = await mocks.requisitar("POST", "/");
  assert.equal(resposta.codigo, 200);
  assert.deepEqual(resposta.corpo, corpo);
  verificarController(mocks, ROTAS[0], true);
  verificarRespostaUnica(mocks, resposta);
});

test("Router tem somente seis rotas, autenticação anterior e rota local antes de ID", async (t) => {
  const mocks = await preparar(t);
  const endpoints = mocks.router.stack.filter((layer) => layer.route);
  assert.equal(endpoints.length, 6);
  assert.ok(endpoints.findIndex((layer) => layer.route.path === "/local/:idLocal") <
    endpoints.findIndex((layer) => layer.route.path === "/:id"));
  assert.equal(require.cache[APP_PATH], undefined);
  assert.equal(require.cache[ROTER_PATH], undefined);
  assert.equal(require.cache[MIDDLEWARE_PATH], undefined);
});

