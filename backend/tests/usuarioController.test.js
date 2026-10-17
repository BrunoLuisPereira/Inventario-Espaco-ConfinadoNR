const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// Substituição anterior ao require: nenhum serviço, banco, dotenv ou app real.
const OPERACOES = [
  { nome: "criar", metodo: "criarUsuario", codigo: 201,
    mensagem: "Usuário cadastrado com sucesso.", interno: "Erro interno ao cadastrar usuário.",
    duplicidade: "Já existe um usuário com este e-mail." },
  { nome: "listar", metodo: "listarUsuarios", codigo: 200,
    interno: "Erro interno ao listar usuários." },
  { nome: "buscarPorId", metodo: "buscarUsuarioPorId", codigo: 200,
    interno: "Erro interno ao buscar usuário." },
  { nome: "atualizar", metodo: "atualizarUsuario", codigo: 200,
    mensagem: "Usuário atualizado com sucesso.", interno: "Erro interno ao atualizar usuário.",
    duplicidade: "Já existe outro usuário com este e-mail." },
  { nome: "alterarStatus", metodo: "alterarStatusUsuario", codigo: 200,
    mensagem: "Usuário ativado com sucesso.", interno: "Erro interno ao alterar status do usuário." },
];
const service = Object.fromEntries(OPERACOES.map(({ metodo }) => [metodo, async () => {
  throw new Error("Serviço não simulado");
}]));
const CAMINHO = require.resolve("../src/controllers/usuarioController");
const cacheAnterior = require.cache[CAMINHO];
const loadAnterior = Module._load;
const imports = [];
let controller;
try {
  delete require.cache[CAMINHO];
  Module._load = function (request, parent, ...resto) {
    if (parent?.filename === CAMINHO) {
      imports.push(request);
      if (request !== "../services/usuarioService") {
        throw new Error("Dependência não autorizada: " + request);
      }
      return service;
    }
    return loadAnterior.call(this, request, parent, ...resto);
  };
  controller = require(CAMINHO);
} finally {
  Module._load = loadAnterior;
  if (cacheAnterior) require.cache[CAMINHO] = cacheAnterior;
  else delete require.cache[CAMINHO];
}

const REGISTRO = Object.freeze({ id_usuario: 12, nome: "Usuário simulado", ativo: true });
const LISTA = Object.freeze([REGISTRO]);
const CORPO = Object.freeze({ nome: "Nome simulado", ativo: true });
const SENSIVEIS = Object.freeze([
  "MENSAGEM_TECNICA_SIMULADA", "SELECT segredo_simulado FROM tabela_interna",
  "STACK_INTERNA_SIMULADA", "SENHA_FICTICIA_NAO_PUBLICAR", "TOKEN_FICTICIO_NAO_PUBLICAR",
  "C:\\caminho-interno-simulado\\arquivo", "DADOS_SIMULADOS_DE_OUTRO_AMBIENTE",
]);
const STATUS_INVALIDOS = [
  ["ausente", undefined], ["null", null], ["false", false], ["true", true],
  ["texto vazio", ""], ["string 400", "400"], ["string 500", "500"],
  ["array vazio", []], ["array numérico", [400]], ["objeto", {}],
  ["fracionário", 400.5], ["NaN", NaN], ["Infinity", Infinity],
  ["menos Infinity", -Infinity], ["negativo", -1], ["zero", 0],
  ["sucesso", 200], ["399", 399], ["600", 600], ["1000", 1000],
];

function reqSimulada() {
  // GETs, PUT e PATCH encaminham esta mesma instância autenticada.
  return { body: CORPO, params: { id: "12" }, query: {}, usuario: { id_usuario: 99 } };
}

function preparar(t, op, implementacao) {
  const logs = [];
  for (const nome of ["error", "warn", "info", "log", "debug"]) {
    t.mock.method(console, nome, (...args) => logs.push(args));
  }
  const chamadas = {};
  for (const outra of OPERACOES) {
    chamadas[outra.metodo] = t.mock.method(service, outra.metodo,
      outra === op ? implementacao : async () => { throw new Error("Operação inesperada"); });
  }
  const carregar = Module._load;
  const proibidos = [];
  t.mock.method(Module, "_load", function (request, parent, ...resto) {
    if (parent?.filename === CAMINHO) {
      if (request === "../services/usuarioService") return service;
      proibidos.push(request);
      throw new Error("Dependência proibida: " + request);
    }
    return carregar.call(this, request, parent, ...resto);
  });
  assert.deepEqual(imports, ["../services/usuarioService"]);
  t.after(() => {
    assert.deepEqual(proibidos, []);
    assert.strictEqual(require.cache[CAMINHO], cacheAnterior);
    for (const outra of OPERACOES) {
      if (outra !== op) assert.equal(chamadas[outra.metodo].mock.callCount(), 0);
    }
  });
  return { chamada: chamadas[op.metodo], logs };
}

function resposta(t) {
  const res = { headersSent: false, statusCode: 200, body: undefined };
  // Aceita até status inválido para que a asserção examine o valor real enviado.
  res.status = t.mock.fn((codigo) => { res.statusCode = codigo; return res; });
  res.json = t.mock.fn((body) => { res.body = body; res.headersSent = true; return res; });
  for (const nome of ["send", "end", "write", "sendFile", "download", "setHeader"]) {
    res[nome] = t.mock.fn(() => res);
  }
  return res;
}

function argumentos(op, req) {
  if (op.nome === "criar") return [req.body];
  if (op.nome === "listar") return [req.usuario];
  if (op.nome === "buscarPorId") return [req.params.id, req.usuario];
  return [req.params.id, req.body, req.usuario];
}

function verificarChamada(contexto, op, req, indice = 0) {
  assert.equal(contexto.chamada.mock.callCount(), indice + 1);
  const recebidos = contexto.chamada.mock.calls[indice].arguments;
  const esperados = argumentos(op, req);
  assert.deepEqual(recebidos, esperados);
  for (let i = 0; i < esperados.length; i++) assert.strictEqual(recebidos[i], esperados[i]);
}

function sucesso(op, registro) {
  if (op.nome === "listar") return { status: "success", total: registro.length, data: registro };
  const body = { status: "success", data: registro };
  if (op.mensagem) body.message = op.nome === "alterarStatus"
    ? registro.ativo ? "Usuário ativado com sucesso." : "Usuário desativado com sucesso."
    : op.mensagem;
  return body;
}

function verificarResposta(res, retorno, codigo, body) {
  assert.strictEqual(retorno, res);
  assert.equal(res.status.mock.callCount(), 1);
  assert.deepEqual(res.status.mock.calls[0].arguments, [codigo]);
  assert.equal(res.statusCode, codigo);
  assert.equal(res.json.mock.callCount(), 1);
  assert.deepEqual(res.json.mock.calls[0].arguments, [body]);
  assert.deepEqual(res.body, body);
  for (const nome of ["send", "end", "write", "sendFile", "download", "setHeader"]) {
    assert.equal(res[nome].mock.callCount(), 0);
  }
}

function verificarPublico(res) {
  assert.deepEqual(Object.keys(res.body).sort(), ["message", "status"]);
  for (const texto of SENSIVEIS) assert.equal(JSON.stringify(res.body).includes(texto), false);
}

function erroSensivel(statusCode) {
  const erro = new Error(SENSIVEIS.join(" | "));
  if (statusCode !== undefined) erro.statusCode = statusCode;
  [erro.query, erro.stack, erro.senha, erro.token, erro.caminho, erro.detail] = SENSIVEIS.slice(1);
  return erro;
}

async function exercitarErro(t, op, erro) {
  const contexto = preparar(t, op, async () => { throw erro; });
  const req = reqSimulada();
  const res = resposta(t);
  const retorno = await controller[op.nome](req, res);
  verificarChamada(contexto, op, req);
  return { ...contexto, res, retorno };
}

// Testes sequenciais: t.mock restaura métodos e loader ao final de cada caso.
for (const op of OPERACOES) {
  test("[contrato] " + op.nome + ": sucesso, mensagem, referência e argumentos originais", async (t) => {
    const registro = op.nome === "listar" ? LISTA : REGISTRO;
    const contexto = preparar(t, op, async () => registro);
    const req = reqSimulada();
    const res = resposta(t);
    const retorno = await controller[op.nome](req, res);
    verificarResposta(res, retorno, op.codigo, sucesso(op, registro));
    assert.strictEqual(res.body.data, registro);
    assert.strictEqual(req.body, CORPO);
    verificarChamada(contexto, op, req);
    if (["listar", "buscarPorId", "atualizar", "alterarStatus"].includes(op.nome)) {
      // Exercita novamente a operação, com identidade forjada em todas as entradas
      // do cliente. A identidade efetiva continua sendo a instância original.
      const identidadeOriginal = req.usuario;
      const identidadeForjada = Object.freeze({
        id_usuario: 777,
        id_ambiente: "22222222-2222-4222-8222-222222222222",
        perfil_acesso: "ADMINISTRADOR",
      });
      const reqForjada = {
        usuario: identidadeOriginal,
        body: Object.freeze({ ...CORPO, ...identidadeForjada, usuario: identidadeForjada }),
        query: identidadeForjada,
        params: Object.freeze({ id: req.params.id, ...identidadeForjada }),
      };
      const resForjada = resposta(t);
      const retornoForjado = await controller[op.nome](reqForjada, resForjada);
      verificarResposta(resForjada, retornoForjado, op.codigo, sucesso(op, registro));
      assert.strictEqual(resForjada.body.data, registro);
      verificarChamada(contexto, op, reqForjada, 1);
      const args = contexto.chamada.mock.calls[1].arguments;
      const indiceIdentidade = op.nome === "listar" ? 0 : op.nome === "buscarPorId" ? 1 : 2;
      const identidadeRecebida = args[indiceIdentidade];
      assert.strictEqual(identidadeRecebida, identidadeOriginal);
      assert.notStrictEqual(identidadeRecebida, identidadeForjada);
      assert.strictEqual(reqForjada.usuario, identidadeOriginal);
    }
    assert.deepEqual(contexto.logs, []);
  });

  test("[contrato] " + op.nome + ": tradução dos erros 4xx preservada", async (t) => {
    let erro;
    const contexto = preparar(t, op, async () => { throw erro; });
    const codigos = [400, 401, 403, 404, 409, 410, 499];
    for (const [indice, codigo] of codigos.entries()) {
      // Testa tradução HTTP, sem presumir quais erros o serviço realmente gera.
      erro = Object.assign(new Error("Mensagem pública de negócio."), { statusCode: codigo });
      const req = reqSimulada();
      const res = resposta(t);
      const retorno = await controller[op.nome](req, res);
      const listarComErroInterno = op.nome === "listar" && codigo !== 401 && codigo !== 403;
      verificarResposta(res, retorno, listarComErroInterno ? 500 : codigo, {
        status: "error", message: listarComErroInterno ? op.interno : erro.message,
      });
      verificarPublico(res);
      verificarChamada(contexto, op, req, indice);
    }
  });

  for (const [nome, codigo] of STATUS_INVALIDOS) {
    test("[segurança] " + op.nome + ": status " + nome + " retorna 500 sem coerção", async (t) => {
      const { res, retorno } = await exercitarErro(t, op, erroSensivel(codigo));
      verificarResposta(res, retorno, 500, { status: "error", message: op.interno });
      verificarPublico(res);
    });
  }

  test("[segurança] " + op.nome + ": todos os 500–599 ocultam detalhes internos", async (t) => {
    let erro;
    const contexto = preparar(t, op, async () => { throw erro; });
    for (let codigo = 500; codigo <= 599; codigo++) {
      erro = erroSensivel(codigo);
      const req = reqSimulada();
      const res = resposta(t);
      const retorno = await controller[op.nome](req, res);
      verificarResposta(res, retorno, op.nome === "listar" ? 500 : codigo, {
        status: "error", message: op.interno,
      });
      verificarPublico(res);
      verificarChamada(contexto, op, req, codigo - 500);
    }
  });

  for (const falha of [false, true]) {
    for (const duranteEspera of [false, true]) {
      test("[segurança] " + op.nome + ": headersSent " + (duranteEspera ? "durante espera" : "prévio") +
        " impede resposta de " + (falha ? "erro" : "sucesso"), async (t) => {
        const req = reqSimulada();
        const res = resposta(t);
        const anterior = Object.freeze({ resposta: "Já iniciada" });
        res.body = anterior;
        if (!duranteEspera) res.headersSent = true;
        const registro = op.nome === "listar" ? LISTA : REGISTRO;
        const contexto = preparar(t, op, async () => {
          if (falha) throw erroSensivel(500);
          return registro;
        });
        if (duranteEspera) {
          let resolver;
          let rejeitar;
          const pendente = new Promise((resolve, reject) => { resolver = resolve; rejeitar = reject; });
          contexto.chamada.mock.mockImplementation(() => pendente);
          const operacao = controller[op.nome](req, res);
          assert.equal(contexto.chamada.mock.callCount(), 1);
          assert.equal(res.json.mock.callCount(), 0);
          res.headersSent = true;
          if (falha) rejeitar(erroSensivel(500));
          else resolver(registro);
          await operacao;
          verificarChamada(contexto, op, req);
        } else {
          // Não impõe se o serviço deve ser chamado quando já houve resposta.
          await controller[op.nome](req, res);
        }
        assert.strictEqual(res.body, anterior);
        assert.equal(res.statusCode, 200);
        for (const nome of ["status", "json", "send", "end", "write", "sendFile", "download", "setHeader"]) {
          assert.equal(res[nome].mock.callCount(), 0);
        }
      });
    }

    test("[segurança] " + op.nome + ": JSON de " + (falha ? "erro" : "sucesso") +
      " iniciado não permite segunda resposta", async (t) => {
      const registro = op.nome === "listar" ? LISTA : REGISTRO;
      const contexto = preparar(t, op, async () => {
        if (falha) throw erroSensivel(400);
        return registro;
      });
      const req = reqSimulada();
      const res = resposta(t);
      const transporte = new Error("Falha de transporte simulada");
      res.json.mock.mockImplementation((body) => {
        res.body = body;
        res.headersSent = true;
        throw transporte;
      });
      // Pode preservar a exceção original ou encerrar sem novo envio.
      try { await controller[op.nome](req, res); }
      catch (erro) { assert.strictEqual(erro, transporte); }
      assert.equal(res.status.mock.callCount(), 1);
      assert.equal(res.json.mock.callCount(), 1);
      verificarChamada(contexto, op, req);
      for (const nome of ["send", "end", "write", "sendFile", "download", "setHeader"]) {
        assert.equal(res[nome].mock.callCount(), 0);
      }
    });
  }

  test("[segurança] " + op.nome + ": logs não recebem objeto de erro nem segredos", async (t) => {
    const erro = erroSensivel();
    const { logs, res, retorno } = await exercitarErro(t, op, erro);
    verificarResposta(res, retorno, 500, { status: "error", message: op.interno });
    verificarPublico(res);
    for (const args of logs) {
      for (const valor of args) {
        assert.notStrictEqual(valor, erro);
        if (typeof valor === "string") {
          for (const segredo of SENSIVEIS) assert.equal(valor.includes(segredo), false);
        } else {
          // Aceita somente metadado mínimo com status estritamente validado.
          assert.ok(valor && typeof valor === "object" && !Array.isArray(valor));
          assert.deepEqual(Object.keys(valor), ["statusCode"]);
          assert.equal(Number.isInteger(valor.statusCode), true);
          assert.ok(valor.statusCode >= 400 && valor.statusCode <= 599);
          assert.equal(valor.statusCode, 500);
        }
      }
    }
  });

  if (op.duplicidade) {
    test("[contrato] " + op.nome + ": 23505 precede statusCode e mantém mensagem própria", async (t) => {
      let erro;
      const contexto = preparar(t, op, async () => { throw erro; });
      const concorrentes = [undefined, 400, 409, 500, 503, "500", 700];
      for (const [indice, codigo] of concorrentes.entries()) {
        erro = erroSensivel(codigo);
        erro.code = "23505";
        const req = reqSimulada();
        const res = resposta(t);
        const retorno = await controller[op.nome](req, res);
        verificarResposta(res, retorno, 409, { status: "error", message: op.duplicidade });
        verificarPublico(res);
        verificarChamada(contexto, op, req, indice);
      }
    });
  }

  if (["criar", "atualizar", "alterarStatus"].includes(op.nome)) {
    test("[contrato] " + op.nome + ": corpo ausente segue sem fallback ou transformação", async (t) => {
      const contexto = preparar(t, op, async () => REGISTRO);
      const req = reqSimulada();
      delete req.body;
      const res = resposta(t);
      const retorno = await controller[op.nome](req, res);
      verificarResposta(res, retorno, op.codigo, sucesso(op, REGISTRO));
      verificarChamada(contexto, op, req);
      assert.equal(Object.hasOwn(req, "body"), false);
    });
  }
}

test("[contrato] listar: lista vazia mantém total zero e referência", async (t) => {
  const op = OPERACOES[1];
  const lista = Object.freeze([]);
  const contexto = preparar(t, op, async () => lista);
  const req = reqSimulada();
  const res = resposta(t);
  const retorno = await controller.listar(req, res);
  verificarResposta(res, retorno, 200, { status: "success", total: 0, data: lista });
  assert.strictEqual(res.body.data, lista);
  verificarChamada(contexto, op, req);
});

test("[contrato] alterarStatus: desativação mantém mensagem e registro original", async (t) => {
  const op = OPERACOES[4];
  const registro = Object.freeze({ ...REGISTRO, ativo: false });
  const contexto = preparar(t, op, async () => registro);
  const req = reqSimulada();
  const res = resposta(t);
  const retorno = await controller.alterarStatus(req, res);
  verificarResposta(res, retorno, 200, {
    status: "success", message: "Usuário desativado com sucesso.", data: registro,
  });
  assert.strictEqual(res.body.data, registro);
  verificarChamada(contexto, op, req);
});

test("[isolamento] apenas cinco exports e serviço simulado, sem aplicação ou banco", () => {
  assert.deepEqual(Object.keys(controller).sort(), OPERACOES.map((op) => op.nome).sort());
  assert.deepEqual(imports, ["../services/usuarioService"]);
  assert.strictEqual(require.cache[CAMINHO], cacheAnterior);
});
