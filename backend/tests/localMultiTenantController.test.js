const test = require("node:test");
const assert = require("node:assert/strict");
const controller = require("../src/controllers/localMultiTenantController");
const localService = require("../src/services/localMultiTenantService");
const excelService = require("../src/services/excelMultiTenantService");
const localServiceLegado = require("../src/services/localService");
const excelServiceLegado = require("../src/services/excelService");
const localRepositoryLegado = require("../src/repositories/localRepository");
const campanhaRepositoryLegado = require("../src/repositories/campanhaRepository");
const pool = require("../src/config/database");

const AMBIENTE_A = "11111111-1111-4111-8111-111111111111";
const AMBIENTE_B = "22222222-2222-4222-8222-222222222222";
const IDENTIDADES = [
  { id_usuario: 10, id_ambiente: AMBIENTE_A, eh_fundador: false, perfil_acesso: "ENGENHEIRO_SEGURANCA" },
  { id_usuario: 20, id_ambiente: AMBIENTE_B, eh_fundador: false, perfil_acesso: "ENGENHEIRO_SEGURANCA" },
];
const LOCAL = { id_local: 40, id_campanha: 30, nome_local: "Tanque A", status: "ATIVO" };
// Buffer simulado: estes testes verificam transporte, não geração do XLSX.
const BUFFER_XLSX = Buffer.from("buffer-xlsx-simulado");

const OPERACOES = [
  {
    controller: "criar", servico: "criarLocal", alvo: localService,
    argumentos: (req) => [req.body, req.usuario],
    resultado: LOCAL, codigo: 201,
    resposta: { status: "success", message: "Local cadastrado com sucesso.", data: LOCAL },
    erroInterno: "Erro interno ao cadastrar local.",
  },
  {
    controller: "listar", servico: "listarLocais", alvo: localService,
    argumentos: (req) => [req.usuario],
    resultado: [LOCAL], codigo: 200,
    resposta: { status: "success", total: 1, data: [LOCAL] },
    erroInterno: "Erro interno ao listar locais.",
  },
  {
    controller: "buscarPorId", servico: "buscarLocalPorId", alvo: localService,
    argumentos: (req) => [req.params.id, req.usuario],
    resultado: LOCAL, codigo: 200,
    resposta: { status: "success", data: LOCAL },
    erroInterno: "Erro interno ao buscar local.",
  },
  {
    controller: "atualizar", servico: "atualizarLocal", alvo: localService,
    argumentos: (req) => [req.params.id, req.body, req.usuario],
    resultado: LOCAL, codigo: 200,
    resposta: { status: "success", message: "Local atualizado com sucesso.", data: LOCAL },
    erroInterno: "Erro interno ao atualizar local.",
  },
  {
    controller: "alterarStatus", servico: "alterarStatusLocal", alvo: localService,
    argumentos: (req) => [req.params.id, req.body, req.usuario],
    resultado: { ...LOCAL, status: "INATIVO" }, codigo: 200,
    resposta: {
      status: "success", message: "Status do local atualizado com sucesso.",
      data: { ...LOCAL, status: "INATIVO" },
    },
    erroInterno: "Erro interno ao alterar status do local.",
  },
  {
    controller: "exportar", servico: "gerarExcelLocais", alvo: excelService,
    argumentos: (req) => [req.usuario],
    resultado: BUFFER_XLSX, codigo: 200, binario: true,
    erroInterno: "Erro interno ao exportar locais para Excel.",
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
    params: { id: "40", ...identidadeForjada },
    query: { id: "999", ...identidadeForjada },
    body: {
      id: "999", id_local: 999, id_campanha: 999,
      nome_local: "Tanque A", status: "INATIVO",
      ...identidadeForjada,
    },
  };
}

function simularRes(t) {
  const res = {};
  res.status = t.mock.fn(() => res);
  res.json = t.mock.fn(() => res);
  res.send = t.mock.fn(() => res);
  res.setHeader = t.mock.fn(() => res);
  return res;
}

function simularServicos(t, operacao, implementacao) {
  const mocks = {};
  for (const item of OPERACOES) {
    mocks[item.servico] = t.mock.method(item.alvo, item.servico, async () => {
      throw new Error(`Serviço inesperado: ${item.servico}`);
    });
  }
  mocks[operacao.servico].mock.mockImplementation(implementacao);

  const guardas = [];
  function bloquear(objeto, metodo) {
    guardas.push(t.mock.method(objeto, metodo, async () => {
      throw new Error(`Chamada proibida: ${metodo}`);
    }));
  }
  bloquear(localService, "listarLocaisParaExportacao");
  bloquear(pool, "query");
  bloquear(pool, "connect");
  for (const objeto of [
    localServiceLegado, excelServiceLegado,
    localRepositoryLegado, campanhaRepositoryLegado,
  ]) {
    for (const metodo of Object.keys(objeto)) {
      if (typeof objeto[metodo] === "function") {
        bloquear(objeto, metodo);
      }
    }
  }
  t.mock.method(console, "error", () => {});
  t.after(() => {
    for (const guarda of guardas) {
      assert.equal(guarda.mock.callCount(), 0);
    }
  });
  return mocks;
}

function verificarEncaminhamento(mocks, operacao, req) {
  const mock = mocks[operacao.servico];
  assert.equal(mock.mock.callCount(), 1);
  const argumentos = mock.mock.calls[0].arguments;
  assert.deepEqual(argumentos, operacao.argumentos(req));
  assert.strictEqual(argumentos[argumentos.length - 1], req.usuario);
  for (const item of OPERACOES) {
    if (item.servico !== operacao.servico) {
      assert.equal(mocks[item.servico].mock.callCount(), 0);
    }
  }
}

function verificarRespostaUnica(res, retorno, codigo) {
  assert.strictEqual(retorno, res);
  assert.equal(res.status.mock.callCount(), 1);
  assert.deepEqual(res.status.mock.calls[0].arguments, [codigo]);
  assert.equal(res.json.mock.callCount() + res.send.mock.callCount(), 1);
}

function verificarErro(res, retorno, codigo, message) {
  verificarRespostaUnica(res, retorno, codigo);
  assert.equal(res.json.mock.callCount(), 1);
  assert.equal(res.send.mock.callCount(), 0);
  assert.equal(res.setHeader.mock.callCount(), 0);
  assert.deepEqual(res.json.mock.calls[0].arguments, [{ status: "error", message }]);
}

for (const operacao of OPERACOES) {
  for (const [indice, identidade] of IDENTIDADES.entries()) {
    test(`${operacao.controller}: sucesso no ambiente ${indice === 0 ? "A" : "B"} preserva identidade original e ignora identidade forjada`, async (t) => {
      const usuario = { ...identidade };
      const req = simularReq(usuario);
      const res = simularRes(t);
      const mocks = simularServicos(t, operacao, async () => operacao.resultado);

      const retorno = await controller[operacao.controller](req, res);

      verificarRespostaUnica(res, retorno, operacao.codigo);
      verificarEncaminhamento(mocks, operacao, req);
      assert.strictEqual(req.usuario, usuario);
      assert.deepEqual(usuario, identidade);

      if (operacao.binario) {
        assert.equal(res.json.mock.callCount(), 0);
        assert.equal(res.send.mock.callCount(), 1);
        assert.equal(res.send.mock.calls[0].arguments.length, 1);
        assert.strictEqual(res.send.mock.calls[0].arguments[0], BUFFER_XLSX);
        assert.deepEqual(res.setHeader.mock.calls.map((chamada) => chamada.arguments), [
          ["Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
          ["Content-Disposition", 'attachment; filename="inventario-locais.xlsx"'],
          ["Content-Length", BUFFER_XLSX.length],
        ]);
      } else {
        assert.equal(res.json.mock.callCount(), 1);
        assert.equal(res.send.mock.callCount(), 0);
        assert.equal(res.setHeader.mock.callCount(), 0);
        assert.deepEqual(res.json.mock.calls[0].arguments, [operacao.resposta]);
      }
    });
  }

  for (const statusCode of [400, 401, 403, 404]) {
    test(`${operacao.controller}: preserva erro ${statusCode} do serviço e envia uma única resposta`, async (t) => {
      const req = simularReq({ ...IDENTIDADES[0] });
      if (statusCode === 401) {
        delete req.usuario;
      }
      const res = simularRes(t);
      const erro = new Error(`Erro de aplicação simulado ${statusCode}.`);
      erro.statusCode = statusCode;
      erro.detail = "DETALHE_INTERNO_NAO_PUBLICAR";
      const mocks = simularServicos(t, operacao, async () => { throw erro; });

      const retorno = await controller[operacao.controller](req, res);

      verificarErro(res, retorno, statusCode, erro.message);
      verificarEncaminhamento(mocks, operacao, req);
      const json = JSON.stringify(res.json.mock.calls[0].arguments[0]);
      assert.equal(json.includes(erro.detail), false);
      assert.equal(json.includes(erro.stack), false);
    });
  }

  for (const statusCode of [undefined, 500]) {
    const descricao = statusCode === undefined ? "sem statusCode" : "com statusCode 500";
    test(`${operacao.controller}: erro interno ${descricao} recebe mensagem genérica sem resposta duplicada`, async (t) => {
      const req = simularReq({ ...IDENTIDADES[0] });
      const res = simularRes(t);
      const erro = new Error("MENSAGEM_INTERNA_SIMULADA_NAO_PUBLICAR");
      erro.detail = "DETALHE_INTERNO_SIMULADO_NAO_PUBLICAR";
      if (statusCode !== undefined) {
        erro.statusCode = statusCode;
      }
      const mocks = simularServicos(t, operacao, async () => { throw erro; });

      const retorno = await controller[operacao.controller](req, res);

      verificarErro(res, retorno, 500, operacao.erroInterno);
      verificarEncaminhamento(mocks, operacao, req);
      const json = JSON.stringify(res.json.mock.calls[0].arguments[0]);
      assert.equal(json.includes(erro.message), false);
      assert.equal(json.includes(erro.detail), false);
      assert.equal(json.includes(erro.stack), false);
    });
  }
}
