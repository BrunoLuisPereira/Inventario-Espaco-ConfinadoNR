const politicaRbac723 = require('../src/utils/permissoes');
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const CONTROLLER_PATH = require.resolve("../src/controllers/authController");
const MENSAGEM_INTERNA = "Erro interno ao realizar login.";
const SENSIVEIS = Object.freeze([
  "MENSAGEM_TECNICA_SIMULADA_NAO_PUBLICAR",
  "SELECT segredo_simulado FROM tabela_interna",
  "CREDENCIAL_FICTICIA_NAO_PUBLICAR",
  "TOKEN_FICTICIO_NAO_PUBLICAR",
  "C:\\diretorio-interno-simulado\\arquivo",
  "DADOS_SIMULADOS_DE_OUTRO_AMBIENTE",
]);
const DADOS = Object.freeze({
  email: "usuario@example.invalid", senha: "CREDENCIAL_FICTICIA_DE_ENTRADA",
});
const RESULTADO = Object.freeze({
  token: "TOKEN_FICTICIO_DE_LOGIN_BEM_SUCEDIDO",
  usuario: Object.freeze({ id_usuario: 10, nome: "Usuário simulado" }),
});

function preparar(t, implementacao) {
  const imports = [];
  const proibidos = [];
  const logs = [];
  const service = {
    login: t.mock.fn(implementacao),
    loginMultiTenant: t.mock.fn(async () => { throw new Error("Método alternativo proibido"); }),
  };
  for (const nome of ["error", "warn", "info", "log"]) {
    t.mock.method(console, nome, (...args) => { logs.push(args); });
  }
  const anterior = require.cache[CONTROLLER_PATH];
  const carregar = Module._load;
  let controller;
  try {
    delete require.cache[CONTROLLER_PATH];
    Module._load = function (request, parent, ...resto) {
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (request === '../utils/permissoes') return politicaRbac723;
      if (parent && parent.filename === CONTROLLER_PATH) {
        imports.push(request);
        if (request !== "../services/authService") {
          proibidos.push(request);
          throw new Error("Dependência não autorizada: " + request);
        }
        return service;
      }
      return carregar.call(this, request, parent, ...resto);
    };
    controller = require(CONTROLLER_PATH);
  } finally {
    Module._load = carregar;
    if (anterior) require.cache[CONTROLLER_PATH] = anterior;
    else delete require.cache[CONTROLLER_PATH];
  }
  // A mesma barreira permanece ativa para imports feitos durante o login.
  t.mock.method(Module, "_load", function (request, parent, ...resto) {
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (request === '../utils/permissoes') return politicaRbac723;
    if (parent && parent.filename === CONTROLLER_PATH) {
      if (request === "../services/authService") return service;
      proibidos.push(request);
      throw new Error("Banco, app, arquivos ou serviços reais proibidos: " + request);
    }
    return carregar.call(this, request, parent, ...resto);
  });
  t.after(() => {
    assert.deepEqual(proibidos, []);
    assert.equal(service.loginMultiTenant.mock.callCount(), 0);
    assert.strictEqual(require.cache[CONTROLLER_PATH], anterior);
  });
  return { controller, service, imports, logs };
}

function simularReq() {
  const usuario = Object.freeze({
    id_usuario: 20, id_ambiente: "22222222-2222-4222-8222-222222222222",
  });
  return { body: DADOS, usuario };
}

function simularRes(t) {
  const res = { headersSent: false, statusCode: 200, body: undefined };
  res.status = t.mock.fn((codigo) => { res.statusCode = codigo; return res; });
  res.json = t.mock.fn((corpo) => { res.body = corpo; res.headersSent = true; return res; });
  for (const nome of ["send", "end", "write", "sendFile", "download", "setHeader"]) {
    res[nome] = t.mock.fn(() => res);
  }
  return res;
}

function erroSensivel(statusCode) {
  const erro = new Error(SENSIVEIS.join(" | "));
  if (statusCode !== undefined) erro.statusCode = statusCode;
  erro.stack = "STACK_INTERNA_SIMULADA " + SENSIVEIS[4];
  erro.query = SENSIVEIS[1];
  erro.senha = SENSIVEIS[2];
  erro.token = SENSIVEIS[3];
  erro.caminho = SENSIVEIS[4];
  erro.detail = SENSIVEIS[5];
  return erro;
}

function verificarDelegacao(contexto, req, usuarioOriginal) {
  assert.deepEqual(contexto.imports, ["../services/authService"]);
  assert.equal(contexto.service.login.mock.callCount(), 1);
  const args = contexto.service.login.mock.calls[0].arguments;
  assert.equal(args.length, 2);
  assert.equal(args[1], req.socket?.remoteAddress);
  assert.strictEqual(args[0], req.body);
  assert.strictEqual(req.usuario, usuarioOriginal);
  assert.strictEqual(req.body, DADOS);
  assert.equal(contexto.service.loginMultiTenant.mock.callCount(), 0);
}

function verificarResposta(res, retorno, codigo, corpo) {
  assert.strictEqual(retorno, res);
  assert.equal(res.status.mock.callCount(), 1);
  assert.deepEqual(res.status.mock.calls[0].arguments, [codigo]);
  assert.equal(res.statusCode, codigo);
  assert.equal(res.json.mock.callCount(), 1);
  assert.deepEqual(res.json.mock.calls[0].arguments, [corpo]);
  assert.deepEqual(res.body, corpo);
  for (const nome of ["send", "end", "write", "sendFile", "download", "setHeader"]) {
    assert.equal(res[nome].mock.callCount(), 0);
  }
}

function verificarErroSeguro(res) {
  assert.deepEqual(Object.keys(res.body).sort(), ["message", "status"]);
  const publico = JSON.stringify(res.body);
  for (const segredo of SENSIVEIS) assert.equal(publico.includes(segredo), false);
  assert.equal(publico.includes("STACK_INTERNA_SIMULADA"), false);
}

async function executarErro(t, contexto, erro) {
  contexto.service.login.mock.mockImplementation(async () => { throw erro; });
  const req = simularReq();
  const usuario = req.usuario;
  const res = simularRes(t);
  const retorno = await contexto.controller.login(req, res);
  verificarDelegacao(contexto, req, usuario);
  return { res, retorno };
}

// CONTRATOS ATUAIS: devem permanecer aprovados após a correção.
test("[contrato atual] isola o serviço antes da carga e exporta somente login", (t) => {
  const contexto = preparar(t, async () => RESULTADO);
  assert.deepEqual(contexto.imports, ["../services/authService"]);
  assert.deepEqual(Object.keys(contexto.controller), ["login"]);
  assert.equal(typeof contexto.controller.login, "function");
});

test("[contrato atual] login bem-sucedido preserva HTTP 200, JSON, referências e identidade", async (t) => {
  const contexto = preparar(t, async () => RESULTADO);
  const req = simularReq();
  const usuario = req.usuario;
  const res = simularRes(t);
  const retorno = await contexto.controller.login(req, res);
  verificarResposta(res, retorno, 200, {
    status: "success", message: "Login realizado com sucesso.", data: RESULTADO,
  });
  assert.strictEqual(res.body.data, RESULTADO);
  verificarDelegacao(contexto, req, usuario);
  assert.equal(contexto.logs.length, 0);
});

for (const statusCode of [400, 401, 403, 404, 409]) {
  test("[contrato atual] preserva erro controlado HTTP " + statusCode + " sem campos internos", async (t) => {
    // Verifica a tradução do controller, sem afirmar que o serviço produz
    // necessariamente cada um destes códigos em um login real.
    const erro = erroSensivel(statusCode);
    erro.message = "Mensagem pública de negócio " + statusCode + ".";
    const contexto = preparar(t, async () => { throw erro; });
    const { res, retorno } = await executarErro(t, contexto, erro);
    verificarResposta(res, retorno, statusCode, { status: "error", message: erro.message });
    verificarErroSeguro(res);
  });
}

test("[contrato atual] erro inesperado sem statusCode recebe HTTP 500 genérico", async (t) => {
  const contexto = preparar(t);
  const { res, retorno } = await executarErro(t, contexto, erroSensivel());
  verificarResposta(res, retorno, 500, { status: "error", message: MENSAGEM_INTERNA });
  verificarErroSeguro(res);
});

test("[contrato atual] erro sem mensagem mantém a resposta genérica anterior", async (t) => {
  const contexto = preparar(t);
  const { res, retorno } = await executarErro(t, contexto, new Error());
  verificarResposta(res, retorno, 500, { status: "error", message: MENSAGEM_INTERNA });
});

for (const [nome, statusCode] of [
  ["null", null], ["zero", 0], ["NaN", NaN], ["false", false], ["string vazia", ""],
]) {
  test("[contrato atual] status inválido falso " + nome + " já resulta em HTTP 500 seguro", async (t) => {
    const contexto = preparar(t);
    const { res, retorno } = await executarErro(t, contexto, erroSensivel(statusCode));
    verificarResposta(res, retorno, 500, { status: "error", message: MENSAGEM_INTERNA });
    verificarErroSeguro(res);
  });
}

test("[contrato atual] outros inteiros 4xx válidos preservam o contrato de mensagem pública", async (t) => {
  const contexto = preparar(t);
  for (const statusCode of [402, 410, 413, 415, 422, 429, 499]) {
    const erro = Object.assign(new Error("Mensagem pública controlada."), { statusCode });
    // Cada chamada usa resposta e requisição novas; somente o mock é reutilizado.
    const inicio = contexto.service.login.mock.callCount();
    contexto.service.login.mock.mockImplementation(async () => { throw erro; });
    const req = simularReq();
    const res = simularRes(t);
    const retorno = await contexto.controller.login(req, res);
    verificarResposta(res, retorno, statusCode, { status: "error", message: erro.message });
    assert.equal(contexto.service.login.mock.callCount(), inicio + 1);
    const args = contexto.service.login.mock.calls[inicio].arguments;
    assert.equal(args.length, 2);
    assert.strictEqual(args[0], DADOS);
  }
});

// PROTEÇÕES NECESSÁRIAS: falhas esperadas no controller atual, sem skip/todo.
test("[segurança pendente] todos os HTTP 500–599 recebem mensagem genérica", async (t) => {
  const contexto = preparar(t);
  for (let statusCode = 500; statusCode <= 599; statusCode += 1) {
    const erro = erroSensivel(statusCode);
    contexto.service.login.mock.mockImplementation(async () => { throw erro; });
    const req = simularReq();
    const res = simularRes(t);
    const retorno = await contexto.controller.login(req, res);
    verificarResposta(res, retorno, statusCode, { status: "error", message: MENSAGEM_INTERNA });
    verificarErroSeguro(res);
  }
});

const STATUS_INVALIDOS_VERDADEIROS = [
  ["string 400", "400"], ["string 500", "500"], ["string false", "false"],
  ["array", []], ["objeto", {}], ["true", true], ["fracionário", 400.5],
  ["negativo", -1], ["abaixo de HTTP", 99], ["sucesso 200", 200],
  ["redirecionamento 302", 302], ["acima de 599", 600], ["fora de HTTP", 1000],
  ["Infinity", Infinity],
];
for (const [nome, statusCode] of STATUS_INVALIDOS_VERDADEIROS) {
  test("[segurança pendente] status " + nome + " não sofre coerção e retorna HTTP 500 seguro", async (t) => {
    const contexto = preparar(t);
    const { res, retorno } = await executarErro(t, contexto, erroSensivel(statusCode));
    verificarResposta(res, retorno, 500, { status: "error", message: MENSAGEM_INTERNA });
    verificarErroSeguro(res);
  });
}

test("[segurança pendente] erro após headersSent não envia segunda resposta", async (t) => {
  const contexto = preparar(t);
  const req = simularReq();
  const usuario = req.usuario;
  const res = simularRes(t);
  const corpoAnterior = Object.freeze({ status: "success", data: RESULTADO });
  res.body = corpoAnterior;
  res.headersSent = true;
  contexto.service.login.mock.mockImplementation(async () => { throw erroSensivel(500); });
  await contexto.controller.login(req, res);
  assert.strictEqual(res.body, corpoAnterior);
  assert.equal(res.statusCode, 200);
  for (const nome of ["status", "json", "send", "end", "write", "sendFile", "download", "setHeader"]) {
    assert.equal(res[nome].mock.callCount(), 0);
  }
  verificarDelegacao(contexto, req, usuario);
});

test("[segurança pendente] resposta iniciada enquanto aguarda login não é sobrescrita no sucesso", async (t) => {
  const req = simularReq();
  const res = simularRes(t);
  const corpoAnterior = Object.freeze({ status: "success", message: "Resposta anterior simulada." });
  const contexto = preparar(t, async () => {
    res.body = corpoAnterior;
    res.headersSent = true;
    return RESULTADO;
  });
  await contexto.controller.login(req, res);
  assert.strictEqual(res.body, corpoAnterior);
  for (const nome of ["status", "json", "send", "end", "write", "sendFile", "download", "setHeader"]) {
    assert.equal(res[nome].mock.callCount(), 0);
  }
  verificarDelegacao(contexto, req, req.usuario);
});

test("[segurança pendente] falha de transporte após JSON iniciado não tenta outro JSON", async (t) => {
  const contexto = preparar(t, async () => RESULTADO);
  const req = simularReq();
  const res = simularRes(t);
  res.json.mock.mockImplementation(() => {
    res.headersSent = true;
    throw new Error("Falha de transporte simulada após envio");
  });
  await contexto.controller.login(req, res);
  assert.equal(res.status.mock.callCount(), 1);
  assert.equal(res.json.mock.callCount(), 1);
  assert.equal(res.send.mock.callCount(), 0);
  assert.equal(res.end.mock.callCount(), 0);
  verificarDelegacao(contexto, req, req.usuario);
});

test("[segurança pendente] logs não contêm mensagem sensível nem erro completo", async (t) => {
  const erro = erroSensivel();
  const contexto = preparar(t, async () => { throw erro; });
  const { res, retorno } = await executarErro(t, contexto, erro);
  verificarResposta(res, retorno, 500, { status: "error", message: MENSAGEM_INTERNA });
  const visitados = new WeakSet();
  function inspecionar(valor) {
    assert.notStrictEqual(valor, erro);
    if (typeof valor === "string") {
      for (const segredo of SENSIVEIS) assert.equal(valor.includes(segredo), false);
      return;
    }
    if (!valor || typeof valor !== "object" || visitados.has(valor)) return;
    visitados.add(valor);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(valor))) {
      if (Object.hasOwn(descriptor, "value")) inspecionar(descriptor.value);
    }
  }
  for (const args of contexto.logs) for (const valor of args) inspecionar(valor);
});

