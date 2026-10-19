const test = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/services/checklistMultiTenantService");
const repository = require("../src/repositories/checklistMultiTenantRepository");
const checklistLegado = require("../src/repositories/checklistRepository");
const localLegado = require("../src/repositories/localRepository");
const campanhaLegado = require("../src/repositories/campanhaRepository");
const pool = require("../src/config/database");

const AMBIENTE_A = "11111111-1111-4111-8111-111111111111";
const AMBIENTE_B = "22222222-2222-4222-8222-222222222222";
const USUARIO_A = { id_usuario: 10, id_ambiente: AMBIENTE_A };
const USUARIO_B = { id_usuario: 20, id_ambiente: AMBIENTE_B };
const CAMPOS = [
  "criterio_a", "criterio_b", "criterio_c", "acesso_controlado",
  "ventilacao_adequada", "monitoramento_atmosferico", "procedimento_emergencia",
];
const RESPOSTAS = {
  criterio_a: "SIM", criterio_b: "NAO", criterio_c: "SIM",
  acesso_controlado: "SIM", ventilacao_adequada: "NAO",
  monitoramento_atmosferico: "SIM", procedimento_emergencia: "NAO",
};
const DADOS = { id_local: 40, ...RESPOSTAS, observacoes: "Observação simulada" };
const CRIACAO = { ...DADOS, status: "PENDENTE" };
const CHECKLIST = { ...CRIACAO, id_checklist: 50, id_usuario: 10 };
const METODOS = [
  "criarNoAmbiente", "listarPermitidosNoAmbiente", "buscarPermitidoPorIdNoAmbiente",
  "atualizarNoAmbiente", "atualizarStatusNoAmbiente", "buscarPorLocalEAmbiente",
];
const IDS_INVALIDOS = [
  undefined, null, "", "   ", "id-invalido", 0, -1, 1.5,
  NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, true, false, {}, [], [40],
];

function simularRepositorio(t, respostas = {}) {
  const guardas = [];
  function bloquear(objeto, metodo) {
    guardas.push(t.mock.method(objeto, metodo, async () => {
      throw new Error(`Chamada proibida neste teste: ${metodo}`);
    }));
  }
  bloquear(pool, "query");
  bloquear(pool, "connect");
  for (const objeto of [checklistLegado, localLegado, campanhaLegado]) {
    for (const metodo of Object.keys(objeto)) {
      if (typeof objeto[metodo] === "function") bloquear(objeto, metodo);
    }
  }
  t.after(() => {
    for (const guarda of guardas) assert.equal(guarda.mock.callCount(), 0);
  });

  return Object.fromEntries(METODOS.map((metodo) => [
    metodo,
    t.mock.method(repository, metodo, async (...argumentos) => {
      if (!Object.hasOwn(respostas, metodo)) {
        throw new Error(`Consulta multi-tenant inesperada: ${metodo}`);
      }
      const resposta = respostas[metodo];
      return typeof resposta === "function" ? resposta(...argumentos) : resposta;
    }),
  ]));
}

function semChamadas(mocks) {
  for (const mock of Object.values(mocks)) assert.equal(mock.mock.callCount(), 0);
}

function unica(mock) {
  assert.equal(mock.mock.callCount(), 1);
  return mock.mock.calls[0].arguments;
}

function operacoes(usuario) {
  return [
    () => service.criarChecklist(DADOS, usuario),
    () => service.listarChecklists(usuario),
    () => service.buscarChecklistPorId(50, usuario),
    () => service.atualizarChecklist(50, { criterio_a: "NAO" }, usuario),
    () => service.alterarStatusChecklist(50, { status: "CONCLUIDO" }, usuario),
  ];
}

test("Recusa ausência de identidade nas cinco funções com HTTP 401", async (t) => {
  const mocks = simularRepositorio(t);
  for (const usuario of [undefined, null]) {
    for (const executar of operacoes(usuario)) {
      await assert.rejects(executar, { statusCode: 401 });
    }
  }
  semChamadas(mocks);
});

test("Recusa identificador de usuário inválido com HTTP 401", async (t) => {
  const mocks = simularRepositorio(t);
  for (const id_usuario of IDS_INVALIDOS) {
    for (const executar of operacoes({ ...USUARIO_A, id_usuario })) {
      await assert.rejects(executar, { statusCode: 401 });
    }
  }
  for (const usuario of [[], {}, "usuario", 123, true]) {
    for (const executar of operacoes(usuario)) {
      await assert.rejects(executar, { statusCode: 401 });
    }
  }
  semChamadas(mocks);
});

test("Recusa UUID de ambiente inválido com HTTP 401", async (t) => {
  const mocks = simularRepositorio(t);
  for (const id_ambiente of [undefined, null, "", 123, "ambiente-invalido", "11111111-1111-4111-8111-11111111111Z"]) {
    for (const executar of operacoes({ ...USUARIO_A, id_ambiente })) {
      await assert.rejects(executar, { statusCode: 401 });
    }
  }
  semChamadas(mocks);
});

test("Recusa IDs de checklist e local inválidos com HTTP 400", async (t) => {
  const mocks = simularRepositorio(t);
  for (const id of IDS_INVALIDOS) {
    await assert.rejects(service.criarChecklist({ ...DADOS, id_local: id }, USUARIO_A), {
      statusCode: 400, message: "ID do local inválido.",
    });
    for (const executar of [
      () => service.buscarChecklistPorId(id, USUARIO_A),
      () => service.atualizarChecklist(id, {}, USUARIO_A),
      () => service.alterarStatusChecklist(id, { status: "PENDENTE" }, USUARIO_A),
    ]) {
      await assert.rejects(executar, { statusCode: 400, message: "ID do checklist inválido." });
    }
  }
  semChamadas(mocks);
});

test("Recusa dados ausentes, null, arrays e tipos inesperados nas escritas", async (t) => {
  const mocks = simularRepositorio(t);
  for (const dados of [undefined, null, [], [DADOS], "", "dados", 0, 123, true, false]) {
    for (const executar of [
      () => service.criarChecklist(dados, USUARIO_A),
      () => service.atualizarChecklist(50, dados, USUARIO_A),
      () => service.alterarStatusChecklist(50, dados, USUARIO_A),
    ]) {
      await assert.rejects(executar, { statusCode: 400, message: "Dados do checklist inválidos." });
    }
  }
  semChamadas(mocks);
});

test("Exige as sete respostas obrigatórias na criação", async (t) => {
  const mocks = simularRepositorio(t);
  for (const campo of CAMPOS) {
    for (const valor of [undefined, null]) {
      await assert.rejects(service.criarChecklist({ ...DADOS, [campo]: valor }, USUARIO_A), {
        statusCode: 400, message: `${campo} deve ser SIM ou NAO.`,
      });
    }
  }
  semChamadas(mocks);
});

test("Aceita somente SIM e NAO nas respostas de criação e atualização", async (t) => {
  const mocks = simularRepositorio(t, { criarNoAmbiente: CHECKLIST, atualizarNoAmbiente: CHECKLIST });
  for (const campo of CAMPOS) {
    for (const valor of ["", "sim", "NÃO", "SIM ", true, 1, [], {}]) {
      await assert.rejects(service.criarChecklist({ ...DADOS, [campo]: valor }, USUARIO_A), { statusCode: 400 });
      await assert.rejects(service.atualizarChecklist(50, { [campo]: valor }, USUARIO_A), { statusCode: 400 });
    }
  }
  semChamadas(mocks);
  for (const [indice, valor] of ["SIM", "NAO"].entries()) {
    const respostas = Object.fromEntries(CAMPOS.map((campo) => [campo, valor]));
    await service.criarChecklist({ ...DADOS, ...respostas }, USUARIO_A);
    await service.atualizarChecklist(50, respostas, USUARIO_A);
    assert.deepEqual(mocks.atualizarNoAmbiente.mock.calls[indice].arguments, [50, respostas, USUARIO_A, { bloquearAutorizacao: true }]);
    for (const campo of CAMPOS) {
      assert.equal(mocks.criarNoAmbiente.mock.calls[indice].arguments[0][campo], valor);
    }
  }
  assert.equal(mocks.criarNoAmbiente.mock.callCount(), 2);
  assert.equal(mocks.atualizarNoAmbiente.mock.callCount(), 2);
});

test("Valida observações textuais, rejeita tipos incorretos e preserva omitidas ou null", async (t) => {
  const mocks = simularRepositorio(t, { criarNoAmbiente: CHECKLIST, atualizarNoAmbiente: CHECKLIST });
  for (const observacoes of [0, 123, true, false, [], {}]) {
    await assert.rejects(service.criarChecklist({ ...DADOS, observacoes }, USUARIO_A), { statusCode: 400 });
    await assert.rejects(service.atualizarChecklist(50, { observacoes }, USUARIO_A), { statusCode: 400 });
  }
  semChamadas(mocks);
  for (const [indice, observacoes] of [undefined, null, "Texto", "   "].entries()) {
    await service.criarChecklist({ ...DADOS, observacoes }, USUARIO_A);
    await service.atualizarChecklist(50, { observacoes }, USUARIO_A);
    const camposCriacao = mocks.criarNoAmbiente.mock.calls[indice].arguments[0];
    const camposAtualizacao = mocks.atualizarNoAmbiente.mock.calls[indice].arguments[1];
    for (const campos of [camposCriacao, camposAtualizacao]) {
      if (observacoes == null) assert.equal(Object.hasOwn(campos, "observacoes"), false);
      else assert.equal(campos.observacoes, observacoes);
    }
  }
  assert.equal(mocks.criarNoAmbiente.mock.callCount(), 4);
  assert.equal(mocks.atualizarNoAmbiente.mock.callCount(), 4);
});

test("Utiliza PENDENTE como status inicial padrão", async (t) => {
  const mocks = simularRepositorio(t, { criarNoAmbiente: CHECKLIST });
  await service.criarChecklist(DADOS, USUARIO_A);
  assert.deepEqual(unica(mocks.criarNoAmbiente), [CRIACAO, USUARIO_A, { bloquearAutorizacao: true }]);
});

test("Aceita somente PENDENTE e CONCLUIDO como status", async (t) => {
  const mocks = simularRepositorio(t, {
    criarNoAmbiente: (dados) => ({ ...CHECKLIST, status: dados.status }),
    atualizarStatusNoAmbiente: (_id, status) => ({ ...CHECKLIST, status }),
  });
  for (const status of [null, "", "ATIVO", "CONCLUIDA", "pendente", "PENDENTE ", 1, false, [], {}]) {
    await assert.rejects(service.criarChecklist({ ...DADOS, status }, USUARIO_A), { statusCode: 400 });
    await assert.rejects(service.alterarStatusChecklist(50, { status }, USUARIO_A), { statusCode: 400 });
  }
  await assert.rejects(service.alterarStatusChecklist(50, {}, USUARIO_A), { statusCode: 400 });
  semChamadas(mocks);
  for (const [indice, status] of ["PENDENTE", "CONCLUIDO"].entries()) {
    assert.deepEqual(await service.criarChecklist({ ...DADOS, status }, USUARIO_A), { ...CHECKLIST, status });
    assert.deepEqual(await service.alterarStatusChecklist(50, { status }, USUARIO_A), { ...CHECKLIST, status });
    assert.equal(mocks.criarNoAmbiente.mock.calls[indice].arguments[0].status, status);
    assert.deepEqual(mocks.atualizarStatusNoAmbiente.mock.calls[indice].arguments, [50, status, USUARIO_A, { bloquearAutorizacao: true }]);
  }
  assert.equal(mocks.criarNoAmbiente.mock.callCount(), 2);
  assert.equal(mocks.atualizarStatusNoAmbiente.mock.callCount(), 2);
});

test("Cria checklist usando exclusivamente identidade autenticada e IDs normalizados", async (t) => {
  const mocks = simularRepositorio(t, { criarNoAmbiente: CHECKLIST });
  const resultado = await service.criarChecklist({ ...DADOS, id_local: "40" }, { ...USUARIO_A, id_usuario: "10" });
  assert.deepEqual(resultado, CHECKLIST);
  assert.deepEqual(unica(mocks.criarNoAmbiente), [CRIACAO, USUARIO_A, { bloquearAutorizacao: true }]);
});

test("Ignora usuário, ambiente e perfil forjados no corpo das três escritas", async (t) => {
  const mocks = simularRepositorio(t, {
    criarNoAmbiente: CHECKLIST, atualizarNoAmbiente: CHECKLIST, atualizarStatusNoAmbiente: CHECKLIST,
  });
  const dados = {
    ...DADOS, status: "CONCLUIDO", id_usuario: 999, id_ambiente: AMBIENTE_B,
    eh_fundador: true, perfil_acesso: "ADMINISTRADOR", idUsuario: 999, idAmbiente: AMBIENTE_B,
  };
  await service.criarChecklist(dados, USUARIO_A);
  await service.atualizarChecklist(50, dados, USUARIO_A);
  await service.alterarStatusChecklist(50, dados, USUARIO_A);
  assert.deepEqual(unica(mocks.criarNoAmbiente), [{ ...CRIACAO, status: "CONCLUIDO" }, USUARIO_A, { bloquearAutorizacao: true }]);
  assert.deepEqual(unica(mocks.atualizarNoAmbiente), [50, { ...RESPOSTAS, observacoes: DADOS.observacoes }, USUARIO_A, { bloquearAutorizacao: true }]);
  assert.deepEqual(unica(mocks.atualizarStatusNoAmbiente), [50, "CONCLUIDO", USUARIO_A, { bloquearAutorizacao: true }]);
});

test("Lista checklists exclusivamente pelo ambiente autenticado", async (t) => {
  const mocks = simularRepositorio(t, { listarPermitidosNoAmbiente: [CHECKLIST] });
  assert.deepEqual(await service.listarChecklists(USUARIO_A), [CHECKLIST]);
  assert.deepEqual(unica(mocks.listarPermitidosNoAmbiente), [USUARIO_A]);
});

test("Busca checklist pelo ID e ambiente autenticado", async (t) => {
  const mocks = simularRepositorio(t, { buscarPermitidoPorIdNoAmbiente: CHECKLIST });
  assert.deepEqual(await service.buscarChecklistPorId("50", USUARIO_A), CHECKLIST);
  assert.deepEqual(unica(mocks.buscarPermitidoPorIdNoAmbiente), [50, USUARIO_A]);
});

test("Retorna HTTP 404 para checklist inexistente ou externo ao ambiente", async (t) => {
  const mocks = simularRepositorio(t, { buscarPermitidoPorIdNoAmbiente: null });
  for (const [indice, usuario] of [USUARIO_A, USUARIO_B].entries()) {
    await assert.rejects(service.buscarChecklistPorId(50, usuario), {
      statusCode: 404, message: "Checklist não encontrado.",
    });
    assert.deepEqual(mocks.buscarPermitidoPorIdNoAmbiente.mock.calls[indice].arguments, [50, usuario]);
  }
  assert.equal(mocks.buscarPermitidoPorIdNoAmbiente.mock.callCount(), 2);
});

test("Atualiza parcialmente sem encaminhar respostas omitidas ou null e sem leitura prévia", async (t) => {
  const mocks = simularRepositorio(t, { atualizarNoAmbiente: CHECKLIST });
  const casos = [
    [{}, {}],
    [Object.fromEntries(CAMPOS.map((campo) => [campo, null])), {}],
    [{ criterio_a: "NAO", criterio_b: null, criterio_c: undefined }, { criterio_a: "NAO" }],
  ];
  for (const [indice, [dados, esperado]] of casos.entries()) {
    assert.deepEqual(await service.atualizarChecklist(50, dados, USUARIO_A), CHECKLIST);
    assert.deepEqual(mocks.atualizarNoAmbiente.mock.calls[indice].arguments, [50, esperado, USUARIO_A, { bloquearAutorizacao: true }]);
  }
  assert.equal(mocks.atualizarNoAmbiente.mock.callCount(), 3);
  assert.equal(mocks.buscarPermitidoPorIdNoAmbiente.mock.callCount(), 0);
  assert.equal(mocks.buscarPorLocalEAmbiente.mock.callCount(), 0);
});

test("Encaminha observações vazias para limpeza pelo repositório", async (t) => {
  const mocks = simularRepositorio(t, { criarNoAmbiente: CHECKLIST, atualizarNoAmbiente: CHECKLIST });
  await service.criarChecklist({ ...DADOS, observacoes: "" }, USUARIO_A);
  await service.atualizarChecklist(50, { observacoes: "" }, USUARIO_A);
  assert.equal(unica(mocks.criarNoAmbiente)[0].observacoes, "");
  assert.deepEqual(unica(mocks.atualizarNoAmbiente), [50, { observacoes: "" }, USUARIO_A, { bloquearAutorizacao: true }]);
});

test("PUT de respostas não encaminha alteração de id_local, id_usuario ou status", async (t) => {
  const mocks = simularRepositorio(t, { atualizarNoAmbiente: CHECKLIST });
  await service.atualizarChecklist("50", {
    criterio_a: "NAO", id_local: 999, id_usuario: 999, status: "CONCLUIDO",
    id_ambiente: AMBIENTE_B, eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
  }, USUARIO_A);
  assert.deepEqual(unica(mocks.atualizarNoAmbiente), [50, { criterio_a: "NAO" }, USUARIO_A, { bloquearAutorizacao: true }]);
  assert.equal(mocks.atualizarStatusNoAmbiente.mock.callCount(), 0);
});

test("Retorna HTTP 404 quando atualização não é autorizada", async (t) => {
  const mocks = simularRepositorio(t, { atualizarNoAmbiente: null });
  await assert.rejects(service.atualizarChecklist(50, { criterio_a: "NAO" }, USUARIO_A), {
    statusCode: 404, message: "Checklist não encontrado.",
  });
  assert.deepEqual(unica(mocks.atualizarNoAmbiente), [50, { criterio_a: "NAO" }, USUARIO_A, { bloquearAutorizacao: true }]);
});

test("Altera status utilizando a identidade autenticada", async (t) => {
  const atualizado = { ...CHECKLIST, status: "CONCLUIDO" };
  const mocks = simularRepositorio(t, { atualizarStatusNoAmbiente: atualizado });
  assert.deepEqual(await service.alterarStatusChecklist("50", { status: "CONCLUIDO" }, USUARIO_A), atualizado);
  assert.deepEqual(unica(mocks.atualizarStatusNoAmbiente), [50, "CONCLUIDO", USUARIO_A, { bloquearAutorizacao: true }]);
  assert.equal(mocks.buscarPermitidoPorIdNoAmbiente.mock.callCount(), 0);
});

test("Retorna HTTP 404 quando alteração de status não é autorizada", async (t) => {
  const mocks = simularRepositorio(t, { atualizarStatusNoAmbiente: null });
  await assert.rejects(service.alterarStatusChecklist(50, { status: "CONCLUIDO" }, USUARIO_A), {
    statusCode: 404, message: "Checklist não encontrado.",
  });
  assert.deepEqual(unica(mocks.atualizarStatusNoAmbiente), [50, "CONCLUIDO", USUARIO_A, { bloquearAutorizacao: true }]);
});

test("Retorna HTTP 404 quando criação não encontra local autorizado", async (t) => {
  const mocks = simularRepositorio(t, { criarNoAmbiente: null });
  await assert.rejects(service.criarChecklist(DADOS, USUARIO_A), {
    statusCode: 404, message: "Local não encontrado.",
  });
  assert.deepEqual(unica(mocks.criarNoAmbiente), [CRIACAO, USUARIO_A, { bloquearAutorizacao: true }]);
  assert.equal(mocks.buscarPorLocalEAmbiente.mock.callCount(), 0);
});

test("Preserva HTTP 409 e a mesma instância do conflito identificado pelo repositório", async (t) => {
  const erro = new Error("Este local já possui um checklist NR-33.");
  erro.statusCode = 409;
  const mocks = simularRepositorio(t, { criarNoAmbiente: async () => { throw erro; } });
  await assert.rejects(service.criarChecklist(DADOS, USUARIO_A), (recebido) => {
    assert.strictEqual(recebido, erro);
    assert.equal(recebido.statusCode, 409);
    return true;
  });
  assert.deepEqual(unica(mocks.criarNoAmbiente), [CRIACAO, USUARIO_A, { bloquearAutorizacao: true }]);
  assert.equal(mocks.buscarPorLocalEAmbiente.mock.callCount(), 0);
});

test("Não consulta duplicidade antes de tentar a criação autorizada no repositório", async (t) => {
  const mocks = simularRepositorio(t, { criarNoAmbiente: CHECKLIST });
  assert.deepEqual(await service.criarChecklist(DADOS, USUARIO_A), CHECKLIST);
  assert.equal(mocks.criarNoAmbiente.mock.callCount(), 1);
  for (const metodo of METODOS.filter((nome) => nome !== "criarNoAmbiente")) {
    assert.equal(mocks[metodo].mock.callCount(), 0);
  }
});

test("Encaminha parâmetros dos ambientes A e B sem usar identidade forjada", async (t) => {
  const respostas = Object.fromEntries(METODOS.slice(0, 5).map((metodo) => [
    metodo, metodo === "listarPermitidosNoAmbiente" ? [CHECKLIST] : CHECKLIST,
  ]));
  const mocks = simularRepositorio(t, respostas);
  for (const [indice, usuario] of [USUARIO_A, USUARIO_B].entries()) {
    const dados = {
      ...DADOS, id_usuario: 999, id_ambiente: indice === 0 ? AMBIENTE_B : AMBIENTE_A,
      eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
    };
    await service.criarChecklist(dados, usuario);
    await service.listarChecklists(usuario);
    await service.buscarChecklistPorId(50, usuario);
    await service.atualizarChecklist(50, { ...dados, criterio_a: "NAO" }, usuario);
    await service.alterarStatusChecklist(50, { ...dados, status: "CONCLUIDO" }, usuario);
    const esperados = {
      criarNoAmbiente: [CRIACAO, usuario, { bloquearAutorizacao: true }],
      listarPermitidosNoAmbiente: [usuario],
      buscarPermitidoPorIdNoAmbiente: [50, usuario],
      atualizarNoAmbiente: [50, { ...RESPOSTAS, criterio_a: "NAO", observacoes: DADOS.observacoes }, usuario, { bloquearAutorizacao: true }],
      atualizarStatusNoAmbiente: [50, "CONCLUIDO", usuario, { bloquearAutorizacao: true }],
    };
    for (const metodo of METODOS.slice(0, 5)) {
      assert.equal(mocks[metodo].mock.callCount(), indice + 1);
      assert.deepEqual(mocks[metodo].mock.calls[indice].arguments, esperados[metodo]);
    }
  }
  assert.equal(mocks.buscarPorLocalEAmbiente.mock.callCount(), 0);
});

test("Propaga erros internos inesperados nas cinco funções sem converter em 404 ou 409", async (t) => {
  const erros = {};
  const respostas = {};
  for (const metodo of METODOS.slice(0, 5)) {
    const erro = new Error(`Falha interna simulada: ${metodo}`);
    erro.statusCode = 500;
    erros[metodo] = erro;
    respostas[metodo] = async () => { throw erro; };
  }
  const mocks = simularRepositorio(t, respostas);
  for (const [indice, executar] of operacoes(USUARIO_A).entries()) {
    const metodo = METODOS[indice];
    await assert.rejects(executar, (recebido) => {
      assert.strictEqual(recebido, erros[metodo]);
      assert.equal(recebido.statusCode, 500);
      return true;
    });
    assert.equal(mocks[metodo].mock.callCount(), 1);
  }
});

test("As cinco funções não utilizam repositórios legados nem acesso direto ao banco", async (t) => {
  const respostas = Object.fromEntries(METODOS.slice(0, 5).map((metodo) => [
    metodo, metodo === "listarPermitidosNoAmbiente" ? [] : CHECKLIST,
  ]));
  const mocks = simularRepositorio(t, respostas);
  for (const executar of operacoes(USUARIO_A)) await executar();
  for (const metodo of METODOS.slice(0, 5)) assert.equal(mocks[metodo].mock.callCount(), 1);
  assert.equal(mocks.buscarPorLocalEAmbiente.mock.callCount(), 0);
  // O encerramento verifica que nenhuma guarda de SQL/conexão/legado foi chamada.
});
