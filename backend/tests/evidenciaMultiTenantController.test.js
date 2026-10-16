const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const fs = require("node:fs");

const METODOS_SERVICO = [
  "criarEvidencia", "listarEvidencias", "buscarEvidenciaPorId",
  "listarEvidenciasPorLocal", "atualizarEvidencia", "excluirEvidencia",
];
const service = Object.fromEntries(METODOS_SERVICO.map((nome) => [nome, async () => {
  throw new Error("Serviço não simulado: " + nome);
}]));
const caminhoController = require.resolve("../src/controllers/evidenciaMultiTenantController");
const moduloAnterior = require.cache[caminhoController];
const carregarOriginal = Module._load;
const dependencias = [];
let controller;
// O serviço real não é carregado: nenhum pool, dotenv, repository ou app é
// importado. Qualquer outra dependência do controller provoca falha imediata.
try {
  delete require.cache[caminhoController];
  Module._load = function (request, parent, ...resto) {
    if (parent && parent.filename === caminhoController) {
      dependencias.push(request);
      if (request !== "../services/evidenciaMultiTenantService") {
        throw new Error("Dependência não autorizada: " + request);
      }
      return service;
    }
    return carregarOriginal.call(this, request, parent, ...resto);
  };
  controller = require(caminhoController);
} finally {
  Module._load = carregarOriginal;
  if (moduloAnterior) require.cache[caminhoController] = moduloAnterior;
  else delete require.cache[caminhoController];
}

const AMBIENTE_A = "11111111-1111-4111-8111-111111111111";
const AMBIENTE_B = "22222222-2222-4222-8222-222222222222";
const IDENTIDADES = [
  Object.freeze({ id_usuario: 10, id_ambiente: AMBIENTE_A, perfil_acesso: "ENGENHEIRO_SEGURANCA" }),
  Object.freeze({ id_usuario: 20, id_ambiente: AMBIENTE_B, perfil_acesso: "ENGENHEIRO_SEGURANCA" }),
];
const EVIDENCIA = Object.freeze({
  id_evidencia: 50, id_local: 40, id_usuario: 10, tipo: "FOTO",
  descricao: "Evidência simulada", caminho_arquivo: "uploads/evidencias/legado.jpg",
  data_criacao: "2020-01-01T00:00:00.000Z",
});
const MENSAGEM_CONFLITO = "Não foi possível concluir a operação devido a um conflito. Recarregue os dados e tente novamente.";
const SENSIVEIS = [
  "SQL_INTERNO SELECT segredo FROM tabela_interna",
  "TOKEN_INTERNO_SIMULADO_NAO_PUBLICAR",
  "C:\\diretorio-interno\\arquivo-sensivel",
  "REGISTRO_EXTERNO_AMBIENTE_B_NAO_PUBLICAR",
  "STACK_INTERNA_NAO_PUBLICAR",
];
const OPERACOES = [
  {
    nome: "criar", metodo: "criarEvidencia", identidade: 1,
    argumentos: (req) => [req.body, req.usuario, { incluirResultadoCriacao: true }],
    resultado: (registro) => ({ evidencia: registro, criada: true }),
    codigo: 201, mensagem: "Evidência criada com sucesso.",
    erroInterno: "Erro interno ao criar evidência.",
  },
  {
    nome: "listar", metodo: "listarEvidencias", identidade: 0,
    argumentos: (req) => [req.usuario],
    resultado: (registro) => [registro], lista: true, codigo: 200,
    erroInterno: "Erro interno ao listar evidências.",
  },
  {
    nome: "buscarPorId", metodo: "buscarEvidenciaPorId", identidade: 1,
    argumentos: (req) => [req.params.id, req.usuario],
    resultado: (registro) => registro, codigo: 200,
    erroInterno: "Erro interno ao buscar evidência.",
  },
  {
    nome: "listarPorLocal", metodo: "listarEvidenciasPorLocal", identidade: 1,
    argumentos: (req) => [req.params.idLocal, req.usuario],
    resultado: (registro) => [registro], lista: true, codigo: 200,
    erroInterno: "Erro interno ao listar evidências do local.",
  },
  {
    nome: "atualizar", metodo: "atualizarEvidencia", identidade: 2,
    argumentos: (req) => [req.params.id, req.body, req.usuario],
    resultado: (registro) => registro, codigo: 200,
    mensagem: "Evidência atualizada com sucesso.",
    erroInterno: "Erro interno ao atualizar evidência.",
  },
  {
    nome: "excluir", metodo: "excluirEvidencia", identidade: 1,
    argumentos: (req) => [req.params.id, req.usuario],
    resultado: (registro) => registro, codigo: 200,
    mensagem: "Evidência excluída com sucesso.",
    erroInterno: "Erro interno ao excluir evidência.",
  },
];

function simularReq(usuario = IDENTIDADES[0]) {
  const forjada = {
    id_usuario: 999,
    id_ambiente: usuario.id_ambiente === AMBIENTE_A ? AMBIENTE_B : AMBIENTE_A,
    perfil_acesso: "ADMINISTRADOR",
  };
  return {
    usuario,
    body: {
      id: "999", id_local: 999, descricao: "Solicitação", ...forjada,
      usuario: { ...forjada }, criada: false, incluirResultadoCriacao: false,
    },
    params: { id: "50", idLocal: "40", ...forjada, usuario: { ...forjada } },
    query: { id: "999", idLocal: "999", ...forjada, usuario: { ...forjada } },
  };
}

function simularRes(t) {
  const res = { headersSent: false };
  res.status = t.mock.fn(() => res);
  res.json = t.mock.fn(() => { res.headersSent = true; return res; });
  for (const nome of ["send", "end", "sendFile", "download", "setHeader"]) {
    res[nome] = t.mock.fn(() => res);
  }
  return res;
}

function simularServico(t, operacao, implementacao) {
  const proibidos = [];
  const carregar = Module._load;
  t.mock.method(Module, "_load", function (request, parent, ...resto) {
    if (parent && parent.filename === caminhoController) {
      if (request === "../services/evidenciaMultiTenantService") return service;
      proibidos.push(request);
      throw new Error("Banco, legado ou acesso físico proibido: " + request);
    }
    return carregar.call(this, request, parent, ...resto);
  });
  const mocks = Object.fromEntries(METODOS_SERVICO.map((nome) => [
    nome, t.mock.method(service, nome, async () => {
      throw new Error("Método de serviço inesperado: " + nome);
    }),
  ]));
  mocks[operacao.metodo].mock.mockImplementation(implementacao);
  t.mock.method(console, "error", () => {});
  t.after(() => assert.deepEqual(proibidos, []));
  return mocks;
}

function verificarEncaminhamento(mocks, operacao, req, usuarioOriginal) {
  const mock = mocks[operacao.metodo];
  assert.equal(mock.mock.callCount(), 1);
  const args = mock.mock.calls[0].arguments;
  assert.deepEqual(args, operacao.argumentos(req));
  assert.strictEqual(args[operacao.identidade], usuarioOriginal);
  assert.strictEqual(req.usuario, usuarioOriginal);
  if (operacao.nome === "criar") assert.strictEqual(args[0], req.body);
  if (operacao.nome === "atualizar") assert.strictEqual(args[1], req.body);
  for (const nome of METODOS_SERVICO) {
    if (nome !== operacao.metodo) assert.equal(mocks[nome].mock.callCount(), 0);
  }
}

function verificarResposta(res, retorno, codigo, corpo) {
  assert.strictEqual(retorno, res);
  assert.equal(res.status.mock.callCount(), 1);
  assert.deepEqual(res.status.mock.calls[0].arguments, [codigo]);
  assert.equal(res.json.mock.callCount(), 1);
  assert.deepEqual(res.json.mock.calls[0].arguments, [corpo]);
  for (const nome of ["send", "end", "sendFile", "download", "setHeader"]) {
    assert.equal(res[nome].mock.callCount(), 0);
  }
}

function erroSensivel(statusCode) {
  const erro = new Error(SENSIVEIS.join(" | "));
  if (statusCode !== undefined) erro.statusCode = statusCode;
  erro.stack = SENSIVEIS[4];
  erro.query = SENSIVEIS[0];
  erro.token = SENSIVEIS[1];
  erro.caminho = SENSIVEIS[2];
  erro.detail = SENSIVEIS[3];
  erro.registro = { ambiente: AMBIENTE_B, segredo: SENSIVEIS[3] };
  return erro;
}

function verificarSemDetalhes(res, erro) {
  const publico = JSON.stringify(res.json.mock.calls[0].arguments[0]);
  for (const segredo of SENSIVEIS) assert.equal(publico.includes(segredo), false);
  assert.equal(publico.includes(erro.stack), false);
  assert.equal(publico.includes(AMBIENTE_B), false);
  assert.deepEqual(Object.keys(res.json.mock.calls[0].arguments[0]).sort(), ["message", "status"]);
}

for (const operacao of OPERACOES) {
  for (const [indice, identidade] of IDENTIDADES.entries()) {
    test(operacao.nome + ": sucesso e identidade original no ambiente " + (indice === 0 ? "A" : "B"), async (t) => {
      const usuario = Object.freeze({ ...identidade });
      const req = simularReq(usuario);
      const body = req.body;
      const recurso = Object.freeze({ ...EVIDENCIA, id_usuario: usuario.id_usuario });
      const resultado = operacao.resultado(recurso);
      const res = simularRes(t);
      const mocks = simularServico(t, operacao, async () => resultado);

      const retorno = await controller[operacao.nome](req, res);
      const data = operacao.lista ? resultado : recurso;
      const corpo = { status: "success" };
      if (operacao.lista) corpo.total = data.length;
      if (operacao.mensagem) corpo.message = operacao.mensagem;
      corpo.data = data;
      verificarResposta(res, retorno, operacao.codigo, corpo);
      verificarEncaminhamento(mocks, operacao, req, usuario);
      assert.strictEqual(res.json.mock.calls[0].arguments[0].data, data);
      assert.strictEqual(req.body, body);
      assert.notStrictEqual(usuario, req.body.usuario);
      assert.notStrictEqual(usuario, req.params.usuario);
      assert.notStrictEqual(usuario, req.query.usuario);
      assert.notEqual(usuario.id_ambiente, req.body.id_ambiente);
      if (operacao.nome === "criar") {
        assert.equal(Object.hasOwn(corpo, "criada"), false);
        assert.equal(Object.hasOwn(corpo, "evidencia"), false);
        assert.notStrictEqual(corpo.data, resultado);
      }
    });
  }

  for (const statusCode of [400, 401, 403, 404, 409]) {
    test(operacao.nome + ": preserva HTTP " + statusCode + " controlado sem resposta duplicada", async (t) => {
      const req = simularReq();
      if (statusCode === 401) delete req.usuario;
      const usuario = req.usuario;
      const res = simularRes(t);
      const erro = erroSensivel(statusCode);
      if (statusCode !== 409) erro.message = "Erro controlado de aplicação " + statusCode + ".";
      const mocks = simularServico(t, operacao, async () => { throw erro; });

      const retorno = await controller[operacao.nome](req, res);
      verificarResposta(res, retorno, statusCode, {
        status: "error", message: statusCode === 409 ? MENSAGEM_CONFLITO : erro.message,
      });
      verificarEncaminhamento(mocks, operacao, req, usuario);
      verificarSemDetalhes(res, erro);
    });
  }

  test(operacao.nome + ": CONFLITO_GPS permanece HTTP 409 com mensagem pública genérica", async (t) => {
    const req = simularReq();
    const res = simularRes(t);
    const erro = erroSensivel(409);
    erro.code = "CONFLITO_GPS";
    const mocks = simularServico(t, operacao, async () => { throw erro; });
    const retorno = await controller[operacao.nome](req, res);
    verificarResposta(res, retorno, 409, { status: "error", message: MENSAGEM_CONFLITO });
    verificarEncaminhamento(mocks, operacao, req, req.usuario);
    verificarSemDetalhes(res, erro);
  });

  for (const statusCode of [undefined, 500]) {
    test(operacao.nome + ": erro interno " + (statusCode === undefined ? "sem status" : "500") + " não expõe detalhes", async (t) => {
      const req = simularReq();
      const res = simularRes(t);
      const erro = erroSensivel(statusCode);
      const mocks = simularServico(t, operacao, async () => { throw erro; });
      const retorno = await controller[operacao.nome](req, res);
      verificarResposta(res, retorno, 500, { status: "error", message: operacao.erroInterno });
      verificarEncaminhamento(mocks, operacao, req, req.usuario);
      verificarSemDetalhes(res, erro);
    });
  }

  test(operacao.nome + ": status inválidos ou inesperados retornam 500 sem coerção", async (t) => {
    let erro;
    const req = simularReq();
    const mocks = simularServico(t, operacao, async () => { throw erro; });
    const invalidos = [null, "400", "401", "409", "500", 0, -1, 200, 302, 422, 503, 600, NaN, Infinity, true, [], {}];
    for (const statusCode of invalidos) {
      erro = erroSensivel(statusCode);
      const res = simularRes(t);
      const retorno = await controller[operacao.nome](req, res);
      verificarResposta(res, retorno, 500, { status: "error", message: operacao.erroInterno });
      verificarSemDetalhes(res, erro);
    }
    assert.equal(mocks[operacao.metodo].mock.callCount(), invalidos.length);
    for (const chamada of mocks[operacao.metodo].mock.calls) {
      assert.deepEqual(chamada.arguments, operacao.argumentos(req));
      assert.strictEqual(chamada.arguments[operacao.identidade], req.usuario);
    }
    for (const nome of METODOS_SERVICO) {
      if (nome !== operacao.metodo) assert.equal(mocks[nome].mock.callCount(), 0);
    }
  });

  test(operacao.nome + ": erro após cabeçalhos enviados não gera nova resposta", async (t) => {
    const req = simularReq();
    const res = simularRes(t);
    const mocks = simularServico(t, operacao, async () => {
      // Simula resposta encerrada enquanto a operação aguardava o serviço.
      res.headersSent = true;
      throw erroSensivel(500);
    });
    assert.strictEqual(await controller[operacao.nome](req, res), res);
    for (const nome of ["status", "json", "send", "end", "sendFile", "download", "setHeader"]) {
      assert.equal(res[nome].mock.callCount(), 0);
    }
    verificarEncaminhamento(mocks, operacao, req, req.usuario);
  });

  test(operacao.nome + ": falha após envio do JSON não tenta responder novamente", async (t) => {
    const req = simularReq();
    const res = simularRes(t);
    res.json.mock.mockImplementation(() => {
      res.headersSent = true;
      throw new Error("Falha de transporte após início da resposta");
    });
    const mocks = simularServico(t, operacao, async () => operacao.resultado(EVIDENCIA));
    assert.strictEqual(await controller[operacao.nome](req, res), res);
    assert.equal(res.status.mock.callCount(), 1);
    assert.equal(res.json.mock.callCount(), 1);
    assert.equal(res.send.mock.callCount(), 0);
    assert.equal(res.end.mock.callCount(), 0);
    verificarEncaminhamento(mocks, operacao, req, req.usuario);
  });
}

for (const [indice, identidade] of IDENTIDADES.entries()) {
  test("criar: repetição autorizada retorna 200 no ambiente " + (indice === 0 ? "A" : "B") + " sem inferir pelo corpo", async (t) => {
    const req = simularReq(identidade);
    req.body.criada = true;
    req.body.data_criacao = "2099-01-01T00:00:00.000Z";
    req.body.caminho_arquivo = EVIDENCIA.caminho_arquivo;
    const res = simularRes(t);
    const operacao = OPERACOES[0];
    const envelope = { evidencia: EVIDENCIA, criada: false };
    const mocks = simularServico(t, operacao, async () => envelope);
    const retorno = await controller.criar(req, res);
    verificarResposta(res, retorno, 200, {
      status: "success", message: "Evidência existente retornada com sucesso.", data: EVIDENCIA,
    });
    verificarEncaminhamento(mocks, operacao, req, identidade);
    assert.strictEqual(res.json.mock.calls[0].arguments[0].data, EVIDENCIA);
    assert.notStrictEqual(res.json.mock.calls[0].arguments[0].data, envelope);
  });
}

// Casos distintos de envelope, recurso e indicador inválidos. Mesmo contendo
// dados sensíveis, nenhum retorno é incluído na resposta pública.
const RESULTADOS_INVALIDOS = [
  ["undefined", undefined], ["null", null], ["string", SENSIVEIS[0]],
  ["número", 123], ["true", true], ["false", false],
  ["array vazio", []], ["array com envelope", [{ evidencia: EVIDENCIA, criada: true }]],
  ["sem evidencia", { criada: true, detail: SENSIVEIS[1] }],
  ["evidencia undefined", { evidencia: undefined, criada: true }],
  ["evidencia null", { evidencia: null, criada: true }],
  ["evidencia string", { evidencia: SENSIVEIS[2], criada: true }],
  ["evidencia número", { evidencia: 123, criada: false }],
  ["evidencia true", { evidencia: true, criada: true }],
  ["evidencia false", { evidencia: false, criada: false }],
  ["evidencia array", { evidencia: [SENSIVEIS[3]], criada: false }],
  ["sem criada", { evidencia: EVIDENCIA }],
  ["criada undefined", { evidencia: EVIDENCIA, criada: undefined }],
  ["criada null", { evidencia: EVIDENCIA, criada: null }],
  ["criada string true", { evidencia: EVIDENCIA, criada: "true" }],
  ["criada string false", { evidencia: EVIDENCIA, criada: "false" }],
  ["criada string sensível", { evidencia: EVIDENCIA, criada: SENSIVEIS[1] }],
  ["criada zero", { evidencia: EVIDENCIA, criada: 0 }],
  ["criada um", { evidencia: EVIDENCIA, criada: 1 }],
  ["criada NaN", { evidencia: EVIDENCIA, criada: NaN }],
  ["criada array", { evidencia: EVIDENCIA, criada: [] }],
  ["criada objeto", { evidencia: EVIDENCIA, criada: {} }],
  ["criada Boolean objeto", { evidencia: EVIDENCIA, criada: new Boolean(true) }],
];

for (const [nome, resultado] of RESULTADOS_INVALIDOS) {
  test("criar: rejeita " + nome + " com um único HTTP 500 genérico", async (t) => {
    const req = simularReq();
    const res = simularRes(t);
    const operacao = OPERACOES[0];
    const mocks = simularServico(t, operacao, async () => resultado);
    const retorno = await controller.criar(req, res);
    verificarResposta(res, retorno, 500, { status: "error", message: operacao.erroInterno });
    verificarEncaminhamento(mocks, operacao, req, req.usuario);
    const corpo = res.json.mock.calls[0].arguments[0];
    assert.equal(Object.hasOwn(corpo, "data"), false);
    assert.equal(Object.hasOwn(corpo, "criada"), false);
    assert.equal(Object.hasOwn(corpo, "evidencia"), false);
    verificarSemDetalhes(res, erroSensivel());
  });
}

for (const operacao of OPERACOES.filter((item) => item.lista)) {
  test(operacao.nome + ": preserva lista vazia e total zero", async (t) => {
    const req = simularReq();
    const res = simularRes(t);
    const lista = [];
    const mocks = simularServico(t, operacao, async () => lista);
    const retorno = await controller[operacao.nome](req, res);
    verificarResposta(res, retorno, 200, { status: "success", total: 0, data: lista });
    assert.strictEqual(res.json.mock.calls[0].arguments[0].data, lista);
    verificarEncaminhamento(mocks, operacao, req, req.usuario);
  });
}

test("Controller exporta somente as seis operações e carrega apenas o serviço simulado", () => {
  assert.deepEqual(Object.keys(controller).sort(), OPERACOES.map((item) => item.nome).sort());
  for (const operacao of OPERACOES) assert.equal(typeof controller[operacao.nome], "function");
  assert.deepEqual(dependencias, ["../services/evidenciaMultiTenantService"]);
});

test("As seis operações não manipulam arquivos nem carregam dependências de banco ou legados", async (t) => {
  const proibidos = [];
  const carregar = Module._load;
  t.mock.method(Module, "_load", function (request, parent, ...resto) {
    if (parent && parent.filename === caminhoController) {
      if (request === "../services/evidenciaMultiTenantService") return service;
      proibidos.push(request);
      throw new Error("Dependência proibida: " + request);
    }
    return carregar.call(this, request, parent, ...resto);
  });
  const eventos = [];
  for (const operacao of OPERACOES) {
    t.mock.method(service, operacao.metodo, async () => {
      eventos.push(operacao.metodo);
      return operacao.resultado(EVIDENCIA);
    });
  }
  const guardas = [];
  try {
    for (const nome of [
      "readFile", "writeFile", "appendFile", "unlink", "rename", "copyFile",
      "mkdir", "rm", "open", "readdir", "stat", "lstat", "realpath",
    ]) {
      guardas.push(t.mock.method(fs, nome, () => { throw new Error("Acesso físico proibido"); }));
      guardas.push(t.mock.method(fs, nome + "Sync", () => { throw new Error("Acesso físico proibido"); }));
      guardas.push(t.mock.method(fs.promises, nome, async () => { throw new Error("Acesso físico proibido"); }));
    }
    for (const nome of ["createReadStream", "createWriteStream", "existsSync"]) {
      guardas.push(t.mock.method(fs, nome, () => { throw new Error("Acesso físico proibido"); }));
    }
    for (const operacao of OPERACOES) {
      const req = simularReq();
      const res = simularRes(t);
      const retorno = await controller[operacao.nome](req, res);
      assert.strictEqual(retorno, res);
      assert.deepEqual(res.status.mock.calls[0].arguments, [operacao.codigo]);
      assert.equal(res.json.mock.callCount(), 1);
      assert.equal(res.sendFile.mock.callCount(), 0);
      assert.equal(res.download.mock.callCount(), 0);
    }
    for (const guarda of guardas) assert.equal(guarda.mock.callCount(), 0);
    assert.deepEqual(eventos, OPERACOES.map((operacao) => operacao.metodo));
    assert.deepEqual(proibidos, []);
  } finally {
    // Restaura imediatamente para não bloquear arquivos do próprio runner.
    for (const guarda of guardas.reverse()) guarda.mock.restore();
  }
});

for (const operacao of OPERACOES) {
  test(operacao.nome + ": delega decisão de perfil ao serviço sem autorização alternativa", async (t) => {
    // O serviço consulta a autorização atual no banco; perfil do contexto não
    // constitui uma decisão de permissão a ser reproduzida pelo controller.
    const usuario = Object.freeze({ id_usuario: 10, id_ambiente: AMBIENTE_A });
    const req = simularReq(usuario);
    const res = simularRes(t);
    const resultado = operacao.resultado(EVIDENCIA);
    const mocks = simularServico(t, operacao, async () => resultado);
    const retorno = await controller[operacao.nome](req, res);
    const corpo = { status: "success" };
    if (operacao.lista) corpo.total = resultado.length;
    if (operacao.mensagem) corpo.message = operacao.mensagem;
    corpo.data = operacao.lista ? resultado : EVIDENCIA;
    verificarResposta(res, retorno, operacao.codigo, corpo);
    verificarEncaminhamento(mocks, operacao, req, usuario);
    assert.equal(Object.hasOwn(usuario, "perfil_acesso"), false);
  });
}


