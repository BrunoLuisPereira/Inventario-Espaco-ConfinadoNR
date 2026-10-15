const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../src/config/database");
const middleware = require("../src/middlewares/autenticacaoMiddleware");
const controller = require("../src/controllers/checklistMultiTenantController");
const controllerLegado = require("../src/controllers/checklistController");
const serviceLegado = require("../src/services/checklistService");
const checklistRepositoryLegado = require("../src/repositories/checklistRepository");
const localRepositoryLegado = require("../src/repositories/localRepository");
const campanhaRepositoryLegado = require("../src/repositories/campanhaRepository");

const AMBIENTE_A = "11111111-1111-4111-8111-111111111111";
const AMBIENTE_B = "22222222-2222-4222-8222-222222222222";
const USUARIO_A = {
  id_usuario: 10, id_ambiente: AMBIENTE_A, perfil_acesso: "ENGENHEIRO_SEGURANCA",
};
const USUARIO_B = {
  id_usuario: 20, id_ambiente: AMBIENTE_B, perfil_acesso: "ENGENHEIRO_SEGURANCA",
};
const ROTAS = [
  { metodo: "POST", caminho: "/", url: "/", handler: "criar", corpo: true },
  { metodo: "GET", caminho: "/", url: "/", handler: "listar" },
  { metodo: "GET", caminho: "/:id", url: "/50", handler: "buscarPorId", id: "50" },
  { metodo: "PUT", caminho: "/:id", url: "/50", handler: "atualizar", corpo: true, id: "50" },
  { metodo: "PATCH", caminho: "/:id/status", url: "/50/status", handler: "alterarStatus", corpo: true, id: "50" },
];
const CENARIOS = [
  { nome: "sem JWT", usuario: USUARIO_A, usuarioAtivo: true, ambienteAtivo: true },
  { nome: "JWT inválido", token: true, invalido: true, usuario: USUARIO_A, usuarioAtivo: true, ambienteAtivo: true },
  { nome: "usuário inativo", token: true, usuario: USUARIO_A, usuarioAtivo: false, ambienteAtivo: true },
  { nome: "ambiente inativo", token: true, usuario: USUARIO_A, usuarioAtivo: true, ambienteAtivo: false },
  { nome: "usuário ativo do ambiente A", token: true, usuario: USUARIO_A, usuarioAtivo: true, ambienteAtivo: true, autorizado: true },
  { nome: "usuário ativo do ambiente B", token: true, usuario: USUARIO_B, usuarioAtivo: true, ambienteAtivo: true, autorizado: true },
];

function configurarMocks(t, cenario) {
  // Configuração temporária em memória, sem leitura de arquivos .env.
  const segredoAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "chave-ficticia-dos-testes-de-rotas-de-checklists";
  t.after(() => {
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
  });
  t.mock.method(console, "error", () => {});

  const verificarJwt = t.mock.method(jwt, "verify", () => {
    if (cenario.invalido) throw new jwt.JsonWebTokenError("JWT inválido simulado");
    return {
      sub: String(cenario.usuario.id_usuario),
      perfil: "ADMINISTRADOR",
      id_usuario: 999,
      id_ambiente: cenario.usuario.id_ambiente === AMBIENTE_A ? AMBIENTE_B : AMBIENTE_A,
    };
  });

  const consulta = t.mock.method(pool, "query", async (sql, parametros) => {
    assert.deepEqual(parametros, [cenario.usuario.id_usuario]);
    assert.match(sql, /FROM\s+usuario\s+AS\s+u/i);
    assert.match(sql, /INNER\s+JOIN\s+ambiente\s+AS\s+a/i);
    assert.match(sql, /a\.id_ambiente\s*=\s*u\.id_ambiente/i);
    assert.match(sql, /u\.id_usuario\s*=\s*\$1/i);
    assert.match(sql, /u\.ativo\s*=\s*TRUE/i);
    assert.match(sql, /a\.ativo\s*=\s*TRUE/i);
    // Simula o resultado dos filtros de atividade da consulta real.
    return {
      rows: cenario.usuarioAtivo && cenario.ambienteAtivo
        ? [{ ...cenario.usuario }]
        : [],
    };
  });

  const guardas = [];
  function bloquear(objeto, metodo) {
    guardas.push(t.mock.method(objeto, metodo, async () => {
      throw new Error(`Chamada proibida neste teste: ${metodo}`);
    }));
  }
  bloquear(pool, "connect");
  bloquear(middleware, "autenticar");
  for (const objeto of [
    controllerLegado, serviceLegado, checklistRepositoryLegado,
    localRepositoryLegado, campanhaRepositoryLegado,
  ]) {
    for (const metodo of Object.keys(objeto)) {
      if (typeof objeto[metodo] === "function") bloquear(objeto, metodo);
    }
  }
  t.after(() => {
    for (const guarda of guardas) assert.equal(guarda.mock.callCount(), 0);
  });

  // Exercita o middleware real com JWT e consultas simulados.
  const identidadesValidadas = new WeakMap();
  const autenticarOriginal = middleware.autenticarMultiTenant;
  const multiTenant = t.mock.method(
    middleware,
    "autenticarMultiTenant",
    async (req, res, next) => autenticarOriginal(req, res, () => {
      identidadesValidadas.set(req, req.usuario);
      return next();
    })
  );
  const controllers = {};
  for (const { handler } of ROTAS) {
    controllers[handler] = t.mock.method(controller, handler, (req, res) => {
      assert.ok(identidadesValidadas.has(req));
      assert.strictEqual(req.usuario, identidadesValidadas.get(req));
      return res.status(200).json({
        handler,
        usuario: req.usuario,
        id: req.params.id,
        body: req.body,
      });
    });
  }
  return { verificarJwt, consulta, multiTenant, controllers, identidadesValidadas };
}

async function iniciarAplicacaoIsolada(t) {
  // Resolve os caminhos sem importar a aplicação ou o servidor principal.
  const caminhoApp = require.resolve("../src/app");
  const caminhoServidor = require.resolve("../src/server");
  function verificarAplicacaoNaoCarregada() {
    assert.equal(require.cache[caminhoApp], undefined);
    assert.equal(require.cache[caminhoServidor], undefined);
  }
  verificarAplicacaoNaoCarregada();
  t.after(verificarAplicacaoNaoCarregada);

  // O router captura os handlers ao ser importado: recarrega após os mocks.
  const caminhoRouter = require.resolve("../src/routes/checklistMultiTenantRoutes");
  const cacheAnterior = require.cache[caminhoRouter];
  delete require.cache[caminhoRouter];
  t.after(() => {
    if (cacheAnterior === undefined) delete require.cache[caminhoRouter];
    else require.cache[caminhoRouter] = cacheAnterior;
  });
  const router = require("../src/routes/checklistMultiTenantRoutes");

  const endpoints = router.stack.filter((layer) => layer.route).map((layer) => ({
    caminho: layer.route.path,
    metodos: Object.keys(layer.route.methods).filter((metodo) => layer.route.methods[metodo]),
  }));
  assert.deepEqual(endpoints, ROTAS.map((rota) => ({
    caminho: rota.caminho, metodos: [rota.metodo.toLowerCase()],
  })));

  const app = express();
  app.use(express.json());
  app.use("/api/checklists", router);
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
  return `http://127.0.0.1:${servidor.address().port}/api/checklists`;
}

for (const rota of ROTAS) {
  for (const cenario of CENARIOS) {
    test(`${rota.metodo} ${rota.caminho}: ${cenario.nome}`, async (t) => {
      const mocks = configurarMocks(t, cenario);
      const baseUrl = await iniciarAplicacaoIsolada(t);
      const outroAmbiente = cenario.usuario.id_ambiente === AMBIENTE_A ? AMBIENTE_B : AMBIENTE_A;
      const corpo = {
        id_local: 40,
        criterio_a: "SIM", criterio_b: "NAO", criterio_c: "SIM",
        acesso_controlado: "SIM", ventilacao_adequada: "NAO",
        monitoramento_atmosferico: "SIM", procedimento_emergencia: "NAO",
        status: "CONCLUIDO",
        id: "999", id_checklist: 999,
        id_usuario: 999, id_ambiente: outroAmbiente, perfil_acesso: "ADMINISTRADOR",
        usuario: { id_usuario: 999, id_ambiente: outroAmbiente, perfil_acesso: "ADMINISTRADOR" },
      };
      const headers = { "Content-Type": "application/json" };
      if (cenario.token) headers.Authorization = "Bearer jwt-ficticio-interceptado-pelo-mock";
      const opcoes = { method: rota.metodo, headers };
      if (rota.corpo) opcoes.body = JSON.stringify(corpo);
      const query = `?id=999&id_usuario=999&id_ambiente=${outroAmbiente}&perfil_acesso=ADMINISTRADOR`;
      const resposta = await fetch(`${baseUrl}${rota.url}${query}`, opcoes);
      const dados = await resposta.json();

      assert.equal(mocks.multiTenant.mock.callCount(), 1);
      assert.equal(mocks.verificarJwt.mock.callCount(), cenario.token ? 1 : 0);
      assert.equal(mocks.consulta.mock.callCount(), cenario.token && !cenario.invalido ? 1 : 0);
      for (const { handler } of ROTAS) {
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
      const esperado = { handler: rota.handler, usuario: cenario.usuario };
      if (rota.id !== undefined) esperado.id = rota.id;
      if (rota.corpo) esperado.body = corpo;
      assert.deepEqual(dados, esperado);

      const reqRecebida = mocks.controllers[rota.handler].mock.calls[0].arguments[0];
      assert.strictEqual(reqRecebida.usuario, mocks.identidadesValidadas.get(reqRecebida));
      assert.deepEqual(reqRecebida.usuario, cenario.usuario);
      assert.equal(reqRecebida.usuario.perfil_acesso, "ENGENHEIRO_SEGURANCA");
      assert.equal(reqRecebida.query.id_usuario, "999");
      assert.equal(reqRecebida.query.id_ambiente, outroAmbiente);
      if (rota.id !== undefined) {
        assert.equal(reqRecebida.params.id, "50");
        assert.notEqual(Number(reqRecebida.params.id), reqRecebida.usuario.id_usuario);
      }
      if (rota.corpo) {
        assert.deepEqual(reqRecebida.body, corpo);
        assert.notStrictEqual(reqRecebida.usuario, reqRecebida.body.usuario);
      }
    });
  }
}
