const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");

const CAMINHOS = Object.fromEntries(Object.entries({
  evidencia: "../src/repositories/evidenciaRepository",
  evidenciaMt: "../src/repositories/evidenciaMultiTenantRepository",
  local: "../src/repositories/localRepository",
  campanha: "../src/repositories/campanhaRepository",
  usuario: "../src/repositories/usuarioRepository",
  service: "../src/services/evidenciaService",
  serviceMt: "../src/services/evidenciaMultiTenantService",
  controller: "../src/controllers/evidenciaController",
  autenticacao: "../src/middlewares/autenticacaoMiddleware",
  router: "../src/routes/evidenciaRoutes",
  app: "../src/app",
}).map(([nome, caminho]) => [nome, require.resolve(caminho)]));
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const CHAVE = "33333333-3333-4333-8333-333333333333";
const SEGREDO = "SEGREDO_FICTICIO_CADASTRO_EVIDENCIA";
const SENSIVEL = "SQL_STACK_TOKEN_CAMINHO_INTERNO_NAO_PUBLICAR";
const CONTEXTOS = [
  { nome: "A", ambiente: A, outro: B, admin: 11, responsavel: 12, engenheiro: 13, criador: 14, campanha: 1, local: 101, evidencia: 501, externa: 601 },
  { nome: "B", ambiente: B, outro: A, admin: 21, responsavel: 22, engenheiro: 23, criador: 24, campanha: 2, local: 201, evidencia: 601, externa: 501 },
];
const normalizar = (sql) => sql.replace(/\s+/g, " ").trim().replace(/;$/, "");
const SQL_IDENTIDADE = "SELECT u.id_usuario, u.id_ambiente, u.nome, u.email, u.perfil_acesso FROM usuario AS u INNER JOIN ambiente AS a ON a.id_ambiente = u.id_ambiente WHERE u.id_usuario = $1 AND u.ativo = TRUE AND a.ativo = TRUE LIMIT 1";
const SQL_LOCAL = "SELECT l.id_local, l.nome_local, l.setor, l.descricao, l.endereco, l.latitude, l.longitude, l.status, l.id_campanha, c.nome_campanha, l.data_criacao, l.data_atualizacao FROM local l INNER JOIN campanha c ON c.id_campanha = l.id_campanha WHERE l.id_local = $1 LIMIT 1";
const SQL_CAMPANHA = "SELECT c.id_campanha, c.nome_campanha, c.empresa, c.responsavel, c.data_inicio, c.status, c.id_usuario, u.nome AS usuario_responsavel, c.data_criacao, c.data_atualizacao FROM campanha c INNER JOIN usuario u ON u.id_usuario = c.id_usuario WHERE c.id_campanha = $1 LIMIT 1";
const SQL_OPERACAO = "SELECT e.*, l.nome_local, u.nome AS usuario_responsavel FROM evidencia e INNER JOIN local l ON l.id_local = e.id_local INNER JOIN usuario u ON u.id_usuario = e.id_usuario WHERE e.id_operacao_cliente = $1";
// SQLs fixos independentes da implementação: mudanças exigem revisão explícita.
const AUTORIZACAO = `AND EXISTS ( SELECT 1 FROM usuario AS solicitante
  INNER JOIN ambiente AS a ON a.id_ambiente = solicitante.id_ambiente
  WHERE solicitante.id_usuario = $2 AND solicitante.id_ambiente = c.id_ambiente
  AND solicitante.ativo = TRUE AND a.ativo = TRUE
  AND ( solicitante.perfil_acesso = 'ADMINISTRADOR' OR c.id_usuario = solicitante.id_usuario ) )`;
const SQL_LOCAL_MT = normalizar(`SELECT l.id_local FROM local AS l
  INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
  WHERE c.id_ambiente = $1 AND l.id_local = $3 ${AUTORIZACAO} LIMIT 1`);
const SQL_OPERACAO_MT = normalizar(`SELECT e.*, l.nome_local, criador.nome AS usuario_responsavel
  FROM evidencia AS e INNER JOIN local AS l ON l.id_local = e.id_local
  INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
  INNER JOIN usuario AS criador ON criador.id_usuario = e.id_usuario AND criador.id_ambiente = c.id_ambiente
  WHERE c.id_ambiente = $1 ${AUTORIZACAO} AND e.id_local = $3 AND e.id_operacao_cliente = $4 LIMIT 1`);
const COLUNAS = "id_local, tipo, caminho_arquivo, descricao, id_usuario, id_operacao_cliente, latitude, longitude, precisao_gps, origem_coordenadas, data_captura_gps";
const SQL_INSERT = normalizar(`INSERT INTO evidencia ( ${COLUNAS} ) VALUES ( $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11 ) RETURNING *`);
const SQL_INSERT_MT = normalizar(`INSERT INTO evidencia AS e ( ${COLUNAS} )
  SELECT l.id_local, $4, $5, $6, $2, $7, $8, $9, $10, $11, $12
  FROM local AS l INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
  WHERE c.id_ambiente = $1 AND l.id_local = $3 ${AUTORIZACAO} RETURNING e.*`);

function preparar(t) {
  const estado = {
    usuarios: new Map(), ambientes: new Map([[A, true], [B, true]]), campanhas: new Map(),
    locais: new Map(), evidencias: new Map(), consultas: [], identidades: [], globais: [],
    inserts: [], indevidas: [], criadas: [], operacoes: [], eventos: [], proibidas: [],
    inesperadas: [], fisicas: [], falhasSimulador: [], conexoes: 0, logs: [],
    corridaLocal: null, erroInsert: null, erroOperacaoNaChamada: null, falhasInjetadas: [],
  };
  const tokens = new Map();
  for (const c of CONTEXTOS) {
    for (const [papel, id] of [["admin", c.admin], ["responsavel", c.responsavel], ["engenheiro", c.engenheiro], ["criador", c.criador]]) {
      const perfil = papel === "admin" ? "ADMINISTRADOR" : "ENGENHEIRO_SEGURANCA";
      estado.usuarios.set(id, { id_usuario: id, id_ambiente: c.ambiente, perfil_acesso: perfil, ativo: true });
      // O ambiente do JWT é propositalmente desatualizado.
      tokens.set(papel + "-" + c.nome, { sub: String(id), perfil, id_ambiente: c.outro });
    }
    estado.campanhas.set(c.campanha, { id_campanha: c.campanha, id_ambiente: c.ambiente, id_usuario: c.responsavel });
    estado.locais.set(c.local, { id_local: c.local, id_campanha: c.campanha, nome_local: "Local " + c.nome });
    estado.locais.set(c.local + 1, { id_local: c.local + 1, id_campanha: c.campanha, nome_local: "Outro local " + c.nome });
    estado.evidencias.set(c.evidencia, {
      id_evidencia: c.evidencia, id_local: c.local, id_usuario: c.criador,
      id_operacao_cliente: c.nome === "A" ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      tipo: "TEXTO", descricao: "DADO_EXCLUSIVO_" + c.nome,
      caminho_arquivo: "uploads/evidencias/EXCLUSIVO_" + c.nome + ".jpg",
      latitude: c.nome === "A" ? 10 : 20, longitude: 0,
    });
  }
  function permitido(idLocal, ambiente, idUsuario) {
    const local = estado.locais.get(idLocal);
    const campanha = local && estado.campanhas.get(local.id_campanha);
    const usuario = estado.usuarios.get(idUsuario);
    return !!(campanha && usuario && usuario.ativo === true && estado.ambientes.get(ambiente) === true &&
      usuario.id_ambiente === ambiente && campanha.id_ambiente === ambiente &&
      (usuario.perfil_acesso === "ADMINISTRADOR" || campanha.id_usuario === idUsuario));
  }
  const resultado = (rows) => ({ rows, rowCount: rows.length });
  const conflito = (constraint = "uq_evidencia_id_operacao_cliente") => Object.assign(new Error(SENSIVEL), {
    code: "23505", constraint, table: "evidencia", detail: SENSIVEL,
  });
  const pool = {
    async query(texto, params = []) {
      const sql = normalizar(texto);
      estado.consultas.push({ sql, params: [...params] });
      if (sql === SQL_IDENTIDADE) {
        assert.equal(params.length, 1);
        estado.identidades.push(params[0]);
        estado.eventos.push("IDENTIDADE");
        const usuario = estado.usuarios.get(params[0]);
        return resultado(usuario?.ativo && estado.ambientes.get(usuario.id_ambiente) === true ? [{ ...usuario }] : []);
      }
      if (sql === SQL_LOCAL || sql === SQL_LOCAL_MT) {
        const mt = sql === SQL_LOCAL_MT;
        assert.equal(params.length, mt ? 3 : 1);
        const local = estado.locais.get(params[mt ? 2 : 0]);
        const campanha = local && estado.campanhas.get(local.id_campanha);
        estado.eventos.push(mt ? "LOCAL_AUTORIZADO" : "LOCAL_GLOBAL");
        if (!mt) estado.globais.push(sql);
        if (!local || !campanha || (mt && !permitido(local.id_local, params[0], params[1]))) return resultado([]);
        return resultado(mt ? [{ id_local: local.id_local }] : [{ ...local }]);
      }
      if (sql === SQL_CAMPANHA) {
        assert.equal(params.length, 1);
        estado.globais.push(sql);
        const campanha = estado.campanhas.get(params[0]);
        if (!campanha) return resultado([]);
        const { id_ambiente, ...legado } = campanha;
        return resultado([{ ...legado }]);
      }
      if (sql === SQL_OPERACAO || sql === SQL_OPERACAO_MT) {
        const mt = sql === SQL_OPERACAO_MT;
        assert.equal(params.length, mt ? 4 : 1);
        estado.operacoes.push({ sql, params: [...params] });
        estado.eventos.push(mt ? "OPERACAO_AUTORIZADA" : "OPERACAO_GLOBAL");
        if (!mt) estado.globais.push(sql);
        if (estado.operacoes.length === estado.erroOperacaoNaChamada) {
          estado.falhasInjetadas.push("operacao");
          throw Object.assign(new Error(SENSIVEL), { code: "XX000" });
        }
        const chave = params[mt ? 3 : 0];
        const registro = [...estado.evidencias.values()].find((e) => e.id_operacao_cliente === chave);
        if (!registro) return resultado([]);
        const local = estado.locais.get(registro.id_local);
        const criador = estado.usuarios.get(registro.id_usuario);
        if (!local || !criador || (mt && (registro.id_local !== params[2] || criador.id_ambiente !== params[0] ||
          !permitido(registro.id_local, params[0], params[1])))) return resultado([]);
        return resultado([{ ...registro, nome_local: local.nome_local, usuario_responsavel: "Pessoa " + criador.id_usuario }]);
      }
      if (sql === SQL_INSERT || sql === SQL_INSERT_MT) {
        const mt = sql === SQL_INSERT_MT;
        assert.equal(params.length, mt ? 12 : 11);
        const valores = mt ? [params[2], params[3], params[4], params[5], params[1], ...params.slice(6)] : params;
        const dados = Object.fromEntries(COLUNAS.split(", ").map((campo, i) => [campo, valores[i]]));
        const identidade = estado.usuarios.get(dados.id_usuario);
        const autorizado = permitido(dados.id_local, mt ? params[0] : identidade?.id_ambiente, dados.id_usuario);
        estado.inserts.push({ sql, params: [...params], dados: { ...dados }, autorizado, mt });
        estado.eventos.push(mt ? "INSERT_AUTORIZADO" : "INSERT_GLOBAL");
        if (!autorizado) estado.indevidas.push({ ...dados });
        if (mt && !autorizado) return resultado([]);
        if (estado.corridaLocal !== null) {
          // Outra operação confirma uma evidência entre o SELECT e o INSERT.
          const alvo = estado.locais.get(estado.corridaLocal);
          const campanha = alvo && estado.campanhas.get(alvo.id_campanha);
          assert.ok(campanha, "Corrida deve apontar para local simulado existente");
          estado.evidencias.set(900, { ...dados, id_evidencia: 900, id_local: alvo.id_local,
            id_usuario: campanha.id_usuario, descricao: "DADO_DA_CORRIDA_" + campanha.id_ambiente });
          estado.corridaLocal = null;
          estado.eventos.push("COMMIT_CONCORRENTE_SIMULADO");
        }
        if (estado.erroInsert) {
          estado.falhasInjetadas.push("insert");
          throw estado.erroInsert;
        }
        if (dados.id_operacao_cliente && [...estado.evidencias.values()].some((e) => e.id_operacao_cliente === dados.id_operacao_cliente)) {
          estado.eventos.push("23505");
          throw conflito();
        }
        const registro = { ...dados, id_evidencia: 1000 + estado.criadas.length };
        estado.evidencias.set(registro.id_evidencia, registro);
        estado.criadas.push(registro);
        return resultado([{ ...registro }]);
      }
      estado.inesperadas.push(sql);
      throw new Error("SQL desconhecido ou escrita fora do escopo");
    },
    connect() { estado.conexoes++; throw new Error("Conexão real proibida"); },
  };
  const consulta = pool.query;
  pool.query = async (...args) => {
    try { return await consulta(...args); }
    catch (erro) { if (erro?.code === "ERR_ASSERTION") estado.falhasSimulador.push(erro); throw erro; }
  };
  const proibido = (nome) => (...args) => {
    estado.fisicas.push(nome);
    throw new Error("Operação externa proibida: " + nome);
  };
  const arquivos = Object.fromEntries(["obterCaminhoCompleto", "removerArquivo", "removerArquivos"].map((nome) => [nome, proibido(nome)]));
  const externo = (nome) => new Proxy(Object.create(null), { get: (_obj, chave) => proibido(nome + "." + String(chave))() });
  const jwt = { verify(token, segredo, opcoes) {
    assert.equal(segredo, SEGREDO);
    assert.deepEqual(opcoes.algorithms, ["HS256"]);
    if (!tokens.has(token)) throw Object.assign(new Error("JWT simulado inválido"), { name: "JsonWebTokenError" });
    return { ...tokens.get(token) };
  } };
  const upload = { uploadEvidencia: { single(campo) {
    assert.equal(campo, "arquivo");
    return proibido("upload");
  } } };
  for (const nome of ["error", "warn", "info", "log"]) t.mock.method(console, nome, (...args) => estado.logs.push(args));
  const cache = new Map(Object.values(CAMINHOS).map((p) => [p, require.cache[p]]));
  const load = Module._load;
  const segredoAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SEGREDO;
  const dependencias = new Map();
  const modulos = {};
  const registros = [];
  const neutro = (_req, _res, next) => next();
  const appInerte = { get() { return this; }, use(...args) { registros.push(args); return this; } };
  const expressInerte = () => appInerte;
  expressInerte.json = () => neutro;
  expressInerte.urlencoded = () => neutro;
  let tratarErro;
  t.after(() => {
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
    assert.strictEqual(Module._load, load);
    for (const [p, anterior] of cache) assert.strictEqual(require.cache[p], anterior);
    assert.deepEqual(estado.proibidas, []);
    assert.deepEqual(estado.inesperadas, []);
    assert.deepEqual(estado.falhasSimulador, []);
    assert.deepEqual(estado.fisicas, []);
    assert.equal(estado.conexoes, 0);
  });
  try {
    for (const p of cache.keys()) delete require.cache[p];
    Module._load = function (request, parent, ...resto) {
      if (cache.has(parent?.filename)) {
        const permitidas = dependencias.get(parent.filename);
        if (!permitidas?.has(request)) {
          estado.proibidas.push(request);
          throw new Error("Dependência real proibida: " + request);
        }
        return permitidas.get(request);
      }
      return load.call(this, request, parent, ...resto);
    };
    for (const nome of ["evidencia", "evidenciaMt", "local", "campanha"]) {
      dependencias.set(CAMINHOS[nome], new Map([["../config/database", pool]]));
      modulos[nome] = require(CAMINHOS[nome]);
    }
    dependencias.set(CAMINHOS.usuario, new Map([
      ["../config/database", pool], ["./emailLockRepository", externo("emailLock")], ["./conviteRepository", externo("convite")],
    ]));
    modulos.usuario = require(CAMINHOS.usuario);
    dependencias.set(CAMINHOS.service, new Map([
      ["../utils/evidenciaArquivoUtils", arquivos], ["../repositories/evidenciaRepository", modulos.evidencia],
      ["../repositories/localRepository", modulos.local], ["../repositories/campanhaRepository", modulos.campanha],
    ]));
    modulos.service = require(CAMINHOS.service);
    dependencias.set(CAMINHOS.serviceMt, new Map([["../repositories/evidenciaMultiTenantRepository", modulos.evidenciaMt]]));
    modulos.serviceMt = require(CAMINHOS.serviceMt);
    dependencias.set(CAMINHOS.controller, new Map([
      ["../services/evidenciaService", modulos.service], ["../services/evidenciaMultiTenantService", modulos.serviceMt],
      ["../utils/evidenciaArquivoUtils", arquivos],
    ]));
    modulos.controller = require(CAMINHOS.controller);
    dependencias.set(CAMINHOS.autenticacao, new Map([["jsonwebtoken", jwt], ["../repositories/usuarioRepository", modulos.usuario]]));
    modulos.autenticacao = require(CAMINHOS.autenticacao);
    dependencias.set(CAMINHOS.router, new Map([
      ["express", express], ["../controllers/evidenciaController", modulos.controller],
      ["../middlewares/autenticacaoMiddleware", modulos.autenticacao], ["../middlewares/uploadEvidenciaMiddleware", upload],
    ]));
    modulos.router = require(CAMINHOS.router);
    dependencias.set(CAMINHOS.app, new Map([
      ["express", expressInerte], ["cors", () => neutro],
      ...["auth", "usuario", "campanha", "local", "checklist", "evidencia", "dadosTecnicos", "relatorio", "sincronizacao"]
        .map((nome) => ["./routes/" + nome + "Routes", nome === "evidencia" ? modulos.router : neutro]),
    ]));
    assert.strictEqual(require(CAMINHOS.app), appInerte);
    assert.ok(registros.some((args) => args[0] === "/api/evidencias" && args[1] === modulos.router));
    const handlers = registros.filter((args) => args.length === 1 && typeof args[0] === "function" && args[0].length === 4);
    assert.equal(handlers.length, 1);
    tratarErro = handlers[0][0];
  } finally {
    Module._load = load;
    for (const [p, anterior] of cache) { if (anterior) require.cache[p] = anterior; else delete require.cache[p]; }
  }
  async function solicitar(body = {}, token = "admin-A", forjas = {}) {
    const req = { method: "POST", url: "/", originalUrl: "/api/evidencias", baseUrl: "/api/evidencias",
      headers: token === null ? {} : { authorization: "Bearer " + token }, body,
      query: forjas.query || {}, params: forjas.params || {}, usuario: forjas.usuario };
    let concluir;
    let rejeitar;
    const fim = new Promise((resolve, reject) => { concluir = resolve; rejeitar = reject; });
    const res = { statusCode: 200, headersSent: false };
    res.status = t.mock.fn((codigo) => { res.statusCode = codigo; return res; });
    res.json = t.mock.fn((valor) => { res.body = valor; res.headersSent = true; concluir(); return res; });
    for (const nome of ["sendFile", "download", "write", "end"]) res[nome] = proibido("res." + nome);
    let temporizador;
    try {
      const prazo = new Promise((_resolve, reject) => {
        temporizador = setTimeout(() => reject(new Error("Router de cadastro não concluiu")), 1000);
      });
      modulos.router.handle(req, res, (erro) => {
        if (!erro) return rejeitar(new Error("POST não atendido"));
        try { tratarErro(erro, req, res, rejeitar); } catch (falha) { rejeitar(falha); }
      });
      await Promise.race([fim, prazo]);
      await new Promise((resolve) => setImmediate(resolve));
    } finally { clearTimeout(temporizador); }
    assert.equal(res.json.mock.callCount(), 1);
    assert.equal(res.status.mock.callCount(), 1);
    return { req, res };
  }
  return { estado, solicitar, conflito };
}

const dados = (c, extra = {}) => ({ id_local: c.local, tipo: "TEXTO", descricao: "Cadastro " + c.nome, ...extra });
function erroPublico(res, status) {
  assert.equal(res.statusCode, status);
  assert.deepEqual(Object.keys(res.body).sort(), ["message", "status"]);
  assert.equal(res.body.status, "error");
  assert.equal(typeof res.body.message, "string");
  assert.equal(JSON.stringify(res.body).includes(SENSIVEL), false);
}
function semEscrita(ctx) {
  assert.deepEqual(ctx.estado.inserts, [], "Nem tentativa de INSERT após recusa");
  assert.deepEqual(ctx.estado.indevidas, []);
  assert.deepEqual(ctx.estado.criadas, []);
}
function semVazamento(res, registro) {
  const json = JSON.stringify(res.body);
  for (const valor of [registro.descricao, registro.caminho_arquivo]) {
    if (valor) assert.equal(json.includes(valor), false, "Resposta contém dado do registro não correspondente");
  }
  assert.equal(res.body.data, undefined);
}
function sucesso(res, esperado, status = 201) {
  assert.equal(res.statusCode, status);
  assert.equal(res.body.status, "success");
  assert.deepEqual(Object.keys(res.body).sort(), ["data", "message", "status"]);
  assert.equal(typeof res.body.message, "string");
  for (const [campo, valor] of Object.entries(esperado)) assert.deepEqual(res.body.data[campo], valor);
  assert.equal(res.body.data.evidencia, undefined, "Envelope interno não deve substituir o recurso");
  if (status === 201) assert.equal(res.body.message, "Evidência criada com sucesso.");
}

for (const c of CONTEXTOS) {
  const outro = CONTEXTOS.find((item) => item.nome !== c.nome);
  for (const tipo of ["FOTO", "TEXTO", "DOCUMENTO"]) {
    test(c.nome + ": administrador cria " + tipo + " no local correto", async (t) => {
      const ctx = preparar(t);
      const { res } = await ctx.solicitar(dados(c, { tipo }), "admin-" + c.nome);
      sucesso(res, { id_local: c.local, id_usuario: c.admin, tipo });
      assert.equal(ctx.estado.criadas.length, 1);
      assert.deepEqual(ctx.estado.indevidas, []);
    });
  }
  test(c.nome + ": engenheiro responsável cria no próprio ambiente", async (t) => {
    const ctx = preparar(t);
    sucesso((await ctx.solicitar(dados(c), "responsavel-" + c.nome)).res, { id_local: c.local, id_usuario: c.responsavel });
    assert.equal(ctx.estado.criadas.length, 1);
  });
  test(c.nome + ": administrador não tenta INSERT em local externo", async (t) => {
    const ctx = preparar(t);
    const { res } = await ctx.solicitar(dados(outro), "admin-" + c.nome);
    semEscrita(ctx);
    erroPublico(res, 404);
  });
  test(c.nome + ": local externo é recusado antes de recuperar chave própria", async (t) => {
    const ctx = preparar(t);
    const registro = ctx.estado.evidencias.get(c.evidencia);
    const { res } = await ctx.solicitar(dados(outro, { id_operacao_cliente: registro.id_operacao_cliente }), "admin-" + c.nome);
    semEscrita(ctx);
    erroPublico(res, 404);
    assert.deepEqual(ctx.estado.operacoes, [], "Local externo não permite sequer recuperação idempotente");
    semVazamento(res, registro);
  });
  test(c.nome + ": engenheiro não responsável não cria", async (t) => {
    const ctx = preparar(t);
    const { res } = await ctx.solicitar(dados(c), "engenheiro-" + c.nome);
    semEscrita(ctx);
    erroPublico(res, 404);
  });
  test(c.nome + ": responsabilidade não atravessa ambientes", async (t) => {
    const ctx = preparar(t);
    // Vínculo inconsistente deliberado; não afirma que constraints reais o permitam.
    ctx.estado.campanhas.get(outro.campanha).id_usuario = c.responsavel;
    const { res } = await ctx.solicitar(dados(outro), "responsavel-" + c.nome);
    semEscrita(ctx);
    erroPublico(res, 404);
  });
  for (const alvo of ["usuario", "ambiente"]) {
    test(c.nome + ": " + alvo + " inativo recebe 401 sem INSERT", async (t) => {
      const ctx = preparar(t);
      if (alvo === "usuario") ctx.estado.usuarios.get(c.admin).ativo = false;
      else ctx.estado.ambientes.set(c.ambiente, false);
      const { res } = await ctx.solicitar(dados(c), "admin-" + c.nome);
      semEscrita(ctx);
      erroPublico(res, 401);
      assert.deepEqual(ctx.estado.identidades, [c.admin]);
    });
  }
  test(c.nome + ": perfil revogado no banco não conserva privilégio do JWT", async (t) => {
    const ctx = preparar(t);
    ctx.estado.usuarios.get(c.admin).perfil_acesso = "ENGENHEIRO_SEGURANCA";
    const { res, req } = await ctx.solicitar(dados(c), "admin-" + c.nome);
    semEscrita(ctx);
    erroPublico(res, 404);
    assert.equal(req.usuario.perfil_acesso, "ENGENHEIRO_SEGURANCA");
  });
  for (const fonte of ["body", "query", "params"]) {
    test(c.nome + ": forja em " + fonte + " não autoriza cadastro externo", async (t) => {
      const ctx = preparar(t);
      const forjada = { id_usuario: outro.admin, id_ambiente: outro.ambiente, perfil_acesso: "ADMINISTRADOR" };
      const body = dados(outro, fonte === "body" ? forjada : {});
      const { res } = await ctx.solicitar(body, "admin-" + c.nome, { [fonte]: forjada, usuario: forjada });
      semEscrita(ctx);
      erroPublico(res, 404);
    });
  }
  test(c.nome + ": criador de evidência não ganha permissão para cadastrar", async (t) => {
    const ctx = preparar(t);
    const { res } = await ctx.solicitar(dados(c), "criador-" + c.nome);
    semEscrita(ctx);
    erroPublico(res, 404);
  });
  test(c.nome + ": repetição no mesmo contexto preserva HTTP 201 legado sem INSERT", async (t) => {
    const ctx = preparar(t);
    const registro = ctx.estado.evidencias.get(c.evidencia);
    const { res } = await ctx.solicitar(dados(c, { id_operacao_cliente: registro.id_operacao_cliente }), "admin-" + c.nome);
    semEscrita(ctx);
    sucesso(res, registro);
  });
  for (const alvo of ["outro ambiente", "outro local"]) {
    test(c.nome + ": chave existente de " + alvo + " não recupera registro externo ao contexto", async (t) => {
      const ctx = preparar(t);
      const registro = ctx.estado.evidencias.get(alvo === "outro ambiente" ? outro.evidencia : c.evidencia);
      const body = dados(c, { id_local: alvo === "outro local" ? c.local + 1 : c.local, id_operacao_cliente: registro.id_operacao_cliente });
      const { res } = await ctx.solicitar(body, "admin-" + c.nome);
      erroPublico(res, 409);
      semVazamento(res, registro);
      assert.deepEqual(ctx.estado.criadas, []);
      assert.deepEqual(ctx.estado.indevidas, []);
    });
  }
  for (const alvo of ["mesmo contexto", "outro ambiente", "outro local"]) {
    test(c.nome + ": corrida 23505 com " + alvo + " só recupera repetição autorizada", async (t) => {
      const ctx = preparar(t);
      ctx.estado.corridaLocal = alvo === "mesmo contexto" ? c.local : alvo === "outro ambiente" ? outro.local : c.local + 1;
      const { res } = await ctx.solicitar(dados(c, { id_operacao_cliente: CHAVE }), "admin-" + c.nome);
      assert.equal(ctx.estado.inserts.length, 1);
      assert.deepEqual(ctx.estado.criadas, []);
      assert.ok(ctx.estado.eventos.includes("23505"));
      const concorrente = ctx.estado.evidencias.get(900);
      if (alvo === "mesmo contexto") sucesso(res, concorrente);
      else { erroPublico(res, 409); semVazamento(res, concorrente); }
      assert.equal(ctx.estado.operacoes.length, 2);
      assert.deepEqual(ctx.estado.indevidas, []);
    });
  }
}

for (const token of [null, "invalido"]) {
  test("JWT " + (token === null ? "ausente" : "inválido") + " recebe 401 sem consultas", async (t) => {
    const ctx = preparar(t);
    erroPublico((await ctx.solicitar(dados(CONTEXTOS[0]), token)).res, 401);
    semEscrita(ctx);
    assert.deepEqual(ctx.estado.consultas, []);
  });
}
for (const [latitude, longitude] of [[0, 0], [0, -46.5], [-23.5, 0]]) {
  test("GPS legítimo preserva latitude " + latitude + " e longitude " + longitude, async (t) => {
    const ctx = preparar(t);
    const gps = { latitude, longitude, origem_coordenadas: "GPS", precisao_gps: 0, data_captura_gps: "2026-10-15T12:00:00.000Z" };
    sucesso((await ctx.solicitar(dados(CONTEXTOS[0], gps))).res, gps);
    assert.deepEqual(ctx.estado.criadas[0].latitude, latitude);
    assert.deepEqual(ctx.estado.criadas[0].longitude, longitude);
  });
}
test("Cadastro exige identidade atual e SELECT/INSERT autorizados parametrizados", async (t) => {
  const ctx = preparar(t);
  const descricao = "Texto literal ' $1 ; -- sem interpolação";
  const { res } = await ctx.solicitar(dados(CONTEXTOS[0], { descricao, id_operacao_cliente: CHAVE,
    id_usuario: 999, id_ambiente: B, perfil_acesso: "ADMINISTRADOR" }));
  sucesso(res, { id_usuario: 11, id_local: 101, descricao });
  assert.deepEqual(ctx.estado.identidades, [11]);
  assert.deepEqual(ctx.estado.globais, []);
  assert.deepEqual(ctx.estado.operacoes.map((q) => q.params), [[A, 11, 101, CHAVE]]);
  assert.equal(ctx.estado.inserts[0].sql, SQL_INSERT_MT);
  assert.deepEqual(ctx.estado.inserts[0].params.slice(0, 3), [A, 11, 101]);
  assert.ok(ctx.estado.eventos.indexOf("LOCAL_AUTORIZADO") < ctx.estado.eventos.indexOf("OPERACAO_AUTORIZADA"));
  for (const q of ctx.estado.consultas) assert.equal(q.sql.includes(descricao), false);
});
test("23505 de outra constraint não é convertido em recuperação idempotente", async (t) => {
  const ctx = preparar(t);
  ctx.estado.erroInsert = ctx.conflito("outra_constraint");
  const { res } = await ctx.solicitar(dados(CONTEXTOS[0], { id_operacao_cliente: CHAVE }));
  erroPublico(res, 409); // Mapeamento público global existente de PostgreSQL.
  assert.equal(ctx.estado.operacoes.length, 1, "Outra unicidade não autoriza nova recuperação");
  assert.deepEqual(ctx.estado.falhasInjetadas, ["insert"]);
  assert.deepEqual(ctx.estado.criadas, []);
});
for (const fase of ["inicial", "após colisão"]) {
  test("Falha técnica de idempotência " + fase + " permanece 500 seguro", async (t) => {
    const ctx = preparar(t);
    ctx.estado.erroOperacaoNaChamada = fase === "inicial" ? 1 : 2;
    if (fase !== "inicial") ctx.estado.corridaLocal = 101;
    const { res } = await ctx.solicitar(dados(CONTEXTOS[0], { id_operacao_cliente: CHAVE }));
    erroPublico(res, 500);
    assert.equal(res.body.message, "Erro interno do servidor.");
    assert.deepEqual(ctx.estado.falhasInjetadas, ["operacao"]);
    assert.deepEqual(ctx.estado.criadas, []);
    if (fase === "inicial") semEscrita(ctx);
    else assert.equal(ctx.estado.inserts.length, 1);
  });
}
test("Caracterização de risco: cadastro aceita caminho textual do cliente sem acessar arquivo", async (t) => {
  const ctx = preparar(t);
  const caminho = "uploads/evidencias/CAMINHO_INFORMADO_PELO_CLIENTE.jpg";
  sucesso((await ctx.solicitar(dados(CONTEXTOS[0], { caminho_arquivo: caminho }))).res, { caminho_arquivo: caminho });
  assert.equal(ctx.estado.criadas[0].caminho_arquivo, caminho);
  assert.deepEqual(ctx.estado.fisicas, []);
  // Documenta aceitação atual, sem afirmar propriedade/autorização física.
  // Política de vinculação de arquivos exige decisão e testes separados.
});

// Não inicia servidor: router.handle recebe requisição simulada. O app é
// carregado com registros inertes apenas para confirmar montagem e usar seu
// handler global real. Não executa parser, CORS ou outros routers.
// Constraints e corridas são modelos explícitos, não PostgreSQL real: não
// comprovam locks, transações, RLS ou isolamento. SQL desconhecido falha e é
// registrado mesmo se a produção capturar sua exceção. Nenhum filesystem é usado.
// Preserva 201 também em repetição no POST legado. O controller multi-tenant
// separado usa 200: qualquer mudança deste contrato precisa ser autorizada.
