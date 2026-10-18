const test = require("node:test");
const assert = require("node:assert/strict");

const campanhaRepository = require(
  "../src/repositories/campanhaMultiTenantRepository"
);
const campanhaService = require("../src/services/campanhaMultiTenantService");

const AMBIENTE_A = "11111111-1111-4111-8111-111111111111";
const AMBIENTE_B = "22222222-2222-4222-8222-222222222222";
const USUARIO = { id_usuario: 10, id_ambiente: AMBIENTE_A };
const DADOS = {
  nome_campanha: "  Inspeção NR-33  ",
  empresa: "  Empresa A  ",
  responsavel: "  Responsável A  ",
  data_inicio: "2026-10-14",
};
const CAMPOS = {
  nomeCampanha: "Inspeção NR-33",
  empresa: "Empresa A",
  responsavel: "Responsável A",
  dataInicio: "2026-10-14",
};
const CAMPANHA = {
  id_campanha: 30,
  id_ambiente: AMBIENTE_A,
  id_usuario: 10,
  nome_campanha: "Inspeção NR-33",
  status: "EM ANDAMENTO",
};

// Intercepta todas as funções utilizadas pelo serviço. Chamadas não previstas
// falham no mock, antes de alcançar pool.query ou abrir conexão com PostgreSQL.
function simularRepositorio(t, respostas = {}) {
  const metodos = [
    "criarNoAmbiente",
    "listarPermitidasNoAmbiente",
    "buscarPermitidaPorIdNoAmbiente",
    "atualizarNoAmbiente",
    "atualizarStatusNoAmbiente",
  ];

  return Object.fromEntries(metodos.map((metodo) => [
    metodo,
    t.mock.method(campanhaRepository, metodo, async () => {
      if (!Object.hasOwn(respostas, metodo)) {
        throw new Error(`Chamada inesperada: ${metodo}`);
      }
      return respostas[metodo];
    }),
  ]));
}

function verificarSemChamadas(consultas) {
  for (const consulta of Object.values(consultas)) {
    assert.equal(consulta.mock.callCount(), 0);
  }
}

function operacoes(usuario) {
  return [
    () => campanhaService.criarCampanha(DADOS, usuario),
    () => campanhaService.listarCampanhas(usuario),
    () => campanhaService.buscarCampanhaPorId(30, usuario),
    () => campanhaService.atualizarCampanha(30, DADOS, usuario),
    () => campanhaService.alterarStatusCampanha(30, { status: "CONCLUIDO" }, usuario),
  ];
}

test("Recusa todas as operações sem identidade autenticada com HTTP 401", async (t) => {
  const consultas = simularRepositorio(t);

  for (const usuario of [undefined, null]) {
    for (const executar of operacoes(usuario)) {
      await assert.rejects(executar, {
        statusCode: 401,
        message: "Usuário não autenticado.",
      });
    }
  }

  verificarSemChamadas(consultas);
});

test("Recusa identidade com identificador de usuário inválido com HTTP 401", async (t) => {
  const consultas = simularRepositorio(t);
  const idsInvalidos = [
    undefined, null, "", "usuario-invalido", 0, -1, 1.5,
    Number.MAX_SAFE_INTEGER + 1, true, {}, [],
  ];

  for (const id of idsInvalidos) {
    for (const executar of operacoes({ ...USUARIO, id_usuario: id })) {
      await assert.rejects(executar, { statusCode: 401 });
    }
  }

  verificarSemChamadas(consultas);
});

test("Recusa identidade com UUID de ambiente inválido com HTTP 401", async (t) => {
  const consultas = simularRepositorio(t);
  const ambientesInvalidos = [
    undefined, null, "", "ambiente-invalido", 123,
    "11111111-1111-4111-8111-11111111111Z",
  ];

  for (const ambiente of ambientesInvalidos) {
    for (const executar of operacoes({ ...USUARIO, id_ambiente: ambiente })) {
      await assert.rejects(executar, { statusCode: 401 });
    }
  }

  verificarSemChamadas(consultas);
});

test("Valida os campos obrigatórios na criação antes de chamar o repositório", async (t) => {
  const consultas = simularRepositorio(t);
  const campos = [
    ["nome_campanha", "O nome da campanha é obrigatório."],
    ["empresa", "A empresa é obrigatória."],
    ["responsavel", "O responsável é obrigatório."],
    ["data_inicio", "A data de início é obrigatória."],
  ];

  for (const [campo, message] of campos) {
    const valores = campo === "data_inicio"
      ? [undefined, null, ""]
      : [undefined, null, "", "   ", 123];

    for (const valor of valores) {
      await assert.rejects(
        campanhaService.criarCampanha({ ...DADOS, [campo]: valor }, USUARIO),
        { statusCode: 400, message }
      );
    }
  }

  verificarSemChamadas(consultas);
});

test("Recusa status de criação não permitido com HTTP 400", async (t) => {
  const consultas = simularRepositorio(t);

  for (const status of ["ATIVA", "CONCLUIDA", "CANCELADO", "em andamento", "", null]) {
    await assert.rejects(
      campanhaService.criarCampanha({ ...DADOS, status }, USUARIO),
      { statusCode: 400, message: "Status da campanha inválido." }
    );
  }

  verificarSemChamadas(consultas);
});

test("Cria campanha com usuário e ambiente autenticados e normaliza os campos", async (t) => {
  const consultas = simularRepositorio(t, { criarNoAmbiente: CAMPANHA });

  const resultado = await campanhaService.criarCampanha(DADOS, USUARIO);

  assert.deepEqual(resultado, CAMPANHA);
  assert.equal(consultas.criarNoAmbiente.mock.callCount(), 1);
  assert.deepEqual(consultas.criarNoAmbiente.mock.calls[0].arguments, [
    { ...CAMPOS, status: "EM ANDAMENTO", idUsuario: 10 },
    AMBIENTE_A,
    { bloquearAutorizacao: true },
  ]);
});

test("Ignora usuário, ambiente e perfil enviados no corpo da criação", async (t) => {
  const consultas = simularRepositorio(t, { criarNoAmbiente: CAMPANHA });

  await campanhaService.criarCampanha({
    ...DADOS,
    status: "CONCLUIDO",
    id_usuario: 999,
    id_ambiente: AMBIENTE_B,
    idUsuario: 999,
    idAmbiente: AMBIENTE_B,
    perfil_acesso: "ADMINISTRADOR",
  }, USUARIO);

  assert.equal(consultas.criarNoAmbiente.mock.callCount(), 1);
  assert.deepEqual(consultas.criarNoAmbiente.mock.calls[0].arguments, [
    { ...CAMPOS, status: "CONCLUIDO", idUsuario: 10 },
    AMBIENTE_A,
    { bloquearAutorizacao: true },
  ]);
});

test("Lista campanhas exclusivamente pelo ambiente autenticado", async (t) => {
  const campanhas = [CAMPANHA];
  const consultas = simularRepositorio(t, { listarPermitidasNoAmbiente: campanhas });

  const resultado = await campanhaService.listarCampanhas(USUARIO);

  assert.deepEqual(resultado, campanhas);
  assert.equal(consultas.listarPermitidasNoAmbiente.mock.callCount(), 1);
  assert.deepEqual(consultas.listarPermitidasNoAmbiente.mock.calls[0].arguments, [USUARIO]);
});

test("Busca campanha pelo ID e ambiente autenticado", async (t) => {
  const consultas = simularRepositorio(t, { buscarPermitidaPorIdNoAmbiente: CAMPANHA });

  const resultado = await campanhaService.buscarCampanhaPorId("30", USUARIO);

  assert.deepEqual(resultado, CAMPANHA);
  assert.equal(consultas.buscarPermitidaPorIdNoAmbiente.mock.callCount(), 1);
  assert.deepEqual(consultas.buscarPermitidaPorIdNoAmbiente.mock.calls[0].arguments, [30, USUARIO]);
});

test("Retorna HTTP 404 quando a campanha não é encontrada no ambiente", async (t) => {
  const consultas = simularRepositorio(t, { buscarPermitidaPorIdNoAmbiente: null });

  await assert.rejects(
    campanhaService.buscarCampanhaPorId(30, USUARIO),
    { statusCode: 404, message: "Campanha não encontrada." }
  );

  assert.equal(consultas.buscarPermitidaPorIdNoAmbiente.mock.callCount(), 1);
  assert.deepEqual(consultas.buscarPermitidaPorIdNoAmbiente.mock.calls[0].arguments, [30, USUARIO]);
});

test("Valida os campos obrigatórios na atualização antes de chamar o repositório", async (t) => {
  const consultas = simularRepositorio(t);
  const campos = [
    ["nome_campanha", "O nome da campanha é obrigatório."],
    ["empresa", "A empresa é obrigatória."],
    ["responsavel", "O responsável é obrigatório."],
    ["data_inicio", "A data de início é obrigatória."],
  ];

  for (const [campo, message] of campos) {
    const valores = campo === "data_inicio"
      ? [undefined, null, ""]
      : [undefined, null, "", "   ", 123];

    for (const valor of valores) {
      await assert.rejects(
        campanhaService.atualizarCampanha(30, { ...DADOS, [campo]: valor }, USUARIO),
        { statusCode: 400, message }
      );
    }
  }

  verificarSemChamadas(consultas);
});

test("Encaminha atualização com identidade autenticada sem usar o perfil do corpo", async (t) => {
  const consultas = simularRepositorio(t, { atualizarNoAmbiente: CAMPANHA });

  const resultado = await campanhaService.atualizarCampanha("30", {
    ...DADOS,
    id_usuario: 999,
    id_ambiente: AMBIENTE_B,
    perfil_acesso: "ADMINISTRADOR",
  }, { id_usuario: "10", id_ambiente: AMBIENTE_A });

  assert.deepEqual(resultado, CAMPANHA);
  assert.equal(consultas.atualizarNoAmbiente.mock.callCount(), 1);
  assert.deepEqual(consultas.atualizarNoAmbiente.mock.calls[0].arguments, [
    30, CAMPOS, USUARIO, { bloquearAutorizacao: true },
  ]);
  assert.equal(consultas.buscarPermitidaPorIdNoAmbiente.mock.callCount(), 0);
});

test("Retorna HTTP 404 quando a atualização não é autorizada", async (t) => {
  const consultas = simularRepositorio(t, { atualizarNoAmbiente: null });

  await assert.rejects(
    campanhaService.atualizarCampanha(30, DADOS, USUARIO),
    { statusCode: 404, message: "Campanha não encontrada." }
  );

  assert.equal(consultas.atualizarNoAmbiente.mock.callCount(), 1);
  assert.deepEqual(consultas.atualizarNoAmbiente.mock.calls[0].arguments, [
    30, CAMPOS, USUARIO, { bloquearAutorizacao: true },
  ]);
});

test("Aceita somente os três status permitidos na alteração de status", async (t) => {
  const consultas = simularRepositorio(t, { atualizarStatusNoAmbiente: CAMPANHA });

  for (const status of [undefined, null, "", "ATIVA", "CONCLUIDA", "CANCELADO", "concluido", "CONCLUIDO "]) {
    await assert.rejects(
      campanhaService.alterarStatusCampanha(30, { status }, USUARIO),
      {
        statusCode: 400,
        message: "O status deve ser EM ANDAMENTO, CONCLUIDO ou CANCELADA.",
      }
    );
  }

  verificarSemChamadas(consultas);

  const permitidos = ["EM ANDAMENTO", "CONCLUIDO", "CANCELADA"];
  for (const [indice, status] of permitidos.entries()) {
    await campanhaService.alterarStatusCampanha(30, { status }, USUARIO);
    assert.equal(consultas.atualizarStatusNoAmbiente.mock.callCount(), indice + 1);
    assert.deepEqual(consultas.atualizarStatusNoAmbiente.mock.calls[indice].arguments, [
      30, status, USUARIO, { bloquearAutorizacao: true },
    ]);
  }
});

test("Encaminha alteração de status com identidade autenticada sem usar o perfil do corpo", async (t) => {
  const campanhaAtualizada = { ...CAMPANHA, status: "CONCLUIDO" };
  const consultas = simularRepositorio(t, {
    atualizarStatusNoAmbiente: campanhaAtualizada,
  });

  const resultado = await campanhaService.alterarStatusCampanha("30", {
    status: "CONCLUIDO",
    id_usuario: 999,
    id_ambiente: AMBIENTE_B,
    perfil_acesso: "ADMINISTRADOR",
  }, { id_usuario: "10", id_ambiente: AMBIENTE_A });

  assert.deepEqual(resultado, campanhaAtualizada);
  assert.equal(consultas.atualizarStatusNoAmbiente.mock.callCount(), 1);
  assert.deepEqual(consultas.atualizarStatusNoAmbiente.mock.calls[0].arguments, [
    30, "CONCLUIDO", USUARIO, { bloquearAutorizacao: true },
  ]);
  assert.equal(consultas.buscarPermitidaPorIdNoAmbiente.mock.callCount(), 0);
});

test("Retorna HTTP 404 quando a alteração de status não é autorizada", async (t) => {
  const consultas = simularRepositorio(t, { atualizarStatusNoAmbiente: null });

  await assert.rejects(
    campanhaService.alterarStatusCampanha(30, { status: "CANCELADA" }, USUARIO),
    { statusCode: 404, message: "Campanha não encontrada." }
  );

  assert.equal(consultas.atualizarStatusNoAmbiente.mock.callCount(), 1);
  assert.deepEqual(consultas.atualizarStatusNoAmbiente.mock.calls[0].arguments, [
    30, "CANCELADA", USUARIO, { bloquearAutorizacao: true },
  ]);
});

test("Retorna HTTP 403 quando o repositório recusa a criação", async (t) => {
  const consultas = simularRepositorio(t, { criarNoAmbiente: null });

  await assert.rejects(
    campanhaService.criarCampanha(DADOS, USUARIO),
    {
      statusCode: 403,
      message: "Usuário ou ambiente sem permissão para criar campanha.",
    }
  );

  assert.equal(consultas.criarNoAmbiente.mock.callCount(), 1);
  assert.deepEqual(consultas.criarNoAmbiente.mock.calls[0].arguments, [
    { ...CAMPOS, status: "EM ANDAMENTO", idUsuario: 10 },
    AMBIENTE_A,
    { bloquearAutorizacao: true },
  ]);
});

// ========================================
// COBERTURA COMPLEMENTAR DE SEGURANÇA
// ========================================

const operacoesComId = [
  ["busca", (id) => campanhaService.buscarCampanhaPorId(id, USUARIO)],
  ["atualização", (id) => campanhaService.atualizarCampanha(id, DADOS, USUARIO)],
  ["alteração de status", (id) => campanhaService.alterarStatusCampanha(
    id, { status: "CONCLUIDO" }, USUARIO
  )],
];

for (const [nome, executar] of operacoesComId) {
  test(`Recusa ID de campanha inválido na ${nome} sem chamar o repositório`, async (t) => {
    const consultas = simularRepositorio(t);
    const idsInvalidos = [
      undefined, null, "", "   ", "campanha-invalida",
      0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1,
      true, false, {}, [], [30],
    ];

    for (const id of idsInvalidos) {
      await assert.rejects(
        () => executar(id),
        { statusCode: 400, message: "ID da campanha inválido." }
      );
    }

    verificarSemChamadas(consultas);
  });
}

const operacoesComDados = [
  ["criação", (dados) => campanhaService.criarCampanha(dados, USUARIO)],
  ["atualização", (dados) => campanhaService.atualizarCampanha(30, dados, USUARIO)],
  ["alteração de status", (dados) => campanhaService.alterarStatusCampanha(30, dados, USUARIO)],
];

for (const [nome, executar] of operacoesComDados) {
  test(`Recusa dados ausentes, arrays e primitivos na ${nome} sem chamar o repositório`, async (t) => {
    const consultas = simularRepositorio(t);
    const dadosInvalidos = [
      undefined, null, [], [DADOS], "", "dados-invalidos",
      0, 123, true, false,
    ];

    for (const dados of dadosInvalidos) {
      await assert.rejects(
        () => executar(dados),
        { statusCode: 400, message: "Dados da campanha inválidos." }
      );
    }

    verificarSemChamadas(consultas);
  });
}

test("Mantém as cinco operações no ambiente B apesar da identidade forjada no corpo", async (t) => {
  const usuarioB = { id_usuario: 20, id_ambiente: AMBIENTE_B };
  const campanhaB = {
    ...CAMPANHA,
    id_campanha: 40,
    id_usuario: 20,
    id_ambiente: AMBIENTE_B,
  };
  const consultas = simularRepositorio(t, {
    criarNoAmbiente: campanhaB,
    listarPermitidasNoAmbiente: [campanhaB],
    buscarPermitidaPorIdNoAmbiente: campanhaB,
    atualizarNoAmbiente: campanhaB,
    atualizarStatusNoAmbiente: { ...campanhaB, status: "CANCELADA" },
  });
  const dadosForjados = {
    ...DADOS,
    id_ambiente: AMBIENTE_A,
    id_usuario: 10,
    idAmbiente: AMBIENTE_A,
    idUsuario: 10,
    perfil_acesso: "ADMINISTRADOR",
  };

  assert.deepEqual(
    await campanhaService.criarCampanha(dadosForjados, usuarioB),
    campanhaB
  );
  assert.deepEqual(
    await campanhaService.listarCampanhas(usuarioB),
    [campanhaB]
  );
  assert.deepEqual(
    await campanhaService.buscarCampanhaPorId(40, usuarioB),
    campanhaB
  );
  assert.deepEqual(
    await campanhaService.atualizarCampanha(40, dadosForjados, usuarioB),
    campanhaB
  );
  assert.deepEqual(
    await campanhaService.alterarStatusCampanha(
      40, { ...dadosForjados, status: "CANCELADA" }, usuarioB
    ),
    { ...campanhaB, status: "CANCELADA" }
  );

  for (const consulta of Object.values(consultas)) {
    assert.equal(consulta.mock.callCount(), 1);
  }

  assert.deepEqual(consultas.criarNoAmbiente.mock.calls[0].arguments, [
    { ...CAMPOS, status: "EM ANDAMENTO", idUsuario: 20 },
    AMBIENTE_B,
    { bloquearAutorizacao: true },
  ]);
  assert.deepEqual(consultas.listarPermitidasNoAmbiente.mock.calls[0].arguments, [usuarioB]);
  assert.deepEqual(consultas.buscarPermitidaPorIdNoAmbiente.mock.calls[0].arguments, [40, usuarioB]);
  assert.deepEqual(consultas.atualizarNoAmbiente.mock.calls[0].arguments, [
    40, CAMPOS, usuarioB, { bloquearAutorizacao: true },
  ]);
  assert.deepEqual(consultas.atualizarStatusNoAmbiente.mock.calls[0].arguments, [
    40, "CANCELADA", usuarioB, { bloquearAutorizacao: true },
  ]);
});

test("Propaga os erros internos do repositório nas cinco operações sem convertê-los em 403 ou 404", async (t) => {
  const consultas = simularRepositorio(t);
  const erros = {};

  for (const [metodo, consulta] of Object.entries(consultas)) {
    const erro = new Error(`Falha interna simulada: ${metodo}`);
    erro.statusCode = 500;
    erros[metodo] = erro;
    consulta.mock.mockImplementation(async () => {
      throw erro;
    });
  }

  const chamadas = [
    ["criarNoAmbiente", () => campanhaService.criarCampanha(DADOS, USUARIO)],
    ["listarPermitidasNoAmbiente", () => campanhaService.listarCampanhas(USUARIO)],
    ["buscarPermitidaPorIdNoAmbiente", () => campanhaService.buscarCampanhaPorId(30, USUARIO)],
    ["atualizarNoAmbiente", () => campanhaService.atualizarCampanha(30, DADOS, USUARIO)],
    ["atualizarStatusNoAmbiente", () => campanhaService.alterarStatusCampanha(
      30, { status: "CONCLUIDO" }, USUARIO
    )],
  ];

  for (const [metodo, executar] of chamadas) {
    await assert.rejects(executar, (erro) => {
      assert.strictEqual(erro, erros[metodo]);
      assert.equal(erro.statusCode, 500);
      return true;
    });
    assert.equal(consultas[metodo].mock.callCount(), 1);
  }
});
