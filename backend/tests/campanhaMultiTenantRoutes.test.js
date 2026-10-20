const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

const pool = require("../src/config/database");
const middleware = require("../src/middlewares/autenticacaoMiddleware");
const controller = require("../src/controllers/campanhaMultiTenantController");

const AMBIENTE_A = "11111111-1111-4111-8111-111111111111";
const AMBIENTE_B = "22222222-2222-4222-8222-222222222222";
const IDENTIDADE = {
  id_usuario: 10,
  id_ambiente: AMBIENTE_A,
  eh_fundador: false, perfil_acesso: "ENGENHEIRO_SEGURANCA",
};

const rotas = [
  { metodo: "POST", caminho: "/", handler: "criar", corpo: true },
  { metodo: "GET", caminho: "/", handler: "listar", corpo: false },
  { metodo: "GET", caminho: "/30", handler: "buscarPorId", corpo: false, id: "30" },
  { metodo: "PUT", caminho: "/30", handler: "atualizar", corpo: true, id: "30" },
  { metodo: "PATCH", caminho: "/30/status", handler: "alterarStatus", corpo: true, id: "30" },
];

const cenarios = [
  { nome: "sem JWT", token: false, usuarioAtivo: true, ambienteAtivo: true },
  { nome: "JWT inválido", token: true, invalido: true, usuarioAtivo: true, ambienteAtivo: true },
  { nome: "usuário inativo", token: true, usuarioAtivo: false, ambienteAtivo: true },
  { nome: "ambiente inativo", token: true, usuarioAtivo: true, ambienteAtivo: false },
  { nome: "identidade autenticada e identidade forjada nos dados", token: true, usuarioAtivo: true, ambienteAtivo: true, autorizado: true },
];

function configurarMocks(t, cenario) {
  // Configuração temporária em memória; nenhum arquivo .env é acessado.
  const segredoAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "chave-ficticia-exclusiva-deste-teste";
  t.after(() => {
    if (segredoAnterior === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = segredoAnterior;
    }
  });

  t.mock.method(console, "error", () => {});
  const verificarJwt = t.mock.method(jwt, "verify", () => {
    if (cenario.invalido) {
      throw new jwt.JsonWebTokenError("JWT simulado inválido");
    }

    return {
      sub: "10",
      // O papel atual e o ambiente devem vir da consulta de identidade.
      perfil: "ADMINISTRADOR",
      id_usuario: 999,
      id_ambiente: AMBIENTE_B,
    };
  });

  const consulta = t.mock.method(pool, "query", async (sql, parametros) => {
    assert.deepEqual(parametros, [10]);
    assert.match(sql, /FROM\s+usuario\s+AS\s+u/i);
    assert.match(sql, /INNER\s+JOIN\s+ambiente\s+AS\s+a/i);
    assert.match(sql, /a\.id_ambiente\s*=\s*u\.id_ambiente/i);
    assert.match(sql, /u\.id_usuario\s*=\s*\$1/i);
    assert.match(sql, /u\.ativo\s*=\s*TRUE/i);
    assert.match(sql, /a\.ativo\s*=\s*TRUE/i);

    // Simula o resultado dos filtros de atividade da consulta real.
    return {
      rows: cenario.usuarioAtivo && cenario.ambienteAtivo
        ? [{ ...IDENTIDADE }]
        : [],
    };
  });

  const conectar = t.mock.method(pool, "connect", async () => {
    throw new Error("Conexão real proibida neste teste");
  });
  const legado = t.mock.method(middleware, "autenticar", () => {
    throw new Error("Middleware legado não deve ser utilizado");
  });
  const autenticarOriginal = middleware.autenticarMultiTenant;
  const multiTenant = t.mock.method(
    middleware,
    "autenticarMultiTenant",
    async (req, res, next) => autenticarOriginal(req, res, next)
  );

  const controllers = {};
  for (const { handler } of rotas) {
    controllers[handler] = t.mock.method(controller, handler, (req, res) => {
      return res.status(200).json({
        handler,
        usuario: req.usuario,
        id: req.params.id,
        body: req.body,
      });
    });
  }

  return { verificarJwt, consulta, conectar, legado, multiTenant, controllers };
}

async function iniciarAplicacaoIsolada(t) {
  // O router captura os handlers ao ser importado. Carregá-lo após os mocks
  // garante que nenhum controller ou serviço real seja executado.
  const caminhoRouter = require.resolve("../src/routes/campanhaMultiTenantRoutes");
  const cacheAnterior = require.cache[caminhoRouter];
  delete require.cache[caminhoRouter];
  t.after(() => {
    if (cacheAnterior === undefined) {
      delete require.cache[caminhoRouter];
    } else {
      require.cache[caminhoRouter] = cacheAnterior;
    }
  });

  const router = require("../src/routes/campanhaMultiTenantRoutes");
  const app = express();
  app.use(express.json());
  app.use("/api/campanhas", router);

  const servidor = await new Promise((resolve, reject) => {
    const instancia = app.listen(0, "127.0.0.1", () => resolve(instancia));
    instancia.once("error", reject);
  });
  t.after(async () => {
    await new Promise((resolve, reject) => {
      servidor.close((erro) => erro ? reject(erro) : resolve());
      servidor.closeAllConnections();
    });
  });

  return `http://127.0.0.1:${servidor.address().port}/api/campanhas`;
}

for (const rota of rotas) {
  for (const cenario of cenarios) {
    test(`${rota.metodo} ${rota.caminho}: ${cenario.nome}`, async (t) => {
      const mocks = configurarMocks(t, cenario);
      const baseUrl = await iniciarAplicacaoIsolada(t);
      const corpo = {
        nome_campanha: "Inspeção NR-33",
        empresa: "Empresa A",
        responsavel: "Responsável A",
        data_inicio: "2026-10-14",
        status: "CONCLUIDO",
        id_usuario: 999,
        id_ambiente: AMBIENTE_B,
        eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
      };
      const headers = { "Content-Type": "application/json" };
      if (cenario.token) {
        headers.Authorization = "Bearer jwt-ficticio-interceptado-pelo-mock";
      }
      const opcoes = { method: rota.metodo, headers };
      if (rota.corpo) {
        opcoes.body = JSON.stringify(corpo);
      }

      // GET não envia corpo; a tentativa de forjar identidade vai na query.
      const query = rota.corpo
        ? ""
        : `?id_usuario=999&id_ambiente=${AMBIENTE_B}&perfil_acesso=ADMINISTRADOR`;
      const resposta = await fetch(`${baseUrl}${rota.caminho}${query}`, opcoes);
      const dados = await resposta.json();

      assert.equal(mocks.multiTenant.mock.callCount(), 1);
      assert.equal(mocks.legado.mock.callCount(), 0);
      assert.equal(mocks.conectar.mock.callCount(), 0);
      assert.equal(mocks.verificarJwt.mock.callCount(), cenario.token ? 1 : 0);
      assert.equal(
        mocks.consulta.mock.callCount(),
        cenario.token && !cenario.invalido ? 1 : 0
      );

      for (const { handler } of rotas) {
        assert.equal(
          mocks.controllers[handler].mock.callCount(),
          cenario.autorizado && handler === rota.handler ? 1 : 0
        );
      }

      if (!cenario.autorizado) {
        assert.equal(resposta.status, 401);
        const message = !cenario.token
          ? "Token de autenticação não informado."
          : cenario.invalido
            ? "Token inválido."
            : "Usuário ou ambiente inválido ou desativado. Realize o login novamente.";
        assert.deepEqual(dados, { status: "error", message });
        return;
      }

      assert.equal(resposta.status, 200);
      const esperado = { handler: rota.handler, usuario: IDENTIDADE };
      if (rota.id !== undefined) {
        esperado.id = rota.id;
      }
      if (rota.corpo) {
        esperado.body = corpo;
      }
      assert.deepEqual(dados, esperado);

      const reqRecebida = mocks.controllers[rota.handler].mock.calls[0].arguments[0];
      assert.deepEqual(reqRecebida.usuario, IDENTIDADE);
      assert.equal(reqRecebida.usuario.id_ambiente, AMBIENTE_A);
      assert.equal(reqRecebida.usuario.id_usuario, 10);
      assert.equal(reqRecebida.usuario.perfil_acesso, "ENGENHEIRO_SEGURANCA");
      if (rota.corpo) {
        assert.deepEqual(reqRecebida.body, corpo);
        assert.notStrictEqual(reqRecebida.usuario, reqRecebida.body);
      }
    });
  }
}
