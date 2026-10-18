const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const repository = require("../src/repositories/localMultiTenantRepository");

const AMBIENTE_A = "11111111-1111-4111-8111-111111111111";
const AMBIENTE_B = "22222222-2222-4222-8222-222222222222";
const USUARIO_A = { id_usuario: 10, id_ambiente: AMBIENTE_A };
const USUARIO_B = { id_usuario: 20, id_ambiente: AMBIENTE_B };
const DADOS = {
  nomeLocal: "Tanque A",
  setor: "Setor A",
  descricao: "Descrição A",
  endereco: "Endereço A",
  latitude: -23.5,
  longitude: -46.6,
  status: "ATIVO",
  idCampanha: 30,
};
const LOCAL = {
  id_local: 40,
  nome_local: DADOS.nomeLocal,
  setor: DADOS.setor,
  descricao: DADOS.descricao,
  endereco: DADOS.endereco,
  latitude: DADOS.latitude,
  longitude: DADOS.longitude,
  status: "ATIVO",
  id_campanha: 30,
  data_criacao: "2026-10-14T12:00:00.000Z",
  data_atualizacao: "2026-10-14T12:00:00.000Z",
};
const IDS_INVALIDOS = [
  undefined, null, "", "   ", "id-invalido", 0, -1, 1.5,
  NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, true, {}, [], [30],
  "30; DROP TABLE local; --",
];

// Toda consulta é interceptada. A conexão direta também é bloqueada.
function simularBanco(t, rows = []) {
  t.mock.method(pool, "connect", async () => {
    throw new Error("Conexão real proibida neste teste");
  });
  return t.mock.method(pool, "query", async () => ({ rows }));
}

function consultaUnica(consulta) {
  assert.equal(consulta.mock.callCount(), 1);
  return consulta.mock.calls[0].arguments;
}

function escritas(usuario, dados = DADOS) {
  return [
    () => repository.criarNoAmbiente(dados, usuario),
    () => repository.atualizarNoAmbiente(40, dados, usuario),
    () => repository.atualizarStatusNoAmbiente(40, "INATIVO", usuario),
  ];
}

function verificarAutorizacao(sql) {
  assert.match(sql, /AND\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+usuario\s+AS\s+u/i);
  assert.match(sql, /u\.id_usuario\s*=\s*\$3/i);
  assert.match(sql, /u\.id_ambiente\s*=\s*c\.id_ambiente/i);
  assert.match(sql, /AND\s*\(\s*u\.perfil_acesso\s*=\s*'ADMINISTRADOR'\s+OR\s+c\.id_usuario\s*=\s*u\.id_usuario\s*\)/i);
}

test("Recusa UUID de ambiente inválido nas seis funções antes de consultar", async (t) => {
  const consulta = simularBanco(t);
  for (const ambiente of [undefined, null, "", 123, "ambiente-invalido", "11111111-1111-4111-8111-11111111111Z"]) {
    const usuario = { ...USUARIO_A, id_ambiente: ambiente };
    const operacoes = [
      ...escritas(usuario),
      () => repository.listarPorAmbiente(ambiente),
      () => repository.buscarPorIdEAmbiente(40, ambiente),
      () => repository.listarParaExportacaoPorAmbiente(ambiente, { id_usuario: 10, id_ambiente: ambiente }),
    ];
    for (const executar of operacoes) {
      await assert.rejects(executar, {
        statusCode: 403,
        message: "Identificação do ambiente inválida.",
      });
    }
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("Recusa IDs de local inválidos na busca e nas duas atualizações", async (t) => {
  const consulta = simularBanco(t);
  for (const id of IDS_INVALIDOS) {
    const operacoes = [
      () => repository.buscarPorIdEAmbiente(id, AMBIENTE_A),
      () => repository.atualizarNoAmbiente(id, DADOS, USUARIO_A),
      () => repository.atualizarStatusNoAmbiente(id, "ATIVO", USUARIO_A),
    ];
    for (const executar of operacoes) {
      await assert.rejects(executar, { statusCode: 400, message: "ID do local inválido." });
    }
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("Recusa IDs de campanha inválidos na criação", async (t) => {
  const consulta = simularBanco(t);
  for (const idCampanha of IDS_INVALIDOS) {
    await assert.rejects(
      repository.criarNoAmbiente({ ...DADOS, idCampanha }, USUARIO_A),
      { statusCode: 400, message: "ID da campanha inválido." }
    );
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("Recusa IDs de usuário inválidos nas três escritas", async (t) => {
  const consulta = simularBanco(t);
  for (const id_usuario of IDS_INVALIDOS) {
    for (const executar of escritas({ ...USUARIO_A, id_usuario })) {
      await assert.rejects(executar, { statusCode: 403, message: "Usuário inválido." });
    }
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("Recusa as três escritas sem usuário autenticado", async (t) => {
  const consulta = simularBanco(t);
  for (const usuario of [undefined, null]) {
    for (const executar of escritas(usuario)) {
      await assert.rejects(executar, { statusCode: 401, message: "Usuário não autenticado." });
    }
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("Cria local com INSERT SELECT parametrizado e retorna as colunas legadas", async (t) => {
  const consulta = simularBanco(t, [LOCAL]);
  const resultado = await repository.criarNoAmbiente(DADOS, USUARIO_A);
  const [sql, parametros] = consultaUnica(consulta);

  assert.deepEqual(resultado, LOCAL);
  assert.match(sql, /INSERT\s+INTO\s+local\s+AS\s+l\s*\(/i);
  assert.match(sql, /SELECT\s+\$4,\s*\$5,\s*\$6,\s*\$7,\s*\$8,\s*\$9,\s*\$10,\s*c\.id_campanha\s+FROM\s+campanha\s+AS\s+c/i);
  assert.match(sql, /RETURNING\s+l\.id_local/i);
  for (const coluna of Object.keys(LOCAL)) {
    assert.ok(sql.includes(`l.${coluna}`));
  }
  assert.deepEqual(parametros, [
    30, AMBIENTE_A, 10, DADOS.nomeLocal, DADOS.setor, DADOS.descricao,
    DADOS.endereco, DADOS.latitude, DADOS.longitude, "ATIVO",
  ]);
});

test("Restringe a criação à campanha do ambiente autenticado e ignora identidade no corpo", async (t) => {
  const consulta = simularBanco(t, [LOCAL]);
  await repository.criarNoAmbiente({
    ...DADOS,
    id_ambiente: AMBIENTE_B,
    idAmbiente: AMBIENTE_B,
    id_usuario: 999,
    idUsuario: 999,
    perfil_acesso: "ADMINISTRADOR",
  }, USUARIO_A);
  const [sql, parametros] = consultaUnica(consulta);

  assert.match(sql, /WHERE\s+c\.id_campanha\s*=\s*\$1\s+AND\s+c\.id_ambiente\s*=\s*\$2/i);
  assert.deepEqual(parametros.slice(0, 3), [30, AMBIENTE_A, 10]);
  assert.equal(parametros.includes(AMBIENTE_B), false);
  assert.equal(parametros.includes(999), false);
  assert.equal(sql.includes(AMBIENTE_B), false);
  const colunasInsert = sql.match(/INSERT\s+INTO\s+local\s+AS\s+l\s*\(([^)]*)\)/i)[1];
  assert.doesNotMatch(colunasInsert, /id_ambiente/i);
});

test("Exige administrador do mesmo ambiente ou responsável pela campanha na criação", async (t) => {
  const consulta = simularBanco(t);
  await repository.criarNoAmbiente(DADOS, USUARIO_A);
  const [sql] = consultaUnica(consulta);
  verificarAutorizacao(sql);
});

test("Lista locais com filtro pelo ambiente A ou B e preserva nome da campanha", async (t) => {
  const consulta = simularBanco(t, [{ ...LOCAL, nome_campanha: "Campanha" }]);
  for (const [indice, ambiente] of [AMBIENTE_A, AMBIENTE_B].entries()) {
    const resultado = await repository.listarPorAmbiente(ambiente);
    const [sql, parametros] = consulta.mock.calls[indice].arguments;
    assert.deepEqual(resultado, [{ ...LOCAL, nome_campanha: "Campanha" }]);
    assert.match(sql, /c\.id_campanha\s*=\s*l\.id_campanha/i);
    assert.match(sql, /WHERE\s+c\.id_ambiente\s*=\s*\$1/i);
    assert.match(sql, /c\.nome_campanha/i);
    assert.match(sql, /ORDER\s+BY\s+l\.data_criacao\s+DESC/i);
    assert.deepEqual(parametros, [ambiente]);
  }
  assert.equal(consulta.mock.callCount(), 2);
});

test("Busca local por ID e ambiente A ou B com parâmetros separados", async (t) => {
  const consulta = simularBanco(t, [LOCAL]);
  for (const [indice, ambiente] of [AMBIENTE_A, AMBIENTE_B].entries()) {
    assert.deepEqual(await repository.buscarPorIdEAmbiente("40", ambiente), LOCAL);
    const [sql, parametros] = consulta.mock.calls[indice].arguments;
    assert.match(sql, /c\.id_campanha\s*=\s*l\.id_campanha/i);
    assert.match(sql, /WHERE\s+l\.id_local\s*=\s*\$1\s+AND\s+c\.id_ambiente\s*=\s*\$2/i);
    assert.match(sql, /LIMIT\s+1/i);
    assert.deepEqual(parametros, [40, ambiente]);
  }
  assert.equal(consulta.mock.callCount(), 2);
});

test("Retorna null quando o local não é encontrado no ambiente", async (t) => {
  const consulta = simularBanco(t);
  assert.equal(await repository.buscarPorIdEAmbiente(40, AMBIENTE_B), null);
  const [, parametros] = consultaUnica(consulta);
  assert.deepEqual(parametros, [40, AMBIENTE_B]);
});

test("Atualiza local com filtros de local, vínculo com campanha e ambiente", async (t) => {
  const consulta = simularBanco(t, [LOCAL]);
  assert.deepEqual(await repository.atualizarNoAmbiente("40", DADOS, USUARIO_A), LOCAL);
  const [sql, parametros] = consultaUnica(consulta);

  assert.match(sql, /UPDATE\s+local\s+AS\s+l/i);
  assert.match(sql, /FROM\s+campanha\s+AS\s+c/i);
  assert.match(sql, /WHERE\s+l\.id_local\s*=\s*\$1\s+AND\s+c\.id_campanha\s*=\s*l\.id_campanha\s+AND\s+c\.id_ambiente\s*=\s*\$2/i);
  assert.match(sql, /nome_local\s*=\s*CASE WHEN \$10::boolean THEN \$4 ELSE l\.nome_local END/i);
  assert.match(sql, /longitude\s*=\s*CASE WHEN \$15::boolean THEN \$9 ELSE l\.longitude END/i);
  assert.match(sql, /data_atualizacao\s*=\s*CURRENT_TIMESTAMP/i);
  assert.match(sql, /RETURNING\s+l\.id_local/i);
  assert.deepEqual(parametros, [
    40, AMBIENTE_A, 10, DADOS.nomeLocal, DADOS.setor, DADOS.descricao,
    DADOS.endereco, DADOS.latitude, DADOS.longitude,
    true, true, true, true, true, true,
  ]);
});

test("Exige usuário e ambiente ativos no SQL das três escritas", async (t) => {
  const consulta = simularBanco(t);
  for (const executar of escritas(USUARIO_A)) {
    await executar();
  }
  assert.equal(consulta.mock.callCount(), 3);
  for (const chamada of consulta.mock.calls) {
    const sql = chamada.arguments[0];
    assert.match(sql, /INNER\s+JOIN\s+ambiente\s+AS\s+a\s+ON\s+a\.id_ambiente\s*=\s*u\.id_ambiente/i);
    assert.match(sql, /AND\s+u\.ativo\s*=\s*TRUE\s+AND\s+a\.ativo\s*=\s*TRUE/i);
  }
});

test("Exige administrador ou responsável nas duas atualizações", async (t) => {
  const consulta = simularBanco(t);
  await repository.atualizarNoAmbiente(40, DADOS, USUARIO_A);
  await repository.atualizarStatusNoAmbiente(40, "INATIVO", USUARIO_A);
  assert.equal(consulta.mock.callCount(), 2);
  for (const chamada of consulta.mock.calls) {
    const sql = chamada.arguments[0];
    verificarAutorizacao(sql);
    assert.match(sql, /c\.id_campanha\s*=\s*l\.id_campanha/i);
    assert.match(sql, /c\.id_ambiente\s*=\s*\$2/i);
  }
});

test("Não altera id_campanha nem identidade fornecidos nos dados da atualização", async (t) => {
  const consulta = simularBanco(t, [LOCAL]);
  await repository.atualizarNoAmbiente(40, {
    ...DADOS, idCampanha: 999, id_campanha: 999,
    id_usuario: 999, id_ambiente: AMBIENTE_B, perfil_acesso: "ADMINISTRADOR",
  }, USUARIO_A);
  await repository.atualizarStatusNoAmbiente(40, "INATIVO", USUARIO_A);

  assert.equal(consulta.mock.callCount(), 2);
  for (const chamada of consulta.mock.calls) {
    const [sql, parametros] = chamada.arguments;
    const set = sql.match(/\bSET\b([\s\S]*?)\bFROM\b/i)[1];
    assert.doesNotMatch(set, /id_campanha|id_ambiente|id_usuario|perfil_acesso/i);
    assert.equal(parametros.includes(999), false);
    assert.equal(parametros.includes(AMBIENTE_B), false);
  }
});

test("Alteração de status aceita somente ATIVO e INATIVO", async (t) => {
  const consulta = simularBanco(t);
  for (const status of [undefined, null, "", "ATIVA", "EM ANDAMENTO", "ativo", "ATIVO ", 1]) {
    await assert.rejects(
      repository.atualizarStatusNoAmbiente(40, status, USUARIO_A),
      { statusCode: 400, message: "O status deve ser ATIVO ou INATIVO." }
    );
  }
  assert.equal(consulta.mock.callCount(), 0);

  const resultados = [];
  consulta.mock.mockImplementation(async (_sql, parametros) => ({
    rows: [{ ...LOCAL, status: parametros[3] }],
  }));
  for (const status of ["ATIVO", "INATIVO"]) {
    resultados.push(await repository.atualizarStatusNoAmbiente(40, status, USUARIO_A));
  }
  assert.equal(consulta.mock.callCount(), 2);
  for (const [indice, status] of ["ATIVO", "INATIVO"].entries()) {
    const [sql, parametros] = consulta.mock.calls[indice].arguments;
    assert.deepEqual(resultados[indice], { ...LOCAL, status });
    assert.match(sql, /SET\s+status\s*=\s*\$4/i);
    assert.match(sql, /data_atualizacao\s*=\s*CURRENT_TIMESTAMP/i);
    assert.deepEqual(parametros, [40, AMBIENTE_A, 10, status]);
  }
});

test("Retorna null nas três escritas quando nenhum registro é autorizado", async (t) => {
  const consulta = simularBanco(t);
  for (const executar of escritas(USUARIO_B)) {
    assert.equal(await executar(), null);
  }
  assert.equal(consulta.mock.callCount(), 3);
});

test("Exportação filtra os ambientes A e B por WHERE c.id_ambiente = $1", async (t) => {
  const registros = [{ id_local: 40, nome_campanha: "Campanha", id_evidencia: null }];
  const consulta = simularBanco(t, registros);
  for (const [indice, ambiente] of [AMBIENTE_A, AMBIENTE_B].entries()) {
    assert.deepEqual(await repository.listarParaExportacaoPorAmbiente(ambiente, { id_usuario: 10, id_ambiente: ambiente }), registros);
    const [sql, parametros] = consulta.mock.calls[indice].arguments;
    assert.match(sql, /c\.id_campanha\s*=\s*l\.id_campanha/i);
    assert.match(sql, /WHERE\s+c\.id_ambiente\s*=\s*\$1\s+AND\s+EXISTS/i);
    assert.deepEqual(parametros, [ambiente, 10]);
    assert.match(sql, /u\.id_usuario\s*=\s*\$2/);
    assert.match(sql, /u\.ativo\s*=\s*TRUE/);
    assert.match(sql, /a\.ativo\s*=\s*TRUE/);
    assert.match(sql, /c\.id_usuario\s*=\s*u\.id_usuario/);
  }
  assert.equal(consulta.mock.callCount(), 2);
});

test("Exportação preserva LEFT JOIN evidencia, aliases legados e locais sem fotos", async (t) => {
  const registros = [{ id_local: 40, id_evidencia: null }];
  const consulta = simularBanco(t, registros);
  assert.deepEqual(await repository.listarParaExportacaoPorAmbiente(AMBIENTE_A, USUARIO_A), registros);
  const [sql] = consultaUnica(consulta);

  assert.match(sql, /LEFT\s+JOIN\s+evidencia\s+AS\s+e\s+ON\s+e\.id_local\s*=\s*l\.id_local/i);
  const where = sql.match(/\bWHERE\b([\s\S]*?)\bORDER\s+BY\b/i)[1];
  assert.doesNotMatch(where, /e\./i);
  for (const alias of ["latitude_local", "longitude_local", "tipo_evidencia", "descricao_evidencia", "latitude_foto", "longitude_foto"]) {
    assert.ok(sql.includes(`AS ${alias}`));
  }
  assert.match(sql, /e\.origem_coordenadas/i);
  assert.match(sql, /e\.precisao_gps/i);
  assert.match(sql, /l\.id_local\s+ASC,\s*e\.id_evidencia\s+ASC/i);
});

test("Não interpola valores do cliente no SQL das seis funções", async (t) => {
  const consulta = simularBanco(t);
  const texto = "Local d'água'; DROP TABLE local; --";
  const usuario = { id_usuario: 78901, id_ambiente: AMBIENTE_B };
  const dados = { ...DADOS, nomeLocal: texto, idCampanha: 78902 };

  await repository.criarNoAmbiente(dados, usuario);
  await repository.listarPorAmbiente(AMBIENTE_B);
  await repository.buscarPorIdEAmbiente(78903, AMBIENTE_B);
  await repository.atualizarNoAmbiente(78903, dados, usuario);
  await repository.atualizarStatusNoAmbiente(78903, "INATIVO", usuario);
  await repository.listarParaExportacaoPorAmbiente(AMBIENTE_B, USUARIO_B);

  assert.equal(consulta.mock.callCount(), 6);
  for (const chamada of consulta.mock.calls) {
    const [sql, parametros] = chamada.arguments;
    assert.match(sql, /\$\d+/);
    assert.ok(Array.isArray(parametros));
    for (const valor of [texto, AMBIENTE_B, "78901", "78902", "78903"]) {
      assert.equal(sql.includes(valor), false);
    }
  }
  assert.equal(consulta.mock.calls[0].arguments[1][3], texto);
  assert.equal(consulta.mock.calls[3].arguments[1][3], texto);
});

test("O parâmetro $3 representa o usuário autenticado nas três escritas", async (t) => {
  const consulta = simularBanco(t);
  for (const executar of escritas({ id_usuario: "20", id_ambiente: AMBIENTE_B })) {
    await executar();
  }
  assert.equal(consulta.mock.callCount(), 3);
  for (const chamada of consulta.mock.calls) {
    const [sql, parametros] = chamada.arguments;
    assert.match(sql, /WHERE\s+u\.id_usuario\s*=\s*\$3/i);
    assert.equal(parametros[2], 20);
    assert.equal(parametros[1], AMBIENTE_B);
  }
});

test("As três escritas encaminham identidade A ou B sem usar ambiente e perfil do corpo", async (t) => {
  const consulta = simularBanco(t);
  for (const [indice, usuario] of [USUARIO_A, USUARIO_B].entries()) {
    const outroAmbiente = indice === 0 ? AMBIENTE_B : AMBIENTE_A;
    const dados = {
      ...DADOS, id_ambiente: outroAmbiente, id_usuario: 999,
      perfil_acesso: "ADMINISTRADOR",
    };
    for (const executar of escritas(usuario, dados)) {
      await executar();
    }
    const chamadas = consulta.mock.calls.slice(indice * 3, indice * 3 + 3);
    assert.equal(chamadas.length, 3);
    for (const [posicao, chamada] of chamadas.entries()) {
      const [sql, parametros] = chamada.arguments;
      assert.deepEqual(parametros.slice(0, 3), [
        posicao === 0 ? 30 : 40, usuario.id_ambiente, usuario.id_usuario,
      ]);
      assert.equal(parametros.includes(outroAmbiente), false);
      assert.equal(parametros.includes(999), false);
      verificarAutorizacao(sql);
    }
  }
  assert.equal(consulta.mock.callCount(), 6);
});
