
const test = require("node:test");
const assert = require("node:assert/strict");

const pool = require("../src/config/database");

const {
  buscarPorEmailComAmbiente,
} = require(
  "../src/repositories/autenticacaoMultiTenantRepository"
);

test(
  "Retorna null para e-mail inválido sem consultar o banco",
  async (t) => {
    const consulta = t.mock.method(
      pool,
      "query",
      async () => {
        throw new Error(
          "O banco não deveria ser consultado"
        );
      }
    );

    assert.equal(
      await buscarPorEmailComAmbiente(""),
      null
    );

    assert.equal(
      await buscarPorEmailComAmbiente(null),
      null
    );

    assert.equal(
      await buscarPorEmailComAmbiente("   "),
      null
    );

    assert.equal(consulta.mock.callCount(), 0);
  }
);

test(
  "Normaliza o e-mail e utiliza consulta parametrizada",
  async (t) => {
    const consulta = t.mock.method(
      pool,
      "query",
      async () => ({
        rows: [],
      })
    );

    await buscarPorEmailComAmbiente(
      "  ADMIN@EXEMPLO.COM  "
    );

    assert.equal(consulta.mock.callCount(), 1);

    const [sql, parametros] =
      consulta.mock.calls[0].arguments;

    assert.deepEqual(
      parametros,
      ["admin@exemplo.com"]
    );

    assert.match(
      sql,
      /LOWER\(u\.email\)\s*=\s*\$1/i
    );
  }
);

test(
  "Retorna usuário com informações do ambiente",
  async (t) => {
    const usuarioSimulado = {
      id_usuario: 10,
      id_ambiente:
        "11111111-1111-4111-8111-111111111111",
      nome: "Administrador Teste",
      email: "admin@exemplo.com",
      senha_hash: "hash-simulado",
      eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
      ativo: true,
      ambiente_ativo: true,
    };

    t.mock.method(
      pool,
      "query",
      async () => ({
        rows: [usuarioSimulado],
      })
    );

    const resultado =
      await buscarPorEmailComAmbiente(
        "admin@exemplo.com"
      );

    assert.deepEqual(
      resultado,
      usuarioSimulado
    );
  }
);

test(
  "Retorna null quando o usuário não é encontrado",
  async (t) => {
    t.mock.method(
      pool,
      "query",
      async () => ({
        rows: [],
      })
    );

    const resultado =
      await buscarPorEmailComAmbiente(
        "inexistente@exemplo.com"
      );

    assert.equal(resultado, null);
  }
);

test(
  "Consulta o ambiente e sua situação atual",
  async (t) => {
    const consulta = t.mock.method(
      pool,
      "query",
      async () => ({
        rows: [],
      })
    );

    await buscarPorEmailComAmbiente(
      "admin@exemplo.com"
    );

    const sql =
      consulta.mock.calls[0].arguments[0];

    assert.match(
      sql,
      /LEFT\s+JOIN\s+ambiente\s+AS\s+a/i
    );

    assert.match(
      sql,
      /a\.id_ambiente\s*=\s*u\.id_ambiente/i
    );

    assert.match(
      sql,
      /a\.ativo\s+AS\s+ambiente_ativo/i
    );
  }
);
