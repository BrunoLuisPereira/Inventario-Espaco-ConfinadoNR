const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const fs = require("node:fs");

const METODOS = [
  "criarNoAmbiente", "listarPermitidasNoAmbiente", "buscarPorIdEAmbiente",
  "listarPorLocalEAmbiente", "buscarPorOperacaoClienteNoAmbiente",
  "atualizarNoAmbiente", "excluirNoAmbiente", "buscarLocalAutorizadoNoAmbiente",
];
// Substitui a dependência antes de carregar o serviço: não carrega o pool,
// sua configuração, dotenv, repositórios legados ou a aplicação principal.
const repository = Object.fromEntries(METODOS.map((nome) => [nome, async () => {
  throw new Error("Repositório não simulado: " + nome);
}]));
const caminhoService = require.resolve("../src/services/evidenciaMultiTenantService");
const moduloAnterior = require.cache[caminhoService];
const carregarOriginal = Module._load;
const importsService = [];
let service;
try {
  delete require.cache[caminhoService];
  Module._load = function (request, parent, ...resto) {
    if (parent && parent.filename === caminhoService) {
      importsService.push(request);
      if (request !== "../repositories/evidenciaMultiTenantRepository") {
        throw new Error("Dependência não autorizada do serviço: " + request);
      }
      return repository;
    }
    return carregarOriginal.call(this, request, parent, ...resto);
  };
  service = require(caminhoService);
} finally {
  Module._load = carregarOriginal;
  if (moduloAnterior) require.cache[caminhoService] = moduloAnterior;
  else delete require.cache[caminhoService];
}

const AMBIENTE_A = "11111111-1111-4111-8111-111111111111";
const AMBIENTE_B = "22222222-2222-4222-8222-222222222222";
const OPERACAO = "33333333-3333-4333-8333-333333333333";
const USUARIO_A = Object.freeze({ id_usuario: 10, id_ambiente: AMBIENTE_A });
const USUARIO_B = Object.freeze({ id_usuario: 20, id_ambiente: AMBIENTE_B });
const GPS = Object.freeze({
  latitude: "-23.1234567", longitude: "-46.7654321", precisao_gps: "3.20",
  origem_coordenadas: "GPS", data_captura_gps: "2026-10-15T12:34:56.123456Z",
});
const GPS_NULO = Object.freeze(Object.fromEntries(Object.keys(GPS).map((campo) => [campo, null])));
const DADOS = Object.freeze({
  id_local: 40, tipo: "FOTO", caminho_arquivo: "uploads/evidencias/legado.jpg", descricao: "Descrição",
});
const CRIACAO = Object.freeze({ ...DADOS, ...GPS_NULO, id_operacao_cliente: null });
const REGISTRO = Object.freeze({ ...DADOS, ...GPS, id_evidencia: 50, id_usuario: 10, id_operacao_cliente: OPERACAO });
const ATUAL = Object.freeze({ ...REGISTRO, estado_gps: GPS });
const IDS_INVALIDOS = [
  undefined, null, "", " ", "inválido", 0, -1, 1.5, NaN, Infinity,
  Number.MAX_SAFE_INTEGER + 1, true, false, {}, [], [40],
];

function simularRepositorio(t, respostas = {}) {
  const eventos = [];
  const acessoProibido = [];
  const carregar = Module._load;
  t.mock.method(Module, "_load", function (request, parent, ...resto) {
    if (parent && parent.filename === caminhoService) {
      if (request === "../repositories/evidenciaMultiTenantRepository") return repository;
      acessoProibido.push(request);
      throw new Error("Acesso direto a banco, legado ou arquivos proibido: " + request);
    }
    return carregar.call(this, request, parent, ...resto);
  });
  const mocks = Object.fromEntries(METODOS.map((nome) => [
    nome, t.mock.method(repository, nome, async (...args) => {
      eventos.push(nome);
      if (!Object.hasOwn(respostas, nome)) throw new Error("Chamada inesperada: " + nome);
      const resposta = respostas[nome];
      return typeof resposta === "function" ? resposta(...args) : resposta;
    }),
  ]));
  t.after(() => assert.deepEqual(acessoProibido, []));
  return { mocks, eventos };
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
    () => service.criarEvidencia(DADOS, usuario),
    () => service.listarEvidencias(usuario),
    () => service.buscarEvidenciaPorId(50, usuario),
    () => service.listarEvidenciasPorLocal(40, usuario),
    () => service.atualizarEvidencia(50, { descricao: "Nova" }, usuario),
    () => service.excluirEvidencia(50, usuario),
  ];
}

function respostasCriacao(extras = {}) {
  return {
    buscarLocalAutorizadoNoAmbiente: { id_local: 40 },
    criarNoAmbiente: (dados, usuario) => ({ ...dados, id_evidencia: 50, id_usuario: usuario.id_usuario }),
    ...extras,
  };
}

function respostasAtualizacao(extras = {}) {
  return {
    buscarPorIdEAmbiente: ATUAL,
    atualizarNoAmbiente: (_id, patch) => ({ ...REGISTRO, ...patch }),
    ...extras,
  };
}

function conflitoIdempotencia() {
  return Object.assign(new Error("Não foi possível processar esta chave de operação."), {
    statusCode: 409, code: "23505", constraint: "uq_evidencia_id_operacao_cliente",
  });
}

test("Recusa identidade ausente nas seis operações com HTTP 401 sem consultar repositório", async (t) => {
  const { mocks } = simularRepositorio(t);
  for (const usuario of [undefined, null, [], {}, 1, "usuário", true]) {
    for (const executar of operacoes(usuario)) await assert.rejects(executar, { statusCode: 401 });
  }
  semChamadas(mocks);
});

test("Recusa identificador de usuário inválido nas seis operações com HTTP 401", async (t) => {
  const { mocks } = simularRepositorio(t);
  for (const id_usuario of IDS_INVALIDOS) {
    for (const executar of operacoes({ ...USUARIO_A, id_usuario })) {
      await assert.rejects(executar, { statusCode: 401 });
    }
  }
  semChamadas(mocks);
});

test("Recusa UUID de ambiente inválido nas seis operações com HTTP 401", async (t) => {
  const { mocks } = simularRepositorio(t);
  for (const id_ambiente of [undefined, null, "", 123, "inválido", "11111111-1111-4111-8111-11111111111Z"]) {
    for (const executar of operacoes({ ...USUARIO_A, id_ambiente })) {
      await assert.rejects(executar, { statusCode: 401 });
    }
  }
  semChamadas(mocks);
});

test("Recusa IDs de evidência e local inválidos com HTTP 400 antes de consultar", async (t) => {
  const { mocks } = simularRepositorio(t);
  for (const id of IDS_INVALIDOS) {
    for (const executar of [
      () => service.criarEvidencia({ ...DADOS, id_local: id }, USUARIO_A),
      () => service.buscarEvidenciaPorId(id, USUARIO_A),
      () => service.listarEvidenciasPorLocal(id, USUARIO_A),
      () => service.atualizarEvidencia(id, {}, USUARIO_A),
      () => service.excluirEvidencia(id, USUARIO_A),
    ]) await assert.rejects(executar, { statusCode: 400 });
  }
  semChamadas(mocks);
});

test("Recusa dados ausentes, arrays e valores primitivos nas duas escritas", async (t) => {
  const { mocks } = simularRepositorio(t);
  for (const dados of [undefined, null, [], [DADOS], 0, 123, "", "dados", false, true]) {
    await assert.rejects(service.criarEvidencia(dados, USUARIO_A), { statusCode: 400 });
    await assert.rejects(service.atualizarEvidencia(50, dados, USUARIO_A), { statusCode: 400 });
  }
  semChamadas(mocks);
});

test("Exige tipo na criação e rejeita tipos fora de FOTO, TEXTO e DOCUMENTO", async (t) => {
  const { mocks } = simularRepositorio(t);
  for (const tipo of [undefined, null, "", "foto", "VIDEO", "FOTO ", 1, true, [], {}]) {
    await assert.rejects(service.criarEvidencia({ ...DADOS, tipo }, USUARIO_A), { statusCode: 400 });
    if (tipo !== undefined) {
      await assert.rejects(service.atualizarEvidencia(50, { tipo }, USUARIO_A), { statusCode: 400 });
    }
  }
  semChamadas(mocks);
});

test("Cria os três tipos válidos com identidade e ID normalizados", async (t) => {
  const { mocks, eventos } = simularRepositorio(t, respostasCriacao());
  for (const [indice, tipo] of ["FOTO", "TEXTO", "DOCUMENTO"].entries()) {
    const esperado = { ...CRIACAO, tipo };
    const resultado = await service.criarEvidencia(
      { ...DADOS, id_local: "40", tipo }, { ...USUARIO_A, id_usuario: "10" }
    );
    assert.deepEqual(resultado, { ...esperado, id_evidencia: 50, id_usuario: 10 });
    assert.deepEqual(mocks.criarNoAmbiente.mock.calls[indice].arguments, [esperado, USUARIO_A]);
    assert.deepEqual(mocks.buscarLocalAutorizadoNoAmbiente.mock.calls[indice].arguments, [40, USUARIO_A]);
  }
  assert.deepEqual(eventos, Array.from({ length: 3 }, () => [
    "buscarLocalAutorizadoNoAmbiente", "criarNoAmbiente",
  ]).flat());
});

test("Valida campos textuais e limite do caminho sem acessar arquivos", async (t) => {
  const { mocks } = simularRepositorio(t);
  for (const patch of [
    { descricao: true }, { descricao: {} }, { descricao: [] },
    { caminho_arquivo: 1 }, { caminho_arquivo: {} }, { caminho_arquivo: "x".repeat(501) },
  ]) {
    await assert.rejects(service.criarEvidencia({ ...DADOS, ...patch }, USUARIO_A), { statusCode: 400 });
    await assert.rejects(service.atualizarEvidencia(50, patch, USUARIO_A), { statusCode: 400 });
  }
  semChamadas(mocks);
});

test("Campos opcionais omitidos na criação viram null sem exigir arquivo ou descrição", async (t) => {
  const { mocks } = simularRepositorio(t, respostasCriacao());
  await service.criarEvidencia({ id_local: 40, tipo: "TEXTO" }, USUARIO_A);
  assert.deepEqual(unica(mocks.criarNoAmbiente), [{
    id_local: 40, tipo: "TEXTO", caminho_arquivo: null, descricao: null,
    ...GPS_NULO, id_operacao_cliente: null,
  }, USUARIO_A]);
});

test("Valida UUID da chave de operação antes de buscar repetição", async (t) => {
  const { mocks } = simularRepositorio(t);
  for (const id_operacao_cliente of [1, false, [], {}, "inválido"]) {
    await assert.rejects(service.criarEvidencia({ ...DADOS, id_operacao_cliente }, USUARIO_A), { statusCode: 400 });
  }
  semChamadas(mocks);
});

test("Ausência, null e texto vazio na chave não causam busca idempotente", async (t) => {
  const { mocks, eventos } = simularRepositorio(t, respostasCriacao());
  for (const id_operacao_cliente of [undefined, null, ""]) {
    await service.criarEvidencia({ ...DADOS, id_operacao_cliente }, USUARIO_A);
  }
  assert.equal(mocks.buscarPorOperacaoClienteNoAmbiente.mock.callCount(), 0);
  assert.deepEqual(eventos, Array.from({ length: 3 }, () => [
    "buscarLocalAutorizadoNoAmbiente", "criarNoAmbiente",
  ]).flat());
});

test("Valida todos os dados da criação antes da autorização ou recuperação idempotente", async (t) => {
  const { mocks } = simularRepositorio(t);
  await assert.rejects(service.criarEvidencia({
    ...DADOS, id_operacao_cliente: OPERACAO, latitude: 91, longitude: 0,
  }, USUARIO_A), { statusCode: 400 });
  semChamadas(mocks);
});

test("Local não autorizado retorna 404 sem buscar chave nem evidências", async (t) => {
  const { mocks, eventos } = simularRepositorio(t, { buscarLocalAutorizadoNoAmbiente: null });
  await assert.rejects(service.criarEvidencia({ ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_B), {
    statusCode: 404, message: "Local não encontrado.",
  });
  assert.deepEqual(eventos, ["buscarLocalAutorizadoNoAmbiente"]);
  assert.deepEqual(unica(mocks.buscarLocalAutorizadoNoAmbiente), [40, USUARIO_B]);
});

test("Chave nova verifica local, recupera pela chave e local e somente então cria", async (t) => {
  const { mocks, eventos } = simularRepositorio(t, respostasCriacao({ buscarPorOperacaoClienteNoAmbiente: null }));
  const resultado = await service.criarEvidencia({ ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A);
  assert.deepEqual(eventos, ["buscarLocalAutorizadoNoAmbiente", "buscarPorOperacaoClienteNoAmbiente", "criarNoAmbiente"]);
  assert.deepEqual(unica(mocks.buscarPorOperacaoClienteNoAmbiente), [OPERACAO, 40, USUARIO_A]);
  assert.deepEqual(unica(mocks.criarNoAmbiente), [{ ...CRIACAO, id_operacao_cliente: OPERACAO }, USUARIO_A]);
  assert.equal(resultado.id_operacao_cliente, OPERACAO);
});

test("Repetição autorizada retorna a mesma evidência sem INSERT", async (t) => {
  const { mocks, eventos } = simularRepositorio(t, {
    buscarLocalAutorizadoNoAmbiente: { id_local: 40 },
    buscarPorOperacaoClienteNoAmbiente: REGISTRO,
  });
  assert.strictEqual(await service.criarEvidencia({ ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A), REGISTRO);
  assert.deepEqual(eventos, ["buscarLocalAutorizadoNoAmbiente", "buscarPorOperacaoClienteNoAmbiente"]);
  assert.deepEqual(unica(mocks.buscarPorOperacaoClienteNoAmbiente), [OPERACAO, 40, USUARIO_A]);
  assert.equal(mocks.criarNoAmbiente.mock.callCount(), 0);
});

test("Conflito específico recupera somente a mesma chave, local e identidade", async (t) => {
  const conflito = conflitoIdempotencia();
  let buscas = 0;
  const { mocks, eventos } = simularRepositorio(t, respostasCriacao({
    buscarPorOperacaoClienteNoAmbiente: () => ++buscas === 1 ? null : REGISTRO,
    criarNoAmbiente: async () => { throw conflito; },
  }));
  assert.strictEqual(await service.criarEvidencia({ ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A), REGISTRO);
  assert.deepEqual(eventos, [
    "buscarLocalAutorizadoNoAmbiente", "buscarPorOperacaoClienteNoAmbiente",
    "criarNoAmbiente", "buscarPorOperacaoClienteNoAmbiente",
  ]);
  for (const chamada of mocks.buscarPorOperacaoClienteNoAmbiente.mock.calls) {
    assert.deepEqual(chamada.arguments, [OPERACAO, 40, USUARIO_A]);
  }
});

test("Colisão sem repetição autorizada mantém conflito genérico sem recuperar dados externos", async (t) => {
  const conflito = conflitoIdempotencia();
  const { mocks, eventos } = simularRepositorio(t, respostasCriacao({
    buscarLocalAutorizadoNoAmbiente: { id_local: 41 },
    buscarPorOperacaoClienteNoAmbiente: null,
    criarNoAmbiente: async () => { throw conflito; },
  }));
  await assert.rejects(service.criarEvidencia({ ...DADOS, id_local: 41, id_operacao_cliente: OPERACAO }, USUARIO_B),
    (erro) => {
      assert.strictEqual(erro, conflito);
      assert.equal(erro.statusCode, 409);
      assert.equal(erro.detail, undefined);
      assert.equal(erro.message.includes(AMBIENTE_A), false);
      return true;
    });
  assert.deepEqual(eventos, [
    "buscarLocalAutorizadoNoAmbiente", "buscarPorOperacaoClienteNoAmbiente",
    "criarNoAmbiente", "buscarPorOperacaoClienteNoAmbiente",
  ]);
  for (const chamada of mocks.buscarPorOperacaoClienteNoAmbiente.mock.calls) {
    assert.deepEqual(chamada.arguments, [OPERACAO, 41, USUARIO_B]);
  }
});

test("Outras violações 23505 e conflitos não específicos são propagados sem recuperação adicional", async (t) => {
  const erros = [
    Object.assign(new Error("Outro índice"), { code: "23505", constraint: "outro_indice" }),
    Object.assign(new Error("Outro conflito"), { statusCode: 409, code: "23505", constraint: "outro_indice" }),
    Object.assign(new Error("Erro bruto"), { code: "23505", constraint: "uq_evidencia_id_operacao_cliente" }),
    Object.assign(conflitoIdempotencia(), { table: "outra_tabela" }),
    Object.assign(new Error("Conflito GPS"), { statusCode: 409, code: "CONFLITO_GPS" }),
  ];
  let corrente;
  const { mocks } = simularRepositorio(t, respostasCriacao({
    buscarPorOperacaoClienteNoAmbiente: null,
    criarNoAmbiente: async () => { throw corrente; },
  }));
  for (const erro of erros) {
    corrente = erro;
    await assert.rejects(service.criarEvidencia({ ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A),
      (recebido) => recebido === erro);
  }
  assert.equal(mocks.buscarPorOperacaoClienteNoAmbiente.mock.callCount(), erros.length);
  assert.equal(mocks.criarNoAmbiente.mock.callCount(), erros.length);
});

test("Falha na recuperação após conflito é propagada sem convertê-la em sucesso ou 409", async (t) => {
  const interno = new Error("Falha na recuperação autorizada");
  let buscas = 0;
  const { eventos } = simularRepositorio(t, respostasCriacao({
    buscarPorOperacaoClienteNoAmbiente: async () => {
      if (++buscas === 1) return null;
      throw interno;
    },
    criarNoAmbiente: async () => { throw conflitoIdempotencia(); },
  }));
  await assert.rejects(service.criarEvidencia({ ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A),
    (erro) => erro === interno);
  assert.equal(eventos.length, 4);
});

test("Revogação na criação retorna 404 quando INSERT autorizado não retorna linha", async (t) => {
  const { eventos } = simularRepositorio(t, respostasCriacao({ criarNoAmbiente: null }));
  await assert.rejects(service.criarEvidencia(DADOS, USUARIO_A), {
    statusCode: 404, message: "Local não encontrado.",
  });
  assert.deepEqual(eventos, ["buscarLocalAutorizadoNoAmbiente", "criarNoAmbiente"]);
});

test("Aceita limites de latitude e longitude e preserva coordenadas zero na criação", async (t) => {
  const { mocks } = simularRepositorio(t, respostasCriacao());
  for (const [indice, [latitude, longitude]] of [[-90, -180], [90, 180], [0, 0], ["0", "0"]].entries()) {
    const resultado = await service.criarEvidencia({ ...DADOS, latitude, longitude }, USUARIO_A);
    assert.equal(resultado.latitude, Number(latitude));
    assert.equal(resultado.longitude, Number(longitude));
    const enviado = mocks.criarNoAmbiente.mock.calls[indice].arguments[0];
    assert.equal(enviado.latitude, Number(latitude));
    assert.equal(enviado.longitude, Number(longitude));
  }
});

test("Recusa coordenadas fora da faixa, não finitas e de tipos inesperados", async (t) => {
  const { mocks } = simularRepositorio(t);
  for (const coordenadas of [
    { latitude: 90.1, longitude: 0 }, { latitude: -90.1, longitude: 0 },
    { latitude: 0, longitude: 180.1 }, { latitude: 0, longitude: -180.1 },
    { latitude: NaN, longitude: 0 }, { latitude: 0, longitude: Infinity },
    { latitude: "-Infinity", longitude: 0 }, { latitude: true, longitude: 0 },
    { latitude: {}, longitude: 0 }, { latitude: [], longitude: 0 },
    { latitude: "texto", longitude: 0 },
  ]) {
    await assert.rejects(service.criarEvidencia({ ...DADOS, ...coordenadas }, USUARIO_A), { statusCode: 400 });
  }
  semChamadas(mocks);
});

test("Exige par de coordenadas na criação", async (t) => {
  const { mocks } = simularRepositorio(t);
  for (const gps of [
    { latitude: 0 }, { longitude: 0 }, { latitude: 0, longitude: null },
    { latitude: "", longitude: 0 },
  ]) await assert.rejects(service.criarEvidencia({ ...DADOS, ...gps }, USUARIO_A), { statusCode: 400 });
  semChamadas(mocks);
});

test("Valida precisão finita não negativa, origem e data de captura", async (t) => {
  const { mocks } = simularRepositorio(t);
  for (const patch of [
    { precisao_gps: -1 }, { precisao_gps: Infinity }, { precisao_gps: NaN },
    { precisao_gps: 100000000 }, { precisao_gps: true }, { precisao_gps: {} },
    { origem_coordenadas: "OUTRA" }, { origem_coordenadas: true },
    { data_captura_gps: "inválida" }, { data_captura_gps: 123 }, { data_captura_gps: {} },
  ]) {
    await assert.rejects(service.criarEvidencia({ ...DADOS, ...GPS, ...patch }, USUARIO_A), { statusCode: 400 });
  }
  semChamadas(mocks);
});

test("Metadados exigem coordenadas e precisão ou data exigem origem GPS na criação", async (t) => {
  const { mocks } = simularRepositorio(t);
  for (const gps of [
    { precisao_gps: 0 }, { origem_coordenadas: "GPS" }, { origem_coordenadas: "MANUAL" },
    { data_captura_gps: "2026-10-15T12:00:00Z" },
    { latitude: 0, longitude: 0, precisao_gps: 0 },
    { latitude: 0, longitude: 0, origem_coordenadas: "MANUAL", precisao_gps: 1 },
    { latitude: 0, longitude: 0, origem_coordenadas: "MANUAL", data_captura_gps: "2026-10-15T12:00:00Z" },
  ]) await assert.rejects(service.criarEvidencia({ ...DADOS, ...gps }, USUARIO_A), { statusCode: 400 });
  semChamadas(mocks);
});

test("Criação GPS normaliza números e data nova; MANUAL sem metadados é aceita", async (t) => {
  const { mocks } = simularRepositorio(t, respostasCriacao());
  await service.criarEvidencia({ ...DADOS, ...GPS, precisao_gps: "0" }, USUARIO_A);
  const gpsEnviado = mocks.criarNoAmbiente.mock.calls[0].arguments[0];
  assert.deepEqual(gpsEnviado, {
    ...CRIACAO, latitude: -23.1234567, longitude: -46.7654321,
    precisao_gps: 0, origem_coordenadas: "GPS", data_captura_gps: "2026-10-15T12:34:56.123Z",
  });
  await service.criarEvidencia({ ...DADOS, latitude: 0, longitude: 0, origem_coordenadas: "MANUAL" }, USUARIO_A);
  assert.deepEqual(mocks.criarNoAmbiente.mock.calls[1].arguments[0], {
    ...CRIACAO, latitude: 0, longitude: 0, origem_coordenadas: "MANUAL",
  });
});

test("Atualização lê estado preciso e usa obrigatoriamente quatro argumentos mesmo sem patch GPS", async (t) => {
  const { mocks, eventos } = simularRepositorio(t, respostasAtualizacao());
  const resultado = await service.atualizarEvidencia("50", { descricao: "Nova" }, USUARIO_A);
  assert.equal(resultado.descricao, "Nova");
  assert.deepEqual(eventos, ["buscarPorIdEAmbiente", "atualizarNoAmbiente"]);
  assert.deepEqual(unica(mocks.buscarPorIdEAmbiente), [50, USUARIO_A, { incluirEstadoGps: true }]);
  const args = unica(mocks.atualizarNoAmbiente);
  assert.equal(args.length, 4);
  assert.deepEqual(args, [50, { descricao: "Nova" }, USUARIO_A, { gpsEsperado: GPS }]);
  assert.strictEqual(args[3].gpsEsperado, GPS);
  assert.equal(args[3].gpsEsperado.data_captura_gps, "2026-10-15T12:34:56.123456Z");
});

test("Estado esperado vem exclusivamente de estado_gps e não do corpo ou campos comuns da linha", async (t) => {
  // Date comum perdeu microssegundos, como pode ocorrer no driver PostgreSQL.
  const leitura = { ...ATUAL, data_captura_gps: new Date("2026-10-15T12:34:56.123Z") };
  const { mocks } = simularRepositorio(t, respostasAtualizacao({ buscarPorIdEAmbiente: leitura }));
  await service.atualizarEvidencia(50, {
    descricao: "Nova", estado_gps: GPS_NULO, gpsEsperado: GPS_NULO, incluirEstadoGps: false,
  }, USUARIO_A);
  const args = unica(mocks.atualizarNoAmbiente);
  assert.deepEqual(args[1], { descricao: "Nova" });
  assert.strictEqual(args[3].gpsEsperado, GPS);
  assert.equal(args[3].gpsEsperado.data_captura_gps.endsWith(".123456Z"), true);
});

test("Atualização vazia ou undefined não reenvia valores antigos ao SET", async (t) => {
  const { mocks } = simularRepositorio(t, respostasAtualizacao());
  const casos = [{}, Object.fromEntries([...Object.keys(GPS), "tipo", "caminho_arquivo", "descricao"].map((campo) => [campo, undefined]))];
  for (const [indice, patch] of casos.entries()) {
    await service.atualizarEvidencia(50, patch, USUARIO_A);
    assert.deepEqual(mocks.atualizarNoAmbiente.mock.calls[indice].arguments, [50, {}, USUARIO_A, { gpsEsperado: GPS }]);
  }
});

test("Null e texto vazio limpam campos textuais sem reenviar GPS omitido", async (t) => {
  const { mocks } = simularRepositorio(t, respostasAtualizacao());
  for (const [indice, valor] of [null, ""].entries()) {
    await service.atualizarEvidencia(50, { descricao: valor }, USUARIO_A);
    assert.deepEqual(mocks.atualizarNoAmbiente.mock.calls[indice].arguments[1], {
      descricao: null,
    });
    // Política autorizada no PASSO 607: PUT não troca nem limpa a referência física.
    await assert.rejects(service.atualizarEvidencia(50, { caminho_arquivo: valor }, USUARIO_A), { statusCode: 400 });
  }
});

test("Remover coordenadas limpa os cinco campos GPS", async (t) => {
  const { mocks } = simularRepositorio(t, respostasAtualizacao());
  await service.atualizarEvidencia(50, { latitude: null, longitude: null }, USUARIO_A);
  assert.deepEqual(unica(mocks.atualizarNoAmbiente), [50, GPS_NULO, USUARIO_A, { gpsEsperado: GPS }]);
});

test("Alterar coordenadas sem origem usa MANUAL e limpa precisão e captura", async (t) => {
  const { mocks } = simularRepositorio(t, respostasAtualizacao());
  await service.atualizarEvidencia(50, { latitude: "0", longitude: 0 }, USUARIO_A);
  assert.deepEqual(unica(mocks.atualizarNoAmbiente)[1], {
    latitude: 0, longitude: 0, origem_coordenadas: "MANUAL",
    precisao_gps: null, data_captura_gps: null,
  });
});

test("Alteração parcial de uma coordenada preserva a outra sem reenviá-la ao SET", async (t) => {
  const { mocks } = simularRepositorio(t, respostasAtualizacao());
  await service.atualizarEvidencia(50, { latitude: 0 }, USUARIO_A);
  const patch = unica(mocks.atualizarNoAmbiente)[1];
  assert.deepEqual(patch, {
    latitude: 0, origem_coordenadas: "MANUAL", precisao_gps: null, data_captura_gps: null,
  });
  assert.equal(Object.hasOwn(patch, "longitude"), false);
});

test("Não permite remoção de apenas uma coordenada de um par existente", async (t) => {
  const { mocks, eventos } = simularRepositorio(t, { buscarPorIdEAmbiente: ATUAL });
  await assert.rejects(service.atualizarEvidencia(50, { latitude: null }, USUARIO_A), { statusCode: 400 });
  assert.deepEqual(eventos, ["buscarPorIdEAmbiente"]);
  assert.equal(mocks.atualizarNoAmbiente.mock.callCount(), 0);
});

test("Precisão parcial mantém coordenadas, origem e data omitidas sem reenviá-las", async (t) => {
  const { mocks } = simularRepositorio(t, respostasAtualizacao());
  await service.atualizarEvidencia(50, { precisao_gps: "0" }, USUARIO_A);
  assert.deepEqual(unica(mocks.atualizarNoAmbiente), [50, { precisao_gps: 0 }, USUARIO_A, { gpsEsperado: GPS }]);
});

test("Null explícito limpa somente a precisão ou captura solicitada", async (t) => {
  const { mocks } = simularRepositorio(t, respostasAtualizacao());
  for (const [indice, campo] of ["precisao_gps", "data_captura_gps"].entries()) {
    await service.atualizarEvidencia(50, { [campo]: null }, USUARIO_A);
    assert.deepEqual(mocks.atualizarNoAmbiente.mock.calls[indice].arguments[1], { [campo]: null });
  }
});

test("Origem GPS explícita preserva precisão e captura omitidas ao alterar coordenadas", async (t) => {
  const { mocks } = simularRepositorio(t, respostasAtualizacao());
  await service.atualizarEvidencia(50, { latitude: 0, longitude: 0, origem_coordenadas: "GPS" }, USUARIO_A);
  assert.deepEqual(unica(mocks.atualizarNoAmbiente)[1], { latitude: 0, longitude: 0, origem_coordenadas: "GPS" });
});

test("Mudança explícita para MANUAL deriva somente limpezas de precisão e captura", async (t) => {
  const { mocks } = simularRepositorio(t, respostasAtualizacao());
  await service.atualizarEvidencia(50, { origem_coordenadas: "MANUAL" }, USUARIO_A);
  assert.deepEqual(unica(mocks.atualizarNoAmbiente)[1], {
    origem_coordenadas: "MANUAL", precisao_gps: null, data_captura_gps: null,
  });
});

test("Atualização sem coordenadas existentes rejeita metadados isolados ou uma coordenada apenas", async (t) => {
  const { mocks } = simularRepositorio(t, { buscarPorIdEAmbiente: { ...ATUAL, ...GPS_NULO, estado_gps: GPS_NULO } });
  for (const patch of [{ latitude: 0 }, { precisao_gps: 1 }, { origem_coordenadas: "GPS" }, { data_captura_gps: "2026-10-15T12:00:00Z" }]) {
    await assert.rejects(service.atualizarEvidencia(50, patch, USUARIO_A), { statusCode: 400 });
  }
  assert.equal(mocks.atualizarNoAmbiente.mock.callCount(), 0);
});

test("Atualização valida faixas, tipos GPS e coerência antes da escrita", async (t) => {
  const { mocks } = simularRepositorio(t, { buscarPorIdEAmbiente: ATUAL });
  for (const patch of [
    { latitude: 91 }, { longitude: -181 }, { latitude: NaN }, { longitude: Infinity },
    { latitude: true }, { precisao_gps: -1 }, { precisao_gps: "Infinity" },
    { origem_coordenadas: "OUTRA" }, { data_captura_gps: "inválida" },
    { origem_coordenadas: null }, // Precisão e data existentes exigem GPS.
  ]) await assert.rejects(service.atualizarEvidencia(50, patch, USUARIO_A), { statusCode: 400 });
  assert.equal(mocks.atualizarNoAmbiente.mock.callCount(), 0);
});

test("Origem pode ser limpa junto com precisão e captura mantendo coordenadas omitidas", async (t) => {
  const { mocks } = simularRepositorio(t, respostasAtualizacao());
  const patch = { origem_coordenadas: null, precisao_gps: null, data_captura_gps: null };
  await service.atualizarEvidencia(50, patch, USUARIO_A);
  assert.deepEqual(unica(mocks.atualizarNoAmbiente)[1], patch);
});

test("Estado GPS ausente ou estruturalmente inválido impede UPDATE sem fallback impreciso", async (t) => {
  let leitura;
  const { mocks } = simularRepositorio(t, { buscarPorIdEAmbiente: () => leitura });
  const incompleto = { ...GPS };
  delete incompleto.latitude;
  for (const estado_gps of [undefined, null, [], {}, incompleto, { ...GPS, latitude: 0 }, { ...GPS, data_captura_gps: new Date() }]) {
    leitura = { ...REGISTRO, estado_gps };
    await assert.rejects(service.atualizarEvidencia(50, { descricao: "Nova" }, USUARIO_A), {
      statusCode: 500, message: "Não foi possível obter o estado GPS da evidência.",
    });
  }
  assert.equal(mocks.atualizarNoAmbiente.mock.callCount(), 0);
});

test("Conflito GPS mantém a mesma instância, HTTP 409 e código sem repetir UPDATE", async (t) => {
  const erro = Object.assign(new Error("GPS mudou"), { statusCode: 409, code: "CONFLITO_GPS" });
  const { mocks, eventos } = simularRepositorio(t, respostasAtualizacao({
    atualizarNoAmbiente: async () => { throw erro; },
  }));
  await assert.rejects(service.atualizarEvidencia(50, { precisao_gps: 0 }, USUARIO_A), (recebido) => {
    assert.strictEqual(recebido, erro);
    assert.equal(recebido.statusCode, 409);
    assert.equal(recebido.code, "CONFLITO_GPS");
    return true;
  });
  assert.deepEqual(eventos, ["buscarPorIdEAmbiente", "atualizarNoAmbiente"]);
  assert.equal(mocks.atualizarNoAmbiente.mock.callCount(), 1);
});

test("Evidência não autorizada na leitura retorna 404 sem tentar UPDATE", async (t) => {
  const { mocks, eventos } = simularRepositorio(t, { buscarPorIdEAmbiente: null });
  await assert.rejects(service.atualizarEvidencia(50, {}, USUARIO_A), {
    statusCode: 404, message: "Evidência não encontrada.",
  });
  assert.deepEqual(eventos, ["buscarPorIdEAmbiente"]);
  assert.equal(mocks.atualizarNoAmbiente.mock.callCount(), 0);
});

test("Revogação entre leitura e escrita retorna 404 sem converter em conflito GPS", async (t) => {
  const { eventos } = simularRepositorio(t, respostasAtualizacao({ atualizarNoAmbiente: null }));
  await assert.rejects(service.atualizarEvidencia(50, {}, USUARIO_A), (erro) => {
    assert.equal(erro.statusCode, 404);
    assert.equal(erro.code, undefined);
    return true;
  });
  assert.deepEqual(eventos, ["buscarPorIdEAmbiente", "atualizarNoAmbiente"]);
});

test("Lista evidências com identidade autenticada e preserva lista retornada", async (t) => {
  const registros = [REGISTRO];
  const { mocks, eventos } = simularRepositorio(t, { listarPermitidasNoAmbiente: registros });
  assert.strictEqual(await service.listarEvidencias(USUARIO_A), registros);
  assert.deepEqual(unica(mocks.listarPermitidasNoAmbiente), [USUARIO_A]);
  assert.deepEqual(eventos, ["listarPermitidasNoAmbiente"]);
});

test("Busca evidência pelo ID validado com identidade autenticada", async (t) => {
  const { mocks, eventos } = simularRepositorio(t, { buscarPorIdEAmbiente: REGISTRO });
  assert.strictEqual(await service.buscarEvidenciaPorId("50", USUARIO_A), REGISTRO);
  assert.deepEqual(unica(mocks.buscarPorIdEAmbiente), [50, USUARIO_A]);
  assert.deepEqual(eventos, ["buscarPorIdEAmbiente"]);
});

test("Busca individual ausente ou externa retorna a mesma resposta 404", async (t) => {
  const { mocks } = simularRepositorio(t, { buscarPorIdEAmbiente: null });
  for (const [indice, usuario] of [USUARIO_A, USUARIO_B].entries()) {
    await assert.rejects(service.buscarEvidenciaPorId(50, usuario), {
      statusCode: 404, message: "Evidência não encontrada.",
    });
    assert.deepEqual(mocks.buscarPorIdEAmbiente.mock.calls[indice].arguments, [50, usuario]);
  }
});

test("Listagem por local verifica autorização antes de buscar evidências e preserva lista vazia", async (t) => {
  const registros = [];
  const { mocks, eventos } = simularRepositorio(t, {
    buscarLocalAutorizadoNoAmbiente: { id_local: 40 }, listarPorLocalEAmbiente: registros,
  });
  assert.strictEqual(await service.listarEvidenciasPorLocal("40", USUARIO_A), registros);
  assert.deepEqual(eventos, ["buscarLocalAutorizadoNoAmbiente", "listarPorLocalEAmbiente"]);
  assert.deepEqual(unica(mocks.buscarLocalAutorizadoNoAmbiente), [40, USUARIO_A]);
  assert.deepEqual(unica(mocks.listarPorLocalEAmbiente), [40, USUARIO_A]);
});

test("Listagem por local não autorizado retorna 404 sem consultar evidências", async (t) => {
  const { mocks, eventos } = simularRepositorio(t, { buscarLocalAutorizadoNoAmbiente: null });
  await assert.rejects(service.listarEvidenciasPorLocal(40, USUARIO_B), {
    statusCode: 404, message: "Local não encontrado.",
  });
  assert.deepEqual(eventos, ["buscarLocalAutorizadoNoAmbiente"]);
  assert.equal(mocks.listarPorLocalEAmbiente.mock.callCount(), 0);
});

test("Exclusão utiliza apenas DELETE autorizado do repositório e retorna registro", async (t) => {
  const { mocks, eventos } = simularRepositorio(t, { excluirNoAmbiente: REGISTRO });
  assert.strictEqual(await service.excluirEvidencia("50", USUARIO_A), REGISTRO);
  assert.deepEqual(unica(mocks.excluirNoAmbiente), [50, USUARIO_A, { bloquearAutorizacao: true }]);
  assert.deepEqual(eventos, ["excluirNoAmbiente"]);
});

test("Exclusão sem registro autorizado retorna HTTP 404", async (t) => {
  const { mocks } = simularRepositorio(t, { excluirNoAmbiente: null });
  await assert.rejects(service.excluirEvidencia(50, USUARIO_B), {
    statusCode: 404, message: "Evidência não encontrada.",
  });
  assert.deepEqual(unica(mocks.excluirNoAmbiente), [50, USUARIO_B, { bloquearAutorizacao: true }]);
});

test("Criador da evidência não recebe autorização adicional quando o repositório recusa", async (t) => {
  const criador = { id_usuario: REGISTRO.id_usuario, id_ambiente: AMBIENTE_A };
  const { mocks } = simularRepositorio(t, {
    buscarPorIdEAmbiente: null, excluirNoAmbiente: null,
  });
  await assert.rejects(service.buscarEvidenciaPorId(50, criador), { statusCode: 404 });
  await assert.rejects(service.excluirEvidencia(50, criador), { statusCode: 404 });
  assert.deepEqual(unica(mocks.excluirNoAmbiente), [50, criador, { bloquearAutorizacao: true }]);
});

test("Não carrega dependências de banco, legados ou app e não manipula arquivos físicos", async (t) => {
  assert.deepEqual(importsService, ["../repositories/evidenciaMultiTenantRepository"]);
  const { eventos } = simularRepositorio(t, {
    ...respostasCriacao(), ...respostasAtualizacao(),
    listarPermitidasNoAmbiente: [], listarPorLocalEAmbiente: [], excluirNoAmbiente: REGISTRO,
  });
  const guardas = [];
  try {
    for (const nome of [
      "readFile", "writeFile", "appendFile", "unlink", "rename", "copyFile", "mkdir",
      "rm", "open", "readdir", "stat", "lstat", "realpath",
    ]) {
      guardas.push(t.mock.method(fs, nome, () => { throw new Error("Arquivo físico proibido"); }));
      guardas.push(t.mock.method(fs, nome + "Sync", () => { throw new Error("Arquivo físico proibido"); }));
      guardas.push(t.mock.method(fs.promises, nome, async () => { throw new Error("Arquivo físico proibido"); }));
    }
    for (const nome of ["createReadStream", "createWriteStream", "existsSync"]) {
      guardas.push(t.mock.method(fs, nome, () => { throw new Error("Arquivo físico proibido"); }));
    }
    for (const executar of operacoes(USUARIO_A)) await executar();
    for (const guarda of guardas) assert.equal(guarda.mock.callCount(), 0);
    assert.deepEqual(eventos, [
      "buscarLocalAutorizadoNoAmbiente", "criarNoAmbiente", "listarPermitidasNoAmbiente",
      "buscarPorIdEAmbiente", "buscarLocalAutorizadoNoAmbiente", "listarPorLocalEAmbiente",
      "buscarPorIdEAmbiente", "atualizarNoAmbiente", "excluirNoAmbiente",
    ]);
  } finally {
    // Não interfere nas operações de arquivo do próprio runner.
    for (const guarda of guardas.reverse()) guarda.mock.restore();
  }
});

test("Ambiente A: seis operações ignoram identidade forjada e encaminham somente identidade autenticada", async (t) => {
  const usuario = USUARIO_A;
  const forjados = { id_usuario: 999, id_ambiente: AMBIENTE_B, perfil_acesso: "ADMINISTRADOR" };
  const registro = { ...REGISTRO, id_usuario: usuario.id_usuario };
  const lista = [registro];
  const { mocks, eventos } = simularRepositorio(t, {
    ...respostasCriacao(),
    buscarPorOperacaoClienteNoAmbiente: null,
    listarPermitidasNoAmbiente: lista,
    listarPorLocalEAmbiente: lista,
    buscarPorIdEAmbiente: (_id, identidade, opcoes) =>
      opcoes ? { ...registro, estado_gps: GPS } : registro,
    atualizarNoAmbiente: (_id, patch) => ({ ...registro, ...patch }),
    excluirNoAmbiente: registro,
  });
  const entrada = { ...DADOS, ...forjados, id_operacao_cliente: OPERACAO };
  const copiaEntrada = { ...entrada };
  const criada = await service.criarEvidencia(entrada, { ...usuario, perfil_acesso: "VISITANTE" });
  assert.equal(criada.id_usuario, usuario.id_usuario);
  assert.deepEqual(unica(mocks.criarNoAmbiente), [{ ...CRIACAO, id_operacao_cliente: OPERACAO }, usuario]);
  assert.deepEqual(unica(mocks.buscarPorOperacaoClienteNoAmbiente), [OPERACAO, 40, usuario]);
  assert.strictEqual(await service.listarEvidencias(usuario), lista);
  assert.strictEqual(await service.buscarEvidenciaPorId(50, usuario), registro);
  assert.strictEqual(await service.listarEvidenciasPorLocal(40, usuario), lista);
  await service.atualizarEvidencia(50, {
    ...forjados, descricao: "Nova", id_local: 999, id_operacao_cliente: "não pode substituir",
  }, usuario);
  assert.strictEqual(await service.excluirEvidencia(50, usuario), registro);
  assert.deepEqual(unica(mocks.listarPermitidasNoAmbiente), [usuario]);
  assert.deepEqual(mocks.buscarPorIdEAmbiente.mock.calls.map((chamada) => chamada.arguments), [
    [50, usuario], [50, usuario, { incluirEstadoGps: true }],
  ]);
  for (const chamada of mocks.buscarLocalAutorizadoNoAmbiente.mock.calls) {
    assert.deepEqual(chamada.arguments, [40, usuario]);
  }
  assert.deepEqual(unica(mocks.listarPorLocalEAmbiente), [40, usuario]);
  assert.deepEqual(unica(mocks.atualizarNoAmbiente), [50, { descricao: "Nova" }, usuario, { gpsEsperado: GPS }]);
  assert.deepEqual(unica(mocks.excluirNoAmbiente), [50, usuario, { bloquearAutorizacao: true }]);
  assert.deepEqual(entrada, copiaEntrada);
  assert.deepEqual(eventos, [
    "buscarLocalAutorizadoNoAmbiente", "buscarPorOperacaoClienteNoAmbiente", "criarNoAmbiente",
    "listarPermitidasNoAmbiente", "buscarPorIdEAmbiente",
    "buscarLocalAutorizadoNoAmbiente", "listarPorLocalEAmbiente",
    "buscarPorIdEAmbiente", "atualizarNoAmbiente", "excluirNoAmbiente",
  ]);
});

test("Ambiente B: seis operações ignoram identidade forjada e encaminham somente identidade autenticada", async (t) => {
  const usuario = USUARIO_B;
  const forjados = { id_usuario: 999, id_ambiente: AMBIENTE_A, perfil_acesso: "ADMINISTRADOR" };
  const registro = { ...REGISTRO, id_usuario: usuario.id_usuario };
  const lista = [registro];
  const { mocks, eventos } = simularRepositorio(t, {
    ...respostasCriacao(),
    buscarPorOperacaoClienteNoAmbiente: null,
    listarPermitidasNoAmbiente: lista,
    listarPorLocalEAmbiente: lista,
    buscarPorIdEAmbiente: (_id, identidade, opcoes) =>
      opcoes ? { ...registro, estado_gps: GPS } : registro,
    atualizarNoAmbiente: (_id, patch) => ({ ...registro, ...patch }),
    excluirNoAmbiente: registro,
  });
  const entrada = { ...DADOS, ...forjados, id_operacao_cliente: OPERACAO };
  const copiaEntrada = { ...entrada };
  const criada = await service.criarEvidencia(entrada, { ...usuario, perfil_acesso: "VISITANTE" });
  assert.equal(criada.id_usuario, usuario.id_usuario);
  assert.deepEqual(unica(mocks.criarNoAmbiente), [{ ...CRIACAO, id_operacao_cliente: OPERACAO }, usuario]);
  assert.deepEqual(unica(mocks.buscarPorOperacaoClienteNoAmbiente), [OPERACAO, 40, usuario]);
  assert.strictEqual(await service.listarEvidencias(usuario), lista);
  assert.strictEqual(await service.buscarEvidenciaPorId(50, usuario), registro);
  assert.strictEqual(await service.listarEvidenciasPorLocal(40, usuario), lista);
  await service.atualizarEvidencia(50, {
    ...forjados, descricao: "Nova", id_local: 999, id_operacao_cliente: "não pode substituir",
  }, usuario);
  assert.strictEqual(await service.excluirEvidencia(50, usuario), registro);
  assert.deepEqual(unica(mocks.listarPermitidasNoAmbiente), [usuario]);
  assert.deepEqual(mocks.buscarPorIdEAmbiente.mock.calls.map((chamada) => chamada.arguments), [
    [50, usuario], [50, usuario, { incluirEstadoGps: true }],
  ]);
  for (const chamada of mocks.buscarLocalAutorizadoNoAmbiente.mock.calls) {
    assert.deepEqual(chamada.arguments, [40, usuario]);
  }
  assert.deepEqual(unica(mocks.listarPorLocalEAmbiente), [40, usuario]);
  assert.deepEqual(unica(mocks.atualizarNoAmbiente), [50, { descricao: "Nova" }, usuario, { gpsEsperado: GPS }]);
  assert.deepEqual(unica(mocks.excluirNoAmbiente), [50, usuario, { bloquearAutorizacao: true }]);
  assert.deepEqual(entrada, copiaEntrada);
  assert.deepEqual(eventos, [
    "buscarLocalAutorizadoNoAmbiente", "buscarPorOperacaoClienteNoAmbiente", "criarNoAmbiente",
    "listarPermitidasNoAmbiente", "buscarPorIdEAmbiente",
    "buscarLocalAutorizadoNoAmbiente", "listarPorLocalEAmbiente",
    "buscarPorIdEAmbiente", "atualizarNoAmbiente", "excluirNoAmbiente",
  ]);
});

test("Propaga erro interno em autorização do local na criação sem converter em 404 ou 409", async (t) => {
  const erro = Object.assign(new Error("Falha interna simulada"), { statusCode: 500, code: "XX000" });
  const { mocks, eventos } = simularRepositorio(t, {
    ...respostasCriacao(), ...respostasAtualizacao(),
    buscarLocalAutorizadoNoAmbiente: async () => { throw erro; },
  });
  await assert.rejects(service.criarEvidencia(DADOS, USUARIO_A), (recebido) => {
    assert.strictEqual(recebido, erro);
    assert.equal(recebido.statusCode, 500);
    assert.notEqual(recebido.code, "CONFLITO_GPS");
    return true;
  });
  assert.deepEqual(eventos, ["buscarLocalAutorizadoNoAmbiente"]);
  assert.equal(mocks.buscarLocalAutorizadoNoAmbiente.mock.callCount(), 1);
});

test("Propaga erro interno em recuperação inicial idempotente sem converter em 404 ou 409", async (t) => {
  const erro = Object.assign(new Error("Falha interna simulada"), { statusCode: 500, code: "XX000" });
  const { mocks, eventos } = simularRepositorio(t, {
    ...respostasCriacao(), ...respostasAtualizacao(),
    buscarPorOperacaoClienteNoAmbiente: async () => { throw erro; },
  });
  await assert.rejects(service.criarEvidencia({ ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A), (recebido) => {
    assert.strictEqual(recebido, erro);
    assert.equal(recebido.statusCode, 500);
    assert.notEqual(recebido.code, "CONFLITO_GPS");
    return true;
  });
  assert.deepEqual(eventos, ["buscarLocalAutorizadoNoAmbiente", "buscarPorOperacaoClienteNoAmbiente"]);
  assert.equal(mocks.buscarPorOperacaoClienteNoAmbiente.mock.callCount(), 1);
});

test("Propaga erro interno em INSERT autorizado sem converter em 404 ou 409", async (t) => {
  const erro = Object.assign(new Error("Falha interna simulada"), { statusCode: 500, code: "XX000" });
  const { mocks, eventos } = simularRepositorio(t, {
    ...respostasCriacao(), ...respostasAtualizacao(),
    criarNoAmbiente: async () => { throw erro; },
  });
  await assert.rejects(service.criarEvidencia(DADOS, USUARIO_A), (recebido) => {
    assert.strictEqual(recebido, erro);
    assert.equal(recebido.statusCode, 500);
    assert.notEqual(recebido.code, "CONFLITO_GPS");
    return true;
  });
  assert.deepEqual(eventos, ["buscarLocalAutorizadoNoAmbiente", "criarNoAmbiente"]);
  assert.equal(mocks.criarNoAmbiente.mock.callCount(), 1);
});

test("Propaga erro interno em listagem autorizada sem converter em 404 ou 409", async (t) => {
  const erro = Object.assign(new Error("Falha interna simulada"), { statusCode: 500, code: "XX000" });
  const { mocks, eventos } = simularRepositorio(t, {
    ...respostasCriacao(), ...respostasAtualizacao(),
    listarPermitidasNoAmbiente: async () => { throw erro; },
  });
  await assert.rejects(service.listarEvidencias(USUARIO_A), (recebido) => {
    assert.strictEqual(recebido, erro);
    assert.equal(recebido.statusCode, 500);
    assert.notEqual(recebido.code, "CONFLITO_GPS");
    return true;
  });
  assert.deepEqual(eventos, ["listarPermitidasNoAmbiente"]);
  assert.equal(mocks.listarPermitidasNoAmbiente.mock.callCount(), 1);
});

test("Propaga erro interno em busca individual sem converter em 404 ou 409", async (t) => {
  const erro = Object.assign(new Error("Falha interna simulada"), { statusCode: 500, code: "XX000" });
  const { mocks, eventos } = simularRepositorio(t, {
    ...respostasCriacao(), ...respostasAtualizacao(),
    buscarPorIdEAmbiente: async () => { throw erro; },
  });
  await assert.rejects(service.buscarEvidenciaPorId(50, USUARIO_A), (recebido) => {
    assert.strictEqual(recebido, erro);
    assert.equal(recebido.statusCode, 500);
    assert.notEqual(recebido.code, "CONFLITO_GPS");
    return true;
  });
  assert.deepEqual(eventos, ["buscarPorIdEAmbiente"]);
  assert.equal(mocks.buscarPorIdEAmbiente.mock.callCount(), 1);
});

test("Propaga erro interno em listagem por local sem converter em 404 ou 409", async (t) => {
  const erro = Object.assign(new Error("Falha interna simulada"), { statusCode: 500, code: "XX000" });
  const { mocks, eventos } = simularRepositorio(t, {
    ...respostasCriacao(), ...respostasAtualizacao(),
    listarPorLocalEAmbiente: async () => { throw erro; },
  });
  await assert.rejects(service.listarEvidenciasPorLocal(40, USUARIO_A), (recebido) => {
    assert.strictEqual(recebido, erro);
    assert.equal(recebido.statusCode, 500);
    assert.notEqual(recebido.code, "CONFLITO_GPS");
    return true;
  });
  assert.deepEqual(eventos, ["buscarLocalAutorizadoNoAmbiente", "listarPorLocalEAmbiente"]);
  assert.equal(mocks.listarPorLocalEAmbiente.mock.callCount(), 1);
});

test("Propaga erro interno em leitura GPS antes da escrita sem converter em 404 ou 409", async (t) => {
  const erro = Object.assign(new Error("Falha interna simulada"), { statusCode: 500, code: "XX000" });
  const { mocks, eventos } = simularRepositorio(t, {
    ...respostasCriacao(), ...respostasAtualizacao(),
    buscarPorIdEAmbiente: async () => { throw erro; },
  });
  await assert.rejects(service.atualizarEvidencia(50, {}, USUARIO_A), (recebido) => {
    assert.strictEqual(recebido, erro);
    assert.equal(recebido.statusCode, 500);
    assert.notEqual(recebido.code, "CONFLITO_GPS");
    return true;
  });
  assert.deepEqual(eventos, ["buscarPorIdEAmbiente"]);
  assert.equal(mocks.buscarPorIdEAmbiente.mock.callCount(), 1);
});

test("Propaga erro interno em UPDATE condicional sem converter em 404 ou 409", async (t) => {
  const erro = Object.assign(new Error("Falha interna simulada"), { statusCode: 500, code: "XX000" });
  const { mocks, eventos } = simularRepositorio(t, {
    ...respostasCriacao(), ...respostasAtualizacao(),
    atualizarNoAmbiente: async () => { throw erro; },
  });
  await assert.rejects(service.atualizarEvidencia(50, {}, USUARIO_A), (recebido) => {
    assert.strictEqual(recebido, erro);
    assert.equal(recebido.statusCode, 500);
    assert.notEqual(recebido.code, "CONFLITO_GPS");
    return true;
  });
  assert.deepEqual(eventos, ["buscarPorIdEAmbiente", "atualizarNoAmbiente"]);
  assert.equal(mocks.atualizarNoAmbiente.mock.callCount(), 1);
});

test("Propaga erro interno em DELETE autorizado sem converter em 404 ou 409", async (t) => {
  const erro = Object.assign(new Error("Falha interna simulada"), { statusCode: 500, code: "XX000" });
  const { mocks, eventos } = simularRepositorio(t, {
    ...respostasCriacao(), ...respostasAtualizacao(),
    excluirNoAmbiente: async () => { throw erro; },
  });
  await assert.rejects(service.excluirEvidencia(50, USUARIO_A), (recebido) => {
    assert.strictEqual(recebido, erro);
    assert.equal(recebido.statusCode, 500);
    assert.notEqual(recebido.code, "CONFLITO_GPS");
    return true;
  });
  assert.deepEqual(eventos, ["excluirNoAmbiente"]);
  assert.equal(mocks.excluirNoAmbiente.mock.callCount(), 1);
});

test("Atualização textual aceita snapshot GPS inteiramente null sem inventar coordenadas", async (t) => {
  const leitura = { ...ATUAL, ...GPS_NULO, estado_gps: GPS_NULO };
  const { mocks } = simularRepositorio(t, respostasAtualizacao({
    buscarPorIdEAmbiente: leitura,
    atualizarNoAmbiente: (_id, patch) => ({ ...REGISTRO, ...GPS_NULO, ...patch }),
  }));
  const resultado = await service.atualizarEvidencia(50, { descricao: "Nova" }, USUARIO_A);
  assert.deepEqual(unica(mocks.atualizarNoAmbiente), [
    50, { descricao: "Nova" }, USUARIO_A, { gpsEsperado: GPS_NULO },
  ]);
  assert.strictEqual(unica(mocks.atualizarNoAmbiente)[3].gpsEsperado, GPS_NULO);
  assert.equal(resultado.latitude, null);
  assert.equal(resultado.longitude, null);
});

test("Erros inesperados sem statusCode permanecem intactos nas seis operações", async (t) => {
  const erro = new Error("Falha interna sem classificação HTTP");
  const respostas = Object.fromEntries(METODOS.map((nome) => [
    nome, async () => { throw erro; },
  ]));
  const { eventos } = simularRepositorio(t, respostas);
  for (const executar of operacoes(USUARIO_A)) {
    await assert.rejects(executar, (recebido) => {
      assert.strictEqual(recebido, erro);
      assert.equal(recebido.statusCode, undefined);
      assert.equal(recebido.code, undefined);
      return true;
    });
  }
  assert.deepEqual(eventos, [
    "buscarLocalAutorizadoNoAmbiente", "listarPermitidasNoAmbiente", "buscarPorIdEAmbiente",
    "buscarLocalAutorizadoNoAmbiente", "buscarPorIdEAmbiente", "excluirNoAmbiente",
  ]);
});


// Contrato opcional de criação: o mesmo conteúdo de registro é usado nos três
// caminhos. Somente a sequência executada pode determinar o booleano criada.
function simularResultadoCriacao(t, caminho, usuario = USUARIO_A) {
  const registro = Object.freeze({
    ...CRIACAO, id_operacao_cliente: OPERACAO,
    id_evidencia: 50, id_usuario: usuario.id_usuario,
    data_criacao: "2020-01-01T00:00:00.000Z",
    data_atualizacao: "2020-01-01T00:00:00.000Z",
  });
  let buscas = 0;
  const respostas = {
    buscarLocalAutorizadoNoAmbiente: { id_local: 40 },
    buscarPorOperacaoClienteNoAmbiente: () => {
      buscas += 1;
      if (caminho === "repeticao" || (caminho === "conflito" && buscas === 2)) return registro;
      return null;
    },
  };
  if (caminho === "criacao") respostas.criarNoAmbiente = registro;
  if (caminho === "conflito") {
    respostas.criarNoAmbiente = async () => { throw conflitoIdempotencia(); };
  }
  const simulado = simularRepositorio(t, respostas);
  return { ...simulado, registro, usuario, caminho };
}

function verificarFluxoResultadoCriacao(simulado) {
  const { mocks, eventos, usuario, caminho } = simulado;
  const esperado = ["buscarLocalAutorizadoNoAmbiente", "buscarPorOperacaoClienteNoAmbiente"];
  if (caminho !== "repeticao") esperado.push("criarNoAmbiente");
  if (caminho === "conflito") esperado.push("buscarPorOperacaoClienteNoAmbiente");
  assert.deepEqual(eventos, esperado);
  assert.deepEqual(unica(mocks.buscarLocalAutorizadoNoAmbiente), [40, usuario]);
  assert.equal(mocks.buscarPorOperacaoClienteNoAmbiente.mock.callCount(), caminho === "conflito" ? 2 : 1);
  for (const chamada of mocks.buscarPorOperacaoClienteNoAmbiente.mock.calls) {
    assert.deepEqual(chamada.arguments, [OPERACAO, 40, usuario]);
  }
  if (caminho === "repeticao") assert.equal(mocks.criarNoAmbiente.mock.callCount(), 0);
  else assert.deepEqual(unica(mocks.criarNoAmbiente), [
    { ...CRIACAO, id_operacao_cliente: OPERACAO }, usuario,
  ]);
  for (const metodo of METODOS.filter((nome) => ![
    "buscarLocalAutorizadoNoAmbiente", "buscarPorOperacaoClienteNoAmbiente", "criarNoAmbiente",
  ].includes(nome))) assert.equal(mocks[metodo].mock.callCount(), 0);
}

function verificarEnvelopeCriacao(resultado, registro, criada) {
  assert.deepEqual(Object.keys(resultado).sort(), ["criada", "evidencia"]);
  assert.strictEqual(resultado.evidencia, registro);
  assert.equal(typeof resultado.criada, "boolean");
  assert.strictEqual(resultado.criada, criada);
}

test("Resultado de criação: criação efetiva, opção true", async (t) => {
  const simulado = simularResultadoCriacao(t, "criacao");
  const resultado = await service.criarEvidencia(
    { ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A, { incluirResultadoCriacao: true }
  );
  verificarEnvelopeCriacao(resultado, simulado.registro, true);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: criação efetiva, dois argumentos", async (t) => {
  const simulado = simularResultadoCriacao(t, "criacao");
  const resultado = await service.criarEvidencia(
    { ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A
  );
  assert.strictEqual(resultado, simulado.registro);
  assert.equal(Object.hasOwn(resultado, "criada"), false);
  assert.equal(Object.hasOwn(resultado, "evidencia"), false);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: criação efetiva, objeto vazio", async (t) => {
  const simulado = simularResultadoCriacao(t, "criacao");
  const resultado = await service.criarEvidencia(
    { ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A, {}
  );
  assert.strictEqual(resultado, simulado.registro);
  assert.equal(Object.hasOwn(resultado, "criada"), false);
  assert.equal(Object.hasOwn(resultado, "evidencia"), false);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: criação efetiva, opção false", async (t) => {
  const simulado = simularResultadoCriacao(t, "criacao");
  const resultado = await service.criarEvidencia(
    { ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A, { incluirResultadoCriacao: false }
  );
  assert.strictEqual(resultado, simulado.registro);
  assert.equal(Object.hasOwn(resultado, "criada"), false);
  assert.equal(Object.hasOwn(resultado, "evidencia"), false);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: opção herdada não ativa envelope em criação efetiva", async (t) => {
  const simulado = simularResultadoCriacao(t, "criacao");
  const opcoes = Object.create({ incluirResultadoCriacao: true });
  const resultado = await service.criarEvidencia(
    { ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A, opcoes
  );
  assert.strictEqual(resultado, simulado.registro);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: corpo não determina criada em criação efetiva", async (t) => {
  const simulado = simularResultadoCriacao(t, "criacao");
  const resultado = await service.criarEvidencia({
    ...DADOS, id_operacao_cliente: OPERACAO,
    criada: false, evidencia: { id_evidencia: 999 },
    incluirResultadoCriacao: false, opcoes: { incluirResultadoCriacao: false },
    data_criacao: "2099-01-01T00:00:00.000Z", id_evidencia: 999,
    id_usuario: 999, id_ambiente: AMBIENTE_B, perfil_acesso: "ADMINISTRADOR",
  }, USUARIO_A, { incluirResultadoCriacao: true, criada: false });
  verificarEnvelopeCriacao(resultado, simulado.registro, true);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: ambiente B permanece isolado em criação efetiva", async (t) => {
  const simulado = simularResultadoCriacao(t, "criacao", USUARIO_B);
  const resultado = await service.criarEvidencia({
    ...DADOS, id_operacao_cliente: OPERACAO,
    id_usuario: USUARIO_A.id_usuario, id_ambiente: AMBIENTE_A, perfil_acesso: "ADMINISTRADOR",
  }, { ...USUARIO_B, id_usuario: "20" }, { incluirResultadoCriacao: true });
  verificarEnvelopeCriacao(resultado, simulado.registro, true);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: repetição anterior ao INSERT, opção true", async (t) => {
  const simulado = simularResultadoCriacao(t, "repeticao");
  const resultado = await service.criarEvidencia(
    { ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A, { incluirResultadoCriacao: true }
  );
  verificarEnvelopeCriacao(resultado, simulado.registro, false);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: repetição anterior ao INSERT, dois argumentos", async (t) => {
  const simulado = simularResultadoCriacao(t, "repeticao");
  const resultado = await service.criarEvidencia(
    { ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A
  );
  assert.strictEqual(resultado, simulado.registro);
  assert.equal(Object.hasOwn(resultado, "criada"), false);
  assert.equal(Object.hasOwn(resultado, "evidencia"), false);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: repetição anterior ao INSERT, objeto vazio", async (t) => {
  const simulado = simularResultadoCriacao(t, "repeticao");
  const resultado = await service.criarEvidencia(
    { ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A, {}
  );
  assert.strictEqual(resultado, simulado.registro);
  assert.equal(Object.hasOwn(resultado, "criada"), false);
  assert.equal(Object.hasOwn(resultado, "evidencia"), false);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: repetição anterior ao INSERT, opção false", async (t) => {
  const simulado = simularResultadoCriacao(t, "repeticao");
  const resultado = await service.criarEvidencia(
    { ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A, { incluirResultadoCriacao: false }
  );
  assert.strictEqual(resultado, simulado.registro);
  assert.equal(Object.hasOwn(resultado, "criada"), false);
  assert.equal(Object.hasOwn(resultado, "evidencia"), false);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: opção herdada não ativa envelope em repetição anterior ao INSERT", async (t) => {
  const simulado = simularResultadoCriacao(t, "repeticao");
  const opcoes = Object.create({ incluirResultadoCriacao: true });
  const resultado = await service.criarEvidencia(
    { ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A, opcoes
  );
  assert.strictEqual(resultado, simulado.registro);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: corpo não determina criada em repetição anterior ao INSERT", async (t) => {
  const simulado = simularResultadoCriacao(t, "repeticao");
  const resultado = await service.criarEvidencia({
    ...DADOS, id_operacao_cliente: OPERACAO,
    criada: true, evidencia: { id_evidencia: 999 },
    incluirResultadoCriacao: false, opcoes: { incluirResultadoCriacao: false },
    data_criacao: "2099-01-01T00:00:00.000Z", id_evidencia: 999,
    id_usuario: 999, id_ambiente: AMBIENTE_B, perfil_acesso: "ADMINISTRADOR",
  }, USUARIO_A, { incluirResultadoCriacao: true, criada: true });
  verificarEnvelopeCriacao(resultado, simulado.registro, false);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: ambiente B permanece isolado em repetição anterior ao INSERT", async (t) => {
  const simulado = simularResultadoCriacao(t, "repeticao", USUARIO_B);
  const resultado = await service.criarEvidencia({
    ...DADOS, id_operacao_cliente: OPERACAO,
    id_usuario: USUARIO_A.id_usuario, id_ambiente: AMBIENTE_A, perfil_acesso: "ADMINISTRADOR",
  }, { ...USUARIO_B, id_usuario: "20" }, { incluirResultadoCriacao: true });
  verificarEnvelopeCriacao(resultado, simulado.registro, false);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: recuperação após conflito, opção true", async (t) => {
  const simulado = simularResultadoCriacao(t, "conflito");
  const resultado = await service.criarEvidencia(
    { ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A, { incluirResultadoCriacao: true }
  );
  verificarEnvelopeCriacao(resultado, simulado.registro, false);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: recuperação após conflito, dois argumentos", async (t) => {
  const simulado = simularResultadoCriacao(t, "conflito");
  const resultado = await service.criarEvidencia(
    { ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A
  );
  assert.strictEqual(resultado, simulado.registro);
  assert.equal(Object.hasOwn(resultado, "criada"), false);
  assert.equal(Object.hasOwn(resultado, "evidencia"), false);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: recuperação após conflito, objeto vazio", async (t) => {
  const simulado = simularResultadoCriacao(t, "conflito");
  const resultado = await service.criarEvidencia(
    { ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A, {}
  );
  assert.strictEqual(resultado, simulado.registro);
  assert.equal(Object.hasOwn(resultado, "criada"), false);
  assert.equal(Object.hasOwn(resultado, "evidencia"), false);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: recuperação após conflito, opção false", async (t) => {
  const simulado = simularResultadoCriacao(t, "conflito");
  const resultado = await service.criarEvidencia(
    { ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A, { incluirResultadoCriacao: false }
  );
  assert.strictEqual(resultado, simulado.registro);
  assert.equal(Object.hasOwn(resultado, "criada"), false);
  assert.equal(Object.hasOwn(resultado, "evidencia"), false);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: opção herdada não ativa envelope em recuperação após conflito", async (t) => {
  const simulado = simularResultadoCriacao(t, "conflito");
  const opcoes = Object.create({ incluirResultadoCriacao: true });
  const resultado = await service.criarEvidencia(
    { ...DADOS, id_operacao_cliente: OPERACAO }, USUARIO_A, opcoes
  );
  assert.strictEqual(resultado, simulado.registro);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: corpo não determina criada em recuperação após conflito", async (t) => {
  const simulado = simularResultadoCriacao(t, "conflito");
  const resultado = await service.criarEvidencia({
    ...DADOS, id_operacao_cliente: OPERACAO,
    criada: true, evidencia: { id_evidencia: 999 },
    incluirResultadoCriacao: false, opcoes: { incluirResultadoCriacao: false },
    data_criacao: "2099-01-01T00:00:00.000Z", id_evidencia: 999,
    id_usuario: 999, id_ambiente: AMBIENTE_B, perfil_acesso: "ADMINISTRADOR",
  }, USUARIO_A, { incluirResultadoCriacao: true, criada: true });
  verificarEnvelopeCriacao(resultado, simulado.registro, false);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: ambiente B permanece isolado em recuperação após conflito", async (t) => {
  const simulado = simularResultadoCriacao(t, "conflito", USUARIO_B);
  const resultado = await service.criarEvidencia({
    ...DADOS, id_operacao_cliente: OPERACAO,
    id_usuario: USUARIO_A.id_usuario, id_ambiente: AMBIENTE_A, perfil_acesso: "ADMINISTRADOR",
  }, { ...USUARIO_B, id_usuario: "20" }, { incluirResultadoCriacao: true });
  verificarEnvelopeCriacao(resultado, simulado.registro, false);
  verificarFluxoResultadoCriacao(simulado);
});

test("Resultado de criação: rejeita contêineres de opções inválidos antes de consultar", async (t) => {
  const { mocks } = simularRepositorio(t);
  for (const opcoes of [null, [], [true], true, false, 0, 1, "", "true", () => true]) {
    await assert.rejects(service.criarEvidencia(DADOS, USUARIO_A, opcoes), {
      statusCode: 400, message: "Opções da criação inválidas.",
    });
  }
  semChamadas(mocks);
});

test("Resultado de criação: exige booleano próprio sem coerção de valores", async (t) => {
  const { mocks } = simularRepositorio(t);
  for (const incluirResultadoCriacao of [undefined, null, 0, 1, "", "true", "false", [], {}, new Boolean(true)]) {
    await assert.rejects(service.criarEvidencia(DADOS, USUARIO_A, { incluirResultadoCriacao }), {
      statusCode: 400, message: "A opção incluirResultadoCriacao deve ser booleana.",
    });
  }
  semChamadas(mocks);
});

test("Resultado de criação: local não autorizado mantém 404 antes de qualquer recuperação", async (t) => {
  const { mocks, eventos } = simularRepositorio(t, { buscarLocalAutorizadoNoAmbiente: null });
  await assert.rejects(service.criarEvidencia({
    ...DADOS, id_operacao_cliente: OPERACAO,
  }, USUARIO_B, { incluirResultadoCriacao: true }), {
    statusCode: 404, message: "Local não encontrado.",
  });
  assert.deepEqual(eventos, ["buscarLocalAutorizadoNoAmbiente"]);
  assert.deepEqual(unica(mocks.buscarLocalAutorizadoNoAmbiente), [40, USUARIO_B]);
  assert.equal(mocks.buscarPorOperacaoClienteNoAmbiente.mock.callCount(), 0);
  assert.equal(mocks.criarNoAmbiente.mock.callCount(), 0);
});

test("Resultado de criação: colisão sem repetição autorizada preserva conflito genérico", async (t) => {
  const conflito = conflitoIdempotencia();
  const { mocks, eventos } = simularRepositorio(t, respostasCriacao({
    buscarPorOperacaoClienteNoAmbiente: null,
    criarNoAmbiente: async () => { throw conflito; },
  }));
  await assert.rejects(service.criarEvidencia({
    ...DADOS, id_operacao_cliente: OPERACAO,
  }, USUARIO_B, { incluirResultadoCriacao: true }), (erro) => {
    assert.strictEqual(erro, conflito);
    assert.equal(erro.statusCode, 409);
    assert.equal(erro.message, "Não foi possível processar esta chave de operação.");
    assert.equal(erro.detail, undefined);
    assert.equal(erro.evidencia, undefined);
    assert.equal(erro.criada, undefined);
    assert.equal(erro.message.includes(AMBIENTE_A), false);
    return true;
  });
  assert.deepEqual(eventos, [
    "buscarLocalAutorizadoNoAmbiente", "buscarPorOperacaoClienteNoAmbiente",
    "criarNoAmbiente", "buscarPorOperacaoClienteNoAmbiente",
  ]);
  for (const chamada of mocks.buscarPorOperacaoClienteNoAmbiente.mock.calls) {
    assert.deepEqual(chamada.arguments, [OPERACAO, 40, USUARIO_B]);
  }
  assert.deepEqual(unica(mocks.criarNoAmbiente), [
    { ...CRIACAO, id_operacao_cliente: OPERACAO }, USUARIO_B,
  ]);
});

test("Resultado de criação: outras violações e falhas internas não se tornam envelopes", async (t) => {
  let erroAtual;
  const erros = [
    Object.assign(new Error("Outra unicidade"), { code: "23505", constraint: "outra_constraint" }),
    Object.assign(new Error("Erro PostgreSQL bruto"), {
      code: "23505", constraint: "uq_evidencia_id_operacao_cliente",
    }),
    Object.assign(new Error("Outra origem do conflito"), {
      statusCode: 409, code: "23505", constraint: "outra_constraint",
    }),
    new Error("Falha interna"),
    Object.assign(new Error("Falha controlada"), { statusCode: 500 }),
  ];
  const { mocks, eventos } = simularRepositorio(t, respostasCriacao({
    buscarPorOperacaoClienteNoAmbiente: null,
    criarNoAmbiente: async () => { throw erroAtual; },
  }));
  for (const erro of erros) {
    erroAtual = erro;
    await assert.rejects(service.criarEvidencia({
      ...DADOS, id_operacao_cliente: OPERACAO,
    }, USUARIO_A, { incluirResultadoCriacao: true }), (recebido) => recebido === erro);
  }
  assert.equal(mocks.buscarPorOperacaoClienteNoAmbiente.mock.callCount(), erros.length);
  assert.equal(mocks.criarNoAmbiente.mock.callCount(), erros.length);
  assert.deepEqual(eventos, erros.flatMap(() => [
    "buscarLocalAutorizadoNoAmbiente", "buscarPorOperacaoClienteNoAmbiente", "criarNoAmbiente",
  ]));
});

test("Resultado de criação: falha na recuperação após conflito é propagada intacta", async (t) => {
  const erro = new Error("Recuperação indisponível");
  let buscas = 0;
  const { mocks, eventos } = simularRepositorio(t, respostasCriacao({
    buscarPorOperacaoClienteNoAmbiente: async () => {
      if (++buscas === 1) return null;
      throw erro;
    },
    criarNoAmbiente: async () => { throw conflitoIdempotencia(); },
  }));
  await assert.rejects(service.criarEvidencia({
    ...DADOS, id_operacao_cliente: OPERACAO,
  }, USUARIO_A, { incluirResultadoCriacao: true }), (recebido) => recebido === erro);
  assert.equal(mocks.buscarPorOperacaoClienteNoAmbiente.mock.callCount(), 2);
  assert.deepEqual(eventos, [
    "buscarLocalAutorizadoNoAmbiente", "buscarPorOperacaoClienteNoAmbiente",
    "criarNoAmbiente", "buscarPorOperacaoClienteNoAmbiente",
  ]);
});

test("Resultado de criação: INSERT sem registro autorizado mantém 404, nunca criada true", async (t) => {
  const { mocks, eventos } = simularRepositorio(t, respostasCriacao({ criarNoAmbiente: null }));
  await assert.rejects(service.criarEvidencia(DADOS, USUARIO_A, { incluirResultadoCriacao: true }), {
    statusCode: 404, message: "Local não encontrado.",
  });
  assert.deepEqual(unica(mocks.criarNoAmbiente), [CRIACAO, USUARIO_A]);
  assert.deepEqual(eventos, ["buscarLocalAutorizadoNoAmbiente", "criarNoAmbiente"]);
});



