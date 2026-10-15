const test = require("node:test");
const assert = require("node:assert/strict");
const repository = require("../src/repositories/localMultiTenantRepository");
const service = require("../src/services/localMultiTenantService");

const AMBIENTE_A = "11111111-1111-4111-8111-111111111111";
const AMBIENTE_B = "22222222-2222-4222-8222-222222222222";
const USUARIO_A = { id_usuario: 10, id_ambiente: AMBIENTE_A };
const USUARIO_B = { id_usuario: 20, id_ambiente: AMBIENTE_B };
const DADOS = {
  nome_local: "  Tanque A  ",
  setor: "  Setor A  ",
  descricao: "  Descrição A  ",
  endereco: "  Endereço A  ",
  latitude: "-23.5",
  longitude: "-46.6",
  id_campanha: 30,
};
const CAMPOS = {
  nomeLocal: "Tanque A",
  setor: "Setor A",
  descricao: "Descrição A",
  endereco: "Endereço A",
  latitude: -23.5,
  longitude: -46.6,
};
const LOCAL = { id_local: 40, id_campanha: 30, nome_local: "Tanque A", status: "ATIVO" };
const METODOS = [
  "criarNoAmbiente", "listarPorAmbiente", "buscarPorIdEAmbiente",
  "atualizarNoAmbiente", "atualizarStatusNoAmbiente", "listarParaExportacaoPorAmbiente",
];
const IDS_INVALIDOS = [
  undefined, null, "", "   ", "id-invalido", 0, -1, 1.5,
  NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, true, false, {}, [], [30],
];

// Todas as funções do repositório são substituídas antes de chamar o serviço.
// Nenhum mock encaminha consultas ao PostgreSQL.
function simularRepositorio(t, respostas = {}) {
  return Object.fromEntries(METODOS.map((metodo) => [
    metodo,
    t.mock.method(repository, metodo, async (...argumentos) => {
      if (!Object.hasOwn(respostas, metodo)) {
        throw new Error(`Chamada inesperada: ${metodo}`);
      }
      const resposta = respostas[metodo];
      return typeof resposta === "function" ? resposta(...argumentos) : resposta;
    }),
  ]));
}

function semChamadas(mocks) {
  for (const mock of Object.values(mocks)) {
    assert.equal(mock.mock.callCount(), 0);
  }
}

function argumentosUnicos(mock) {
  assert.equal(mock.mock.callCount(), 1);
  return mock.mock.calls[0].arguments;
}

function operacoes(usuario) {
  return [
    () => service.criarLocal(DADOS, usuario),
    () => service.listarLocais(usuario),
    () => service.buscarLocalPorId(40, usuario),
    () => service.atualizarLocal(40, DADOS, usuario),
    () => service.alterarStatusLocal(40, { status: "INATIVO" }, usuario),
    () => service.listarLocaisParaExportacao(usuario),
  ];
}

test("Recusa ausência de identidade nas seis operações com HTTP 401", async (t) => {
  const mocks = simularRepositorio(t);
  for (const usuario of [undefined, null]) {
    for (const executar of operacoes(usuario)) {
      await assert.rejects(executar, { statusCode: 401 });
    }
  }
  semChamadas(mocks);
});

test("Recusa ID de usuário inválido nas seis operações com HTTP 401", async (t) => {
  const mocks = simularRepositorio(t);
  for (const id_usuario of IDS_INVALIDOS) {
    for (const executar of operacoes({ ...USUARIO_A, id_usuario })) {
      await assert.rejects(executar, { statusCode: 401 });
    }
  }
  for (const usuario of [[], "usuario", 123, true, {}]) {
    for (const executar of operacoes(usuario)) {
      await assert.rejects(executar, { statusCode: 401 });
    }
  }
  semChamadas(mocks);
});

test("Recusa UUID de ambiente inválido nas seis operações com HTTP 401", async (t) => {
  const mocks = simularRepositorio(t);
  for (const id_ambiente of [undefined, null, "", 123, "ambiente-invalido", "11111111-1111-4111-8111-11111111111Z"]) {
    for (const executar of operacoes({ ...USUARIO_A, id_ambiente })) {
      await assert.rejects(executar, { statusCode: 401 });
    }
  }
  semChamadas(mocks);
});

test("Recusa IDs de local e campanha inválidos com HTTP 400 sem chamar o repositório", async (t) => {
  const mocks = simularRepositorio(t);
  for (const id of IDS_INVALIDOS) {
    await assert.rejects(
      service.criarLocal({ ...DADOS, id_campanha: id }, USUARIO_A),
      { statusCode: 400, message: "ID da campanha inválido." }
    );
    for (const executar of [
      () => service.buscarLocalPorId(id, USUARIO_A),
      () => service.atualizarLocal(id, DADOS, USUARIO_A),
      () => service.alterarStatusLocal(id, { status: "ATIVO" }, USUARIO_A),
    ]) {
      await assert.rejects(executar, { statusCode: 400, message: "ID do local inválido." });
    }
  }
  semChamadas(mocks);
});

test("Recusa dados ausentes, null, arrays e primitivos nas três escritas", async (t) => {
  const mocks = simularRepositorio(t);
  for (const dados of [undefined, null, [], [DADOS], "", "dados", 0, 123, true, false]) {
    for (const executar of [
      () => service.criarLocal(dados, USUARIO_A),
      () => service.atualizarLocal(40, dados, USUARIO_A),
      () => service.alterarStatusLocal(40, dados, USUARIO_A),
    ]) {
      await assert.rejects(executar, { statusCode: 400, message: "Dados do local inválidos." });
    }
  }
  semChamadas(mocks);
});

test("Valida nome obrigatório e seu tipo na criação e atualização", async (t) => {
  const mocks = simularRepositorio(t);
  for (const nome_local of [undefined, null, "", "   ", 123, false, [], {}]) {
    const dados = { ...DADOS, nome_local };
    for (const executar of [
      () => service.criarLocal(dados, USUARIO_A),
      () => service.atualizarLocal(40, dados, USUARIO_A),
    ]) {
      await assert.rejects(executar, { statusCode: 400, message: "O nome do local é obrigatório." });
    }
  }
  semChamadas(mocks);
});

test("Preserva entrada nome_local e normaliza espaços sem aceitar nomeLocal como substituto", async (t) => {
  const mocks = simularRepositorio(t, { criarNoAmbiente: LOCAL, atualizarNoAmbiente: LOCAL });
  await service.criarLocal(DADOS, USUARIO_A);
  await service.atualizarLocal(40, DADOS, USUARIO_A);
  assert.deepEqual(argumentosUnicos(mocks.criarNoAmbiente), [
    { ...CAMPOS, status: "ATIVO", idCampanha: 30 }, USUARIO_A,
  ]);
  assert.deepEqual(argumentosUnicos(mocks.atualizarNoAmbiente), [40, CAMPOS, USUARIO_A]);

  const dados = { ...DADOS, nomeLocal: "Nome camelCase" };
  delete dados.nome_local;
  await assert.rejects(service.criarLocal(dados, USUARIO_A), { statusCode: 400 });
  await assert.rejects(service.atualizarLocal(40, dados, USUARIO_A), { statusCode: 400 });
  assert.equal(mocks.criarNoAmbiente.mock.callCount(), 1);
  assert.equal(mocks.atualizarNoAmbiente.mock.callCount(), 1);
});

test("Normaliza campos opcionais para null ou texto e rejeita tipos inesperados", async (t) => {
  const mocks = simularRepositorio(t, { criarNoAmbiente: LOCAL, atualizarNoAmbiente: LOCAL });
  for (const campo of ["setor", "descricao", "endereco"]) {
    for (const valor of [0, 123, false, true, [], {}]) {
      const dados = { ...DADOS, [campo]: valor };
      await assert.rejects(service.criarLocal(dados, USUARIO_A), { statusCode: 400 });
      await assert.rejects(service.atualizarLocal(40, dados, USUARIO_A), { statusCode: 400 });
    }
  }
  semChamadas(mocks);

  for (const [indice, valor] of [undefined, null, "", "   "].entries()) {
    await service.criarLocal({ ...DADOS, setor: valor, descricao: valor, endereco: valor }, USUARIO_A);
    await service.atualizarLocal(40, { ...DADOS, setor: valor, descricao: valor, endereco: valor }, USUARIO_A);
    const camposCriacao = mocks.criarNoAmbiente.mock.calls[indice].arguments[0];
    const camposAtualizacao = mocks.atualizarNoAmbiente.mock.calls[indice].arguments[1];
    for (const campo of ["setor", "descricao", "endereco"]) {
      assert.equal(camposCriacao[campo], null);
      assert.equal(camposAtualizacao[campo], null);
    }
  }
  assert.equal(mocks.criarNoAmbiente.mock.callCount(), 4);
  assert.equal(mocks.atualizarNoAmbiente.mock.callCount(), 4);
});

test("Converte coordenadas em texto para números finitos e preserva zero", async (t) => {
  const mocks = simularRepositorio(t, { criarNoAmbiente: LOCAL, atualizarNoAmbiente: LOCAL });
  for (const [indice, valor] of ["-23.5", " 12.25 ", "0", 0, -46.6].entries()) {
    const dados = { ...DADOS, latitude: valor, longitude: valor };
    await service.criarLocal(dados, USUARIO_A);
    await service.atualizarLocal(40, dados, USUARIO_A);
    for (const campos of [
      mocks.criarNoAmbiente.mock.calls[indice].arguments[0],
      mocks.atualizarNoAmbiente.mock.calls[indice].arguments[1],
    ]) {
      assert.equal(campos.latitude, Number(valor));
      assert.equal(campos.longitude, Number(valor));
      assert.ok(Number.isFinite(campos.latitude));
      assert.ok(Number.isFinite(campos.longitude));
    }
  }
  assert.equal(mocks.criarNoAmbiente.mock.callCount(), 5);
  assert.equal(mocks.atualizarNoAmbiente.mock.callCount(), 5);
});

test("Rejeita coordenadas inválidas e normaliza coordenadas opcionais vazias", async (t) => {
  const mocks = simularRepositorio(t, { criarNoAmbiente: LOCAL, atualizarNoAmbiente: LOCAL });
  for (const campo of ["latitude", "longitude"]) {
    for (const valor of ["coordenada-invalida", "Infinity", NaN, Infinity, -Infinity, true, false, [], {}]) {
      const dados = { ...DADOS, [campo]: valor };
      await assert.rejects(service.criarLocal(dados, USUARIO_A), { statusCode: 400 });
      await assert.rejects(service.atualizarLocal(40, dados, USUARIO_A), { statusCode: 400 });
    }
  }
  semChamadas(mocks);

  for (const [indice, valor] of [undefined, null, "", "   "].entries()) {
    const dados = { ...DADOS, latitude: valor, longitude: valor };
    await service.criarLocal(dados, USUARIO_A);
    await service.atualizarLocal(40, dados, USUARIO_A);
    for (const campos of [
      mocks.criarNoAmbiente.mock.calls[indice].arguments[0],
      mocks.atualizarNoAmbiente.mock.calls[indice].arguments[1],
    ]) {
      assert.equal(campos.latitude, null);
      assert.equal(campos.longitude, null);
    }
  }
});

test("Utiliza ATIVO como status inicial padrão", async (t) => {
  const mocks = simularRepositorio(t, { criarNoAmbiente: LOCAL });
  await service.criarLocal(DADOS, USUARIO_A);
  assert.equal(argumentosUnicos(mocks.criarNoAmbiente)[0].status, "ATIVO");
});

test("Aceita somente ATIVO e INATIVO na criação e alteração de status", async (t) => {
  const mocks = simularRepositorio(t, {
    criarNoAmbiente: (dados) => ({ ...LOCAL, status: dados.status }),
    atualizarStatusNoAmbiente: (_id, status) => ({ ...LOCAL, status }),
  });
  for (const status of [null, "", "ATIVA", "EM ANDAMENTO", "ativo", "ATIVO ", 1, false, [], {}]) {
    await assert.rejects(service.criarLocal({ ...DADOS, status }, USUARIO_A), { statusCode: 400 });
    await assert.rejects(service.alterarStatusLocal(40, { status }, USUARIO_A), { statusCode: 400 });
  }
  await assert.rejects(service.alterarStatusLocal(40, {}, USUARIO_A), { statusCode: 400 });
  semChamadas(mocks);

  for (const [indice, status] of ["ATIVO", "INATIVO"].entries()) {
    assert.deepEqual(await service.criarLocal({ ...DADOS, status }, USUARIO_A), { ...LOCAL, status });
    assert.deepEqual(await service.alterarStatusLocal(40, { status }, USUARIO_A), { ...LOCAL, status });
    assert.equal(mocks.criarNoAmbiente.mock.calls[indice].arguments[0].status, status);
    assert.deepEqual(mocks.atualizarStatusNoAmbiente.mock.calls[indice].arguments, [40, status, USUARIO_A]);
  }
  assert.equal(mocks.criarNoAmbiente.mock.callCount(), 2);
  assert.equal(mocks.atualizarStatusNoAmbiente.mock.callCount(), 2);
});

test("Cria local encaminhando somente os campos permitidos e a identidade autenticada", async (t) => {
  const mocks = simularRepositorio(t, { criarNoAmbiente: LOCAL });
  const resultado = await service.criarLocal(DADOS, { ...USUARIO_A, id_usuario: "10" });
  assert.deepEqual(resultado, LOCAL);
  assert.deepEqual(argumentosUnicos(mocks.criarNoAmbiente), [
    { ...CAMPOS, status: "ATIVO", idCampanha: 30 }, USUARIO_A,
  ]);
});

test("Ignora usuário, ambiente e perfil forjados no corpo das três escritas", async (t) => {
  const mocks = simularRepositorio(t, {
    criarNoAmbiente: LOCAL, atualizarNoAmbiente: LOCAL, atualizarStatusNoAmbiente: LOCAL,
  });
  const dados = {
    ...DADOS, status: "INATIVO", id_usuario: 999, id_ambiente: AMBIENTE_B,
    perfil_acesso: "ADMINISTRADOR", idUsuario: 999, idAmbiente: AMBIENTE_B,
  };
  await service.criarLocal(dados, USUARIO_A);
  await service.atualizarLocal(40, dados, USUARIO_A);
  await service.alterarStatusLocal(40, dados, USUARIO_A);
  assert.deepEqual(argumentosUnicos(mocks.criarNoAmbiente), [
    { ...CAMPOS, status: "INATIVO", idCampanha: 30 }, USUARIO_A,
  ]);
  assert.deepEqual(argumentosUnicos(mocks.atualizarNoAmbiente), [40, CAMPOS, USUARIO_A]);
  assert.deepEqual(argumentosUnicos(mocks.atualizarStatusNoAmbiente), [40, "INATIVO", USUARIO_A]);
});

test("Lista locais exclusivamente pelo ambiente autenticado", async (t) => {
  const mocks = simularRepositorio(t, { listarPorAmbiente: [LOCAL] });
  assert.deepEqual(await service.listarLocais(USUARIO_A), [LOCAL]);
  assert.deepEqual(argumentosUnicos(mocks.listarPorAmbiente), [AMBIENTE_A]);
});

test("Busca local pelo ID normalizado e ambiente autenticado", async (t) => {
  const mocks = simularRepositorio(t, { buscarPorIdEAmbiente: LOCAL });
  assert.deepEqual(await service.buscarLocalPorId("40", USUARIO_A), LOCAL);
  assert.deepEqual(argumentosUnicos(mocks.buscarPorIdEAmbiente), [40, AMBIENTE_A]);
});

test("Retorna HTTP 404 para local inexistente ou externo ao ambiente", async (t) => {
  const mocks = simularRepositorio(t, { buscarPorIdEAmbiente: null });
  for (const [indice, usuario] of [USUARIO_A, USUARIO_B].entries()) {
    await assert.rejects(service.buscarLocalPorId(40, usuario), {
      statusCode: 404, message: "Local não encontrado.",
    });
    assert.deepEqual(mocks.buscarPorIdEAmbiente.mock.calls[indice].arguments, [40, usuario.id_ambiente]);
  }
  assert.equal(mocks.buscarPorIdEAmbiente.mock.callCount(), 2);
});

test("Atualiza local sem permitir troca de campanha ou alteração de status pelo PUT", async (t) => {
  const mocks = simularRepositorio(t, { atualizarNoAmbiente: LOCAL });
  const resultado = await service.atualizarLocal("40", {
    ...DADOS, id_campanha: 999, idCampanha: 999, status: "INATIVO",
  }, USUARIO_A);
  assert.deepEqual(resultado, LOCAL);
  assert.deepEqual(argumentosUnicos(mocks.atualizarNoAmbiente), [40, CAMPOS, USUARIO_A]);
  assert.equal(mocks.buscarPorIdEAmbiente.mock.callCount(), 0);
});

test("Retorna HTTP 404 quando a atualização não é autorizada", async (t) => {
  const mocks = simularRepositorio(t, { atualizarNoAmbiente: null });
  await assert.rejects(service.atualizarLocal(40, DADOS, USUARIO_A), {
    statusCode: 404, message: "Local não encontrado.",
  });
  assert.deepEqual(argumentosUnicos(mocks.atualizarNoAmbiente), [40, CAMPOS, USUARIO_A]);
});

test("Altera status utilizando ID normalizado e identidade autenticada", async (t) => {
  const atualizado = { ...LOCAL, status: "INATIVO" };
  const mocks = simularRepositorio(t, { atualizarStatusNoAmbiente: atualizado });
  assert.deepEqual(await service.alterarStatusLocal("40", { status: "INATIVO" }, USUARIO_A), atualizado);
  assert.deepEqual(argumentosUnicos(mocks.atualizarStatusNoAmbiente), [40, "INATIVO", USUARIO_A]);
  assert.equal(mocks.buscarPorIdEAmbiente.mock.callCount(), 0);
});

test("Retorna HTTP 404 quando a alteração de status não é autorizada", async (t) => {
  const mocks = simularRepositorio(t, { atualizarStatusNoAmbiente: null });
  await assert.rejects(service.alterarStatusLocal(40, { status: "INATIVO" }, USUARIO_A), {
    statusCode: 404, message: "Local não encontrado.",
  });
  assert.deepEqual(argumentosUnicos(mocks.atualizarStatusNoAmbiente), [40, "INATIVO", USUARIO_A]);
});

test("Lista dados para exportação somente pelo ambiente autenticado", async (t) => {
  const registros = [{ id_local: 40, id_evidencia: null }];
  const mocks = simularRepositorio(t, { listarParaExportacaoPorAmbiente: registros });
  assert.deepEqual(await service.listarLocaisParaExportacao(USUARIO_A), registros);
  assert.deepEqual(argumentosUnicos(mocks.listarParaExportacaoPorAmbiente), [AMBIENTE_A]);
  assert.equal(mocks.listarPorAmbiente.mock.callCount(), 0);
});

test("Encaminha argumentos isolados para ambientes A e B nas seis operações", async (t) => {
  const respostas = Object.fromEntries(METODOS.map((metodo) => [
    metodo, metodo.startsWith("listar") ? [LOCAL] : LOCAL,
  ]));
  const mocks = simularRepositorio(t, respostas);
  for (const [indice, usuario] of [USUARIO_A, USUARIO_B].entries()) {
    const dados = {
      ...DADOS, id_ambiente: indice === 0 ? AMBIENTE_B : AMBIENTE_A,
      id_usuario: 999, perfil_acesso: "ADMINISTRADOR",
    };
    await service.criarLocal(dados, usuario);
    await service.listarLocais(usuario);
    await service.buscarLocalPorId(40, usuario);
    await service.atualizarLocal(40, dados, usuario);
    await service.alterarStatusLocal(40, { ...dados, status: "INATIVO" }, usuario);
    await service.listarLocaisParaExportacao(usuario);

    const esperados = {
      criarNoAmbiente: [{ ...CAMPOS, status: "ATIVO", idCampanha: 30 }, usuario],
      listarPorAmbiente: [usuario.id_ambiente],
      buscarPorIdEAmbiente: [40, usuario.id_ambiente],
      atualizarNoAmbiente: [40, CAMPOS, usuario],
      atualizarStatusNoAmbiente: [40, "INATIVO", usuario],
      listarParaExportacaoPorAmbiente: [usuario.id_ambiente],
    };
    for (const metodo of METODOS) {
      assert.equal(mocks[metodo].mock.callCount(), indice + 1);
      assert.deepEqual(mocks[metodo].mock.calls[indice].arguments, esperados[metodo]);
    }
  }
});

test("Propaga a mesma instância de erro interno nas seis operações", async (t) => {
  const erros = {};
  const respostas = {};
  for (const metodo of METODOS) {
    const erro = new Error(`Falha interna simulada: ${metodo}`);
    erro.statusCode = 500;
    erros[metodo] = erro;
    respostas[metodo] = async () => { throw erro; };
  }
  const mocks = simularRepositorio(t, respostas);
  for (const [indice, executar] of operacoes(USUARIO_A).entries()) {
    await assert.rejects(executar, (erro) => {
      assert.strictEqual(erro, erros[METODOS[indice]]);
      assert.equal(erro.statusCode, 500);
      return true;
    });
    assert.equal(mocks[METODOS[indice]].mock.callCount(), 1);
  }
});

test("Retorna HTTP 404 quando a campanha da criação não é encontrada ou autorizada", async (t) => {
  const mocks = simularRepositorio(t, { criarNoAmbiente: null });
  await assert.rejects(service.criarLocal(DADOS, USUARIO_A), {
    statusCode: 404, message: "Campanha não encontrada.",
  });
  assert.deepEqual(argumentosUnicos(mocks.criarNoAmbiente), [
    { ...CAMPOS, status: "ATIVO", idCampanha: 30 }, USUARIO_A,
  ]);
});
