
const test = require("node:test");
const assert = require("node:assert/strict");

const conviteService = require(
  "../src/services/conviteService"
);

const conviteController = require(
  "../src/controllers/conviteController"
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
