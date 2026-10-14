
const test = require("node:test");
const assert = require("node:assert/strict");

const pool = require("../src/config/database");

const campanhaRepository = require(
  "../src/repositories/campanhaMultiTenantRepository"
);

const AMBIENTE_A =
  "11111111-1111-4111-8111-111111111111";

const AMBIENTE_B =
  "22222222-2222-4222-8222-222222222222";

// ========================================
// TESTES DE VALIDAÇÃO
// ========================================

test(
  "Recusa ambiente inválido antes de consultar o banco",
  async (t) => {
    const consulta = t.mock.method(
      pool,
      "query",
      async () => {
        throw new Error("Consulta inesperada");
      }
    );

    await assert.rejects(
      campanhaRepository.listarPorAmbiente(
        "ambiente-invalido"
      ),
      { statusCode: 403 }
    );

    assert.equal(consulta.mock.callCount(), 0);
  }
);

test(
  "Recusa ID de campanha inválido antes de consultar o banco",
  async (t) => {
    const consulta = t.mock.method(
      pool,
      "query",
      async () => {
        throw new Error("Consulta inesperada");
      }
    );

    await assert.rejects(
      campanhaRepository.buscarPorIdEAmbiente(
        -1,
        AMBIENTE_A
      ),
      { statusCode: 400 }
    );

    assert.equal(consulta.mock.callCount(), 0);
  }
);

// ========================================
// TESTES DE ISOLAMENTO
// ========================================

test(
  "Lista campanhas utilizando filtro por ambiente",
  async (t) => {
    const campanhasSimuladas = [
      {
        id_campanha: 10,
        id_ambiente: AMBIENTE_A,
        nome_campanha: "Campanha A",
      },
    ];

    const consulta = t.mock.method(
      pool,
      "query",
      async () => ({
        rows: campanhasSimuladas,
      })
    );

    const resultado =
      await campanhaRepository.listarPorAmbiente(
        AMBIENTE_A
      );

    assert.deepEqual(
      resultado,
      campanhasSimuladas
    );

    assert.equal(consulta.mock.callCount(), 1);

    const [sql, parametros] =
      consulta.mock.calls[0].arguments;

    assert.deepEqual(parametros, [AMBIENTE_A]);

    assert.match(
      sql,
      /c\.id_ambiente\s*=\s*\$1/i
    );

    assert.match(
      sql,
      /u\.id_ambiente\s*=\s*c\.id_ambiente/i
    );
  }
);

test(
  "Busca campanha utilizando ID e ambiente",
  async (t) => {
    const campanhaSimulada = {
      id_campanha: 20,
      id_ambiente: AMBIENTE_B,
      nome_campanha: "Campanha B",
    };

    const consulta = t.mock.method(
      pool,
      "query",
      async () => ({
        rows: [campanhaSimulada],
      })
    );

    const resultado =
      await campanhaRepository.buscarPorIdEAmbiente(
        20,
        AMBIENTE_B
      );

    assert.deepEqual(
      resultado,
      campanhaSimulada
    );

    const [sql, parametros] =
      consulta.mock.calls[0].arguments;

    assert.deepEqual(
      parametros,
      [20, AMBIENTE_B]
    );

    assert.match(
      sql,
      /c\.id_campanha\s*=\s*\$1/i
    );

    assert.match(
      sql,
      /c\.id_ambiente\s*=\s*\$2/i
    );
  }
);

test(
  "Retorna null quando a campanha não pertence ao ambiente consultado",
  async (t) => {
    const consulta = t.mock.method(
      pool,
      "query",
      async () => ({
        rows: [],
      })
    );

    const resultado =
      await campanhaRepository.buscarPorIdEAmbiente(
        20,
        AMBIENTE_A
      );

    assert.equal(resultado, null);

    assert.equal(consulta.mock.callCount(), 1);

    assert.deepEqual(
      consulta.mock.calls[0].arguments[1],
      [20, AMBIENTE_A]
    );
  }
);
