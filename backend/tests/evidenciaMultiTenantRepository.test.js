const { conferir: conferirCapacidadeSql } = require('./helpers/rbacSqlSimulado.cjs');
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
  const consulta = t.mock.method(pool, "query", async () => ({ rows }));
  let aberta = false, locks = [], liberadas = 0;
  const conectar = t.mock.method(pool, "connect", async () => ({
    async query(sql, params=[]) {
      const q=sql.replace(/\s+/g,' ').trim();
      if(q.startsWith('BEGIN')) { assert.equal(aberta,false); aberta=true; locks=[]; return {rows:[]}; }
      if(q==='COMMIT'||q==='ROLLBACK') { assert.ok(aberta); aberta=false; return {rows:[]}; }
      assert.ok(aberta);
      if(q.startsWith('SELECT l.id_local FROM ambiente a')) {
        assert.match(q,/a\.id_ambiente=\$1/); assert.match(q,/solicitante\.id_usuario=\$2/);
        assert.match(q,/a\.ativo=TRUE AND solicitante\.ativo=TRUE/);
        assert.deepEqual(conferirCapacidadeSql(q,'solicitante'),['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR']);
        assert.ok([AMBIENTE_A,AMBIENTE_B].includes(params[0])); assert.ok(Number.isSafeInteger(params[1]));
        locks.push(q.match(/FOR (?:SHARE|UPDATE) OF (\w+)$/)[1]); return {rows:[{id_local:params[2]}]};
      }
      assert.deepEqual(locks, q.startsWith('INSERT') ? ['a','solicitante','c','l'] : ['a','solicitante','c','l','e']);
      // Apenas a opera??o de dom?nio ? contabilizada nas asser??es antigas.
      const r=await pool.query(sql,params);
      return r.rows.length ? r : {rows:[{}]};
    }, release() { assert.equal(aberta,false); liberadas++; }
  }));
  t.after(()=>{assert.equal(aberta,false);assert.equal(liberadas,conectar.mock.callCount());});
  return {consulta,conectar};
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
  conferirCapacidadeSql(sql, 'solicitante');
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
    eh_fundador: true, perfil_acesso: "ADMINISTRADOR", idAmbiente: AMBIENTE_B, idUsuario: 999,
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
  for (const executar of operacoes({ ...USUARIO_A, eh_fundador: true, perfil_acesso: "ADMINISTRADOR" })) await executar();
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
    assert.doesNotMatch(autorizacao, /c\.id_usuario\s*=/i);
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
    id_ambiente: AMBIENTE_B, eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
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
  assert.deepEqual(dependencias, [require.resolve("../src/utils/permissoes"), require.resolve("../src/config/database")]);
  assert.equal(require.cache[require.resolve("../src/app")], undefined);
  assert.equal(require.cache[require.resolve("../src/server")], undefined);
  assert.equal(consulta.mock.callCount(), 7);
});

test("Todas as funções usam query simulado e nenhuma abre conexão real", async (t) => {
  const { consulta, conectar } = simularBanco(t);
  for (const executar of operacoes(USUARIO_A)) await executar();
  assert.equal(consulta.mock.callCount(), 7);
  assert.equal(conectar.mock.callCount(), 2);
});

test("Retorna listas vazias ou null quando os filtros não encontram registro autorizado", async (t) => {
  const { consulta } = simularBanco(t);
  const executar = operacoes(USUARIO_B);
  for (const [indice, operacao] of executar.entries()) {
    const resultado = await operacao();
    if (indice === 1 || indice === 3) assert.deepEqual(resultado, []);
    else if (indice === 0 || indice === 5) assert.deepEqual(resultado, {});
    else assert.equal(resultado, null);
  }
  assert.equal(consulta.mock.callCount(), 7);
});

// ========================================
// VERIFICAÇÃO DE LOCAL AUTORIZADO
// ========================================

test("Local autorizado: rejeita IDs inválidos antes de consultar", async (t) => {
  const { consulta } = simularBanco(t);
  for (const id of [...IDS_INVALIDOS, "40; DROP TABLE local; --"]) {
    await assert.rejects(repository.buscarLocalAutorizadoNoAmbiente(id, USUARIO_A), {
      statusCode: 400, message: "ID do local inválido.",
    });
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("Local autorizado: rejeita ausência de identidade autenticada", async (t) => {
  const { consulta } = simularBanco(t);
  for (const usuario of [undefined, null]) {
    await assert.rejects(repository.buscarLocalAutorizadoNoAmbiente(40, usuario), {
      statusCode: 401, message: "Usuário não autenticado.",
    });
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("Local autorizado: rejeita identificador de usuário inválido", async (t) => {
  const { consulta } = simularBanco(t);
  for (const id_usuario of IDS_INVALIDOS) {
    await assert.rejects(repository.buscarLocalAutorizadoNoAmbiente(40, {
      ...USUARIO_A, id_usuario,
    }), { statusCode: 401, message: "Identidade autenticada inválida." });
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("Local autorizado: rejeita UUID de ambiente inválido", async (t) => {
  const { consulta } = simularBanco(t);
  for (const id_ambiente of UUIDS_INVALIDOS) {
    await assert.rejects(repository.buscarLocalAutorizadoNoAmbiente(40, {
      ...USUARIO_A, id_ambiente,
    }), { statusCode: 401, message: "Identidade autenticada inválida." });
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("Local autorizado: ambiente vem somente da identidade autenticada", async (t) => {
  const { consulta } = simularBanco(t, [{ id_local: 40 }]);
  const dadosForjados = { id_usuario: 999, id_ambiente: AMBIENTE_B, eh_fundador: true, perfil_acesso: "ADMINISTRADOR" };
  await repository.buscarLocalAutorizadoNoAmbiente("40", {
    ...USUARIO_A, idAmbiente: AMBIENTE_B, idUsuario: 999,
    body: dadosForjados, query: dadosForjados, params: dadosForjados,
  });
  const [sql, parametros] = unica(consulta);
  assert.deepEqual(parametros, [AMBIENTE_A, 10, 40]);
  assert.equal(parametros.includes(AMBIENTE_B), false);
  assert.equal(parametros.includes(999), false);
  verificarAutorizacao(sql);
});

test("Local autorizado: SQL é parametrizado sem interpolação de valores", async (t) => {
  const { consulta } = simularBanco(t);
  await repository.buscarLocalAutorizadoNoAmbiente("78902", {
    id_usuario: "78901", id_ambiente: AMBIENTE_B,
  });
  const [sql, parametros] = unica(consulta);
  assert.deepEqual(parametros, [AMBIENTE_B, 78901, 78902]);
  assert.match(sql, /\bc\.id_ambiente\s*=\s*\$1\b/i);
  assert.match(sql, /\bsolicitante\.id_usuario\s*=\s*\$2\b/i);
  assert.match(sql, /\bl\.id_local\s*=\s*\$3\b/i);
  for (const valor of [AMBIENTE_B, "78901", "78902"]) {
    assert.equal(sql.includes(valor), false);
  }
  const indices = [...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
  assert.deepEqual([...new Set(indices)].sort((a, b) => a - b), [1, 2, 3]);
});

test("Local autorizado: consulta a relação local, campanha e ambiente", async (t) => {
  const { consulta } = simularBanco(t);
  await repository.buscarLocalAutorizadoNoAmbiente(40, USUARIO_A);
  const [sql] = unica(consulta);
  assert.match(sql, /\bFROM\s+local\s+AS\s+l\s+INNER\s+JOIN\s+campanha\s+AS\s+c\s+ON\s+c\.id_campanha\s*=\s*l\.id_campanha/i);
  assert.match(sql, /\bWHERE\s+c\.id_ambiente\s*=\s*\$1\s+AND\s+l\.id_local\s*=\s*\$3/i);
  assert.match(sql, /\bINNER\s+JOIN\s+ambiente\s+AS\s+a\s+ON\s+a\.id_ambiente\s*=\s*solicitante\.id_ambiente/i);
  assert.match(sql, /\bsolicitante\.id_ambiente\s*=\s*c\.id_ambiente/i);
});

test("Local autorizado: exige usuário e ambiente ativos no SQL", async (t) => {
  const { consulta } = simularBanco(t);
  await repository.buscarLocalAutorizadoNoAmbiente(40, USUARIO_A);
  const [sql] = unica(consulta);
  assert.match(sql, /\bsolicitante\.id_usuario\s*=\s*\$2/i);
  assert.match(sql, /AND\s+solicitante\.ativo\s*=\s*TRUE\s+AND\s+a\.ativo\s*=\s*TRUE/i);
});

test("Local autorizado: permite administrador somente pelo perfil do banco e no mesmo ambiente", async (t) => {
  const { consulta } = simularBanco(t, [{ id_local: 40 }]);
  const resultado = await repository.buscarLocalAutorizadoNoAmbiente(40, USUARIO_A);
  const [sql, parametros] = unica(consulta);
  verificarAutorizacao(sql);
  conferirCapacidadeSql(sql, 'solicitante');
  assert.match(sql, /\bsolicitante\.ativo\s*=\s*TRUE/i);
  assert.match(sql, /\ba\.ativo\s*=\s*TRUE/i);
  assert.deepEqual(parametros, [AMBIENTE_A, 10, 40]);
  assert.equal(parametros.includes("ADMINISTRADOR"), false);
  assert.deepEqual(resultado, { id_local: 40 });
});

test("Local autorizado: permite responsável ativo pela campanha", async (t) => {
  const { consulta } = simularBanco(t, [{ id_local: 40 }]);
  assert.deepEqual(await repository.buscarLocalAutorizadoNoAmbiente(40, USUARIO_B), { id_local: 40 });
  const [sql, parametros] = unica(consulta);
  verificarAutorizacao(sql);
  conferirCapacidadeSql(sql, 'solicitante');
  assert.match(sql, /\bsolicitante\.ativo\s*=\s*TRUE/i);
  assert.deepEqual(parametros, [AMBIENTE_B, 20, 40]);
});

test("Local autorizado: ser criador de evidência não aparece como condição de autorização", async (t) => {
  const { consulta } = simularBanco(t);
  await repository.buscarLocalAutorizadoNoAmbiente(40, USUARIO_A);
  const [sql] = unica(consulta);
  verificarAutorizacao(sql);
  assert.doesNotMatch(sql, /\b(?:e\.id_usuario|criador\.)/i);
  conferirCapacidadeSql(sql, 'solicitante');
  assert.doesNotMatch(sql, /\b(?:FROM|JOIN)\s+evidencia\b/i);
});

test("Local autorizado: separa parâmetros dos ambientes A e B", async (t) => {
  const { consulta } = simularBanco(t);
  for (const [indice, usuario] of [USUARIO_A, USUARIO_B].entries()) {
    await repository.buscarLocalAutorizadoNoAmbiente(40, usuario);
    const [sql, parametros] = consulta.mock.calls[indice].arguments;
    assert.deepEqual(parametros, [usuario.id_ambiente, usuario.id_usuario, 40]);
    verificarAutorizacao(sql);
  }
  assert.equal(consulta.mock.callCount(), 2);
});

test("Local autorizado: retorna somente a identificação do local", async (t) => {
  const { consulta } = simularBanco(t, [{ id_local: 40 }]);
  assert.deepEqual(await repository.buscarLocalAutorizadoNoAmbiente(40, USUARIO_A), { id_local: 40 });
  const [sql] = unica(consulta);
  assert.match(sql, /^\s*SELECT\s+l\.id_local\s+FROM\s+local\s+AS\s+l\b/i);
  assert.doesNotMatch(sql, /SELECT\s+(?:l\.)?\*/i);
  assert.match(sql, /\bLIMIT\s+1\b/i);
});

test("Local autorizado: retorna null sem resultado para local ausente, externo ou sem permissão", async (t) => {
  const { consulta } = simularBanco(t);
  // O mock simula ausência de linhas após os filtros; não executa a política SQL.
  const casos = [[999, USUARIO_A], [40, USUARIO_B], [40, USUARIO_A]];
  for (const [indice, [id, usuario]] of casos.entries()) {
    assert.equal(await repository.buscarLocalAutorizadoNoAmbiente(id, usuario), null);
    const [sql, parametros] = consulta.mock.calls[indice].arguments;
    assert.deepEqual(parametros, [usuario.id_ambiente, usuario.id_usuario, id]);
    verificarAutorizacao(sql);
  }
  assert.equal(consulta.mock.callCount(), 3);
});

test("Local autorizado: funciona sem depender de evidências existentes", async (t) => {
  const { consulta } = simularBanco(t, [{ id_local: 40 }]);
  assert.deepEqual(await repository.buscarLocalAutorizadoNoAmbiente(40, USUARIO_A), { id_local: 40 });
  const [sql] = unica(consulta);
  assert.match(sql, /\bFROM\s+local\s+AS\s+l\b/i);
  assert.doesNotMatch(sql, /\bevidencia\b/i);
  assert.doesNotMatch(sql, /\bid_evidencia\b|\bid_operacao_cliente\b/i);
});

test("Local autorizado: não acessa nem retorna dados da tabela evidencia", async (t) => {
  const { consulta } = simularBanco(t, [{ id_local: 40 }]);
  const resultado = await repository.buscarLocalAutorizadoNoAmbiente(40, USUARIO_A);
  const [sql] = unica(consulta);
  assert.doesNotMatch(sql, /\bevidencia\b|\bcriador\b|\bcaminho_arquivo\b/i);
  assert.deepEqual(Object.keys(resultado), ["id_local"]);
});

test("Local autorizado: executa somente SELECT sem escritas ou DDL", async (t) => {
  const { consulta } = simularBanco(t);
  await repository.buscarLocalAutorizadoNoAmbiente(40, USUARIO_A);
  const [sql] = unica(consulta);
  assert.match(sql, /^\s*SELECT\b/i);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
});

test("Local autorizado: não utiliza repositórios legados", async (t) => {
  const { consulta } = simularBanco(t);
  await repository.buscarLocalAutorizadoNoAmbiente(40, USUARIO_A);
  unica(consulta);
  const modulo = require.cache[require.resolve("../src/repositories/evidenciaMultiTenantRepository")];
  assert.deepEqual(modulo.children.map((child) => child.id), [
    require.resolve("../src/utils/permissoes"),
    require.resolve("../src/config/database"),
  ]);
});

test("Local autorizado: usa query simulado e não abre conexão real", async (t) => {
  const { consulta, conectar } = simularBanco(t, [{ id_local: 40 }]);
  assert.deepEqual(await repository.buscarLocalAutorizadoNoAmbiente(40, USUARIO_A), { id_local: 40 });
  assert.equal(consulta.mock.callCount(), 1);
  assert.equal(conectar.mock.callCount(), 0);
});

test("Local autorizado: nova função e as sete funções anteriores continuam exportadas", () => {
  const anteriores = [
    "criarNoAmbiente", "listarPermitidasNoAmbiente", "buscarPorIdEAmbiente",
    "listarPorLocalEAmbiente", "buscarPorOperacaoClienteNoAmbiente",
    "atualizarNoAmbiente", "excluirNoAmbiente",
  ];
  for (const nome of [...anteriores, "buscarLocalAutorizadoNoAmbiente"]) {
    assert.equal(typeof repository[nome], "function");
  }
  assert.deepEqual(Object.keys(repository).sort(), [...anteriores, "buscarLocalAutorizadoNoAmbiente"].sort());
});


// Controle GPS: os mocks verificam o protocolo; não emulam locks ou tipos do PostgreSQL.
const GPS_PRECISO = Object.freeze({
  latitude: "-23.1234567",
  longitude: "-46.7654321",
  precisao_gps: "3.20",
  origem_coordenadas: "GPS",
  data_captura_gps: "2026-10-15T12:34:56.123456Z",
});
const GPS_NULO = Object.freeze(Object.fromEntries(Object.keys(GPS_PRECISO).map((campo) => [campo, null])));
const GPS_ZERO = Object.freeze({
  ...GPS_PRECISO, latitude: "0.0000000", longitude: "0.0000000", precisao_gps: "0.00",
});
const EVIDENCIA_GPS_ATUALIZADA = { ...EVIDENCIA, ...GPS_PRECISO, descricao: "Nova" };

function verificarComparacaoGps(sql, inicio) {
  const tipos = ["numeric", "numeric", "numeric", "varchar", "timestamptz"];
  Object.keys(GPS_PRECISO).forEach((campo, indice) => {
    assert.match(sql, new RegExp(
      "\\be\\." + campo + "\\s+IS NOT DISTINCT FROM\\s+\\$" + (inicio + indice) + "::" + tipos[indice] + "\\b", "i"
    ));
  });
  assert.equal((sql.match(/IS NOT DISTINCT FROM/gi) || []).length, 5);
}

function verificarBloqueioGps(sql, parametros, usuario) {
  assert.deepEqual(parametros.slice(0, 3), [usuario.id_ambiente, usuario.id_usuario, 50]);
  assert.match(sql, /\bc\.id_ambiente\s*=\s*\$1\b/i);
  assert.match(sql, /\bsolicitante\.id_usuario\s*=\s*\$2\b/i);
  assert.match(sql, /\be\.id_evidencia\s*=\s*\$3\b/i);
  assert.match(sql, /\bsolicitante\.id_ambiente\s*=\s*c\.id_ambiente/i);
  assert.match(sql, /\bsolicitante\.ativo\s*=\s*TRUE/i);
  assert.match(sql, /\ba\.ativo\s*=\s*TRUE/i);
  conferirCapacidadeSql(sql, 'solicitante');
  assert.match(sql, /\bl\.id_campanha\s*=\s*c\.id_campanha/i);
  assert.match(sql, /\be\.id_local\s*=\s*l\.id_local/i);
  const permissao = sql.slice(sql.indexOf("WHERE"));
  assert.doesNotMatch(permissao, /\b(?:e\.id_usuario|criador\.)/i);
  assert.equal(sql.includes(usuario.id_ambiente), false);
}

// Cada resposta corresponde a uma instrução efetivamente esperada, em ordem.
// Falhas e ausência de linhas interrompem o roteiro antes do UPDATE/COMMIT.
function simularTransacaoGps(t, configuracao = {}) {
  const usuario = configuracao.usuario || USUARIO_A;
  const esperado = configuracao.gpsEsperado || GPS_PRECISO;
  const erro = configuracao.erro || new Error("Falha interna simulada");
  const passos = ["BEGIN", "a", "solicitante", "c", "l", "e", "UPDATE", "COMMIT"];
  const corte = configuracao.falha || configuracao.ausente ||
    (configuracao.conflito ? "e" : configuracao.updateVazio ? "UPDATE" : null);
  const roteiro = corte ? passos.slice(0, passos.indexOf(corte) + 1) : [...passos];
  if (corte && corte !== "BEGIN") roteiro.push("ROLLBACK");
  // No retorno antecipado, a primeira falha de rollback entra no catch,
  // que tenta encerrar a transação novamente antes de descartar o cliente.
  if (configuracao.ausente && configuracao.erroRollback) roteiro.push("ROLLBACK");
  const eventos = [];
  let indice = 0;
  const client = {
    query: t.mock.fn(async (sql, parametros) => {
      const passo = roteiro[indice++];
      assert.ok(passo, "Consulta transacional adicional inesperada");
      eventos.push(passo);
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(passo)) {
        assert.equal(sql, passo === "BEGIN" ? "BEGIN ISOLATION LEVEL READ COMMITTED" : passo);
        assert.equal(parametros, undefined);
      } else if (passo === "UPDATE") {
        assert.match(sql, /^\s*UPDATE\s+evidencia\s+AS\s+e\b/i);
        verificarAutorizacao(sql);
        assert.match(sql, /\be\.id_evidencia\s*=\s*\$3\b/i);
        assert.match(sql, /\bl\.id_local\s*=\s*e\.id_local/i);
        assert.deepEqual(parametros.slice(0, 3), [usuario.id_ambiente, usuario.id_usuario, 50]);
        assert.deepEqual(parametros.slice(19), Object.values(esperado));
        assert.equal(parametros.length, 24);
        verificarComparacaoGps(sql, 20);
      } else {
        assert.match(sql, /^\s*SELECT\b/i);
        verificarBloqueioGps(sql, parametros, usuario);
        assert.match(sql, new RegExp("FOR " + (passo === "e" ? "UPDATE" : "SHARE") + " OF " + passo + "\\s*$", "i"));
        if (passo !== "a") {
          assert.match(sql, /\bl\.id_local\s*=\s*\$4\b/i);
          assert.match(sql, /\bc\.id_campanha\s*=\s*\$5\b/i);
          assert.deepEqual(parametros.slice(3, 5), [40, 30]);
        }
        if (passo === "e") {
          verificarComparacaoGps(sql, 6);
          assert.deepEqual(parametros.slice(5), Object.values(esperado));
          assert.equal(parametros.length, 10);
        } else assert.equal(parametros.length, passo === "a" ? 3 : 5);
      }
      if (configuracao.falha === passo) throw erro;
      if (passo === "ROLLBACK" && configuracao.erroRollback) throw configuracao.erroRollback;
      if (configuracao.ausente === passo || (passo === "UPDATE" && configuracao.updateVazio)) return { rows: [] };
      if (passo === "e") return { rows: [{ id_evidencia: 50, gps_confere: !configuracao.conflito }] };
      if (passo === "UPDATE") return { rows: [configuracao.registro || EVIDENCIA_GPS_ATUALIZADA] };
      if (["a", "solicitante", "c", "l"].includes(passo)) return { rows: [{ id_local: 40, id_campanha: 30 }] };
      return { rows: [] };
    }),
    release: t.mock.fn(() => { eventos.push("release"); }),
  };
  const consulta = t.mock.method(pool, "query", async () => {
    throw new Error("Modo GPS não deve usar pool.query");
  });
  const conectar = t.mock.method(pool, "connect", async () => client);
  t.after(() => {
    assert.equal(indice, roteiro.length);
    assert.equal(consulta.mock.callCount(), 0);
    assert.equal(conectar.mock.callCount(), 1);
    assert.equal(client.release.mock.callCount(), 1);
    assert.deepEqual(eventos, [...roteiro, "release"]);
  });
  return { client, eventos, erro, roteiro };
}

test("GPS: leitura sem opção mantém SQL e resposta anteriores", async (t) => {
  const { consulta } = simularBanco(t, [EVIDENCIA]);
  for (const opcoes of [undefined, {}, { incluirEstadoGps: false }]) {
    assert.strictEqual(await repository.buscarPorIdEAmbiente(50, USUARIO_A, opcoes), EVIDENCIA);
  }
  const chamadas = consulta.mock.calls.map((chamada) => chamada.arguments);
  assert.deepEqual(chamadas[1], chamadas[0]);
  assert.deepEqual(chamadas[2], chamadas[0]);
  assert.doesNotMatch(chamadas[0][0], /\bestado_gps\b|json_build_object|to_char/i);
  assert.deepEqual(chamadas[0][1], [AMBIENTE_A, 10, 50]);
  assert.equal(Object.hasOwn(EVIDENCIA, "estado_gps"), false);
  verificarAutorizacao(chamadas[0][0]);
});

test("GPS: leitura precisa constrói os cinco campos textuais no SQL autorizado", async (t) => {
  const registro = { ...EVIDENCIA, estado_gps: GPS_PRECISO };
  const { consulta } = simularBanco(t, [registro]);
  assert.strictEqual(await repository.buscarPorIdEAmbiente(50, USUARIO_A, { incluirEstadoGps: true }), registro);
  const [sql, parametros] = unica(consulta);
  for (const campo of ["latitude", "longitude", "precisao_gps", "origem_coordenadas"]) {
    assert.match(sql, new RegExp("'" + campo + "',\\s*e\\." + campo + "::text", "i"));
  }
  assert.match(sql, /json_build_object\s*\(/i);
  assert.match(sql, /'data_captura_gps',\s*to_char\(e\.data_captura_gps AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'\)\s*\|\|\s*'Z'/i);
  assert.match(sql, /\)\s+AS\s+estado_gps/i);
  assert.doesNotMatch(sql, /json_strip_nulls|::float|::double/i);
  verificarAutorizacao(sql);
  assert.match(sql, /criador\.id_ambiente\s*=\s*c\.id_ambiente/i);
  assert.deepEqual(parametros, [AMBIENTE_A, 10, 50]);
});

for (const [nome, estado] of [["null explícito", GPS_NULO], ["zero textual", GPS_ZERO], ["decimais e microssegundos", GPS_PRECISO]]) {
  test("GPS: leitura preserva " + nome + " retornado pelo banco", async (t) => {
    const registro = { ...EVIDENCIA, estado_gps: estado };
    simularBanco(t, [registro]);
    const resultado = await repository.buscarPorIdEAmbiente(50, USUARIO_B, { incluirEstadoGps: true });
    assert.strictEqual(resultado, registro);
    assert.strictEqual(resultado.estado_gps, estado);
    assert.deepEqual(Object.keys(resultado.estado_gps), Object.keys(GPS_PRECISO));
    assert.deepEqual(resultado.estado_gps, estado);
  });
}

test("GPS: leitura autorizada sem linhas retorna null nos ambientes A e B", async (t) => {
  const { consulta } = simularBanco(t);
  for (const [indice, usuario] of [USUARIO_A, USUARIO_B].entries()) {
    assert.equal(await repository.buscarPorIdEAmbiente(50, usuario, { incluirEstadoGps: true }), null);
    const [sql, parametros] = consulta.mock.calls[indice].arguments;
    verificarAutorizacao(sql);
    assert.deepEqual(parametros, [usuario.id_ambiente, usuario.id_usuario, 50]);
  }
});

test("GPS: opções de leitura inválidas são recusadas sem consulta", async (t) => {
  const { consulta } = simularBanco(t);
  for (const opcoes of [[], true, "opções", { incluirEstadoGps: null }, { incluirEstadoGps: 1 }]) {
    await assert.rejects(repository.buscarPorIdEAmbiente(50, USUARIO_A, opcoes), { statusCode: 400 });
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("GPS: UPDATE com três argumentos continua usando somente pool.query", async (t) => {
  const { consulta } = simularBanco(t, [EVIDENCIA_GPS_ATUALIZADA]);
  assert.strictEqual(await repository.atualizarNoAmbiente(50, { descricao: "Nova" }, USUARIO_A), EVIDENCIA_GPS_ATUALIZADA);
  const [sql, parametros] = unica(consulta);
  assert.equal(parametros.length, 19);
  assert.deepEqual(parametros.slice(0, 3), [AMBIENTE_A, 10, 50]);
  assert.deepEqual(parametros.slice(7, 9), [true, "Nova"]);
  assert.doesNotMatch(sql, /IS NOT DISTINCT FROM|FOR SHARE|BEGIN/i);
  verificarAutorizacao(sql);
});

test("GPS: estado esperado incompleto ou inválido é rejeitado antes de connect", async (t) => {
  const { consulta } = simularBanco(t);
  const invalidos = [undefined, null, [], 1, "GPS", {}];
  for (const campo of Object.keys(GPS_PRECISO)) {
    const incompleto = { ...GPS_PRECISO };
    delete incompleto[campo];
    invalidos.push(incompleto, { ...GPS_PRECISO, [campo]: undefined });
  }
  for (const alteracao of [
    { latitude: 0 }, { longitude: "181" }, { latitude: "-91" },
    { latitude: "0.12345678" }, { latitude: null },
    { precisao_gps: "-1" }, { precisao_gps: "1.123" }, { precisao_gps: Infinity },
    { origem_coordenadas: "OUTRA" }, { data_captura_gps: new Date("2026-10-15") },
    { data_captura_gps: "2026-10-15T12:34:56.123Z" },
    { data_captura_gps: "2026-02-30T12:34:56.123456Z" },
    { data_captura_gps: "2026-10-15T24:34:56.123456Z" },
    { latitude: "0; SELECT 1" },
  ]) invalidos.push({ ...GPS_PRECISO, ...alteracao });
  for (const gpsEsperado of invalidos) {
    await assert.rejects(repository.atualizarNoAmbiente(50, {}, USUARIO_A, { gpsEsperado }), { statusCode: 400 });
  }
  assert.equal(consulta.mock.callCount(), 0);
});

test("GPS: identidade, ID e dados inválidos são recusados antes da transação", async (t) => {
  const { consulta } = simularBanco(t);
  const opcoes = { gpsEsperado: GPS_PRECISO };
  for (const usuario of [null, { ...USUARIO_A, id_usuario: 0 }, { ...USUARIO_A, id_ambiente: "inválido" }]) {
    await assert.rejects(repository.atualizarNoAmbiente(50, {}, usuario, opcoes), { statusCode: 401 });
  }
  await assert.rejects(repository.atualizarNoAmbiente(0, {}, USUARIO_A, opcoes), { statusCode: 400 });
  await assert.rejects(repository.atualizarNoAmbiente(50, [], USUARIO_A, opcoes), { statusCode: 400 });
  await assert.rejects(repository.atualizarNoAmbiente(50, { latitude: 91 }, USUARIO_A, opcoes), { statusCode: 400 });
  assert.equal(consulta.mock.callCount(), 0);
});

for (const [nome, gpsEsperado] of [["precisão completa", GPS_PRECISO], ["cinco nulls", GPS_NULO], ["coordenadas zero", GPS_ZERO]]) {
  test("GPS: transação aceita " + nome + " e preserva parâmetros exatos", async (t) => {
    const registro = { ...EVIDENCIA_GPS_ATUALIZADA, ...gpsEsperado };
    const { client, eventos } = simularTransacaoGps(t, { gpsEsperado, registro });
    assert.strictEqual(await repository.atualizarNoAmbiente(50, { descricao: "Nova" }, USUARIO_A, { gpsEsperado }), registro);
    assert.deepEqual(eventos, ["BEGIN", "a", "solicitante", "c", "l", "e", "UPDATE", "COMMIT", "release"]);
    assert.deepEqual(client.release.mock.calls[0].arguments, []);
    const [sql, parametros] = client.query.mock.calls[6].arguments;
    assert.deepEqual(parametros.slice(19), Object.values(gpsEsperado));
    for (const valor of Object.values(gpsEsperado).filter((valor) => valor !== null)) {
      // Valores esperados ficam nos parâmetros; zero também é enviado como texto.
      if (valor.length > 3) assert.equal(sql.includes(valor), false);
    }
  });
}

test("GPS: UPDATE condicional preserva CASE, omissões e campos imutáveis", async (t) => {
  const { client } = simularTransacaoGps(t);
  await repository.atualizarNoAmbiente(50, {
    descricao: "Nova", latitude: undefined, id_local: 999, id_usuario: 999,
    id_operacao_cliente: OPERACAO, id_ambiente: AMBIENTE_B, eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
  }, USUARIO_A, { gpsEsperado: GPS_PRECISO });
  const [sql, parametros] = client.query.mock.calls[6].arguments;
  const set = sql.match(/\bSET\b([\s\S]*?)\bFROM\b/i)[1];
  CAMPOS_UPDATE.forEach((campo, indice) => {
    const flag = 4 + indice * 2;
    assert.match(set, new RegExp("\\b" + campo + "\\s*=\\s*CASE WHEN \\$" + flag +
      "::boolean THEN \\$" + (flag + 1) + "(?:::[a-z]+)? ELSE e\\." + campo + " END", "i"));
    assert.deepEqual(parametros.slice(flag - 1, flag + 1), campo === "descricao" ? [true, "Nova"] : [false, null]);
  });
  assert.doesNotMatch(set, /\bid_local\b|\bid_usuario\b|\bid_operacao_cliente\b|\bid_ambiente\b|\bperfil_acesso\b/);
  assert.doesNotMatch(set, /\$(?:20|21|22|23|24)\b/);
  assert.equal(parametros.includes(999), false);
  assert.equal(parametros.includes(AMBIENTE_B), false);
  assert.equal(parametros.includes(OPERACAO), false);
});

test("GPS: limpeza explícita envia null e preserva os demais campos", async (t) => {
  const registro = { ...EVIDENCIA, ...GPS_NULO };
  const { client } = simularTransacaoGps(t, { registro });
  assert.strictEqual(await repository.atualizarNoAmbiente(50, GPS_NULO, USUARIO_A, { gpsEsperado: GPS_PRECISO }), registro);
  const parametros = client.query.mock.calls[6].arguments[1];
  assert.deepEqual(parametros.slice(3, 9), [false, null, false, null, false, null]);
  assert.deepEqual(parametros.slice(9, 19), Object.keys(GPS_NULO).flatMap(() => [true, null]));
  assert.deepEqual(parametros.slice(19), Object.values(GPS_PRECISO));
});

for (const [nome, usuario] of [["A", USUARIO_A], ["B", USUARIO_B]]) {
  test("GPS: ambiente " + nome + " mantém identidade em todas as etapas", async (t) => {
    const registro = { ...EVIDENCIA_GPS_ATUALIZADA, id_usuario: usuario.id_usuario };
    simularTransacaoGps(t, { usuario, registro });
    assert.strictEqual(
      await repository.atualizarNoAmbiente(50, { descricao: "Nova" }, usuario, { gpsEsperado: GPS_PRECISO }),
      registro
    );
  });
}

for (const fase of ["a", "solicitante", "c", "l", "e"]) {
  test("GPS: ausência de autorização na fase " + fase + " retorna null com rollback", async (t) => {
    const { client, eventos } = simularTransacaoGps(t, { ausente: fase });
    assert.equal(await repository.atualizarNoAmbiente(50, {}, USUARIO_A, { gpsEsperado: GPS_PRECISO }), null);
    assert.equal(eventos.includes("UPDATE"), false);
    assert.equal(eventos.includes("COMMIT"), false);
    assert.deepEqual(client.release.mock.calls[0].arguments, []);
  });
}

test("GPS: divergência autorizada gera somente CONFLITO_GPS sem UPDATE", async (t) => {
  const { eventos, client } = simularTransacaoGps(t, { conflito: true });
  await assert.rejects(repository.atualizarNoAmbiente(50, {}, USUARIO_A, { gpsEsperado: GPS_PRECISO }), (erro) => {
    assert.equal(erro.statusCode, 409);
    assert.equal(erro.code, "CONFLITO_GPS");
    assert.equal(erro.detail, undefined);
    assert.equal(erro.cause, undefined);
    assert.equal(erro.message.includes(AMBIENTE_B), false);
    assert.equal(erro.message.includes(GPS_PRECISO.latitude), false);
    return true;
  });
  assert.equal(eventos.includes("UPDATE"), false);
  assert.equal(eventos.includes("COMMIT"), false);
  assert.deepEqual(client.release.mock.calls[0].arguments, []);
});

test("GPS: UPDATE inesperadamente vazio gera falha 500, nunca conflito", async (t) => {
  const { eventos } = simularTransacaoGps(t, { updateVazio: true });
  await assert.rejects(repository.atualizarNoAmbiente(50, {}, USUARIO_A, { gpsEsperado: GPS_PRECISO }), {
    statusCode: 500, code: "FALHA_ATUALIZACAO_GPS",
    message: "Não foi possível concluir a atualização da evidência.",
  });
  assert.equal(eventos.includes("COMMIT"), false);
});

for (const fase of ["a", "solicitante", "c", "l", "e", "UPDATE", "COMMIT"]) {
  test("GPS: falha interna em " + fase + " propaga o erro e executa rollback", async (t) => {
    const erro = Object.assign(new Error("Falha de infraestrutura simulada"), { code: "XX000" });
    const { client } = simularTransacaoGps(t, { falha: fase, erro });
    await assert.rejects(repository.atualizarNoAmbiente(50, {}, USUARIO_A, { gpsEsperado: GPS_PRECISO }), (recebido) => {
      assert.strictEqual(recebido, erro);
      assert.equal(recebido.statusCode, undefined);
      assert.notEqual(recebido.code, "CONFLITO_GPS");
      return true;
    });
    assert.deepEqual(client.release.mock.calls[0].arguments, []);
  });
}

test("GPS: falha no BEGIN descarta o cliente sem consultas posteriores", async (t) => {
  const { client, erro } = simularTransacaoGps(t, { falha: "BEGIN" });
  await assert.rejects(repository.atualizarNoAmbiente(50, {}, USUARIO_A, { gpsEsperado: GPS_PRECISO }), (recebido) => recebido === erro);
  assert.deepEqual(client.release.mock.calls[0].arguments, [erro]);
});

test("GPS: falha no rollback descarta conexão e preserva erro original", async (t) => {
  const erroRollback = new Error("Rollback indisponível");
  const { client, erro } = simularTransacaoGps(t, { falha: "UPDATE", erroRollback });
  await assert.rejects(repository.atualizarNoAmbiente(50, {}, USUARIO_A, { gpsEsperado: GPS_PRECISO }), (recebido) => recebido === erro);
  assert.deepEqual(client.release.mock.calls[0].arguments, [erroRollback]);
});

test("GPS: conflito continua 409 quando rollback falha e cliente é descartado", async (t) => {
  const erroRollback = new Error("Rollback indisponível");
  const { client } = simularTransacaoGps(t, { conflito: true, erroRollback });
  await assert.rejects(repository.atualizarNoAmbiente(50, {}, USUARIO_A, { gpsEsperado: GPS_PRECISO }), {
    statusCode: 409, code: "CONFLITO_GPS",
  });
  assert.deepEqual(client.release.mock.calls[0].arguments, [erroRollback]);
});

test("GPS: ausência de autorização com rollback indisponível propaga falha e descarta cliente", async (t) => {
  const erroRollback = new Error("Rollback indisponível");
  const { client } = simularTransacaoGps(t, { ausente: "e", erroRollback });
  await assert.rejects(repository.atualizarNoAmbiente(50, {}, USUARIO_A, { gpsEsperado: GPS_PRECISO }), (erro) => {
    assert.strictEqual(erro, erroRollback);
    assert.notEqual(erro.code, "CONFLITO_GPS");
    return true;
  });
  assert.deepEqual(client.release.mock.calls[0].arguments, [erroRollback]);
});

test("GPS: falha ao obter cliente é propagada sem consulta ou conexão alternativa", async (t) => {
  const erro = new Error("Pool indisponível");
  const consulta = t.mock.method(pool, "query", async () => { throw new Error("Consulta inesperada"); });
  const conectar = t.mock.method(pool, "connect", async () => { throw erro; });
  await assert.rejects(repository.atualizarNoAmbiente(50, {}, USUARIO_A, { gpsEsperado: GPS_PRECISO }), (recebido) => recebido === erro);
  assert.equal(conectar.mock.callCount(), 1);
  assert.equal(consulta.mock.callCount(), 0);
});

test("GPS: extensão mantém oito exports e recuperação idempotente restrita", async (t) => {
  const nomes = [
    "criarNoAmbiente", "listarPermitidasNoAmbiente", "buscarPorIdEAmbiente",
    "listarPorLocalEAmbiente", "buscarPorOperacaoClienteNoAmbiente",
    "atualizarNoAmbiente", "excluirNoAmbiente", "buscarLocalAutorizadoNoAmbiente",
  ];
  assert.deepEqual(Object.keys(repository).sort(), nomes.sort());
  for (const nome of nomes) assert.equal(typeof repository[nome], "function");
  const { consulta } = simularBanco(t);
  assert.equal(await repository.buscarPorOperacaoClienteNoAmbiente(OPERACAO, 40, USUARIO_B), null);
  const [sql, parametros] = unica(consulta);
  verificarAutorizacao(sql);
  assert.match(sql, /\be\.id_local\s*=\s*\$3\s+AND\s+e\.id_operacao_cliente\s*=\s*\$4/i);
  assert.doesNotMatch(sql, /\bestado_gps\b|IS NOT DISTINCT FROM|FOR SHARE/i);
  assert.deepEqual(parametros, [AMBIENTE_B, 20, 40, OPERACAO]);
});

