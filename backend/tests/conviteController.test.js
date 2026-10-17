
const test = require("node:test");
const assert = require("node:assert/strict");

const Module = require("node:module");

// Substitui o serviço antes de carregar o controller, inclusive nos seis testes
// antigos. Não importa serviço real, repositories, banco, dotenv ou app.
const conviteService = {
  emitirConvite: async () => { throw new Error("Emissão não simulada"); },
  aceitarConvite: async () => { throw new Error("Aceitação não simulada"); },
};
const CAMINHO_CONTROLLER = require.resolve("../src/controllers/conviteController");
const moduloAnterior = require.cache[CAMINHO_CONTROLLER];
const carregarOriginal = Module._load;
const importsController = [];
let conviteController;
try {
  delete require.cache[CAMINHO_CONTROLLER];
  Module._load = function (request, parent, ...resto) {
    if (parent && parent.filename === CAMINHO_CONTROLLER) {
      importsController.push(request);
      if (request !== "../services/conviteService") {
        throw new Error("Dependência não autorizada: " + request);
      }
      return conviteService;
    }
    return carregarOriginal.call(this, request, parent, ...resto);
  };
  conviteController = require(CAMINHO_CONTROLLER);
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

const ID_AMBIENTE =
  "11111111-1111-4111-8111-111111111111";

// ========================================
// TESTES DE EMISSÃO DE CONVITES
// ========================================

test(
  "Retorna HTTP 201 ao emitir convite",
  async (t) => {
    const dados = {
      email: "engenheiro@exemplo.com",
      perfilAcesso: "ENGENHEIRO_SEGURANCA",
    };

    const resultadoSimulado = {
      convite: {
        id_convite:
          "22222222-2222-4222-8222-222222222222",
        id_ambiente: ID_AMBIENTE,
        email: dados.email,
      },
      token: "token-simulado",
    };

    const emissao = t.mock.method(
      conviteService,
      "emitirConvite",
      async () => resultadoSimulado
    );

    const req = {
      usuario: {
        id_usuario: 10,
        id_ambiente: ID_AMBIENTE,
        perfil_acesso: "ADMINISTRADOR",
      },
      body: dados,
    };

    const res = criarRespostaSimulada();

    await conviteController.emitir(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.status, "success");
    assert.deepEqual(
      res.body.data,
      resultadoSimulado
    );

    assert.equal(emissao.mock.callCount(), 1);

    assert.deepEqual(
      emissao.mock.calls[0].arguments,
      [10, dados]
    );
  }
);

test(
  "Recusa emissão sem usuário autenticado",
  async (t) => {
    const emissao = t.mock.method(
      conviteService,
      "emitirConvite",
      async () => {
        throw new Error(
          "O serviço não deveria ser chamado."
        );
      }
    );

    const req = {
      body: {
        email: "teste@exemplo.com",
        perfilAcesso: "ADMINISTRADOR",
      },
    };

    const res = criarRespostaSimulada();

    await conviteController.emitir(req, res);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.status, "error");
    assert.equal(emissao.mock.callCount(), 0);
  }
);

test(
  "Retorna HTTP 403 quando o administrador não possui permissão",
  async (t) => {
    const erro = new Error(
      "Você não possui permissão para gerenciar convites."
    );
    erro.statusCode = 403;

    t.mock.method(
      conviteService,
      "emitirConvite",
      async () => {
        throw erro;
      }
    );

    t.mock.method(
      console,
      "error",
      () => {}
    );

    const req = {
      usuario: {
        id_usuario: 10,
        id_ambiente: ID_AMBIENTE,
        perfil_acesso: "ADMINISTRADOR",
      },
      body: {
        email: "teste@exemplo.com",
        perfilAcesso: "ADMINISTRADOR",
      },
    };

    const res = criarRespostaSimulada();

    await conviteController.emitir(req, res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.status, "error");
    assert.match(
      res.body.message,
      /permissão/i
    );
  }
);

// ========================================
// TESTES DE ACEITE DE CONVITES
// ========================================

test(
  "Retorna HTTP 201 ao aceitar convite",
  async (t) => {
    const dados = {
      token: "token-simulado",
      nome: "Engenheiro Teste",
      senha: "SenhaSegura123",
    };

    const resultadoSimulado = {
      usuario: {
        id_usuario: 20,
        id_ambiente: ID_AMBIENTE,
        perfil_acesso: "ENGENHEIRO_SEGURANCA",
      },
      convite: {
        id_convite:
          "22222222-2222-4222-8222-222222222222",
        data_aceite:
          "2026-10-14T12:00:00.000Z",
      },
    };

    const aceite = t.mock.method(
      conviteService,
      "aceitarConvite",
      async () => resultadoSimulado
    );

    const req = { body: dados };
    const res = criarRespostaSimulada();

    await conviteController.aceitar(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.status, "success");

    assert.deepEqual(
      res.body.data,
      resultadoSimulado
    );

    assert.equal(aceite.mock.callCount(), 1);

    assert.deepEqual(
      aceite.mock.calls[0].arguments,
      [
        dados.token,
        {
          nome: dados.nome,
          senha: dados.senha,
        },
      ]
    );
  }
);

test(
  "Retorna HTTP 410 para convite expirado",
  async (t) => {
    const erro = new Error(
      "Este convite expirou."
    );
    erro.statusCode = 410;

    t.mock.method(
      conviteService,
      "aceitarConvite",
      async () => {
        throw erro;
      }
    );

    t.mock.method(
      console,
      "error",
      () => {}
    );

    const req = {
      body: {
        token: "token-expirado",
        nome: "Engenheiro Teste",
        senha: "SenhaSegura123",
      },
    };

    const res = criarRespostaSimulada();

    await conviteController.aceitar(req, res);

    assert.equal(res.statusCode, 410);
    assert.equal(res.body.status, "error");
    assert.match(
      res.body.message,
      /expirou/i
    );
  }
);

test(
  "Retorna HTTP 500 sem expor erros internos",
  async (t) => {
    t.mock.method(
      conviteService,
      "aceitarConvite",
      async () => {
        throw new Error(
          "Detalhes internos do PostgreSQL"
        );
      }
    );

    t.mock.method(
      console,
      "error",
      () => {}
    );

    const req = {
      body: {
        token: "token-simulado",
        nome: "Engenheiro Teste",
        senha: "SenhaSegura123",
      },
    };

    const res = criarRespostaSimulada();

    await conviteController.aceitar(req, res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.status, "error");

    assert.equal(
      res.body.message,
      "Erro interno ao aceitar convite."
    );

    assert.doesNotMatch(
      res.body.message,
      /PostgreSQL/
    );
  }
);


// Contratos preservados e proteções pendentes são identificados nos nomes.
// Nenhum teste de regressão é ignorado ou enfraquecido para aprovar o código atual.
const SENSIVEIS = Object.freeze([
  "MENSAGEM_TECNICA_SIMULADA_NAO_PUBLICAR",
  "SELECT segredo_simulado FROM tabela_interna",
  "STACK_INTERNA_SIMULADA_NAO_PUBLICAR",
  "TOKEN_DE_CONVITE_FICTICIO_NAO_PUBLICAR",
  "SENHA_FICTICIA_NAO_PUBLICAR",
  "C:\\caminho-interno-simulado\\arquivo",
  "DADOS_SIMULADOS_DE_OUTRO_AMBIENTE",
]);
const ADMINISTRADOR = Object.freeze({
  id_usuario: 10, id_ambiente: ID_AMBIENTE, perfil_acesso: "ADMINISTRADOR",
});
const DADOS_EMISSAO = Object.freeze({
  email: "convidado@example.invalid", perfilAcesso: "ENGENHEIRO_SEGURANCA",
  id_usuario: 999, id_ambiente: "33333333-3333-4333-8333-333333333333",
});
const DADOS_ACEITE = Object.freeze({
  token: "TOKEN_FICTICIO_DE_ENTRADA",
  nome: "Convidado simulado", senha: "SENHA_FICTICIA_DE_ENTRADA",
  id_usuario: 999, perfil_acesso: "ADMINISTRADOR",
});
const RESULTADO_EMISSAO = Object.freeze({
  convite: Object.freeze({ id_convite: "22222222-2222-4222-8222-222222222222", id_ambiente: ID_AMBIENTE }),
  token: "TOKEN_FICTICIO_DO_RESULTADO_AUTORIZADO",
});
const RESULTADO_ACEITE = Object.freeze({
  usuario: Object.freeze({ id_usuario: 20, id_ambiente: ID_AMBIENTE }),
  convite: Object.freeze({ id_convite: "22222222-2222-4222-8222-222222222222" }),
});
const OPERACOES = [
  {
    nome: "emitir", metodo: "emitirConvite", outro: "aceitarConvite",
    dados: DADOS_EMISSAO, resultado: RESULTADO_EMISSAO,
    mensagem: "Convite criado com sucesso.", erroInterno: "Erro interno ao emitir convite.",
  },
  {
    nome: "aceitar", metodo: "aceitarConvite", outro: "emitirConvite",
    dados: DADOS_ACEITE, resultado: RESULTADO_ACEITE,
    mensagem: "Convite aceito com sucesso.", erroInterno: "Erro interno ao aceitar convite.",
  },
];

function criarReqSeguranca(operacao) {
  return operacao.nome === "emitir"
    ? { usuario: ADMINISTRADOR, body: operacao.dados }
    : { body: operacao.dados };
}

function prepararSeguranca(t, operacao, implementacao) {
  const logs = [];
  const proibidos = [];
  for (const nome of ["error", "warn", "info", "log"]) {
    t.mock.method(console, nome, (...args) => { logs.push(args); });
  }
  const carregar = Module._load;
  t.mock.method(Module, "_load", function (request, parent, ...resto) {
    if (parent && parent.filename === CAMINHO_CONTROLLER) {
      if (request === "../services/conviteService") return conviteService;
      proibidos.push(request);
      throw new Error("Banco, app, arquivos ou serviço real proibidos: " + request);
    }
    return carregar.call(this, request, parent, ...resto);
  });
  const chamada = t.mock.method(conviteService, operacao.metodo, implementacao);
  const outra = t.mock.method(conviteService, operacao.outro, async () => {
    throw new Error("Operação de serviço inesperada: " + operacao.outro);
  });
  assert.deepEqual(importsController, ["../services/conviteService"]);
  t.after(() => {
    assert.deepEqual(proibidos, []);
    assert.equal(outra.mock.callCount(), 0);
    assert.strictEqual(require.cache[CAMINHO_CONTROLLER], moduloAnterior);
  });
  return { chamada, outra, logs };
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

function erroSensivel(statusCode) {
  const erro = new Error(SENSIVEIS.join(" | "));
  if (statusCode !== undefined) erro.statusCode = statusCode;
  erro.query = SENSIVEIS[1];
  erro.stack = SENSIVEIS[2];
  erro.token = SENSIVEIS[3];
  erro.senha = SENSIVEIS[4];
  erro.caminho = SENSIVEIS[5];
  erro.detail = SENSIVEIS[6];
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
}

function verificarChamada(contexto, operacao, req, indice = 0) {
  assert.equal(contexto.chamada.mock.callCount(), indice + 1);
  assert.equal(contexto.outra.mock.callCount(), 0);
  const args = contexto.chamada.mock.calls[indice].arguments;
  if (operacao.nome === "emitir") {
    assert.deepEqual(args, [req.usuario.id_usuario, req.body || {}]);
    assert.strictEqual(req.usuario, ADMINISTRADOR);
    if (req.body) assert.strictEqual(args[1], req.body);
  } else {
    const { token, nome, senha } = req.body || {};
    assert.deepEqual(args, [token, { nome, senha }]);
    assert.deepEqual(Object.keys(args[1]).sort(), ["nome", "senha"]);
    assert.equal(Object.hasOwn(req, "usuario"), false);
  }
}

async function exercitarErro(t, operacao, erro) {
  const contexto = prepararSeguranca(t, operacao, async () => { throw erro; });
  const req = criarReqSeguranca(operacao);
  const res = criarResSeguranca(t);
  const retorno = await conviteController[operacao.nome](req, res);
  verificarChamada(contexto, operacao, req);
  return { ...contexto, req, res, retorno };
}

const STATUS_INVALIDOS_VERDADEIROS = [
  ["string 400", "400"], ["string 500", "500"], ["string false", "false"],
  ["true", true], ["array", []], ["objeto", {}], ["fracionário", 400.5],
  ["negativo", -1], ["abaixo de HTTP", 99], ["sucesso 200", 200],
  ["redirecionamento 302", 302], ["acima de 599", 600], ["fora de HTTP", 1000],
  ["Infinity", Infinity],
];

for (const operacao of OPERACOES) {
  test("[contrato preservado] " + operacao.nome + ": 201, mensagem exata, referências e argumentos", async (t) => {
    const contexto = prepararSeguranca(t, operacao, async () => operacao.resultado);
    const req = criarReqSeguranca(operacao);
    const res = criarResSeguranca(t);
    const retorno = await conviteController[operacao.nome](req, res);
    verificarRespostaUnica(res, retorno, 201, {
      status: "success", message: operacao.mensagem, data: operacao.resultado,
    });
    assert.strictEqual(res.body.data, operacao.resultado);
    assert.strictEqual(req.body, operacao.dados);
    verificarChamada(contexto, operacao, req);
    assert.equal(contexto.logs.length, 0);
  });

  for (const [statusCode, message] of [
    [400, "Dados de convite inválidos."],
    [403, "Você não possui permissão para gerenciar convites."],
    [409, "Conflito de negócio simulado."],
    [410, "Este convite expirou."],
  ]) {
    test("[contrato preservado] " + operacao.nome + ": mantém mensagem pública HTTP " + statusCode, async (t) => {
      // Testa a tradução HTTP, não presume quais erros o serviço realmente gera.
      const erro = erroSensivel(statusCode);
      erro.message = message;
      const { res, retorno } = await exercitarErro(t, operacao, erro);
      verificarRespostaUnica(res, retorno, statusCode, { status: "error", message });
      verificarSemDadosInternos(res);
    });
  }

  test("[contrato preservado] " + operacao.nome + ": status ausente recebe 500 genérico", async (t) => {
    const { res, retorno } = await exercitarErro(t, operacao, erroSensivel());
    verificarRespostaUnica(res, retorno, 500, { status: "error", message: operacao.erroInterno });
    verificarSemDadosInternos(res);
  });

  for (const [nome, statusCode] of [
    ["null", null], ["zero", 0], ["false", false], ["NaN", NaN], ["texto vazio", ""],
  ]) {
    test("[contrato preservado] " + operacao.nome + ": status inválido falso " + nome + " já resulta em 500", async (t) => {
      const { res, retorno } = await exercitarErro(t, operacao, erroSensivel(statusCode));
      verificarRespostaUnica(res, retorno, 500, { status: "error", message: operacao.erroInterno });
      verificarSemDadosInternos(res);
    });
  }

  test("[contrato preservado] " + operacao.nome + ": preserva fallback de corpo e argumentos", async (t) => {
    const erro = Object.assign(new Error("Dados obrigatórios ausentes."), { statusCode: 400 });
    const contexto = prepararSeguranca(t, operacao, async () => { throw erro; });
    for (const [indice, body] of [undefined, null, false, 0, ""].entries()) {
      const req = operacao.nome === "emitir" ? { usuario: ADMINISTRADOR } : {};
      if (body !== undefined) req.body = body;
      const res = criarResSeguranca(t);
      const retorno = await conviteController[operacao.nome](req, res);
      verificarRespostaUnica(res, retorno, 400, { status: "error", message: erro.message });
      verificarChamada(contexto, operacao, req, indice);
      assert.strictEqual(req.body, body);
      if (body === undefined) assert.equal(Object.hasOwn(req, "body"), false);
    }
  });

  test("[contrato preservado] " + operacao.nome + ": não inventa tratamento especial de 23505", async (t) => {
    const erro = erroSensivel();
    erro.code = "23505";
    const { res, retorno } = await exercitarErro(t, operacao, erro);
    verificarRespostaUnica(res, retorno, 500, { status: "error", message: operacao.erroInterno });
    verificarSemDadosInternos(res);
  });

  test("[segurança pendente] " + operacao.nome + ": todos os HTTP 500–599 ocultam mensagem original", async (t) => {
    let erro;
    const contexto = prepararSeguranca(t, operacao, async () => { throw erro; });
    for (let statusCode = 500; statusCode <= 599; statusCode += 1) {
      erro = erroSensivel(statusCode);
      const req = criarReqSeguranca(operacao);
      const res = criarResSeguranca(t);
      const retorno = await conviteController[operacao.nome](req, res);
      verificarRespostaUnica(res, retorno, statusCode, { status: "error", message: operacao.erroInterno });
      verificarSemDadosInternos(res);
      verificarChamada(contexto, operacao, req, statusCode - 500);
    }
  });

  for (const [nome, statusCode] of STATUS_INVALIDOS_VERDADEIROS) {
    test("[segurança pendente] " + operacao.nome + ": status " + nome + " resulta em 500 sem coerção", async (t) => {
      const { res, retorno } = await exercitarErro(t, operacao, erroSensivel(statusCode));
      verificarRespostaUnica(res, retorno, 500, { status: "error", message: operacao.erroInterno });
      verificarSemDadosInternos(res);
    });
  }

  test("[segurança pendente] " + operacao.nome + ": resposta iniciada durante espera não é sobrescrita no erro", async (t) => {
    const req = criarReqSeguranca(operacao);
    const res = criarResSeguranca(t);
    const body = Object.freeze({ status: "success", data: operacao.resultado });
    const contexto = prepararSeguranca(t, operacao, async () => {
      res.body = body;
      res.headersSent = true;
      throw erroSensivel(500);
    });
    await conviteController[operacao.nome](req, res);
    assert.strictEqual(res.body, body);
    assert.equal(res.statusCode, 200);
    for (const nome of ["status", "json", "send", "end", "write", "sendFile", "download", "setHeader"]) {
      assert.equal(res[nome].mock.callCount(), 0);
    }
    verificarChamada(contexto, operacao, req);
  });

  test("[segurança pendente] " + operacao.nome + ": resposta iniciada durante espera não é sobrescrita no sucesso", async (t) => {
    const req = criarReqSeguranca(operacao);
    const res = criarResSeguranca(t);
    const body = Object.freeze({ status: "success", message: "Resposta anterior simulada." });
    const contexto = prepararSeguranca(t, operacao, async () => {
      res.body = body;
      res.headersSent = true;
      return operacao.resultado;
    });
    await conviteController[operacao.nome](req, res);
    assert.strictEqual(res.body, body);
    assert.equal(res.statusCode, 200);
    for (const nome of ["status", "json", "send", "end", "write", "sendFile", "download", "setHeader"]) {
      assert.equal(res[nome].mock.callCount(), 0);
    }
    verificarChamada(contexto, operacao, req);
  });

  test("[segurança pendente] " + operacao.nome + ": falha após iniciar JSON não tenta segunda resposta", async (t) => {
    const contexto = prepararSeguranca(t, operacao, async () => operacao.resultado);
    const req = criarReqSeguranca(operacao);
    const res = criarResSeguranca(t);
    res.json.mock.mockImplementation(() => {
      res.headersSent = true;
      throw new Error("Falha de transporte simulada após início");
    });
    await conviteController[operacao.nome](req, res);
    assert.equal(res.status.mock.callCount(), 1);
    assert.equal(res.json.mock.callCount(), 1);
    assert.equal(res.send.mock.callCount(), 0);
    assert.equal(res.end.mock.callCount(), 0);
    verificarChamada(contexto, operacao, req);
  });

  test("[segurança pendente] " + operacao.nome + ": logs não recebem erro completo ou dados sensíveis", async (t) => {
    const erro = erroSensivel();
    const { logs, res, retorno } = await exercitarErro(t, operacao, erro);
    verificarRespostaUnica(res, retorno, 500, { status: "error", message: operacao.erroInterno });
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
}

test("[contrato preservado] emitir rejeita identidades inválidas com 401 exato sem serviço", async (t) => {
  const contexto = prepararSeguranca(t, OPERACOES[0], async () => {
    throw new Error("Não deveria consultar o serviço");
  });
  const usuarios = [undefined, null, {}];
  for (const id_usuario of [
    undefined, null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1,
    "10", true, false, [], {},
  ]) usuarios.push({ ...ADMINISTRADOR, id_usuario });
  for (const usuario of usuarios) {
    const req = {
      body: { ...DADOS_EMISSAO, id_usuario: 10, usuario: ADMINISTRADOR },
      query: { id_usuario: 10 }, params: { id_usuario: 10 },
    };
    if (usuario !== undefined) req.usuario = usuario;
    const res = criarResSeguranca(t);
    const retorno = await conviteController.emitir(req, res);
    verificarRespostaUnica(res, retorno, 401, { status: "error", message: "Usuário não autenticado." });
  }
  assert.equal(contexto.chamada.mock.callCount(), 0);
});

test("[segurança pendente] emitir com headersSent não envia nem a rejeição local 401", async (t) => {
  const contexto = prepararSeguranca(t, OPERACOES[0], async () => {
    throw new Error("Não deveria consultar o serviço");
  });
  const req = { body: DADOS_EMISSAO };
  const res = criarResSeguranca(t);
  const body = Object.freeze({ status: "success", message: "Resposta anterior simulada." });
  res.body = body;
  res.headersSent = true;
  await conviteController.emitir(req, res);
  assert.strictEqual(res.body, body);
  assert.equal(res.statusCode, 200);
  for (const nome of ["status", "json", "send", "end", "write", "sendFile", "download", "setHeader"]) {
    assert.equal(res[nome].mock.callCount(), 0);
  }
  assert.equal(contexto.chamada.mock.callCount(), 0);
});

test("[contrato preservado] exports e import isolado permanecem limitados ao controller de convites", () => {
  assert.deepEqual(Object.keys(conviteController).sort(), ["aceitar", "emitir"]);
  assert.deepEqual(importsController, ["../services/conviteService"]);
});

