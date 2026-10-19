const test = require("node:test");
const assert = require("node:assert/strict");

const campanhaService = require("../src/services/campanhaMultiTenantService");
const campanhaServiceLegado = require("../src/services/campanhaService");
const campanhaController = require("../src/controllers/campanhaMultiTenantController");

const AMBIENTE_A = "11111111-1111-4111-8111-111111111111";
const AMBIENTE_B = "22222222-2222-4222-8222-222222222222";
const CAMPANHA = {
  id_campanha: 30,
  id_ambiente: AMBIENTE_A,
  id_usuario: 10,
  nome_campanha: "Inspeção NR-33",
  status: "EM ANDAMENTO",
};

const operacoes = [
  {
    controller: "criar",
    servico: "criarCampanha",
    argumentos: (req) => [req.body, req.usuario],
    resultado: CAMPANHA,
    codigo: 201,
    resposta: {
      status: "success",
      message: "Campanha criada com sucesso.",
      data: CAMPANHA,
    },
    erroInterno: "Erro interno ao criar campanha.",
  },
  {
    controller: "listar",
    servico: "listarCampanhas",
    argumentos: (req) => [req.usuario],
    resultado: [CAMPANHA],
    codigo: 200,
    resposta: { status: "success", total: 1, data: [CAMPANHA] },
    erroInterno: "Erro interno ao listar campanhas.",
  },
  {
    controller: "buscarPorId",
    servico: "buscarCampanhaPorId",
    argumentos: (req) => [req.params.id, req.usuario],
    resultado: CAMPANHA,
    codigo: 200,
    resposta: { status: "success", data: CAMPANHA },
    erroInterno: "Erro interno ao buscar campanha.",
  },
  {
    controller: "atualizar",
    servico: "atualizarCampanha",
    argumentos: (req) => [req.params.id, req.body, req.usuario],
    resultado: CAMPANHA,
    codigo: 200,
    resposta: {
      status: "success",
      message: "Campanha atualizada com sucesso.",
      data: CAMPANHA,
    },
    erroInterno: "Erro interno ao atualizar campanha.",
  },
  {
    controller: "alterarStatus",
    servico: "alterarStatusCampanha",
    argumentos: (req) => [req.params.id, req.body, req.usuario],
    resultado: { ...CAMPANHA, status: "CONCLUIDO" },
    codigo: 200,
    resposta: {
      status: "success",
      message: "Status da campanha atualizado com sucesso.",
      data: { ...CAMPANHA, status: "CONCLUIDO" },
    },
    erroInterno: "Erro interno ao alterar status da campanha.",
  },
];

function simularRequisicao() {
  return {
    params: { id: "30" },
    usuario: {
      id_usuario: 10,
      id_ambiente: AMBIENTE_A,
      eh_fundador: false, perfil_acesso: "ENGENHEIRO_SEGURANCA",
    },
    body: {
      nome_campanha: "Inspeção NR-33",
      empresa: "Empresa A",
      responsavel: "Responsável A",
      data_inicio: "2026-10-14",
      status: "CONCLUIDO",
      // Valores forjados devem permanecer apenas como dados do corpo.
      id: "999",
      id_campanha: 999,
      id_usuario: 999,
      id_ambiente: AMBIENTE_B,
      eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
    },
  };
}

function simularResposta(t) {
  const res = {};
  res.status = t.mock.fn(() => res);
  res.json = t.mock.fn(() => res);
  return res;
}

function simularServicos(t, operacao, implementacao) {
  // Nenhum serviço real é executado, inclusive em chamadas inesperadas.
  const mocks = {};
  const mocksLegados = {};

  for (const { servico } of operacoes) {
    mocks[servico] = t.mock.method(campanhaService, servico, async () => {
      throw new Error(`Chamada multi-tenant inesperada: ${servico}`);
    });
    mocksLegados[servico] = t.mock.method(campanhaServiceLegado, servico, async () => {
      throw new Error(`Chamada legada inesperada: ${servico}`);
    });
  }

  mocks[operacao.servico].mock.mockImplementation(implementacao);
  t.mock.method(console, "error", () => {});
  return { mocks, mocksLegados };
}

function verificarChamadas(operacao, req, mocks, mocksLegados) {
  const consulta = mocks[operacao.servico];
  assert.equal(consulta.mock.callCount(), 1);

  const argumentos = consulta.mock.calls[0].arguments;
  assert.deepEqual(argumentos, operacao.argumentos(req));
  assert.strictEqual(argumentos[argumentos.length - 1], req.usuario);

  for (const { servico } of operacoes) {
    if (servico !== operacao.servico) {
      assert.equal(mocks[servico].mock.callCount(), 0);
    }
    assert.equal(mocksLegados[servico].mock.callCount(), 0);
  }
}

function verificarResposta(res, retorno, codigo, corpo) {
  assert.strictEqual(retorno, res);
  assert.equal(res.status.mock.callCount(), 1);
  assert.deepEqual(res.status.mock.calls[0].arguments, [codigo]);
  assert.equal(res.json.mock.callCount(), 1);
  assert.deepEqual(res.json.mock.calls[0].arguments, [corpo]);
}

for (const operacao of operacoes) {
  test(`${operacao.controller}: responde com sucesso e encaminha a identidade autenticada sem substituição pelo corpo`, async (t) => {
    const req = simularRequisicao();
    const usuarioOriginal = { ...req.usuario };
    const res = simularResposta(t);
    const { mocks, mocksLegados } = simularServicos(
      t, operacao, async () => operacao.resultado
    );

    const retorno = await campanhaController[operacao.controller](req, res);

    verificarResposta(res, retorno, operacao.codigo, operacao.resposta);
    verificarChamadas(operacao, req, mocks, mocksLegados);
    assert.deepEqual(req.usuario, usuarioOriginal);
  });

  for (const statusCode of [400, 401, 403, 404]) {
    test(`${operacao.controller}: preserva o erro ${statusCode} informado pelo serviço multi-tenant`, async (t) => {
      const req = simularRequisicao();
      if (statusCode === 401) {
        delete req.usuario;
      }
      const res = simularResposta(t);
      const erro = new Error(`Erro de aplicação simulado ${statusCode}.`);
      erro.statusCode = statusCode;
      const { mocks, mocksLegados } = simularServicos(t, operacao, async () => {
        throw erro;
      });

      const retorno = await campanhaController[operacao.controller](req, res);

      verificarResposta(res, retorno, statusCode, {
        status: "error",
        message: erro.message,
      });
      verificarChamadas(operacao, req, mocks, mocksLegados);
    });
  }

  for (const statusCode of [undefined, 500]) {
    const descricao = statusCode === undefined ? "sem statusCode" : "com statusCode 500";
    test(`${operacao.controller}: oculta detalhes internos de erro ${descricao}`, async (t) => {
      const req = simularRequisicao();
      const res = simularResposta(t);
      const erro = new Error("DETALHE_INTERNO_SIMULADO_NAO_PUBLICAR");
      erro.detail = "DETALHE_TECNICO_SIMULADO_NAO_PUBLICAR";
      if (statusCode !== undefined) {
        erro.statusCode = statusCode;
      }
      const { mocks, mocksLegados } = simularServicos(t, operacao, async () => {
        throw erro;
      });

      const retorno = await campanhaController[operacao.controller](req, res);

      verificarResposta(res, retorno, 500, {
        status: "error",
        message: operacao.erroInterno,
      });
      verificarChamadas(operacao, req, mocks, mocksLegados);

      const corpoJson = JSON.stringify(res.json.mock.calls[0].arguments[0]);
      assert.equal(corpoJson.includes(erro.message), false);
      assert.equal(corpoJson.includes(erro.detail), false);
      assert.equal(corpoJson.includes(erro.stack), false);
    });
  }
}
