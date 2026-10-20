const test = require("node:test");
const assert = require("node:assert/strict");
const controller = require("../src/controllers/checklistMultiTenantController");
const service = require("../src/services/checklistMultiTenantService");
const serviceLegado = require("../src/services/checklistService");
const checklistRepositoryLegado = require("../src/repositories/checklistRepository");
const localRepositoryLegado = require("../src/repositories/localRepository");
const campanhaRepositoryLegado = require("../src/repositories/campanhaRepository");
const pool = require("../src/config/database");

const AMBIENTE_A = "11111111-1111-4111-8111-111111111111";
const AMBIENTE_B = "22222222-2222-4222-8222-222222222222";
const IDENTIDADES = [
  { id_usuario: 10, id_ambiente: AMBIENTE_A, eh_fundador: false, perfil_acesso: "ENGENHEIRO_SEGURANCA" },
  { id_usuario: 20, id_ambiente: AMBIENTE_B, eh_fundador: false, perfil_acesso: "ENGENHEIRO_SEGURANCA" },
];
const CHECKLIST = {
  id_checklist: 50,
  id_local: 40,
  criterio_a: "SIM",
  criterio_b: "NAO",
  criterio_c: "SIM",
  acesso_controlado: "SIM",
  ventilacao_adequada: "NAO",
  monitoramento_atmosferico: "SIM",
  procedimento_emergencia: "NAO",
  observacoes: "Observação simulada",
  status: "PENDENTE",
};

const OPERACOES = [
  {
    controller: "criar", servico: "criarChecklist",
    argumentos: (req) => [req.body, req.usuario],
    resultado: CHECKLIST, codigo: 201,
    resposta: { status: "success", data: CHECKLIST },
    erroInterno: "Erro interno ao criar checklist.",
  },
  {
    controller: "listar", servico: "listarChecklists",
    argumentos: (req) => [req.usuario],
    resultado: [CHECKLIST], codigo: 200,
    resposta: { status: "success", total: 1, data: [CHECKLIST] },
    erroInterno: "Erro interno ao listar checklists.",
  },
  {
    controller: "buscarPorId", servico: "buscarChecklistPorId",
    argumentos: (req) => [req.params.id, req.usuario],
    resultado: CHECKLIST, codigo: 200,
    resposta: { status: "success", data: CHECKLIST },
    erroInterno: "Erro interno ao buscar checklist.",
  },
  {
    controller: "atualizar", servico: "atualizarChecklist",
    argumentos: (req) => [req.params.id, req.body, req.usuario],
    resultado: CHECKLIST, codigo: 200,
    resposta: {
      status: "success", message: "Checklist atualizado com sucesso.", data: CHECKLIST,
    },
    erroInterno: "Erro interno ao atualizar checklist.",
  },
  {
    controller: "alterarStatus", servico: "alterarStatusChecklist",
    argumentos: (req) => [req.params.id, req.body, req.usuario],
    resultado: { ...CHECKLIST, status: "CONCLUIDO" }, codigo: 200,
    resposta: {
      status: "success", message: "Status do checklist atualizado com sucesso.",
      data: { ...CHECKLIST, status: "CONCLUIDO" },
    },
    erroInterno: "Erro interno ao alterar status do checklist.",
  },
];

function simularReq(usuario) {
  const identidadeForjada = {
    id_usuario: 999,
    id_ambiente: usuario.id_ambiente === AMBIENTE_A ? AMBIENTE_B : AMBIENTE_A,
    eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
  };
  return {
    usuario,
    params: { id: "50", ...identidadeForjada },
    query: { id: "999", ...identidadeForjada },
    body: {
      ...CHECKLIST, id: "999", id_checklist: 999,
      status: "CONCLUIDO", ...identidadeForjada,
      usuario: { ...identidadeForjada },
    },
  };
}

function simularRes(t) {
  const res = {};
  res.status = t.mock.fn(() => res);
  res.json = t.mock.fn(() => res);
  res.send = t.mock.fn(() => res);
  res.end = t.mock.fn(() => res);
  return res;
}

function simularServicos(t, operacao, implementacao) {
  const mocks = {};
  for (const item of OPERACOES) {
    mocks[item.servico] = t.mock.method(service, item.servico, async () => {
      throw new Error(`Serviço inesperado: ${item.servico}`);
    });
  }
  mocks[operacao.servico].mock.mockImplementation(implementacao);

  const guardas = [];
  function bloquear(objeto, metodo) {
    guardas.push(t.mock.method(objeto, metodo, async () => {
      throw new Error(`Chamada proibida neste teste: ${metodo}`);
    }));
  }
  bloquear(pool, "query");
  bloquear(pool, "connect");
  for (const objeto of [
    serviceLegado, checklistRepositoryLegado,
    localRepositoryLegado, campanhaRepositoryLegado,
  ]) {
    for (const metodo of Object.keys(objeto)) {
      if (typeof objeto[metodo] === "function") bloquear(objeto, metodo);
    }
  }
  t.mock.method(console, "error", () => {});
  t.after(() => {
    for (const guarda of guardas) assert.equal(guarda.mock.callCount(), 0);
  });
  return mocks;
}

function verificarEncaminhamento(mocks, operacao, req, identidadeOriginal) {
  const mock = mocks[operacao.servico];
  assert.equal(mock.mock.callCount(), 1);
  const argumentos = mock.mock.calls[0].arguments;
  assert.deepEqual(argumentos, operacao.argumentos(req));
  assert.strictEqual(argumentos[argumentos.length - 1], identidadeOriginal);
  assert.strictEqual(req.usuario, identidadeOriginal);
  for (const item of OPERACOES) {
    if (item.servico !== operacao.servico) {
      assert.equal(mocks[item.servico].mock.callCount(), 0);
    }
  }
}

function verificarResposta(res, retorno, codigo, corpo) {
  assert.strictEqual(retorno, res);
  assert.equal(res.status.mock.callCount(), 1);
  assert.deepEqual(res.status.mock.calls[0].arguments, [codigo]);
  assert.equal(res.json.mock.callCount(), 1);
  assert.deepEqual(res.json.mock.calls[0].arguments, [corpo]);
  assert.equal(res.send.mock.callCount(), 0);
  assert.equal(res.end.mock.callCount(), 0);
}

for (const operacao of OPERACOES) {
  for (const [indice, identidade] of IDENTIDADES.entries()) {
    test(`${operacao.controller}: sucesso no ambiente ${indice === 0 ? "A" : "B"} preserva JSON e identidade original`, async (t) => {
      const usuario = { ...identidade };
      const req = simularReq(usuario);
      const res = simularRes(t);
      const mocks = simularServicos(t, operacao, async () => operacao.resultado);

      const retorno = await controller[operacao.controller](req, res);

      verificarResposta(res, retorno, operacao.codigo, operacao.resposta);
      verificarEncaminhamento(mocks, operacao, req, usuario);
      assert.deepEqual(usuario, identidade);
      assert.notStrictEqual(usuario, req.body.usuario);
      assert.notEqual(usuario.id_usuario, req.body.id_usuario);
      assert.notEqual(usuario.id_ambiente, req.params.id_ambiente);
      assert.notEqual(usuario.perfil_acesso, req.query.perfil_acesso);
    });
  }

  for (const statusCode of [400, 401, 403, 404, 409]) {
    test(`${operacao.controller}: preserva HTTP ${statusCode} do serviço sem resposta duplicada`, async (t) => {
      const req = simularReq({ ...IDENTIDADES[0] });
      if (statusCode === 401) delete req.usuario;
      const identidadeOriginal = req.usuario;
      const res = simularRes(t);
      const erro = new Error(statusCode === 409
        ? "Este local já possui um checklist NR-33."
        : `Erro de aplicação simulado ${statusCode}.`);
      erro.statusCode = statusCode;
      erro.detail = "DETALHE_INTERNO_NAO_PUBLICAR";
      const mocks = simularServicos(t, operacao, async () => { throw erro; });

      const retorno = await controller[operacao.controller](req, res);

      verificarResposta(res, retorno, statusCode, { status: "error", message: erro.message });
      verificarEncaminhamento(mocks, operacao, req, identidadeOriginal);
      const json = JSON.stringify(res.json.mock.calls[0].arguments[0]);
      assert.equal(json.includes(erro.detail), false);
      assert.equal(json.includes(erro.stack), false);
    });
  }

  for (const statusCode of [undefined, 500]) {
    const descricao = statusCode === undefined ? "sem statusCode" : "com statusCode 500";
    test(`${operacao.controller}: erro interno ${descricao} retorna 500 genérico sem detalhes sensíveis`, async (t) => {
      const usuario = { ...IDENTIDADES[0] };
      const req = simularReq(usuario);
      const res = simularRes(t);
      const erro = new Error("MENSAGEM_INTERNA_SIMULADA_NAO_PUBLICAR");
      erro.detail = "DETALHE_INTERNO_SIMULADO_NAO_PUBLICAR";
      erro.query = "SELECT dado_interno_simulado FROM tabela_interna_simulada";
      if (statusCode !== undefined) erro.statusCode = statusCode;
      const mocks = simularServicos(t, operacao, async () => { throw erro; });

      const retorno = await controller[operacao.controller](req, res);

      verificarResposta(res, retorno, 500, { status: "error", message: operacao.erroInterno });
      verificarEncaminhamento(mocks, operacao, req, usuario);
      const json = JSON.stringify(res.json.mock.calls[0].arguments[0]);
      for (const detalhe of [erro.message, erro.detail, erro.query, erro.stack]) {
        assert.equal(json.includes(detalhe), false);
      }
    });
  }
}
