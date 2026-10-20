
const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const usuarioRepository = require(
  "../src/repositories/usuarioRepository"
);

const {
  autenticarMultiTenant,
} = require(
  "../src/middlewares/autenticacaoMiddleware"
);

const SEGREDO_TESTE =
  "segredo-exclusivo-para-testes-automatizados";

const EMISSOR =
  "inventario-espacos-confinados-api";

const AUDIENCIA =
  "inventario-espacos-confinados-pwa";

/**
 * Prepara uma requisição e uma resposta simuladas.
 * Nenhum servidor HTTP é iniciado.
 */
function criarContexto(token) {
  const req = {
    headers: token
      ? { authorization: `Bearer ${token}` }
      : {},
  };

  const res = {
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

  let nextChamado = false;

  const next = () => {
    nextChamado = true;
  };

  return {
    req,
    res,
    next,
    foiAutorizado: () => nextChamado,
  };
}

/**
 * Gera um JWT somente para testes.
 */
function gerarToken({
  idUsuario = 10,
  perfil = "ADMINISTRADOR",
  expiresIn = "1h",
} = {}) {
  return jwt.sign(
    { perfil },
    SEGREDO_TESTE,
    {
      subject: String(idUsuario),
      expiresIn,
      issuer: EMISSOR,
      audience: AUDIENCIA,
      algorithm: "HS256",
    }
  );
}

/**
 * Configura o segredo JWT de forma temporária.
 * O valor original é restaurado após cada teste.
 */
function configurarJwt(t) {
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

// ========================================
// TESTES DE VALIDAÇÃO DO TOKEN
// ========================================

test(
  "Recusa requisição sem token",
  async (t) => {
    configurarJwt(t);

    const contexto = criarContexto(null);

    await autenticarMultiTenant(
      contexto.req,
      contexto.res,
      contexto.next
    );

    assert.equal(contexto.res.statusCode, 401);
    assert.equal(contexto.foiAutorizado(), false);
  }
);

test(
  "Recusa JWT inválido",
  async (t) => {
    configurarJwt(t);

    const contexto = criarContexto(
      "token-invalido"
    );

    await autenticarMultiTenant(
      contexto.req,
      contexto.res,
      contexto.next
    );

    assert.equal(contexto.res.statusCode, 401);
    assert.equal(contexto.foiAutorizado(), false);
  }
);

test(
  "Recusa JWT expirado",
  async (t) => {
    configurarJwt(t);

    const token = gerarToken({
      expiresIn: -10,
    });

    const contexto = criarContexto(token);

    await autenticarMultiTenant(
      contexto.req,
      contexto.res,
      contexto.next
    );

    assert.equal(contexto.res.statusCode, 401);

    assert.match(
      contexto.res.body.message,
      /expirado/i
    );

    assert.equal(contexto.foiAutorizado(), false);
  }
);

// ========================================
// TESTES DE IDENTIDADE MULTI-TENANT
// ========================================

test(
  "Autoriza usuário ativo de ambiente ativo",
  async (t) => {
    configurarJwt(t);

    const usuario = {
      id_usuario: 10,
      id_ambiente:
        "11111111-1111-4111-8111-111111111111",
      eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
    };

    const consulta = t.mock.method(
      usuarioRepository,
      "buscarIdentidadeAutenticada",
      async () => usuario
    );

    const contexto = criarContexto(
      gerarToken()
    );

    await autenticarMultiTenant(
      contexto.req,
      contexto.res,
      contexto.next
    );

    assert.equal(contexto.foiAutorizado(), true);
    assert.equal(consulta.mock.callCount(), 1);

    assert.deepEqual(
      contexto.req.usuario,
      usuario
    );

    assert.deepEqual(
      consulta.mock.calls[0].arguments,
      [10]
    );
  }
);

test(
  "Recusa usuário ou ambiente inativo",
  async (t) => {
    configurarJwt(t);

    const consulta = t.mock.method(
      usuarioRepository,
      "buscarIdentidadeAutenticada",
      async () => null
    );

    const contexto = criarContexto(
      gerarToken()
    );

    await autenticarMultiTenant(
      contexto.req,
      contexto.res,
      contexto.next
    );

    assert.equal(contexto.res.statusCode, 401);
    assert.equal(contexto.foiAutorizado(), false);
    assert.equal(consulta.mock.callCount(), 1);
  }
);

test(
  "Utiliza o perfil atual do PostgreSQL",
  async (t) => {
    configurarJwt(t);

    t.mock.method(
      usuarioRepository,
      "buscarIdentidadeAutenticada",
      async () => ({
        id_usuario: 10,
        id_ambiente:
          "11111111-1111-4111-8111-111111111111",
        eh_fundador: false, perfil_acesso: "ENGENHEIRO_SEGURANCA",
      })
    );

    const contexto = criarContexto(
      gerarToken({
        perfil: "ADMINISTRADOR",
      })
    );

    await autenticarMultiTenant(
      contexto.req,
      contexto.res,
      contexto.next
    );

    assert.equal(contexto.foiAutorizado(), true);

    assert.equal(
      contexto.req.usuario.perfil_acesso,
      "ENGENHEIRO_SEGURANCA"
    );
  }
);

test(
  "Retorna erro 500 quando ocorre falha na consulta",
  async (t) => {
    configurarJwt(t);

    t.mock.method(
      usuarioRepository,
      "buscarIdentidadeAutenticada",
      async () => {
        throw new Error(
          "Falha simulada de conexão"
        );
      }
    );

    // Evita imprimir o erro proposital no teste.
    t.mock.method(
      console,
      "error",
      () => {}
    );

    const contexto = criarContexto(
      gerarToken()
    );

    await autenticarMultiTenant(
      contexto.req,
      contexto.res,
      contexto.next
    );

    assert.equal(contexto.res.statusCode, 500);
    assert.equal(contexto.foiAutorizado(), false);

    assert.match(
      contexto.res.body.message,
      /erro interno/i
    );
  }
);
