const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const cors = require("cors");

const APP_PATH = require.resolve("../src/app");
const MENSAGEM_INTERNA = "Erro interno do servidor.";
const SENSIVEIS = Object.freeze([
  "MENSAGEM_TECNICA_SIMULADA_NAO_PUBLICAR",
  "SELECT segredo_simulado FROM tabela_interna",
  "C:\\caminho-interno-simulado\\arquivo",
  "TOKEN_FICTICIO_NAO_PUBLICAR",
  "CREDENCIAL_FICTICIA_NAO_PUBLICAR",
  "DADOS_SIMULADOS_DE_OUTRO_AMBIENTE",
]);
const ROUTERS = [
  "./routes/authRoutes", "./routes/usuarioRoutes", "./routes/campanhaRoutes",
  "./routes/localRoutes", "./routes/checklistRoutes", "./routes/evidenciaRoutes",
  "./routes/dadosTecnicosRoutes", "./routes/relatorioRoutes", "./routes/sincronizacaoRoutes",
];

// Testes unitários do handler REAL registrado pelo app REAL. Não emulam sua
// lógica. Express/CORS são reais, mas todos os routers são substituídos antes
// da carga. Nenhum servidor/socket é aberto, nem o pipeline de uploads usado.
function carregarAppIsolado(t) {
  const usos = [];
  const gets = [];
  const imports = [];
  const proibidos = [];
  const logs = [];
  const routers = Object.fromEntries(ROUTERS.map((nome) => [
    nome, t.mock.fn((_req, _res, next) => next()),
  ]));
  const dependencias = { cors, ...routers };
  function expressCapturado() {
    const app = express();
    const use = app.use;
    const get = app.get;
    app.use = function (...args) {
      usos.push(args);
      return use.apply(this, args);
    };
    app.get = function (...args) {
      if (args.length > 1) gets.push(args);
      return get.apply(this, args);
    };
    return app;
  }
  expressCapturado.json = express.json;
  expressCapturado.urlencoded = express.urlencoded;
  dependencias.express = expressCapturado;

  for (const nome of ["error", "warn", "info", "log"]) {
    t.mock.method(console, nome, (...args) => { logs.push(args); });
  }

  const anterior = require.cache[APP_PATH];
  const carregar = Module._load;
  let app;
  try {
    delete require.cache[APP_PATH];
    Module._load = function (request, parent, ...resto) {
      if (parent && parent.filename === APP_PATH) {
        imports.push(request);
        if (!Object.hasOwn(dependencias, request)) {
          proibidos.push(request);
          throw new Error("Dependência não autorizada do app: " + request);
        }
        return dependencias[request];
      }
      return carregar.call(this, request, parent, ...resto);
    };
    app = require(APP_PATH);
  } finally {
    Module._load = carregar;
    if (anterior) require.cache[APP_PATH] = anterior;
    else delete require.cache[APP_PATH];
  }

  // Bloqueia também tentativas de importar dependências novas dentro dos
  // callbacks do app durante o teste, incluindo pool, dotenv, fs e serviços.
  t.mock.method(Module, "_load", function (request, parent, ...resto) {
    if (parent && parent.filename === APP_PATH) {
      if (!Object.hasOwn(dependencias, request)) {
        proibidos.push(request);
        throw new Error("Dependência não autorizada em callback: " + request);
      }
      return dependencias[request];
    }
    return carregar.call(this, request, parent, ...resto);
  });
  const handlersErro = usos.filter((args) => args.length === 1 &&
    typeof args[0] === "function" && args[0].length === 4);
  assert.equal(handlersErro.length, 1, "Deve capturar o handler global real");
  const tratarErro = handlersErro[0][0];
  const indiceErro = usos.findIndex((args) => args[0] === tratarErro);
  const candidatos404 = usos.slice(0, indiceErro).filter((args) =>
    args.length === 1 && typeof args[0] === "function" && args[0].length === 3);
  assert.ok(candidatos404.length > 0);
  const naoEncontrado = candidatos404[candidatos404.length - 1][0];
  t.after(() => {
    assert.deepEqual(proibidos, []);
    for (const router of Object.values(routers)) assert.equal(router.mock.callCount(), 0);
    assert.strictEqual(require.cache[APP_PATH], anterior);
  });
  return { app, tratarErro, naoEncontrado, gets, usos, imports, logs, routers };
}

function simularRes(t) {
  const res = Object.create(express.response);
  Object.defineProperty(res, "headersSent", { value: false, writable: true, configurable: true });
  res.statusCode = 200;
  res.body = undefined;
  // Usa a validação de status da versão real do Express instalada no projeto.
  res.status = t.mock.fn(function (codigo) {
    return express.response.status.call(this, codigo);
  });
  res.json = t.mock.fn(function (corpo) {
    this.body = corpo;
    this.headersSent = true;
    return this;
  });
  for (const nome of ["send", "end", "write", "sendFile", "download", "setHeader"]) {
    res[nome] = t.mock.fn(() => res);
  }
  return res;
}

function erroSensivel(statusCode) {
  const erro = new Error(SENSIVEIS.join(" | "));
  if (statusCode !== undefined) erro.statusCode = statusCode;
  erro.stack = "STACK_SIMULADA " + SENSIVEIS[2];
  erro.query = SENSIVEIS[1];
  erro.detail = SENSIVEIS[5];
  erro.token = SENSIVEIS[3];
  erro.senha = SENSIVEIS[4];
  erro.body = SENSIVEIS[3];
  return erro;
}

function verificarResposta(res, next, codigo, mensagem) {
  assert.equal(res.status.mock.callCount(), 1);
  assert.deepEqual(res.status.mock.calls[0].arguments, [codigo]);
  assert.equal(res.statusCode, codigo);
  assert.equal(res.json.mock.callCount(), 1);
  assert.deepEqual(res.body, { status: "error", message: mensagem });
  assert.deepEqual(Object.keys(res.body).sort(), ["message", "status"]);
  assert.equal(next.mock.callCount(), 0);
  for (const nome of ["send", "end", "write", "sendFile", "download", "setHeader"]) {
    assert.equal(res[nome].mock.callCount(), 0);
  }
}

function verificarSemSensivel(valor) {
  const texto = JSON.stringify(valor);
  for (const segredo of SENSIVEIS) assert.equal(texto.includes(segredo), false);
}

function executarHandler(t, contexto, erro, req = {}) {
  const res = simularRes(t);
  const next = t.mock.fn();
  contexto.tratarErro(erro, req, res, next);
  return { res, next };
}

// CONTRATOS ATUAIS A PRESERVAR: estas expectativas já são sustentadas pelo app.
test("[contrato atual] carrega o app real com nove routers simulados e sem servidor", (t) => {
  const contexto = carregarAppIsolado(t);
  assert.equal(typeof contexto.app, "function");
  assert.deepEqual(contexto.imports, ["express", "cors", ...ROUTERS]);
  assert.equal(contexto.usos[contexto.usos.length - 1][0], contexto.tratarErro);
});

for (const statusCode of [400, 401, 403, 404, 409, 410]) {
  test("[contrato atual] preserva erro de negócio HTTP " + statusCode + " e mensagem pública", (t) => {
    const contexto = carregarAppIsolado(t);
    const erro = Object.assign(new Error("Mensagem pública de negócio " + statusCode + "."), { statusCode });
    const { res, next } = executarHandler(t, contexto, erro);
    verificarResposta(res, next, statusCode, erro.message);
  });
}

const MAPEAMENTOS = [
  ["LIMIT_FILE_SIZE", 400, "Arquivo muito grande. O tamanho máximo permitido é 10 MB."],
  ["LIMIT_UNEXPECTED_FILE", 400, "Campo de arquivo inválido. Utilize o campo 'arquivo'."],
  ["23505", 409, "Já existe um registro com esses dados."],
  ["23503", 400, "Não foi possível realizar a operação devido a um relacionamento inválido."],
  ["23514", 400, "Um dos valores informados não atende às regras permitidas."],
];
for (const [code, statusCode, message] of MAPEAMENTOS) {
  test("[contrato atual] preserva mapeamento público de " + code, (t) => {
    const contexto = carregarAppIsolado(t);
    const erro = erroSensivel(500);
    erro.code = code;
    const { res, next } = executarHandler(t, contexto, erro);
    verificarResposta(res, next, statusCode, message);
    verificarSemSensivel(res.body);
  });
}

test("[contrato atual] statusCode válido prevalece sobre status válido", (t) => {
  const contexto = carregarAppIsolado(t);
  const erro = Object.assign(new Error("Dados inválidos."), { statusCode: 400, status: 404 });
  const { res, next } = executarHandler(t, contexto, erro);
  verificarResposta(res, next, 400, "Dados inválidos.");
});

test("[contrato atual] status válido é usado quando statusCode está ausente", (t) => {
  const contexto = carregarAppIsolado(t);
  const erro = Object.assign(new Error("Convite expirado."), { status: 410 });
  const { res, next } = executarHandler(t, contexto, erro);
  verificarResposta(res, next, 410, "Convite expirado.");
});

test("[contrato atual] erro sem mensagem e sem status usa 500 e mensagem padrão", (t) => {
  const contexto = carregarAppIsolado(t);
  const { res, next } = executarHandler(t, contexto, new Error());
  verificarResposta(res, next, 500, MENSAGEM_INTERNA);
});

for (const [caminho, message] of [
  ["/", "API do Inventário de Espaços Confinados funcionando."],
  ["/api/health", "API funcionando corretamente."],
]) {
  test("[contrato atual] preserva resposta de sucesso de " + caminho, (t) => {
    const contexto = carregarAppIsolado(t);
    const rota = contexto.gets.find((args) => args[0] === caminho);
    assert.ok(rota);
    const res = simularRes(t);
    rota[1]({}, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { status: "success", message });
    assert.equal(res.json.mock.callCount(), 1);
    assert.equal(contexto.logs.length, 0);
  });
}

// PROTEÇÕES NECESSÁRIAS: testes de regressão deliberadamente não enfraquecidos.
// Devem revelar falhas do app atual; não são skip/todo/expectedFailure.
test("[segurança pendente] erro inesperado sensível retorna 500 genérico", (t) => {
  const contexto = carregarAppIsolado(t);
  const { res, next } = executarHandler(t, contexto, erroSensivel());
  verificarResposta(res, next, 500, MENSAGEM_INTERNA);
  verificarSemSensivel(res.body);
});

test("[segurança pendente] todos os status 500 a 599 ocultam a mensagem original", (t) => {
  const contexto = carregarAppIsolado(t);
  for (let statusCode = 500; statusCode <= 599; statusCode += 1) {
    const { res, next } = executarHandler(t, contexto, erroSensivel(statusCode));
    // Mantém status operacional válido; somente a mensagem interna é ocultada.
    verificarResposta(res, next, statusCode, MENSAGEM_INTERNA);
    verificarSemSensivel(res.body);
  }
});

const STATUS_INVALIDOS = [
  ["ausente", undefined], ["null", null], ["zero", 0], ["negativo", -1],
  ["sucesso 200", 200], ["redirecionamento 302", 302],
  ["abaixo da faixa", 99], ["acima de 599", 600], ["fora de HTTP", 1000],
  ["fracionário", 400.5], ["NaN", NaN], ["Infinity", Infinity],
  ["string 400", "400"], ["string 500", "500"], ["string vazia", ""],
  ["string técnica", SENSIVEIS[0]], ["true", true], ["false", false],
  ["array", []], ["objeto", {}],
];
for (const [nome, statusCode] of STATUS_INVALIDOS) {
  test("[segurança pendente] statusCode " + nome + " resulta em um 500 seguro", (t) => {
    const contexto = carregarAppIsolado(t);
    const { res, next } = executarHandler(t, contexto, erroSensivel(statusCode));
    verificarResposta(res, next, 500, MENSAGEM_INTERNA);
    verificarSemSensivel(res.body);
  });
}

test("[segurança pendente] status alternativo inválido também resulta em 500 seguro", (t) => {
  const contexto = carregarAppIsolado(t);
  for (const [, status] of STATUS_INVALIDOS) {
    const erro = erroSensivel();
    erro.status = status;
    const { res, next } = executarHandler(t, contexto, erro);
    verificarResposta(res, next, 500, MENSAGEM_INTERNA);
    verificarSemSensivel(res.body);
  }
});

test("[segurança pendente] ignora statusCode inválido quando existe status alternativo válido", (t) => {
  const contexto = carregarAppIsolado(t);
  for (const statusCode of ["400", 700, 400.5, true, {}]) {
    const erro = Object.assign(new Error("Recurso não encontrado."), { statusCode, status: 404 });
    const { res, next } = executarHandler(t, contexto, erro);
    verificarResposta(res, next, 404, "Recurso não encontrado.");
  }
});

test("[contrato atual] statusCode falso não impede status alternativo válido", (t) => {
  const contexto = carregarAppIsolado(t);
  for (const statusCode of [undefined, null, 0, false, ""]) {
    const erro = Object.assign(new Error("Convite expirado."), { statusCode, status: 410 });
    const { res, next } = executarHandler(t, contexto, erro);
    verificarResposta(res, next, 410, "Convite expirado.");
  }
});

test("[segurança pendente] statusCode 500 prevalece sobre status 400 sem expor a mensagem", (t) => {
  const contexto = carregarAppIsolado(t);
  const erro = erroSensivel(500);
  erro.status = 400;
  const { res, next } = executarHandler(t, contexto, erro);
  verificarResposta(res, next, 500, MENSAGEM_INTERNA);
});

const ERROS_PARSER = [
  ["entity.parse.failed", 400],
  ["entity.too.large", 413],
  ["charset.unsupported", 415],
  ["encoding.unsupported", 415],
  ["request.size.invalid", 400],
];
for (const [type, statusCode] of ERROS_PARSER) {
  test("[segurança pendente] erro técnico de parser " + type + " tem mensagem pública segura", (t) => {
    const contexto = carregarAppIsolado(t);
    // Formato dos erros de parser; não usa payloads reais nem executa uploads.
    const erro = erroSensivel(statusCode);
    erro.status = statusCode;
    erro.type = type;
    erro.expose = true; // Não basta para considerar uma mensagem técnica pública.
    const { res, next } = executarHandler(t, contexto, erro);
    assert.equal(typeof res.body.message, "string");
    assert.ok(res.body.message.length > 0);
    assert.notEqual(res.body.message, erro.message);
    verificarSemSensivel(res.body);
    verificarResposta(res, next, statusCode, res.body.message);
  });
}

test("[segurança pendente] 404 real do app não reflete URL, query ou valores sensíveis", (t) => {
  const contexto = carregarAppIsolado(t);
  const req = {
    method: "GET",
    originalUrl: "/rota-inexistente?token=" + SENSIVEIS[3] + "&dado=" + SENSIVEIS[5],
  };
  const encaminhar = t.mock.fn();
  contexto.naoEncontrado(req, {}, encaminhar);
  assert.equal(encaminhar.mock.callCount(), 1);
  const erro = encaminhar.mock.calls[0].arguments[0];
  assert.equal(erro.statusCode, 404);
  const { res, next } = executarHandler(t, contexto, erro, req);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.status, "error");
  assert.equal(typeof res.body.message, "string");
  assert.ok(res.body.message.length > 0);
  verificarSemSensivel(res.body);
  assert.equal(res.body.message.includes("?token="), false);
  verificarResposta(res, next, 404, res.body.message);
});

for (const estado of ["somente cabeçalhos", "JSON de sucesso iniciado", "resposta binária iniciada"]) {
  test("[segurança pendente] headersSent com " + estado + " delega sem modificar resposta", (t) => {
    const contexto = carregarAppIsolado(t);
    const res = simularRes(t);
    res.headersSent = true;
    res.statusCode = estado === "resposta binária iniciada" ? 206 : 200;
    const body = estado === "resposta binária iniciada"
      ? Buffer.from("bytes-simulados-sem-arquivo")
      : Object.freeze({ status: "success", data: { id: 50 } });
    res.body = body;
    const codigoAnterior = res.statusCode;
    const erro = erroSensivel(500);
    const next = t.mock.fn();
    contexto.tratarErro(erro, {}, res, next);
    assert.equal(next.mock.callCount(), 1);
    assert.strictEqual(next.mock.calls[0].arguments[0], erro);
    assert.strictEqual(res.body, body);
    assert.equal(res.statusCode, codigoAnterior);
    for (const nome of ["status", "json", "send", "end", "write", "sendFile", "download", "setHeader"]) {
      assert.equal(res[nome].mock.callCount(), 0);
    }
  });
}

test("[segurança pendente] logs não recebem erro completo nem seus dados sensíveis", (t) => {
  const contexto = carregarAppIsolado(t);
  const erro = erroSensivel();
  executarHandler(t, contexto, erro);
  const visitados = new WeakSet();
  function inspecionar(valor) {
    assert.notStrictEqual(valor, erro, "Não registrar o objeto original do erro");
    if (typeof valor === "string") {
      for (const segredo of SENSIVEIS) assert.equal(valor.includes(segredo), false);
      return;
    }
    if (!valor || typeof valor !== "object" || visitados.has(valor)) return;
    visitados.add(valor);
    // Inclui message/stack não enumeráveis sem executar getters do logger.
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(valor))) {
      if (Object.hasOwn(descriptor, "value")) inspecionar(descriptor.value);
    }
  }
  for (const args of contexto.logs) for (const valor of args) inspecionar(valor);
});

