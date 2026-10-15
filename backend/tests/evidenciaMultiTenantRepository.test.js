const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const pool = require("../src/config/database");
const repository = require("../src/repositories/evidenciaMultiTenantRepository");

const AMBIENTE_A = "11111111-1111-4111-8111-111111111111";
const AMBIENTE_B = "22222222-2222-4222-8222-222222222222";
const OPERACAO = "33333333-3333-4333-8333-333333333333";
const USUARIO_A = { id_usuario: 10, id_ambiente: AMBIENTE_A };
const USUARIO_B = { id_usuario: 20, id_ambiente: AMBIENTE_B };
const DADOS = {
  id_local: 40,
  tipo: "FOTO",
  caminho_arquivo: "uploads/evidencias/arquivo-legado.jpg",
  descricao: "Descrição simulada",
  id_operacao_cliente: OPERACAO,
  latitude: "-23.5",
  longitude: "-46.6",
  precisao_gps: "3.25",
  origem_coordenadas: "GPS",
  data_captura_gps: "2026-10-15T12:00:00.000Z",
};
const EVIDENCIA = {
  ...DADOS, id_evidencia: 50, id_usuario: 10,
  latitude: -23.5, longitude: -46.6, precisao_gps: 3.25,
};
const IDS_INVALIDOS = [
  undefined, null, "", "   ", "id-invalido", 0, -1, 1.5,
  NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, true, false, {}, [], [40],
];
const UUIDS_INVALIDOS = [undefined, null, "", 123, "uuid-invalido", "11111111-1111-4111-8111-11111111111Z"];
const CAMPOS_UPDATE = [
  "tipo", "caminho_arquivo", "descricao", "latitude", "longitude",
  "precisao_gps", "origem_coordenadas", "data_captura_gps",
];

function simularBanco(t, rows = []) {
  const conectar = t.mock.method(pool, "connect", async () => {
    throw new Error("Conexão real proibida neste teste");
  });
  const consulta = t.mock.method(pool, "query", async () => ({ rows }));
  t.after(() => assert.equal(conectar.mock.callCount(), 0));
  return { consulta, conectar };
}

function unica(consulta) {
  assert.equal(consulta.mock.callCount(), 1);
  return consulta.mock.calls[0].arguments;
}

function operacoes(usuario, dados = DADOS) {
  return [
    () => repository.criarNoAmbiente(dados, usuario),
    () => repository.listarPermitidasNoAmbiente(usuario),
    () => repository.buscarPorIdEAmbiente(50, usuario),
    () => repository.listarPorLocalEAmbiente(40, usuario),
    () => repository.buscarPorOperacaoClienteNoAmbiente(OPERACAO, 40, usuario),
    () => repository.atualizarNoAmbiente(50, { descricao: "Atualizada" }, usuario),
    () => repository.excluirNoAmbiente(50, usuario),
  ];
}

function verificarAutorizacao(sql) {
  assert.match(sql, /c\.id_ambiente\s*=\s*\$1/i);
  assert.match(sql, /AND\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+usuario\s+AS\s+solicitante/i);
  assert.match(sql, /solicitante\.id_usuario\s*=\s*\$2/i);
  assert.match(sql, /solicitante\.id_ambiente\s*=\s*c\.id_ambiente/i);
  assert.match(sql, /AND\s*\(\s*solicitante\.perfil_acesso\s*=\s*'ADMINISTRADOR'\s+OR\s+c\.id_usuario\s*=\s*solicitante\.id_usuario\s*\)/i);
}

test("Valida UUIDs e identificadores positivos seguros antes de consultar", async (t) => {
  const { consulta } = simularBanco(t);
  for (const id_ambiente of UUIDS_INVALIDOS) {
    for (const executar of operacoes({ ...USUARIO_A, id_ambiente })) {
      await assert.rejects(executar, { statusCode: 401 });
    }
  }
  for (const id of IDS_INVALIDOS) {
    for (const executar of [
      () => repository.criarNoAmbiente({ ...DADOS, id_local: id }, USUARIO_A),
      () => repository.buscarPorIdEAmbiente(id, USUARIO_A),
      () => repository.listarPorLocalEAmbiente(id, USUARIO_A),
      () => repository.buscarPorOperacaoClienteNoAmbiente(OPERACAO, id, USUARIO_A),
      () => repository.atualizarNoAmbiente(id, {}, USUARIO_A),
      () => repository.excluirNoAmbiente(id, USUARIO_A),
    ]) await assert.rejects(executar, { statusCode: 400 });
  }
  for (const operacao of UUIDS_INVALIDOS) {
    await assert.rejects(repository.buscarPorOperacaoClienteNoAmbiente(operacao, 40, USUARIO_A), { statusCode: 400 });
  }
  // Na criação, omissão/null/texto vazio significam ausência de chave.
  for (const operacao of [123, "uuid-invalido", "33333333-3333-4333-8333-33333333333Z"]) {
    await assert.rejects(repository.criarNoAmbiente({ ...DADOS, id_operacao_cliente: operacao }, USUARIO_A), { statusCode: 400 });
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("Recusa identidade ausente ou inválida nas sete funções", async (t) => {
  const { consulta } = simularBanco(t);
  const usuarios = [undefined, null, [], {}, "usuario", 123, true];
  usuarios.push(...IDS_INVALIDOS.map((id_usuario) => ({ ...USUARIO_A, id_usuario })));
  for (const usuario of usuarios) {
    for (const executar of operacoes(usuario)) {
      await assert.rejects(executar, { statusCode: 401 });
    }
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("Obtém ambiente somente da identidade e ignora identidade forjada nas escritas", async (t) => {
  const { consulta } = simularBanco(t);
  const dados = {
    ...DADOS, id_ambiente: AMBIENTE_B, id_usuario: 999,
    perfil_acesso: "ADMINISTRADOR", idAmbiente: AMBIENTE_B, idUsuario: 999,
  };
  await repository.criarNoAmbiente(dados, USUARIO_A);
  await repository.atualizarNoAmbiente(50, dados, USUARIO_A);
  assert.equal(consulta.mock.callCount(), 2);
  for (const chamada of consulta.mock.calls) {
    const [sql, parametros] = chamada.arguments;
    assert.deepEqual(parametros.slice(0, 2), [AMBIENTE_A, 10]);
    assert.equal(parametros.includes(AMBIENTE_B), false);
    assert.equal(parametros.includes(999), false);
    verificarAutorizacao(sql);
  }
});

test("Usa SQL parametrizado nas sete funções sem interpolar valores do cliente", async (t) => {
  const { consulta } = simularBanco(t);
  const descricao = "Foto d'água'; DROP TABLE evidencia; --";
  const usuario = { id_usuario: 78901, id_ambiente: AMBIENTE_B };
  await repository.criarNoAmbiente({ ...DADOS, id_local: 78902, descricao }, usuario);
  await repository.listarPermitidasNoAmbiente(usuario);
  await repository.buscarPorIdEAmbiente(78903, usuario);
  await repository.listarPorLocalEAmbiente(78902, usuario);
  await repository.buscarPorOperacaoClienteNoAmbiente(OPERACAO, 78902, usuario);
  await repository.atualizarNoAmbiente(78903, { descricao }, usuario);
  await repository.excluirNoAmbiente(78903, usuario);
  assert.equal(consulta.mock.callCount(), 7);
  for (const chamada of consulta.mock.calls) {
    const [sql, parametros] = chamada.arguments;
    assert.ok(Array.isArray(parametros));
    for (const valor of [descricao, AMBIENTE_B, OPERACAO, "78901", "78902", "78903"]) {
      assert.equal(sql.includes(valor), false);
    }
    const indices = [...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
    assert.equal(Math.max(...indices), parametros.length);
    assert.deepEqual([...new Set(indices)].sort((a, b) => a - b),
      Array.from({ length: parametros.length }, (_, indice) => indice + 1));
  }
  assert.equal(consulta.mock.calls[0].arguments[1][5], descricao);
  assert.equal(consulta.mock.calls[5].arguments[1][8], descricao);
});

test("Vincula evidência, local, campanha e ambiente em todas as operações", async (t) => {
  const { consulta } = simularBanco(t);
  for (const executar of operacoes(USUARIO_A)) await executar();
  assert.equal(consulta.mock.callCount(), 7);
  for (const [indice, chamada] of consulta.mock.calls.entries()) {
    const sql = chamada.arguments[0];
    assert.match(sql, /c\.id_campanha\s*=\s*l\.id_campanha/i);
    assert.match(sql, /c\.id_ambiente\s*=\s*\$1/i);
    assert.match(sql, /a\.id_ambiente\s*=\s*solicitante\.id_ambiente/i);
    if (indice === 0) assert.match(sql, /SELECT\s+l\.id_local/i);
    else assert.match(sql, /l\.id_local\s*=\s*e\.id_local/i);
  }
});

test("Exige usuário solicitante e ambiente ativos nas sete operações", async (t) => {
  const { consulta } = simularBanco(t);
  for (const executar of operacoes(USUARIO_A)) await executar();
  assert.equal(consulta.mock.callCount(), 7);
  for (const chamada of consulta.mock.calls) {
    assert.match(chamada.arguments[0], /AND\s+solicitante\.ativo\s*=\s*TRUE\s+AND\s+a\.ativo\s*=\s*TRUE/i);
  }
});

test("Restringe todas as leituras e escritas a administrador do ambiente ou responsável", async (t) => {
  const { consulta } = simularBanco(t);
  for (const executar of operacoes({ ...USUARIO_A, perfil_acesso: "ADMINISTRADOR" })) await executar();
  assert.equal(consulta.mock.callCount(), 7);
  for (const chamada of consulta.mock.calls) {
    verificarAutorizacao(chamada.arguments[0]);
    assert.equal(chamada.arguments[1].includes("ADMINISTRADOR"), false);
  }
});

test("Não concede autorização automática ao criador da evidência", async (t) => {
  const { consulta } = simularBanco(t);
  for (const executar of operacoes(USUARIO_A)) await executar();
  for (const chamada of consulta.mock.calls) {
    const sql = chamada.arguments[0];
    verificarAutorizacao(sql);
    const autorizacao = sql.match(/AND\s+EXISTS\s*\(([\s\S]*?)\)\s*\)/i)[1];
    assert.doesNotMatch(autorizacao, /\b(?:e\.id_usuario|criador\.)/i);
    assert.match(autorizacao, /c\.id_usuario\s*=\s*solicitante\.id_usuario/i);
  }
});

test("Separa parâmetros dos ambientes A e B nas sete funções", async (t) => {
  const { consulta } = simularBanco(t);
  for (const [indice, usuario] of [USUARIO_A, USUARIO_B].entries()) {
    for (const executar of operacoes(usuario)) await executar();
    const chamadas = consulta.mock.calls.slice(indice * 7, indice * 7 + 7);
    assert.equal(chamadas.length, 7);
    for (const chamada of chamadas) {
      assert.deepEqual(chamada.arguments[1].slice(0, 2), [usuario.id_ambiente, usuario.id_usuario]);
      verificarAutorizacao(chamada.arguments[0]);
    }
  }
  assert.equal(consulta.mock.callCount(), 14);
});

test("Cria com INSERT SELECT autorizado e preserva campos legados e GPS", async (t) => {
  const { consulta } = simularBanco(t, [EVIDENCIA]);
  assert.deepEqual(await repository.criarNoAmbiente(DADOS, USUARIO_A), EVIDENCIA);
  const [sql, parametros] = unica(consulta);
  assert.match(sql, /INSERT\s+INTO\s+evidencia\s+AS\s+e/i);
  assert.match(sql, /SELECT\s+l\.id_local,\s*\$4,\s*\$5,\s*\$6,\s*\$2,\s*\$7,\s*\$8,\s*\$9,\s*\$10,\s*\$11,\s*\$12/i);
  assert.match(sql, /WHERE\s+c\.id_ambiente\s*=\s*\$1\s+AND\s+l\.id_local\s*=\s*\$3/i);
  assert.match(sql, /RETURNING\s+e\.\*/i);
  verificarAutorizacao(sql);
  assert.deepEqual(parametros, [
    AMBIENTE_A, 10, 40, "FOTO", DADOS.caminho_arquivo, DADOS.descricao,
    OPERACAO, -23.5, -46.6, 3.25, "GPS", DADOS.data_captura_gps,
  ]);
});

test("Usa exclusivamente o usuário autenticado como criador da evidência", async (t) => {
  const { consulta } = simularBanco(t);
  await repository.criarNoAmbiente({ ...DADOS, id_usuario: 999 }, { ...USUARIO_B, id_usuario: "20" });
  const [sql, parametros] = unica(consulta);
  assert.match(sql, /SELECT\s+l\.id_local,\s*\$4,\s*\$5,\s*\$6,\s*\$2,/i);
  assert.equal(parametros[1], 20);
  assert.equal(parametros.includes(999), false);
});

test("Lista somente evidências permitidas com ambiente e autorização no SQL", async (t) => {
  const registros = [{ ...EVIDENCIA, nome_local: "Local", usuario_responsavel: "Criador" }];
  const { consulta } = simularBanco(t, registros);
  assert.deepEqual(await repository.listarPermitidasNoAmbiente(USUARIO_A), registros);
  const [sql, parametros] = unica(consulta);
  verificarAutorizacao(sql);
  assert.match(sql, /ORDER\s+BY\s+e\.id_evidencia\s+ASC/i);
  assert.deepEqual(parametros, [AMBIENTE_A, 10]);
});

test("Busca evidência por ID com filtro de ambiente e autorização", async (t) => {
  const { consulta } = simularBanco(t, [EVIDENCIA]);
  assert.deepEqual(await repository.buscarPorIdEAmbiente("50", USUARIO_A), EVIDENCIA);
  const [sql, parametros] = unica(consulta);
  verificarAutorizacao(sql);
  assert.match(sql, /AND\s+e\.id_evidencia\s*=\s*\$3\s+LIMIT\s+1/i);
  assert.deepEqual(parametros, [AMBIENTE_A, 10, 50]);
});

test("Lista evidências por local com ambiente e autorização", async (t) => {
  const { consulta } = simularBanco(t, [EVIDENCIA]);
  assert.deepEqual(await repository.listarPorLocalEAmbiente("40", USUARIO_B), [EVIDENCIA]);
  const [sql, parametros] = unica(consulta);
  verificarAutorizacao(sql);
  assert.match(sql, /AND\s+e\.id_local\s*=\s*\$3\s+ORDER\s+BY\s+e\.id_evidencia\s+ASC/i);
  assert.deepEqual(parametros, [AMBIENTE_B, 20, 40]);
});

test("Leituras com nome do criador verificam seu vínculo ao ambiente", async (t) => {
  const { consulta } = simularBanco(t);
  const executar = operacoes(USUARIO_A);
  for (const indice of [1, 2, 3, 4]) await executar[indice]();
  assert.equal(consulta.mock.callCount(), 4);
  for (const chamada of consulta.mock.calls) {
    const sql = chamada.arguments[0];
    assert.match(sql, /criador\.nome\s+AS\s+usuario_responsavel/i);
    assert.match(sql, /ON\s+criador\.id_usuario\s*=\s*e\.id_usuario\s+AND\s+criador\.id_ambiente\s*=\s*c\.id_ambiente/i);
    assert.doesNotMatch(sql, /criador\.ativo/i);
  }
});

test("Recupera idempotência somente por chave, local, ambiente e autorização", async (t) => {
  const { consulta } = simularBanco(t, [EVIDENCIA]);
  assert.deepEqual(await repository.buscarPorOperacaoClienteNoAmbiente(OPERACAO, "40", USUARIO_A), EVIDENCIA);
  const [sql, parametros] = unica(consulta);
  verificarAutorizacao(sql);
  assert.match(sql, /AND\s+e\.id_local\s*=\s*\$3\s+AND\s+e\.id_operacao_cliente\s*=\s*\$4\s+LIMIT\s+1/i);
  assert.deepEqual(parametros, [AMBIENTE_A, 10, 40, OPERACAO]);
});

test("Recuperação idempotente sem resultado autorizado retorna null, inclusive em outro local ou ambiente", async (t) => {
  const { consulta } = simularBanco(t);
  const casos = [[USUARIO_A, 41], [USUARIO_B, 40], [USUARIO_A, 40]];
  for (const [indice, [usuario, local]] of casos.entries()) {
    assert.equal(await repository.buscarPorOperacaoClienteNoAmbiente(OPERACAO, local, usuario), null);
    const [sql, parametros] = consulta.mock.calls[indice].arguments;
    verificarAutorizacao(sql);
    assert.match(sql, /AND\s+e\.id_local\s*=\s*\$3\s+AND\s+e\.id_operacao_cliente\s*=\s*\$4/i);
    assert.deepEqual(parametros, [usuario.id_ambiente, usuario.id_usuario, local, OPERACAO]);
  }
  assert.equal(consulta.mock.callCount(), 3);
});

test("Não emite DDL nem altera o índice global ou usa upsert para sobrescrever evidências", async (t) => {
  const { consulta } = simularBanco(t);
  for (const executar of operacoes(USUARIO_A)) await executar();
  assert.equal(consulta.mock.callCount(), 7);
  for (const chamada of consulta.mock.calls) {
    assert.doesNotMatch(chamada.arguments[0], /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|SCHEMA)\b/i);
    assert.doesNotMatch(chamada.arguments[0], /\bON\s+CONFLICT\b/i);
  }
});

test("Converte em 409 somente 23505 do índice específico de idempotência", async (t) => {
  const { consulta } = simularBanco(t);
  for (const table of [undefined, "evidencia"]) {
    const erro = Object.assign(new Error("Detalhe interno"), {
      code: "23505", constraint: "uq_evidencia_id_operacao_cliente", table,
    });
    consulta.mock.mockImplementation(async () => { throw erro; });
    await assert.rejects(repository.criarNoAmbiente(DADOS, USUARIO_A), (recebido) => {
      assert.notStrictEqual(recebido, erro);
      assert.equal(recebido.statusCode, 409);
      assert.equal(recebido.code, "23505");
      assert.equal(recebido.constraint, "uq_evidencia_id_operacao_cliente");
      return true;
    });
  }
  assert.equal(consulta.mock.callCount(), 2);
});

test("Propaga outros 23505 e erros inesperados sem consultas de recuperação", async (t) => {
  const { consulta } = simularBanco(t);
  const casos = [
    { code: "23505", constraint: "evidencia_pkey", table: "evidencia" },
    { code: "23505", constraint: "uq_versao_entidade", table: "versao_entidade" },
    { code: "23505", constraint: "uq_evidencia_id_operacao_cliente", table: "outra_tabela" },
    { code: "23505" },
    { code: "23503", constraint: "uq_evidencia_id_operacao_cliente" },
    { code: "23514" }, { code: "XX000" }, {},
  ];
  let total = 0;
  for (const metadados of casos) {
    const erro = Object.assign(new Error("Falha simulada"), metadados);
    consulta.mock.mockImplementation(async () => { throw erro; });
    for (const executar of operacoes(USUARIO_A)) {
      await assert.rejects(executar, (recebido) => {
        assert.strictEqual(recebido, erro);
        assert.notEqual(recebido.statusCode, 409);
        return true;
      });
      total += 1;
      assert.equal(consulta.mock.callCount(), total);
    }
  }
});

test("Conflito controlado não expõe dados internos e não faz recuperação global", async (t) => {
  const { consulta } = simularBanco(t);
  const erro = Object.assign(new Error("MENSAGEM_INTERNA_NAO_PUBLICAR"), {
    code: "23505", constraint: "uq_evidencia_id_operacao_cliente", table: "evidencia",
    detail: "REGISTRO_EXTERNO_NAO_PUBLICAR", query: "SQL_INTERNO_NAO_PUBLICAR",
  });
  consulta.mock.mockImplementation(async () => { throw erro; });
  await assert.rejects(repository.criarNoAmbiente(DADOS, USUARIO_A), (recebido) => {
    assert.equal(recebido.message, "Não foi possível processar esta chave de operação.");
    assert.equal(recebido.statusCode, 409);
    assert.equal(recebido.detail, undefined);
    assert.equal(recebido.query, undefined);
    assert.equal(recebido.cause, undefined);
    const publico = JSON.stringify({ message: recebido.message, ...recebido });
    for (const dado of [erro.message, erro.detail, erro.query]) assert.equal(publico.includes(dado), false);
    return true;
  });
  assert.equal(consulta.mock.callCount(), 1);
});

test("Atualização parcial preserva campos omitidos ou undefined por flags e CASE", async (t) => {
  const { consulta } = simularBanco(t, [EVIDENCIA]);
  const casos = [{}, Object.fromEntries(CAMPOS_UPDATE.map((campo) => [campo, undefined]))];
  for (const [indice, dados] of casos.entries()) {
    assert.deepEqual(await repository.atualizarNoAmbiente(50, dados, USUARIO_A), EVIDENCIA);
    const [sql, parametros] = consulta.mock.calls[indice].arguments;
    assert.deepEqual(parametros, [AMBIENTE_A, 10, 50, ...CAMPOS_UPDATE.flatMap(() => [false, null])]);
    for (const [posicao, campo] of CAMPOS_UPDATE.entries()) {
      const flag = 4 + posicao * 2;
      const valor = flag + 1;
      const regra = new RegExp(`${campo}\\s*=\\s*CASE\\s+WHEN\\s+\\$${flag}::boolean\\s+THEN\\s+\\$${valor}(?:::[a-z]+)?\\s+ELSE\\s+e\\.${campo}\\s+END`, "i");
      assert.match(sql, regra);
    }
  }
  // Também valida normalização dos valores explicitamente informados.
  await repository.atualizarNoAmbiente(50, { latitude: "0", longitude: 0, descricao: "Nova" }, USUARIO_A);
  const parametros = consulta.mock.calls[2].arguments[1];
  assert.deepEqual(parametros.slice(7, 13), [true, "Nova", true, 0, true, 0]);
  assert.equal(consulta.mock.callCount(), 3);
});

test("Null limpa campos opcionais, mas tipo obrigatório e valores GPS inválidos são rejeitados", async (t) => {
  const { consulta } = simularBanco(t);
  const opcionais = CAMPOS_UPDATE.filter((campo) => campo !== "tipo");
  await repository.atualizarNoAmbiente(50, Object.fromEntries(opcionais.map((campo) => [campo, null])), USUARIO_A);
  const [sql, parametros] = unica(consulta);
  assert.deepEqual(parametros.slice(3, 5), [false, null]);
  assert.deepEqual(parametros.slice(5), opcionais.flatMap(() => [true, null]));
  assert.match(sql, /latitude\s*=\s*CASE\s+WHEN\s+\$10::boolean\s+THEN\s+\$11::numeric\s+ELSE\s+e\.latitude\s+END/i);
  await assert.rejects(repository.atualizarNoAmbiente(50, { tipo: null }, USUARIO_A), { statusCode: 400 });
  const invalidos = [
    { latitude: 91 }, { longitude: -181 }, { latitude: true }, { longitude: "inválida" },
    { precisao_gps: -1 }, { precisao_gps: Infinity }, { origem_coordenadas: "OUTRA" },
    { data_captura_gps: "data-invalida" }, { descricao: {} }, { caminho_arquivo: "x".repeat(501) },
  ];
  for (const dados of invalidos) {
    await assert.rejects(repository.atualizarNoAmbiente(50, dados, USUARIO_A), { statusCode: 400 });
  }
  await assert.rejects(repository.criarNoAmbiente({ ...DADOS, longitude: null }, USUARIO_A), { statusCode: 400 });
  assert.equal(consulta.mock.callCount(), 1);
  // O estado final do par GPS é validado pelo PostgreSQL, sem simulá-lo aqui.
});

test("UPDATE não altera local, criador ou chave da operação", async (t) => {
  const { consulta } = simularBanco(t);
  await repository.atualizarNoAmbiente(50, {
    descricao: "Nova", id_local: 999, id_usuario: 999,
    id_operacao_cliente: "44444444-4444-4444-8444-444444444444",
    id_ambiente: AMBIENTE_B, perfil_acesso: "ADMINISTRADOR",
  }, USUARIO_A);
  const [sql, parametros] = unica(consulta);
  const set = sql.match(/\bSET\b([\s\S]*?)\bFROM\b/i)[1];
  assert.doesNotMatch(set, /id_local|id_usuario|id_operacao_cliente|id_ambiente|perfil_acesso/i);
  assert.equal(parametros.includes(999), false);
  assert.equal(parametros.includes(AMBIENTE_B), false);
  assert.equal(parametros.includes("44444444-4444-4444-8444-444444444444"), false);
});

test("Atualização aplica autorização na própria instrução SQL sem leitura anterior", async (t) => {
  const { consulta } = simularBanco(t, [EVIDENCIA]);
  assert.deepEqual(await repository.atualizarNoAmbiente("50", { descricao: "Nova" }, USUARIO_A), EVIDENCIA);
  const [sql, parametros] = unica(consulta);
  assert.match(sql, /UPDATE\s+evidencia\s+AS\s+e/i);
  assert.match(sql, /AND\s+e\.id_evidencia\s*=\s*\$3\s+AND\s+l\.id_local\s*=\s*e\.id_local/i);
  assert.match(sql, /data_atualizacao\s*=\s*CURRENT_TIMESTAMP/i);
  assert.match(sql, /RETURNING\s+e\.\*/i);
  verificarAutorizacao(sql);
  assert.deepEqual(parametros.slice(0, 3), [AMBIENTE_A, 10, 50]);
});

test("DELETE autoriza no SQL e retorna o registro com caminho para limpeza futura", async (t) => {
  const { consulta } = simularBanco(t, [EVIDENCIA]);
  assert.deepEqual(await repository.excluirNoAmbiente("50", USUARIO_B), EVIDENCIA);
  const [sql, parametros] = unica(consulta);
  assert.match(sql, /DELETE\s+FROM\s+evidencia\s+AS\s+e\s+USING\s+local\s+AS\s+l,\s*campanha\s+AS\s+c/i);
  assert.match(sql, /e\.id_evidencia\s*=\s*\$3/i);
  assert.match(sql, /l\.id_local\s*=\s*e\.id_local/i);
  assert.match(sql, /c\.id_campanha\s*=\s*l\.id_campanha/i);
  assert.match(sql, /RETURNING\s+e\.\*/i);
  verificarAutorizacao(sql);
  assert.deepEqual(parametros, [AMBIENTE_B, 20, 50]);
});

test("Não lê, grava, resolve, move ou exclui arquivos físicos", async (t) => {
  const { consulta } = simularBanco(t, [EVIDENCIA]);
  const guardas = [];
  const metodos = [
    "readFile", "writeFile", "appendFile", "unlink", "rename", "copyFile",
    "mkdir", "rm", "open", "readdir", "stat", "lstat", "realpath",
  ];
  try {
    for (const metodo of metodos) {
      guardas.push(t.mock.method(fs.promises, metodo, async () => {
        throw new Error(`Acesso físico proibido: ${metodo}`);
      }));
      guardas.push(t.mock.method(fs, metodo, () => {
        throw new Error(`Acesso físico proibido: ${metodo}`);
      }));
      guardas.push(t.mock.method(fs, `${metodo}Sync`, () => {
        throw new Error(`Acesso físico proibido: ${metodo}Sync`);
      }));
    }
    for (const metodo of ["createReadStream", "createWriteStream", "existsSync"]) {
      guardas.push(t.mock.method(fs, metodo, () => {
        throw new Error(`Acesso físico proibido: ${metodo}`);
      }));
    }
    for (const executar of operacoes(USUARIO_A)) await executar();
    assert.equal(consulta.mock.callCount(), 7);
    assert.equal(consulta.mock.calls[0].arguments[1][4], DADOS.caminho_arquivo);
    for (const guarda of guardas) assert.equal(guarda.mock.callCount(), 0);
  } finally {
    // Restaura imediatamente para não interferir no próprio runner de testes.
    for (const guarda of guardas.reverse()) guarda.mock.restore();
  }
});

test("Não depende de repositórios legados nem carrega a aplicação principal", async (t) => {
  const { consulta } = simularBanco(t);
  for (const executar of operacoes(USUARIO_A)) await executar();
  const modulo = require.cache[require.resolve("../src/repositories/evidenciaMultiTenantRepository")];
  const dependencias = modulo.children.map((child) => child.id);
  assert.deepEqual(dependencias, [require.resolve("../src/config/database")]);
  assert.equal(require.cache[require.resolve("../src/app")], undefined);
  assert.equal(require.cache[require.resolve("../src/server")], undefined);
  assert.equal(consulta.mock.callCount(), 7);
});

test("Todas as funções usam query simulado e nenhuma abre conexão real", async (t) => {
  const { consulta, conectar } = simularBanco(t);
  for (const executar of operacoes(USUARIO_A)) await executar();
  assert.equal(consulta.mock.callCount(), 7);
  assert.equal(conectar.mock.callCount(), 0);
});

test("Retorna listas vazias ou null quando os filtros não encontram registro autorizado", async (t) => {
  const { consulta } = simularBanco(t);
  const executar = operacoes(USUARIO_B);
  for (const [indice, operacao] of executar.entries()) {
    const resultado = await operacao();
    if (indice === 1 || indice === 3) assert.deepEqual(resultado, []);
    else assert.equal(resultado, null);
  }
  assert.equal(consulta.mock.callCount(), 7);
});
