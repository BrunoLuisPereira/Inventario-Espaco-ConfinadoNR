
const test = require("node:test");
const assert = require("node:assert/strict");

const pool = require("../src/config/database");

const usuarioRepository = require(
  "../src/repositories/usuarioRepository"
);

// ========================================
// TESTES DE IDENTIFICADORES INVÁLIDOS
// ========================================

test(
  "Não consulta o banco quando o ID é zero",
  async () => {
    const resultado =
      await usuarioRepository.buscarIdentidadeAutenticada(0);

    assert.equal(resultado, null);
  }
);

test(
  "Não consulta o banco quando o ID é negativo",
  async () => {
    const resultado =
      await usuarioRepository.buscarIdentidadeAutenticada(-1);

    assert.equal(resultado, null);
  }
);

test(
  "Não consulta o banco quando o ID não é numérico",
  async () => {
    const resultado =
      await usuarioRepository.buscarIdentidadeAutenticada(
        "usuario-invalido"
      );

    assert.equal(resultado, null);
  }
);

test(
  "Não consulta o banco quando o ID ultrapassa o limite seguro",
  async () => {
    const resultado =
      await usuarioRepository.buscarIdentidadeAutenticada(
        Number.MAX_SAFE_INTEGER + 1
      );

    assert.equal(resultado, null);
  }
);

// ========================================
// TESTES COM POSTGRESQL SIMULADO
// ========================================

test(
  "Retorna a identidade do usuário autorizado",
  async (t) => {
    const usuarioSimulado = {
      id_usuario: 10,
      id_ambiente:
        "11111111-1111-4111-8111-111111111111",
      nome: "Administrador Teste",
      email: "admin@exemplo.com",
      perfil_acesso: "ADMINISTRADOR",
    };

    const consulta = t.mock.method(
      pool,
      "query",
      async () => ({
        rows: [usuarioSimulado],
      })
    );

    const resultado =
      await usuarioRepository.buscarIdentidadeAutenticada(
        10
      );

    assert.deepEqual(resultado, usuarioSimulado);
    assert.equal(consulta.mock.callCount(), 1);
  }
);

test(
  "Retorna null quando nenhum usuário autorizado é encontrado",
  async (t) => {
    const consulta = t.mock.method(
      pool,
      "query",
      async () => ({
        rows: [],
      })
    );

    const resultado =
      await usuarioRepository.buscarIdentidadeAutenticada(
        20
      );

    assert.equal(resultado, null);
    assert.equal(consulta.mock.callCount(), 1);
  }
);

test(
  "Utiliza consulta parametrizada pelo ID do usuário",
  async (t) => {
    const consulta = t.mock.method(
      pool,
      "query",
      async () => ({
        rows: [],
      })
    );

    await usuarioRepository.buscarIdentidadeAutenticada(
      30
    );

    assert.equal(consulta.mock.callCount(), 1);

    const chamada = consulta.mock.calls[0];

    const [sql, parametros] = chamada.arguments;

    assert.match(sql, /u\.id_usuario\s*=\s*\$1/i);
    assert.deepEqual(parametros, [30]);
  }
);

test(
  "Exige usuário e ambiente ativos na consulta SQL",
  async (t) => {
    const consulta = t.mock.method(
      pool,
      "query",
      async () => ({
        rows: [],
      })
    );

    await usuarioRepository.buscarIdentidadeAutenticada(
      40
    );

    assert.equal(consulta.mock.callCount(), 1);

    const sql = consulta.mock.calls[0].arguments[0];

    assert.match(
      sql,
      /INNER\s+JOIN\s+ambiente\s+AS\s+a/i
    );

    assert.match(
      sql,
      /u\.ativo\s*=\s*TRUE/i
    );

    assert.match(
      sql,
      /a\.ativo\s*=\s*TRUE/i
    );

        assert.match(
    sql,
    /a\.id_ambiente\s*=\s*u\.id_ambiente/i
    );
  }
);
