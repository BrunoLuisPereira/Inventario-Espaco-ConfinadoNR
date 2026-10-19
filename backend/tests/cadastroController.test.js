const politicaRbac723 = require('../src/utils/permissoes');

const test = require("node:test");
const assert = require("node:assert/strict");

const Module = require("node:module");

// Dependência substituída ANTES da carga: não importa serviço, repository,
// configuração de banco, dotenv ou app reais, inclusive nos quatro testes antigos.
const cadastroService = {
  cadastrarAmbiente: async () => { throw new Error("Serviço não simulado"); },
};
const CAMINHO_CONTROLLER = require.resolve("../src/controllers/cadastroController");
const moduloAnterior = require.cache[CAMINHO_CONTROLLER];
const carregarOriginal = Module._load;
const importsController = [];
let cadastroController;
try {
  delete require.cache[CAMINHO_CONTROLLER];
  Module._load = function (request, parent, ...resto) {
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (request === '../utils/permissoes') return politicaRbac723;
    if (parent && parent.filename === CAMINHO_CONTROLLER) {
      importsController.push(request);
      if (request !== "../services/cadastroService") {
        throw new Error("Dependência não autorizada: " + request);
      }
      return cadastroService;
    }
    return carregarOriginal.call(this, request, parent, ...resto);
  };
  cadastroController = require(CAMINHO_CONTROLLER);
} finally {
  Module._load = carregarOriginal;
  if (moduloAnterior) require.cache[CAMINHO_CONTROLLER] = moduloAnterior;
  else delete require.cache[CAMINHO_CONTROLLER];
}

function criarRespostaSimulada() {
  return {
    statusCode: 200,
    body: null,

    status(codigo) {
      this.statusCode = codigo;
      return this;
    },

    json(dados) {
      this.body = dados;
      return this;
    },
  };
}

test(
  "Retorna HTTP 201 após cadastrar ambiente e administrador",
  async (t) => {
    const dados = {
      nome: "Administrador Teste",
      email: "admin@exemplo.com",
      senha: "SenhaSegura123",
    };

    const resultadoSimulado = {
      ambiente: {
        id_ambiente:
          "11111111-1111-4111-8111-111111111111",
        nome: "Ambiente de Administrador Teste",
      },
      usuario: {
        id_usuario: 10,
        eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
      },
    };

    const cadastro = t.mock.method(
      cadastroService,
      "cadastrarAmbiente",
      async () => resultadoSimulado
    );

    const req = { body: dados };
    const res = criarRespostaSimulada();

    await cadastroController.cadastrarAmbiente(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.status, "success");
    assert.deepEqual(res.body.data, resultadoSimulado);

    assert.equal(cadastro.mock.callCount(), 1);
    assert.deepEqual(
      cadastro.mock.calls[0].arguments,
      [dados]
    );
  }
);

test(
  "Retorna HTTP 400 quando o serviço rejeita dados inválidos",
  async (t) => {
    const erro = new Error("O nome é obrigatório.");
    erro.statusCode = 400;

    t.mock.method(
      cadastroService,
      "cadastrarAmbiente",
      async () => {
        throw erro;
      }
    );

    t.mock.method(console, "error", () => {});

    const req = { body: {} };
    const res = criarRespostaSimulada();

    await cadastroController.cadastrarAmbiente(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.status, "error");
    assert.equal(
      res.body.message,
      "O nome é obrigatório."
    );
  }
);

test(
  "Retorna HTTP 409 quando o e-mail está em conflito",
  async (t) => {
    const erro = new Error(
      "Este e-mail já está cadastrado."
    );
    erro.statusCode = 409;

    t.mock.method(
      cadastroService,
      "cadastrarAmbiente",
      async () => {
        throw erro;
      }
    );

    t.mock.method(console, "error", () => {});

    const req = { body: {} };
    const res = criarRespostaSimulada();

    await cadastroController.cadastrarAmbiente(req, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, "error");
  }
);

test(
  "Retorna HTTP 500 sem expor detalhes de erros internos",
  async (t) => {
    t.mock.method(
      cadastroService,
      "cadastrarAmbiente",
      async () => {
        throw new Error(
          "Detalhes internos de conexão"
        );
      }
    );

    t.mock.method(console, "error", () => {});

    const req = { body: {} };
    const res = criarRespostaSimulada();

    await cadastroController.cadastrarAmbiente(req, res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.status, "error");
    assert.equal(
      res.body.message,
      "Erro interno ao cadastrar ambiente."
    );

    assert.doesNotMatch(
      res.body.message,
      /Detalhes internos de conexão/
    );
  }
);


// Novos cenários: contratos preservados e proteções pendentes ficam identificados.
// Nenhuma expectativa de segurança é ignorada ou adaptada ao defeito atual.
const MENSAGEM_INTERNA = "Erro interno ao cadastrar ambiente.";
const SENSIVEIS = Object.freeze([
  "MENSAGEM_TECNICA_SIMULADA_NAO_PUBLICAR",
  "SELECT segredo_simulado FROM tabela_interna",
  "CREDENCIAL_FICTICIA_NAO_PUBLICAR",
  "TOKEN_FICTICIO_NAO_PUBLICAR",
  "C:\\caminho-interno-simulado\\arquivo",
  "DADOS_SIMULADOS_DE_OUTRO_AMBIENTE",
]);
const DADOS_SEGUROS = Object.freeze({
  nome: "Administrador simulado",
  email: "admin@example.invalid",
  senha: "CREDENCIAL_FICTICIA_DE_ENTRADA",
});
const RESULTADO_SEGURO = Object.freeze({
  ambiente: Object.freeze({
    id_ambiente: "11111111-1111-4111-8111-111111111111", nome: "Ambiente simulado",
  }),
  usuario: Object.freeze({ id_usuario: 10, eh_fundador: true, perfil_acesso: "ADMINISTRADOR" }),
});

function prepararSeguranca(t, implementacao) {
  const logs = [];
  const proibidos = [];
  for (const nome of ["error", "warn", "info", "log"]) {
    t.mock.method(console, nome, (...args) => { logs.push(args); });
  }
  const carregar = Module._load;
  t.mock.method(Module, "_load", function (request, parent, ...resto) {
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (request === '../utils/permissoes') return politicaRbac723;
    if (parent && parent.filename === CAMINHO_CONTROLLER) {
      if (request === "../services/cadastroService") return cadastroService;
      proibidos.push(request);
      throw new Error("Banco, app, arquivos ou serviço real proibidos: " + request);
    }
    return carregar.call(this, request, parent, ...resto);
  });
  const cadastro = t.mock.method(cadastroService, "cadastrarAmbiente", implementacao);
  assert.deepEqual(importsController, ["../services/cadastroService"]);
  t.after(() => {
    assert.deepEqual(proibidos, []);
    assert.strictEqual(require.cache[CAMINHO_CONTROLLER], moduloAnterior);
  });
  return { cadastro, logs };
}

function criarResSeguranca(t) {
  const res = { statusCode: 200, body: undefined, headersSent: false };
  res.status = t.mock.fn((codigo) => { res.statusCode = codigo; return res; });
  res.json = t.mock.fn((corpo) => { res.body = corpo; res.headersSent = true; return res; });
  for (const nome of ["send", "end", "write", "sendFile", "download", "setHeader"]) {
    res[nome] = t.mock.fn(() => res);
  }
  return res;
}

function criarErroSensivel(statusCode) {
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

function verificarRespostaUnica(res, retorno, codigo, corpo) {
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

function verificarSemDadosInternos(res) {
  assert.deepEqual(Object.keys(res.body).sort(), ["message", "status"]);
  const publico = JSON.stringify(res.body);
  for (const segredo of SENSIVEIS) assert.equal(publico.includes(segredo), false);
  assert.equal(publico.includes("STACK_INTERNA_SIMULADA"), false);
}

function verificarChamada(cadastro, req) {
  assert.equal(cadastro.mock.callCount(), 1);
  const args = cadastro.mock.calls[0].arguments;
  assert.equal(args.length, 1);
  assert.strictEqual(args[0], req.body);
}

async function exercitarErro(t, erro) {
  const contexto = prepararSeguranca(t, async () => { throw erro; });
  const req = { body: DADOS_SEGUROS };
  const res = criarResSeguranca(t);
  const retorno = await cadastroController.cadastrarAmbiente(req, res);
  verificarChamada(contexto.cadastro, req);
  return { ...contexto, req, res, retorno };
}

test("[contrato preservado] cadastro mantém 201, mensagem exata, referências e corpo original", async (t) => {
  const { cadastro, logs } = prepararSeguranca(t, async () => RESULTADO_SEGURO);
  const req = { body: DADOS_SEGUROS };
  const res = criarResSeguranca(t);
  const retorno = await cadastroController.cadastrarAmbiente(req, res);
  verificarRespostaUnica(res, retorno, 201, {
    status: "success",
    message: "Ambiente e administrador cadastrados com sucesso.",
    data: RESULTADO_SEGURO,
  });
  assert.strictEqual(res.body.data, RESULTADO_SEGURO);
  assert.strictEqual(req.body, DADOS_SEGUROS);
  verificarChamada(cadastro, req);
  assert.equal(logs.length, 0);
});

for (const [nome, body] of [
  ["ausente", undefined], ["null", null], ["false", false], ["zero", 0], ["texto vazio", ""],
]) {
  test("[contrato preservado] req.body " + nome + " utiliza fallback para objeto vazio", async (t) => {
    const erro = Object.assign(new Error("O nome é obrigatório."), { statusCode: 400 });
    const { cadastro } = prepararSeguranca(t, async () => { throw erro; });
    const req = body === undefined ? {} : { body };
    const res = criarResSeguranca(t);
    const retorno = await cadastroController.cadastrarAmbiente(req, res);
    verificarRespostaUnica(res, retorno, 400, { status: "error", message: "O nome é obrigatório." });
    assert.equal(cadastro.mock.callCount(), 1);
    const args = cadastro.mock.calls[0].arguments;
    assert.equal(args.length, 1);
    assert.deepEqual(args[0], {});
    assert.notStrictEqual(args[0], body);
    assert.strictEqual(req.body, body);
    if (body === undefined) assert.equal(Object.hasOwn(req, "body"), false);
  });
}

for (const [statusCode, message] of [
  [400, "O nome é obrigatório."], [409, "Este e-mail já está cadastrado."],
]) {
  test("[contrato preservado] HTTP " + statusCode + " conserva mensagem pública exata", async (t) => {
    const erro = criarErroSensivel(statusCode);
    erro.message = message;
    const { res, retorno } = await exercitarErro(t, erro);
    verificarRespostaUnica(res, retorno, statusCode, { status: "error", message });
    verificarSemDadosInternos(res);
  });
}

test("[contrato preservado] 23505 mantém 409 e mensagem fixa mesmo com status concorrente", async (t) => {
  let erro;
  const { cadastro } = prepararSeguranca(t, async () => { throw erro; });
  const concorrentes = [undefined, 400, 500, 503, "500", 700];
  for (const [indice, statusCode] of concorrentes.entries()) {
    erro = criarErroSensivel(statusCode);
    erro.code = "23505";
    const req = { body: DADOS_SEGUROS };
    const res = criarResSeguranca(t);
    const retorno = await cadastroController.cadastrarAmbiente(req, res);
    verificarRespostaUnica(res, retorno, 409, {
      status: "error", message: "Já existe um usuário com este e-mail.",
    });
    verificarSemDadosInternos(res);
    assert.deepEqual(cadastro.mock.calls[indice].arguments, [DADOS_SEGUROS]);
    assert.strictEqual(cadastro.mock.calls[indice].arguments[0], DADOS_SEGUROS);
  }
  assert.equal(cadastro.mock.callCount(), concorrentes.length);
});

test("[contrato preservado] status ausente mantém 500 genérico sem dados internos", async (t) => {
  const { res, retorno } = await exercitarErro(t, criarErroSensivel());
  verificarRespostaUnica(res, retorno, 500, { status: "error", message: MENSAGEM_INTERNA });
  verificarSemDadosInternos(res);
});

for (const [nome, statusCode] of [
  ["null", null], ["zero", 0], ["false", false], ["NaN", NaN], ["texto vazio", ""],
]) {
  test("[contrato preservado] status inválido falso " + nome + " já resulta em 500 seguro", async (t) => {
    const { res, retorno } = await exercitarErro(t, criarErroSensivel(statusCode));
    verificarRespostaUnica(res, retorno, 500, { status: "error", message: MENSAGEM_INTERNA });
    verificarSemDadosInternos(res);
  });
}

test("[contrato preservado] outros inteiros 4xx públicos não sofrem coerção", async (t) => {
  let erro;
  const { cadastro } = prepararSeguranca(t, async () => { throw erro; });
  const codigos = [401, 403, 404, 410, 499];
  for (const [indice, statusCode] of codigos.entries()) {
    // Tradução do controller; não afirma que o serviço gera todos estes códigos.
    erro = Object.assign(new Error("Mensagem pública de negócio."), { statusCode });
    const req = { body: DADOS_SEGUROS };
    const res = criarResSeguranca(t);
    const retorno = await cadastroController.cadastrarAmbiente(req, res);
    verificarRespostaUnica(res, retorno, statusCode, { status: "error", message: erro.message });
    assert.strictEqual(cadastro.mock.calls[indice].arguments[0], DADOS_SEGUROS);
  }
  assert.equal(cadastro.mock.callCount(), codigos.length);
});

test("[segurança pendente] todos os HTTP 500–599 ocultam mensagens técnicas", async (t) => {
  let erro;
  const { cadastro } = prepararSeguranca(t, async () => { throw erro; });
  for (let statusCode = 500; statusCode <= 599; statusCode += 1) {
    erro = criarErroSensivel(statusCode);
    const req = { body: DADOS_SEGUROS };
    const res = criarResSeguranca(t);
    const retorno = await cadastroController.cadastrarAmbiente(req, res);
    verificarRespostaUnica(res, retorno, statusCode, { status: "error", message: MENSAGEM_INTERNA });
    verificarSemDadosInternos(res);
    assert.strictEqual(cadastro.mock.calls[statusCode - 500].arguments[0], DADOS_SEGUROS);
  }
});

const STATUS_INVALIDOS_VERDADEIROS = [
  ["string 400", "400"], ["string 500", "500"], ["string false", "false"],
  ["true", true], ["array", []], ["objeto", {}], ["fracionário", 400.5],
  ["negativo", -1], ["abaixo de HTTP", 99], ["sucesso 200", 200],
  ["redirecionamento 302", 302], ["acima de 599", 600], ["fora de HTTP", 1000],
  ["Infinity", Infinity],
];
for (const [nome, statusCode] of STATUS_INVALIDOS_VERDADEIROS) {
  test("[segurança pendente] status " + nome + " resulta em 500 seguro sem coerção", async (t) => {
    const { res, retorno } = await exercitarErro(t, criarErroSensivel(statusCode));
    verificarRespostaUnica(res, retorno, 500, { status: "error", message: MENSAGEM_INTERNA });
    verificarSemDadosInternos(res);
  });
}

function verificarSemNovoEnvio(res, body, codigo) {
  assert.strictEqual(res.body, body);
  assert.equal(res.statusCode, codigo);
  for (const nome of ["status", "json", "send", "end", "write", "sendFile", "download", "setHeader"]) {
    assert.equal(res[nome].mock.callCount(), 0);
  }
}

test("[segurança pendente] headersSent impede nova resposta no caminho de erro", async (t) => {
  const { cadastro } = prepararSeguranca(t, async () => { throw criarErroSensivel(500); });
  const req = { body: DADOS_SEGUROS };
  const res = criarResSeguranca(t);
  const body = Object.freeze({ status: "success", data: RESULTADO_SEGURO });
  res.body = body;
  res.headersSent = true;
  await cadastroController.cadastrarAmbiente(req, res);
  verificarSemNovoEnvio(res, body, 200);
  verificarChamada(cadastro, req);
});

test("[segurança pendente] resposta iniciada durante espera pelo serviço não é sobrescrita no sucesso", async (t) => {
  const req = { body: DADOS_SEGUROS };
  const res = criarResSeguranca(t);
  const body = Object.freeze({ status: "success", message: "Resposta anterior simulada." });
  const { cadastro } = prepararSeguranca(t, async () => {
    res.body = body;
    res.headersSent = true;
    return RESULTADO_SEGURO;
  });
  await cadastroController.cadastrarAmbiente(req, res);
  verificarSemNovoEnvio(res, body, 200);
  verificarChamada(cadastro, req);
});

test("[segurança pendente] falha de json após iniciar envio não causa segunda tentativa", async (t) => {
  const { cadastro } = prepararSeguranca(t, async () => RESULTADO_SEGURO);
  const req = { body: DADOS_SEGUROS };
  const res = criarResSeguranca(t);
  res.json.mock.mockImplementation(() => {
    res.headersSent = true;
    throw new Error("Falha de transporte simulada após início");
  });
  await cadastroController.cadastrarAmbiente(req, res);
  assert.equal(res.status.mock.callCount(), 1);
  assert.equal(res.json.mock.callCount(), 1);
  assert.equal(res.send.mock.callCount(), 0);
  assert.equal(res.end.mock.callCount(), 0);
  verificarChamada(cadastro, req);
});

test("[segurança pendente] headersSent também impede segunda resposta no mapeamento 23505", async (t) => {
  const erro = criarErroSensivel(500);
  erro.code = "23505";
  const { cadastro } = prepararSeguranca(t, async () => { throw erro; });
  const req = { body: DADOS_SEGUROS };
  const res = criarResSeguranca(t);
  const body = Object.freeze({ status: "success", data: RESULTADO_SEGURO });
  res.body = body;
  res.headersSent = true;
  await cadastroController.cadastrarAmbiente(req, res);
  verificarSemNovoEnvio(res, body, 200);
  verificarChamada(cadastro, req);
});

test("[segurança pendente] logs não recebem erro completo nem dados sensíveis", async (t) => {
  const erro = criarErroSensivel();
  const { logs, res, retorno } = await exercitarErro(t, erro);
  verificarRespostaUnica(res, retorno, 500, { status: "error", message: MENSAGEM_INTERNA });
  const visitados = new WeakSet();
  function inspecionar(valor) {
    assert.notStrictEqual(valor, erro, "Não registrar o objeto original do erro");
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
  for (const args of logs) for (const valor of args) inspecionar(valor);
});

