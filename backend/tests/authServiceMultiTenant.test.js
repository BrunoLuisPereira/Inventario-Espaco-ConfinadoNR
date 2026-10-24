
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const authService = require("../src/services/authService");

const autenticacaoRepository = require(
  "../src/repositories/autenticacaoMultiTenantRepository"
);

const SEGREDO_TESTE =
  "segredo-exclusivo-para-testes-de-login-multi-tenant";

const ID_AMBIENTE =
  "11111111-1111-4111-8111-111111111111";

function configurarAmbiente(t) {
  // Testes unitários das credenciais. A proteção persistente é exercitada
  // separadamente em loginProtecao.test.js, sem PostgreSQL real.
  t.mock.method(require('../src/services/loginProtecaoService'), 'executar',
    async (_email, _ip, verificar) => verificar());
  const anterior = process.env.JWT_SECRET;

  process.env.JWT_SECRET = SEGREDO_TESTE;

  t.after(() => {
    if (anterior === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = anterior;
    }
  });
}

function criarUsuario(overrides = {}) {
  return {
    id_usuario: 10,
    id_ambiente: ID_AMBIENTE,
    nome: "Administrador Teste",
    email: "admin@exemplo.com",
    senha_hash: bcrypt.hashSync("SenhaSegura123", 4),
    eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
    ativo: true,
    ambiente_ativo: true,
    ...overrides,
  };
}

test(
  "Realiza login quando usuário e ambiente estão ativos",
  async (t) => {
    configurarAmbiente(t);

    const usuario = criarUsuario();

    const consulta = t.mock.method(
      autenticacaoRepository,
      "buscarPorEmailComAmbiente",
      async () => usuario
    );

    const resultado = await authService.loginMultiTenant({
      email: " ADMIN@EXEMPLO.COM ",
      senha: "SenhaSegura123",
    });

    assert.equal(consulta.mock.callCount(), 2);
    assert.deepEqual(
      consulta.mock.calls[0].arguments,
      ["admin@exemplo.com"]
    );
    assert.deepEqual(consulta.mock.calls[1].arguments, ["admin@exemplo.com"]);

    assert.equal(resultado.tipo, "Bearer");
    assert.equal(resultado.usuario.id_ambiente, ID_AMBIENTE);
    assert.equal(resultado.usuario.perfil_acesso, "ADMINISTRADOR");
    assert.equal(resultado.usuario.senha_hash, undefined);

    const payload = jwt.verify(
      resultado.token,
      SEGREDO_TESTE,
      {
        algorithms: ["HS256"],
        issuer: "inventario-espacos-confinados-api",
        audience: "inventario-espacos-confinados-pwa",
      }
    );

    assert.equal(payload.sub, "10");
    assert.equal(payload.perfil, "ADMINISTRADOR");
    assert.equal(payload.id_ambiente, undefined);
  }
);

test(
  "Recusa senha incorreta",
  async (t) => {
    configurarAmbiente(t);

    t.mock.method(
      autenticacaoRepository,
      "buscarPorEmailComAmbiente",
      async () => criarUsuario()
    );

    await assert.rejects(
      authService.loginMultiTenant({
        email: "admin@exemplo.com",
        senha: "SenhaIncorreta",
      }),
      {
        statusCode: 401,
        message: "E-mail ou senha inválidos.",
      }
    );
  }
);

test(
  "Recusa e-mail inexistente",
  async (t) => {
    configurarAmbiente(t);

    t.mock.method(
      autenticacaoRepository,
      "buscarPorEmailComAmbiente",
      async () => null
    );

    await assert.rejects(
      authService.loginMultiTenant({
        email: "inexistente@exemplo.com",
        senha: "SenhaSegura123",
      }),
      {
        statusCode: 401,
        message: "E-mail ou senha inválidos.",
      }
    );
  }
);

test(
  "Recusa usuário desativado",
  async (t) => {
    configurarAmbiente(t);

    t.mock.method(
      autenticacaoRepository,
      "buscarPorEmailComAmbiente",
      async () => criarUsuario({ ativo: false })
    );

    await assert.rejects(
      authService.loginMultiTenant({
        email: "admin@exemplo.com",
        senha: "SenhaSegura123",
      }),
      { statusCode: 401 }
    );
  }
);

test(
  "Recusa ambiente desativado",
  async (t) => {
    configurarAmbiente(t);

    t.mock.method(
      autenticacaoRepository,
      "buscarPorEmailComAmbiente",
      async () => criarUsuario({ ambiente_ativo: false })
    );

    await assert.rejects(
      authService.loginMultiTenant({
        email: "admin@exemplo.com",
        senha: "SenhaSegura123",
      }),
      { statusCode: 401 }
    );
  }
);

test(
  "Recusa usuário sem ambiente",
  async (t) => {
    configurarAmbiente(t);

    t.mock.method(
      autenticacaoRepository,
      "buscarPorEmailComAmbiente",
      async () => criarUsuario({ id_ambiente: null })
    );

    await assert.rejects(
      authService.loginMultiTenant({
        email: "admin@exemplo.com",
        senha: "SenhaSegura123",
      }),
      { statusCode: 401 }
    );
  }
);

test(
  "Recusa perfil de acesso inválido",
  async (t) => {
    configurarAmbiente(t);

    t.mock.method(
      autenticacaoRepository,
      "buscarPorEmailComAmbiente",
      async () => criarUsuario({ perfil_acesso: "VISITANTE" })
    );

    await assert.rejects(
      authService.loginMultiTenant({
        email: "admin@exemplo.com",
        senha: "SenhaSegura123",
      }),
      { statusCode: 401 }
    );
  }
);

test(
  "Recusa e-mail vazio antes de consultar o banco",
  async (t) => {
    configurarAmbiente(t);

    const consulta = t.mock.method(
      autenticacaoRepository,
      "buscarPorEmailComAmbiente",
      async () => {
        throw new Error("Consulta não esperada");
      }
    );

    await assert.rejects(
      authService.loginMultiTenant({
        email: " ",
        senha: "SenhaSegura123",
      }),
      { statusCode: 400 }
    );

    assert.equal(consulta.mock.callCount(), 0);
  }
);

test(
  "Recusa senha vazia antes de consultar o banco",
  async (t) => {
    configurarAmbiente(t);

    const consulta = t.mock.method(
      autenticacaoRepository,
      "buscarPorEmailComAmbiente",
      async () => {
        throw new Error("Consulta não esperada");
      }
    );

    await assert.rejects(
      authService.loginMultiTenant({
        email: "admin@exemplo.com",
        senha: "",
      }),
      { statusCode: 400 }
    );

    assert.equal(consulta.mock.callCount(), 0);
  }
);
