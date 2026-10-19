const { conferir: conferirCapacidadeSql } = require('./helpers/rbacSqlSimulado.cjs');
const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const repository = require("../src/repositories/checklistMultiTenantRepository");

const AMBIENTE_A = "11111111-1111-4111-8111-111111111111";
const AMBIENTE_B = "22222222-2222-4222-8222-222222222222";
const USUARIO_A = { id_usuario: 10, id_ambiente: AMBIENTE_A };
const USUARIO_B = { id_usuario: 20, id_ambiente: AMBIENTE_B };
const CAMPOS = [
  "criterio_a", "criterio_b", "criterio_c", "acesso_controlado",
  "ventilacao_adequada", "monitoramento_atmosferico", "procedimento_emergencia",
];
const DADOS = {
  id_local: 40,
  criterio_a: "SIM",
  criterio_b: "NAO",
  criterio_c: "SIM",
  acesso_controlado: "SIM",
  ventilacao_adequada: "NAO",
  monitoramento_atmosferico: "SIM",
  procedimento_emergencia: "NAO",
  observacoes: "Observação simulada",
};
const CHECKLIST = {
  ...DADOS, id_checklist: 50, id_usuario: 10, status: "PENDENTE",
};
const IDS_INVALIDOS = [
  undefined, null, "", "   ", "id-invalido", 0, -1, 1.5,
  NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, true, false, {}, [], [40],
  "40; DROP TABLE checklist_nr33; --",
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

function escritas(usuario, dados = DADOS) {
  return [
    () => repository.criarNoAmbiente(dados, usuario),
    () => repository.atualizarNoAmbiente(50, dados, usuario),
    () => repository.atualizarStatusNoAmbiente(50, "CONCLUIDO", usuario),
  ];
}

function operacoes(usuario) {
  return [
    ...escritas(usuario),
    () => repository.listarPorAmbiente(usuario.id_ambiente),
    () => repository.buscarPorIdEAmbiente(50, usuario.id_ambiente),
    () => repository.buscarPorLocalEAmbiente(40, usuario.id_ambiente),
  ];
}

function verificarAutorizacao(sql) {
  assert.match(sql, /AND\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+usuario\s+AS\s+u/i);
  assert.match(sql, /u\.id_usuario\s*=\s*\$3/i);
  assert.match(sql, /u\.id_ambiente\s*=\s*c\.id_ambiente/i);
  conferirCapacidadeSql(sql, 'u');
}

test("Recusa UUID de ambiente inválido nas seis funções sem consultar", async (t) => {
  const { consulta } = simularBanco(t);
  for (const id_ambiente of [undefined, null, "", 123, "ambiente-invalido", "11111111-1111-4111-8111-11111111111Z"]) {
    for (const executar of operacoes({ ...USUARIO_A, id_ambiente })) {
      await assert.rejects(executar, { statusCode: 403, message: "Identificação do ambiente inválida." });
    }
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("Recusa IDs de checklist, local e usuário inválidos ou acima do limite seguro", async (t) => {
  const { consulta } = simularBanco(t);
  for (const id of IDS_INVALIDOS) {
    for (const executar of [
      () => repository.buscarPorIdEAmbiente(id, AMBIENTE_A),
      () => repository.atualizarNoAmbiente(id, {}, USUARIO_A),
      () => repository.atualizarStatusNoAmbiente(id, "PENDENTE", USUARIO_A),
    ]) {
      await assert.rejects(executar, { statusCode: 400, message: "ID do checklist inválido." });
    }
    await assert.rejects(repository.buscarPorLocalEAmbiente(id, AMBIENTE_A), {
      statusCode: 400, message: "ID do local inválido.",
    });
    await assert.rejects(repository.criarNoAmbiente({ ...DADOS, id_local: id }, USUARIO_A), {
      statusCode: 400, message: "ID do local inválido.",
    });
    for (const executar of escritas({ ...USUARIO_A, id_usuario: id })) {
      await assert.rejects(executar, { statusCode: 403, message: "Usuário inválido." });
    }
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("Recusa as três escritas sem identidade autenticada", async (t) => {
  const { consulta } = simularBanco(t);
  for (const usuario of [undefined, null]) {
    for (const executar of escritas(usuario)) {
      await assert.rejects(executar, { statusCode: 401, message: "Usuário não autenticado." });
    }
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("Exige as sete respostas obrigatórias na criação", async (t) => {
  const { consulta } = simularBanco(t);
  for (const campo of CAMPOS) {
    for (const valor of [undefined, null]) {
      await assert.rejects(repository.criarNoAmbiente({ ...DADOS, [campo]: valor }, USUARIO_A), {
        statusCode: 400, message: `${campo} deve ser SIM ou NAO.`,
      });
    }
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("Aceita somente SIM e NAO nas respostas de criação e atualização", async (t) => {
  const { consulta } = simularBanco(t, [CHECKLIST]);
  for (const campo of CAMPOS) {
    for (const valor of ["", "sim", "NÃO", "SIM ", true, 1, [], {}]) {
      await assert.rejects(repository.criarNoAmbiente({ ...DADOS, [campo]: valor }, USUARIO_A), { statusCode: 400 });
      await assert.rejects(repository.atualizarNoAmbiente(50, { [campo]: valor }, USUARIO_A), { statusCode: 400 });
    }
  }
  assert.equal(consulta.mock.callCount(), 0);
  for (const valor of ["SIM", "NAO"]) {
    const respostas = Object.fromEntries(CAMPOS.map((campo) => [campo, valor]));
    await repository.criarNoAmbiente({ ...DADOS, ...respostas }, USUARIO_A);
    await repository.atualizarNoAmbiente(50, respostas, USUARIO_A);
  }
  assert.equal(consulta.mock.callCount(), 4);
  for (const [indice, chamada] of consulta.mock.calls.entries()) {
    const esperado = indice < 2 ? "SIM" : "NAO";
    assert.deepEqual(chamada.arguments[1].slice(3, 10), Array(7).fill(esperado));
  }
});

test("Utiliza PENDENTE como status inicial padrão", async (t) => {
  const { consulta } = simularBanco(t, [CHECKLIST]);
  assert.deepEqual(await repository.criarNoAmbiente(DADOS, USUARIO_A), CHECKLIST);
  const [, parametros] = unica(consulta);
  assert.equal(parametros[11], "PENDENTE");
});

test("Aceita somente PENDENTE e CONCLUIDO como status", async (t) => {
  const { consulta } = simularBanco(t);
  for (const status of [null, "", "ATIVO", "CONCLUIDA", "pendente", "PENDENTE ", 1, false, [], {}]) {
    await assert.rejects(repository.criarNoAmbiente({ ...DADOS, status }, USUARIO_A), { statusCode: 400 });
    await assert.rejects(repository.atualizarStatusNoAmbiente(50, status, USUARIO_A), { statusCode: 400 });
  }
  await assert.rejects(repository.atualizarStatusNoAmbiente(50, undefined, USUARIO_A), { statusCode: 400 });
  assert.equal(consulta.mock.callCount(), 0);
  for (const [indice, status] of ["PENDENTE", "CONCLUIDO"].entries()) {
    await repository.criarNoAmbiente({ ...DADOS, status }, USUARIO_A);
    await repository.atualizarStatusNoAmbiente(50, status, USUARIO_A);
    assert.equal(consulta.mock.calls[indice * 2].arguments[1][11], status);
    assert.equal(consulta.mock.calls[indice * 2 + 1].arguments[1][3], status);
  }
  assert.equal(consulta.mock.callCount(), 4);
});

test("Cria com INSERT SELECT parametrizado e filtro pelo local e ambiente", async (t) => {
  const { consulta } = simularBanco(t, [CHECKLIST]);
  assert.deepEqual(await repository.criarNoAmbiente(DADOS, USUARIO_A), CHECKLIST);
  const [sql, parametros] = unica(consulta);
  assert.match(sql, /INSERT\s+INTO\s+checklist_nr33\s+AS\s+ch/i);
  assert.match(sql, /SELECT\s+l\.id_local,\s*\$4,\s*\$5,\s*\$6,\s*\$7,\s*\$8,\s*\$9,\s*\$10/i);
  assert.match(sql, /FROM\s+local\s+AS\s+l\s+INNER\s+JOIN\s+campanha\s+AS\s+c\s+ON\s+c\.id_campanha\s*=\s*l\.id_campanha/i);
  assert.match(sql, /WHERE\s+l\.id_local\s*=\s*\$1\s+AND\s+c\.id_ambiente\s*=\s*\$2/i);
  assert.match(sql, /RETURNING\s+ch\.\*/i);
  assert.doesNotMatch(sql, /ON\s+CONFLICT\s+DO\s+UPDATE/i);
  assert.deepEqual(parametros, [
    40, AMBIENTE_A, 10, ...CAMPOS.map((campo) => DADOS[campo]), "Observação simulada", "PENDENTE",
  ]);
});

test("Usa o usuário autenticado como criador sem aceitar identidade do corpo", async (t) => {
  const { consulta } = simularBanco(t);
  await repository.criarNoAmbiente({
    ...DADOS, id_usuario: 999, id_ambiente: AMBIENTE_B, eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
  }, USUARIO_A);
  const [sql, parametros] = unica(consulta);
  assert.match(sql, /NULLIF\(\$11::text,\s*''\),\s*\$12,\s*\$3\s+FROM/i);
  assert.deepEqual(parametros.slice(0, 3), [40, AMBIENTE_A, 10]);
  assert.equal(parametros.includes(999), false);
  assert.equal(parametros.includes(AMBIENTE_B), false);
});

test("Exige administrador do ambiente ou responsável pela campanha nas três escritas", async (t) => {
  const { consulta } = simularBanco(t);
  for (const executar of escritas(USUARIO_A)) await executar();
  assert.equal(consulta.mock.callCount(), 3);
  for (const chamada of consulta.mock.calls) verificarAutorizacao(chamada.arguments[0]);
});

test("Exige usuário e ambiente ativos no SQL das três escritas", async (t) => {
  const { consulta } = simularBanco(t);
  for (const executar of escritas(USUARIO_A)) await executar();
  assert.equal(consulta.mock.callCount(), 3);
  for (const chamada of consulta.mock.calls) {
    const sql = chamada.arguments[0];
    assert.match(sql, /INNER\s+JOIN\s+ambiente\s+AS\s+a\s+ON\s+a\.id_ambiente\s*=\s*u\.id_ambiente/i);
    assert.match(sql, /AND\s+u\.ativo\s*=\s*TRUE\s+AND\s+a\.ativo\s*=\s*TRUE/i);
  }
});

test("Lista checklists somente do ambiente solicitado", async (t) => {
  const registros = [{ ...CHECKLIST, nome_local: "Local", usuario_responsavel: "Usuário" }];
  const { consulta } = simularBanco(t, registros);
  for (const [indice, ambiente] of [AMBIENTE_A, AMBIENTE_B].entries()) {
    assert.deepEqual(await repository.listarPorAmbiente(ambiente), registros);
    const [sql, parametros] = consulta.mock.calls[indice].arguments;
    assert.match(sql, /WHERE\s+c\.id_ambiente\s*=\s*\$1/i);
    assert.match(sql, /ORDER\s+BY\s+ch\.id_checklist\s+ASC/i);
    assert.deepEqual(parametros, [ambiente]);
  }
  assert.equal(consulta.mock.callCount(), 2);
});

test("Busca por ID do checklist e ambiente com parâmetros separados", async (t) => {
  const { consulta } = simularBanco(t, [CHECKLIST]);
  assert.deepEqual(await repository.buscarPorIdEAmbiente("50", AMBIENTE_A), CHECKLIST);
  const [sql, parametros] = unica(consulta);
  assert.match(sql, /WHERE\s+ch\.id_checklist\s*=\s*\$1\s+AND\s+c\.id_ambiente\s*=\s*\$2/i);
  assert.deepEqual(parametros, [50, AMBIENTE_A]);
});

test("Busca por ID do local e ambiente preservando retorno de checklist", async (t) => {
  const { consulta } = simularBanco(t, [CHECKLIST]);
  assert.deepEqual(await repository.buscarPorLocalEAmbiente("40", AMBIENTE_B), CHECKLIST);
  const [sql, parametros] = unica(consulta);
  assert.match(sql, /SELECT\s+ch\.\*/i);
  assert.match(sql, /WHERE\s+ch\.id_local\s*=\s*\$1\s+AND\s+c\.id_ambiente\s*=\s*\$2/i);
  assert.deepEqual(parametros, [40, AMBIENTE_B]);
});

test("Vincula o usuário responsável ao mesmo ambiente nas leituras com seu nome", async (t) => {
  const { consulta } = simularBanco(t);
  await repository.listarPorAmbiente(AMBIENTE_A);
  await repository.buscarPorIdEAmbiente(50, AMBIENTE_A);
  assert.equal(consulta.mock.callCount(), 2);
  for (const chamada of consulta.mock.calls) {
    const sql = chamada.arguments[0];
    assert.match(sql, /u\.nome\s+AS\s+usuario_responsavel/i);
    assert.match(sql, /ON\s+u\.id_usuario\s*=\s*ch\.id_usuario\s+AND\s+u\.id_ambiente\s*=\s*c\.id_ambiente/i);
    assert.match(sql, /l\.id_local\s*=\s*ch\.id_local/i);
    assert.match(sql, /c\.id_campanha\s*=\s*l\.id_campanha/i);
  }
});

test("Retorna null nas cinco operações individuais sem registro autorizado", async (t) => {
  const { consulta } = simularBanco(t);
  for (const executar of [
    ...escritas(USUARIO_A),
    () => repository.buscarPorIdEAmbiente(50, AMBIENTE_A),
    () => repository.buscarPorLocalEAmbiente(40, AMBIENTE_A),
  ]) {
    assert.equal(await executar(), null);
  }
  assert.equal(consulta.mock.callCount(), 5);
});

test("Preserva respostas omitidas ou null usando COALESCE no próprio UPDATE", async (t) => {
  const { consulta } = simularBanco(t, [CHECKLIST]);
  for (const [indice, dados] of [{}, Object.fromEntries(CAMPOS.map((campo) => [campo, null]))].entries()) {
    assert.deepEqual(await repository.atualizarNoAmbiente(50, dados, USUARIO_A), CHECKLIST);
    const [sql, parametros] = consulta.mock.calls[indice].arguments;
    assert.deepEqual(parametros.slice(3, 10), Array(7).fill(null));
    for (const [posicao, campo] of CAMPOS.entries()) {
      assert.ok(sql.includes(`${campo} = COALESCE($${posicao + 4}, ch.${campo})`));
    }
    assert.doesNotMatch(sql, /\bSELECT\s+ch\.\*/i);
  }
  assert.equal(consulta.mock.callCount(), 2);
});

test("Encaminha somente respostas informadas e preserva as demais via parâmetros null", async (t) => {
  const { consulta } = simularBanco(t);
  await repository.atualizarNoAmbiente(50, { criterio_b: "SIM", procedimento_emergencia: "SIM" }, USUARIO_A);
  const [sql, parametros] = unica(consulta);
  assert.deepEqual(parametros.slice(3, 10), [null, "SIM", null, null, null, null, "SIM"]);
  assert.match(sql, /criterio_b\s*=\s*COALESCE\(\$5,\s*ch\.criterio_b\)/i);
  assert.match(sql, /procedimento_emergencia\s*=\s*COALESCE\(\$10,\s*ch\.procedimento_emergencia\)/i);
});

test("Preserva observações omitidas ou null e limpa texto vazio sem normalizar espaços", async (t) => {
  const { consulta } = simularBanco(t);
  const casos = [{}, { observacoes: null }, { observacoes: "" }, { observacoes: "   " }, { observacoes: "Nova observação" }];
  for (const [indice, dados] of casos.entries()) {
    await repository.atualizarNoAmbiente(50, dados, USUARIO_A);
    const [sql, parametros] = consulta.mock.calls[indice].arguments;
    assert.match(sql, /observacoes\s*=\s*CASE\s+WHEN\s+\$11::text\s+IS\s+NULL\s+THEN\s+ch\.observacoes\s+ELSE\s+NULLIF\(\$11::text,\s*''\)\s+END/i);
    assert.equal(parametros[10], dados.observacoes ?? null);
  }
  assert.equal(consulta.mock.callCount(), 5);
});

test("UPDATE de respostas não altera id_local, id_usuario, status ou identidade", async (t) => {
  const { consulta } = simularBanco(t);
  await repository.atualizarNoAmbiente(50, {
    criterio_a: "NAO", id_local: 999, id_usuario: 999, status: "CONCLUIDO",
    id_ambiente: AMBIENTE_B, eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
  }, USUARIO_A);
  const [sql, parametros] = unica(consulta);
  const set = sql.match(/\bSET\b([\s\S]*?)\bFROM\b/i)[1];
  assert.doesNotMatch(set, /id_local|id_usuario|id_ambiente|perfil_acesso|\bstatus\b/i);
  assert.equal(parametros.includes(999), false);
  assert.equal(parametros.includes(AMBIENTE_B), false);
  assert.equal(parametros.includes("CONCLUIDO"), false);
  assert.deepEqual(parametros.slice(0, 3), [50, AMBIENTE_A, 10]);
});

test("Atualiza status somente com filtros de checklist, local, campanha, ambiente e usuário", async (t) => {
  const atualizado = { ...CHECKLIST, status: "CONCLUIDO" };
  const { consulta } = simularBanco(t, [atualizado]);
  assert.deepEqual(await repository.atualizarStatusNoAmbiente("50", "CONCLUIDO", USUARIO_A), atualizado);
  const [sql, parametros] = unica(consulta);
  assert.match(sql, /SET\s+status\s*=\s*\$4/i);
  assert.match(sql, /data_atualizacao\s*=\s*CURRENT_TIMESTAMP/i);
  assert.match(sql, /c\.id_campanha\s*=\s*l\.id_campanha/i);
  assert.match(sql, /WHERE\s+ch\.id_checklist\s*=\s*\$1\s+AND\s+l\.id_local\s*=\s*ch\.id_local\s+AND\s+c\.id_ambiente\s*=\s*\$2/i);
  verificarAutorizacao(sql);
  assert.deepEqual(parametros, [50, AMBIENTE_A, 10, "CONCLUIDO"]);
  const set = sql.match(/\bSET\b([\s\S]*?)\bFROM\b/i)[1];
  assert.doesNotMatch(set, /id_local|id_usuario/i);
});

test("Converte somente duplicidade identificável de id_local em erro controlado 409", async (t) => {
  const { consulta } = simularBanco(t);
  const metadados = [
    { constraint: "checklist_nr33_id_local_key" },
    { constraint: "checklist_nr33_id_local_key", table: "checklist_nr33" },
    { table: "checklist_nr33", column: "id_local" },
  ];
  for (const dadosErro of metadados) {
    const erro = Object.assign(new Error("DETALHE_INTERNO_NAO_PUBLICAR"), { code: "23505", ...dadosErro });
    consulta.mock.mockImplementation(async () => { throw erro; });
    await assert.rejects(repository.criarNoAmbiente(DADOS, USUARIO_A), (recebido) => {
      assert.notStrictEqual(recebido, erro);
      assert.equal(recebido.statusCode, 409);
      assert.equal(recebido.message, "Este local já possui um checklist NR-33.");
      assert.equal(recebido.message.includes(erro.message), false);
      return true;
    });
  }
  assert.equal(consulta.mock.callCount(), 3);
});

test("Propaga outras violações 23505, metadados insuficientes e erros inesperados", async (t) => {
  const { consulta } = simularBanco(t);
  const casos = [
    { code: "23505", constraint: "checklist_nr33_pkey", table: "checklist_nr33" },
    { code: "23505", constraint: "uq_versao_entidade", table: "versao_entidade" },
    { code: "23505", constraint: "outra_restricao", table: "checklist_nr33", column: "id_local" },
    { code: "23505" },
    { code: "23505", table: "checklist_nr33" },
    { code: "23505", table: "outra_tabela", constraint: "checklist_nr33_id_local_key" },
    { code: "23503", constraint: "checklist_nr33_id_local_key" },
    { code: "XX000" },
    {},
  ];
  for (const metadados of casos) {
    const erro = Object.assign(new Error("Erro simulado"), metadados);
    consulta.mock.mockImplementation(async () => { throw erro; });
    for (const executar of operacoes(USUARIO_A)) {
      await assert.rejects(executar, (recebido) => {
        assert.strictEqual(recebido, erro);
        assert.notEqual(recebido.statusCode, 409);
        return true;
      });
    }
  }
  assert.equal(consulta.mock.callCount(), casos.length * 6);
});

test("Alvos externos ou não autorizados retornam null sem consulta global de duplicidade", async (t) => {
  const { consulta } = simularBanco(t);
  for (const executar of [
    ...escritas(USUARIO_B),
    () => repository.buscarPorIdEAmbiente(50, AMBIENTE_B),
    () => repository.buscarPorLocalEAmbiente(40, AMBIENTE_B),
  ]) {
    assert.equal(await executar(), null);
  }
  assert.equal(consulta.mock.callCount(), 5);
  for (const chamada of consulta.mock.calls) {
    const [sql, parametros] = chamada.arguments;
    assert.match(sql, /c\.id_ambiente\s*=\s*\$2/i);
    assert.equal(parametros[1], AMBIENTE_B);
  }
});

test("Encaminha ambientes A e B e ignora identidade forjada nas três escritas", async (t) => {
  const { consulta } = simularBanco(t);
  for (const [indice, usuario] of [USUARIO_A, USUARIO_B].entries()) {
    const outroAmbiente = indice === 0 ? AMBIENTE_B : AMBIENTE_A;
    const dados = { ...DADOS, id_usuario: 999, id_ambiente: outroAmbiente, eh_fundador: true, perfil_acesso: "ADMINISTRADOR" };
    for (const executar of escritas(usuario, dados)) await executar();
    await repository.listarPorAmbiente(usuario.id_ambiente);
    await repository.buscarPorIdEAmbiente(50, usuario.id_ambiente);
    await repository.buscarPorLocalEAmbiente(40, usuario.id_ambiente);
    const chamadas = consulta.mock.calls.slice(indice * 6, indice * 6 + 6);
    assert.equal(chamadas.length, 6);
    for (const [posicao, chamada] of chamadas.entries()) {
      const parametros = chamada.arguments[1];
      if (posicao < 3) {
        assert.deepEqual(parametros.slice(0, 3), [posicao === 0 ? 40 : 50, usuario.id_ambiente, usuario.id_usuario]);
      } else {
        assert.deepEqual(parametros, posicao === 3
          ? [usuario.id_ambiente]
          : [posicao === 4 ? 50 : 40, usuario.id_ambiente]);
      }
      assert.equal(parametros.includes(outroAmbiente), false);
      assert.equal(parametros.includes(999), false);
    }
  }
  assert.equal(consulta.mock.callCount(), 12);
});

test("Não interpola valores do cliente no SQL das seis funções", async (t) => {
  const { consulta } = simularBanco(t);
  const texto = "Observação d'água'; DROP TABLE checklist_nr33; --";
  const usuario = { id_usuario: 78901, id_ambiente: AMBIENTE_B };
  await repository.criarNoAmbiente({ ...DADOS, id_local: 78902, observacoes: texto }, usuario);
  await repository.atualizarNoAmbiente(78903, { observacoes: texto }, usuario);
  await repository.atualizarStatusNoAmbiente(78903, "CONCLUIDO", usuario);
  await repository.listarPorAmbiente(AMBIENTE_B);
  await repository.buscarPorIdEAmbiente(78903, AMBIENTE_B);
  await repository.buscarPorLocalEAmbiente(78902, AMBIENTE_B);
  assert.equal(consulta.mock.callCount(), 6);
  for (const chamada of consulta.mock.calls) {
    const [sql, parametros] = chamada.arguments;
    assert.match(sql, /\$\d+/);
    assert.ok(Array.isArray(parametros));
    for (const valor of [texto, AMBIENTE_B, "78901", "78902", "78903"]) {
      assert.equal(sql.includes(valor), false);
    }
  }
  assert.equal(consulta.mock.calls[0].arguments[1][10], texto);
  assert.equal(consulta.mock.calls[1].arguments[1][10], texto);
});

test("O parâmetro $3 representa o usuário autenticado nas três escritas", async (t) => {
  const { consulta } = simularBanco(t);
  for (const executar of escritas({ ...USUARIO_B, id_usuario: "20" })) await executar();
  assert.equal(consulta.mock.callCount(), 3);
  for (const chamada of consulta.mock.calls) {
    const [sql, parametros] = chamada.arguments;
    assert.match(sql, /u\.id_usuario\s*=\s*\$3/i);
    assert.equal(parametros[2], 20);
    assert.equal(parametros[1], AMBIENTE_B);
  }
});

test("As seis funções utilizam query simulado sem abrir conexão real", async (t) => {
  const { consulta, conectar } = simularBanco(t);
  for (const executar of operacoes(USUARIO_A)) await executar();
  assert.equal(consulta.mock.callCount(), 6);
  assert.equal(conectar.mock.callCount(), 0);
});
