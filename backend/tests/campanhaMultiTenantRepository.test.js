const { conferir: conferirCapacidadeSql } = require('./helpers/rbacSqlSimulado.cjs');

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

/**
 * Testes da criação de campanhas multi-tenant.
 *
 * Utilizam mocks: nenhuma conexão real
 * com o PostgreSQL será realizada.
 */

test(
  "Recusa criação com ambiente inválido",
  async (t) => {
    const consulta = t.mock.method(
      pool,
      "query",
      async () => {
        throw new Error("Consulta inesperada");
      }
    );

    await assert.rejects(
      campanhaRepository.criarNoAmbiente(
        { idUsuario: 10 },
        "ambiente-invalido"
      ),
      { statusCode: 403 }
    );

    assert.equal(consulta.mock.callCount(), 0);
  }
);

test(
  "Recusa criação com usuário inválido",
  async (t) => {
    const consulta = t.mock.method(
      pool,
      "query",
      async () => {
        throw new Error("Consulta inesperada");
      }
    );

    await assert.rejects(
      campanhaRepository.criarNoAmbiente(
        { idUsuario: -1 },
        AMBIENTE_A
      ),
      { statusCode: 400 }
    );

    assert.equal(consulta.mock.callCount(), 0);
  }
);

test(
  "Cria campanha vinculada ao ambiente e usuário autorizados",
  async (t) => {
    const campanhaSimulada = {
      id_campanha: 30,
      id_ambiente: AMBIENTE_A,
      nome_campanha: "Inspeção NR-33",
      id_usuario: 10,
    };

    const consulta = t.mock.method(
      pool,
      "query",
      async () => ({
        rows: [campanhaSimulada],
      })
    );

    const dados = {
      nomeCampanha: "Inspeção NR-33",
      empresa: "Empresa A",
      responsavel: "Responsável A",
      dataInicio: "2026-10-14",
      status: "EM ANDAMENTO",
      idUsuario: 10,
    };

    const resultado =
      await campanhaRepository.criarNoAmbiente(
        dados,
        AMBIENTE_A
      );

    assert.deepEqual(
      resultado,
      campanhaSimulada
    );

    assert.equal(consulta.mock.callCount(), 1);

    const [sql, parametros] =
      consulta.mock.calls[0].arguments;

    assert.match(
      sql,
      /INSERT INTO campanha/i
    );

    assert.match(
      sql,
      /u\.id_ambiente\s*=\s*\$7/i
    );

    assert.match(
      sql,
      /u\.id_usuario\s*=\s*\$6/i
    );

    assert.match(
      sql,
      /u\.ativo\s*=\s*TRUE/i
    );

    assert.match(
      sql,
      /a\.ativo\s*=\s*TRUE/i
    );

    assert.deepEqual(parametros, [
      dados.nomeCampanha,
      dados.empresa,
      dados.responsavel,
      dados.dataInicio,
      dados.status,
      10,
      AMBIENTE_A,
    ]);
  }
);

test(
  "Retorna null quando o usuário não está autorizado no ambiente",
  async (t) => {
    const consulta = t.mock.method(
      pool,
      "query",
      async () => ({
        rows: [],
      })
    );

    const resultado =
      await campanhaRepository.criarNoAmbiente(
        {
          nomeCampanha: "Campanha restrita",
          idUsuario: 10,
        },
        AMBIENTE_B
      );

    assert.equal(resultado, null);

    assert.equal(consulta.mock.callCount(), 1);

    assert.deepEqual(
      consulta.mock.calls[0].arguments[1].slice(-2),
      [10, AMBIENTE_B]
    );
  }
);

// ========================================
// TESTES DA ATUALIZAÇÃO MULTI-TENANT
// Todas as consultas são interceptadas por mocks.
// ========================================

test(
  "Recusa atualização com ID de campanha inválido antes de consultar o banco",
  async (t) => {
    const consulta = t.mock.method(pool, "query", async () => {
      throw new Error("Consulta inesperada");
    });

    for (const id of [0, -1, 1.5, "campanha-invalida", Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(
        campanhaRepository.atualizarNoAmbiente(id, {}, {
          id_usuario: 10,
          id_ambiente: AMBIENTE_A,
        }),
        { statusCode: 400, message: "ID da campanha inválido." }
      );
    }

    assert.equal(consulta.mock.callCount(), 0);
  }
);

test(
  "Recusa atualização sem usuário autenticado antes de consultar o banco",
  async (t) => {
    const consulta = t.mock.method(pool, "query", async () => {
      throw new Error("Consulta inesperada");
    });

    for (const usuario of [undefined, null]) {
      await assert.rejects(
        campanhaRepository.atualizarNoAmbiente(30, {}, usuario),
        { statusCode: 401, message: "Usuário não autenticado." }
      );
    }

    assert.equal(consulta.mock.callCount(), 0);
  }
);

test(
  "Recusa atualização com ambiente inválido antes de consultar o banco",
  async (t) => {
    const consulta = t.mock.method(pool, "query", async () => {
      throw new Error("Consulta inesperada");
    });

    for (const ambiente of [undefined, null, "", "ambiente-invalido"]) {
      await assert.rejects(
        campanhaRepository.atualizarNoAmbiente(30, {}, {
          id_usuario: 10,
          id_ambiente: ambiente,
        }),
        { statusCode: 403, message: "Identificação do ambiente inválida." }
      );
    }

    assert.equal(consulta.mock.callCount(), 0);
  }
);

test(
  "Recusa atualização com identificador de usuário inválido antes de consultar o banco",
  async (t) => {
    const consulta = t.mock.method(pool, "query", async () => {
      throw new Error("Consulta inesperada");
    });

    for (const id of [undefined, null, 0, -1, 1.5, "usuario-invalido", Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(
        campanhaRepository.atualizarNoAmbiente(30, {}, {
          id_usuario: id,
          id_ambiente: AMBIENTE_A,
        }),
        { statusCode: 403, message: "Usuário inválido." }
      );
    }

    assert.equal(consulta.mock.callCount(), 0);
  }
);

test(
  "Atualiza campanha com SQL parametrizado e filtros por campanha e ambiente",
  async (t) => {
    const dados = {
      nomeCampanha: "Campanha d'água",
      empresa: "Empresa A",
      responsavel: "Responsável A",
      dataInicio: "2026-10-14",
    };
    const campanhaSimulada = {
      id_campanha: 30,
      id_ambiente: AMBIENTE_A,
      nome_campanha: dados.nomeCampanha,
      id_usuario: 10,
    };
    const consulta = t.mock.method(pool, "query", async () => ({
      rows: [campanhaSimulada],
    }));

    const resultado = await campanhaRepository.atualizarNoAmbiente(
      "30",
      dados,
      { id_usuario: "10", id_ambiente: AMBIENTE_A }
    );

    assert.deepEqual(resultado, campanhaSimulada);
    assert.equal(consulta.mock.callCount(), 1);

    const [sql, parametros] = consulta.mock.calls[0].arguments;

    assert.match(sql, /UPDATE\s+campanha\s+AS\s+c/i);
    assert.match(sql, /nome_campanha\s*=\s*\$1/i);
    assert.match(sql, /empresa\s*=\s*\$2/i);
    assert.match(sql, /responsavel\s*=\s*\$3/i);
    assert.match(sql, /data_inicio\s*=\s*\$4/i);
    assert.match(sql, /WHERE\s+c\.id_campanha\s*=\s*\$5\s+AND\s+c\.id_ambiente\s*=\s*\$6/i);
    assert.match(sql, /RETURNING\s+c\.id_campanha/i);
    assert.equal(sql.includes(dados.nomeCampanha), false);
    assert.equal(sql.includes(AMBIENTE_A), false);
    assert.deepEqual(parametros, [
      dados.nomeCampanha,
      dados.empresa,
      dados.responsavel,
      dados.dataInicio,
      30,
      AMBIENTE_A,
      10,
    ]);
  }
);

test(
  "Exige usuário e ambiente ativos e administrador ou responsável na atualização",
  async (t) => {
    const consulta = t.mock.method(pool, "query", async () => ({
      rows: [],
    }));

    await campanhaRepository.atualizarNoAmbiente(30, {}, {
      id_usuario: 10,
      id_ambiente: AMBIENTE_A,
    });

    assert.equal(consulta.mock.callCount(), 1);

    const sql = consulta.mock.calls[0].arguments[0];

    assert.match(sql, /AND\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+usuario\s+AS\s+u/i);
    assert.match(sql, /INNER\s+JOIN\s+ambiente\s+AS\s+a\s+ON\s+a\.id_ambiente\s*=\s*u\.id_ambiente/i);
    assert.match(sql, /WHERE\s+u\.id_usuario\s*=\s*\$7\s+AND\s+u\.id_ambiente\s*=\s*c\.id_ambiente/i);
    assert.match(sql, /AND\s+u\.ativo\s*=\s*TRUE\s+AND\s+a\.ativo\s*=\s*TRUE/i);
    conferirCapacidadeSql(sql, 'u');
  }
);

test(
  "Retorna null quando nenhuma campanha satisfaz a autorização para atualização",
  async (t) => {
    const consulta = t.mock.method(pool, "query", async () => ({
      rows: [],
    }));

    const resultado = await campanhaRepository.atualizarNoAmbiente(
      30,
      {
        nomeCampanha: "Campanha restrita",
        empresa: "Empresa B",
        responsavel: "Responsável B",
        dataInicio: "2026-10-14",
      },
      { id_usuario: 20, id_ambiente: AMBIENTE_B }
    );

    assert.equal(resultado, null);
    assert.equal(consulta.mock.callCount(), 1);
    assert.deepEqual(
      consulta.mock.calls[0].arguments[1].slice(-3),
      [30, AMBIENTE_B, 20]
    );
  }
);

// ========================================
// TESTES DA ALTERAÇÃO DE STATUS MULTI-TENANT
// Todas as consultas são interceptadas por mocks.
// ========================================

test(
  "Recusa alteração de status com ID de campanha inválido sem consultar o banco",
  async (t) => {
    const consulta = t.mock.method(pool, "query", async () => {
      throw new Error("Consulta inesperada");
    });

    const idsInvalidos = [
      undefined, null, 0, -1, 1.5, "campanha-invalida",
      Number.MAX_SAFE_INTEGER + 1,
    ];

    for (const id of idsInvalidos) {
      await assert.rejects(
        campanhaRepository.atualizarStatusNoAmbiente(
          id,
          "EM ANDAMENTO",
          { id_usuario: 10, id_ambiente: AMBIENTE_A }
        ),
        { statusCode: 400, message: "ID da campanha inválido." }
      );
    }

    assert.equal(consulta.mock.callCount(), 0);
  }
);

test(
  "Recusa alteração de status sem usuário autenticado sem consultar o banco",
  async (t) => {
    const consulta = t.mock.method(pool, "query", async () => {
      throw new Error("Consulta inesperada");
    });

    for (const usuario of [undefined, null]) {
      await assert.rejects(
        campanhaRepository.atualizarStatusNoAmbiente(
          30,
          "EM ANDAMENTO",
          usuario
        ),
        { statusCode: 401, message: "Usuário não autenticado." }
      );
    }

    assert.equal(consulta.mock.callCount(), 0);
  }
);

test(
  "Recusa alteração de status com UUID de ambiente inválido sem consultar o banco",
  async (t) => {
    const consulta = t.mock.method(pool, "query", async () => {
      throw new Error("Consulta inesperada");
    });

    const ambientesInvalidos = [
      undefined, null, "", "ambiente-invalido",
      "11111111-1111-4111-8111-11111111111Z",
    ];

    for (const ambiente of ambientesInvalidos) {
      await assert.rejects(
        campanhaRepository.atualizarStatusNoAmbiente(
          30,
          "EM ANDAMENTO",
          { id_usuario: 10, id_ambiente: ambiente }
        ),
        { statusCode: 403, message: "Identificação do ambiente inválida." }
      );
    }

    assert.equal(consulta.mock.callCount(), 0);
  }
);

test(
  "Recusa alteração de status com identificador de usuário inválido sem consultar o banco",
  async (t) => {
    const consulta = t.mock.method(pool, "query", async () => {
      throw new Error("Consulta inesperada");
    });

    const idsInvalidos = [
      undefined, null, 0, -1, 1.5, "usuario-invalido",
      Number.MAX_SAFE_INTEGER + 1,
    ];

    for (const id of idsInvalidos) {
      await assert.rejects(
        campanhaRepository.atualizarStatusNoAmbiente(
          30,
          "EM ANDAMENTO",
          { id_usuario: id, id_ambiente: AMBIENTE_A }
        ),
        { statusCode: 403, message: "Usuário inválido." }
      );
    }

    assert.equal(consulta.mock.callCount(), 0);
  }
);

test(
  "Recusa status não permitidos sem consultar o banco",
  async (t) => {
    const consulta = t.mock.method(pool, "query", async () => {
      throw new Error("Consulta inesperada");
    });

    const statusInvalidos = [
      undefined, null, "", "ATIVA", "CONCLUIDA", "CANCELADO",
      "em andamento", "EM ANDAMENTO ", 1,
      "CONCLUIDO'; DROP TABLE campanha; --",
    ];

    for (const status of statusInvalidos) {
      await assert.rejects(
        campanhaRepository.atualizarStatusNoAmbiente(
          30,
          status,
          { id_usuario: 10, id_ambiente: AMBIENTE_A }
        ),
        {
          statusCode: 400,
          message: "O status deve ser EM ANDAMENTO, CONCLUIDO ou CANCELADA.",
        }
      );
    }

    assert.equal(consulta.mock.callCount(), 0);
  }
);

test(
  "Atualiza os status permitidos com SQL parametrizado e filtros por campanha e ambiente",
  async (t) => {
    const consulta = t.mock.method(pool, "query", async (_sql, parametros) => ({
      rows: [{
        id_campanha: 30,
        id_ambiente: AMBIENTE_A,
        id_usuario: 10,
        status: parametros[0],
        data_atualizacao: "2026-10-14T12:00:00.000Z",
      }],
    }));

    const statusPermitidos = ["EM ANDAMENTO", "CONCLUIDO", "CANCELADA"];

    for (const [indice, status] of statusPermitidos.entries()) {
      const resultado = await campanhaRepository.atualizarStatusNoAmbiente(
        "30",
        status,
        { id_usuario: "10", id_ambiente: AMBIENTE_A }
      );

      assert.deepEqual(resultado, {
        id_campanha: 30,
        id_ambiente: AMBIENTE_A,
        id_usuario: 10,
        status,
        data_atualizacao: "2026-10-14T12:00:00.000Z",
      });
      assert.equal(consulta.mock.callCount(), indice + 1);

      const [sql, parametros] = consulta.mock.calls[indice].arguments;

      assert.match(sql, /UPDATE\s+campanha\s+AS\s+c/i);
      assert.match(sql, /SET\s+status\s*=\s*\$1/i);
      assert.match(sql, /data_atualizacao\s*=\s*CURRENT_TIMESTAMP/i);
      assert.match(sql, /WHERE\s+c\.id_campanha\s*=\s*\$2\s+AND\s+c\.id_ambiente\s*=\s*\$3/i);
      assert.match(sql, /RETURNING\s+c\.id_campanha/i);
      assert.match(sql, /c\.status/i);
      assert.match(sql, /c\.data_atualizacao/i);
      assert.equal(sql.includes(status), false);
      assert.equal(sql.includes(AMBIENTE_A), false);
      assert.deepEqual(parametros, [status, 30, AMBIENTE_A, 10]);
    }
  }
);

test(
  "Exige usuário e ambiente ativos e administrador ou responsável na alteração de status",
  async (t) => {
    const consulta = t.mock.method(pool, "query", async () => ({
      rows: [],
    }));

    await campanhaRepository.atualizarStatusNoAmbiente(
      30,
      "CONCLUIDO",
      { id_usuario: 10, id_ambiente: AMBIENTE_A }
    );

    assert.equal(consulta.mock.callCount(), 1);

    const sql = consulta.mock.calls[0].arguments[0];

    assert.match(sql, /AND\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+usuario\s+AS\s+u/i);
    assert.match(sql, /INNER\s+JOIN\s+ambiente\s+AS\s+a\s+ON\s+a\.id_ambiente\s*=\s*u\.id_ambiente/i);
    assert.match(sql, /WHERE\s+u\.id_usuario\s*=\s*\$4\s+AND\s+u\.id_ambiente\s*=\s*c\.id_ambiente/i);
    assert.match(sql, /AND\s+u\.ativo\s*=\s*TRUE\s+AND\s+a\.ativo\s*=\s*TRUE/i);
    conferirCapacidadeSql(sql, 'u');
  }
);

test(
  "Retorna null quando nenhuma campanha satisfaz a autorização para alterar status",
  async (t) => {
    const consulta = t.mock.method(pool, "query", async () => ({
      rows: [],
    }));

    const resultado = await campanhaRepository.atualizarStatusNoAmbiente(
      30,
      "CANCELADA",
      { id_usuario: 20, id_ambiente: AMBIENTE_B }
    );

    assert.equal(resultado, null);
    assert.equal(consulta.mock.callCount(), 1);
    assert.deepEqual(
      consulta.mock.calls[0].arguments[1],
      ["CANCELADA", 30, AMBIENTE_B, 20]
    );
  }
);
