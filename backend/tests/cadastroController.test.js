
const test = require("node:test");
const assert = require("node:assert/strict");

const cadastroService = require(
  "../src/services/cadastroService"
);

const cadastroController = require(
  "../src/controllers/cadastroController"
);

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
        perfil_acesso: "ADMINISTRADOR",
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
