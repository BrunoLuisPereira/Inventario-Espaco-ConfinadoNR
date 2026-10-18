const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");

const CAMINHOS = Object.fromEntries(Object.entries({
  evidencia: "../src/repositories/evidenciaRepository",
  evidenciaMultiTenant: "../src/repositories/evidenciaMultiTenantRepository",
  local: "../src/repositories/localRepository",
  campanha: "../src/repositories/campanhaRepository",
  usuario: "../src/repositories/usuarioRepository",
  service: "../src/services/evidenciaService",
  serviceMultiTenant: "../src/services/evidenciaMultiTenantService",
  controller: "../src/controllers/evidenciaController",
  autenticacao: "../src/middlewares/autenticacaoMiddleware",
  router: "../src/routes/evidenciaRoutes",
  app: "../src/app",
}).map(([nome, caminho]) => [nome, require.resolve(caminho)]));
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const SEGREDO = "SEGREDO_FICTICIO_DOWNLOAD_TESTE";
const SENSIVEL = "SQL_STACK_TOKEN_CAMINHO_FICTICIOS_NAO_PUBLICAR";
const CONTEXTOS = [
  { nome: "A", ambiente: A, outro: B, admin: 11, responsavel: 12, engenheiro: 13, criador: 14, campanha: 1, local: 101, evidencia: 501, externa: 601 },
  { nome: "B", ambiente: B, outro: A, admin: 21, responsavel: 22, engenheiro: 23, criador: 24, campanha: 2, local: 201, evidencia: 601, externa: 501 },
];
const SQL_IDENTIDADE = "SELECT u.id_usuario, u.id_ambiente, u.nome, u.email, u.perfil_acesso FROM usuario AS u INNER JOIN ambiente AS a ON a.id_ambiente = u.id_ambiente WHERE u.id_usuario = $1 AND u.ativo = TRUE AND a.ativo = TRUE LIMIT 1";
const SQL_EVIDENCIA = "SELECT e.*, l.nome_local, u.nome AS usuario_responsavel FROM evidencia e INNER JOIN local l ON l.id_local = e.id_local INNER JOIN usuario u ON u.id_usuario = e.id_usuario WHERE e.id_evidencia = $1";
const SQL_LOCAL = "SELECT l.id_local, l.nome_local, l.setor, l.descricao, l.endereco, l.latitude, l.longitude, l.status, l.id_campanha, c.nome_campanha, l.data_criacao, l.data_atualizacao FROM local l INNER JOIN campanha c ON c.id_campanha = l.id_campanha WHERE l.id_local = $1 LIMIT 1";
const SQL_CAMPANHA = "SELECT c.id_campanha, c.nome_campanha, c.empresa, c.responsavel, c.data_inicio, c.status, c.id_usuario, u.nome AS usuario_responsavel, c.data_criacao, c.data_atualizacao FROM campanha c INNER JOIN usuario u ON u.id_usuario = c.id_usuario WHERE c.id_campanha = $1 LIMIT 1";
// Leitura existente do repositório multi-tenant, reconhecida exatamente como
// referência. Outros SQLs/imports futuros exigirão revisão explícita do mock.
const SQL_AUTORIZADO = "SELECT e.*, l.nome_local, criador.nome AS usuario_responsavel FROM evidencia AS e INNER JOIN local AS l ON l.id_local = e.id_local INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha INNER JOIN usuario AS criador ON criador.id_usuario = e.id_usuario AND criador.id_ambiente = c.id_ambiente WHERE c.id_ambiente = $1 AND EXISTS ( SELECT 1 FROM usuario AS solicitante INNER JOIN ambiente AS a ON a.id_ambiente = solicitante.id_ambiente WHERE solicitante.id_usuario = $2 AND solicitante.id_ambiente = c.id_ambiente AND solicitante.ativo = TRUE AND a.ativo = TRUE AND ( solicitante.perfil_acesso = 'ADMINISTRADOR' OR c.id_usuario = solicitante.id_usuario ) ) AND e.id_evidencia = $3 LIMIT 1";

function preparar(t) {
  const estado = { usuarios: new Map(), ambientes: new Map([[A, true], [B, true]]),
    campanhas: new Map(), locais: new Map(), evidencias: new Map(), arquivos: new Map(),
    consultas: [], identidades: [], globais: [], autorizadas: [], resolucoes: [], entregas: [], eventos: [],
    inesperadas: [], proibidas: [], externas: [], escritas: [], conexoes: 0, falhasSimulador: [], logs: [],
    erroConsulta: null, falhasConsultas: [], erroArquivo: null, caminhoRejeitado: false,
    iniciarDuranteLeitura: false, respostaDuranteLeitura: null };
  const tokens = new Map();
  for (const c of CONTEXTOS) {
    for (const [papel, id] of [["admin", c.admin], ["responsavel", c.responsavel], ["engenheiro", c.engenheiro], ["criador", c.criador]]) {
      const perfil = papel === "admin" ? "ADMINISTRADOR" : "ENGENHEIRO_SEGURANCA";
      estado.usuarios.set(id, { id_usuario: id, id_ambiente: c.ambiente, perfil_acesso: perfil, ativo: true, nome: "Pessoa " + id });
      tokens.set(papel + "-" + c.nome, { sub: String(id), perfil, id_ambiente: c.outro });
    }
    estado.campanhas.set(c.campanha, { id_campanha: c.campanha, id_ambiente: c.ambiente,
      id_usuario: c.responsavel, nome_campanha: "Campanha " + c.nome });
    estado.locais.set(c.local, { id_local: c.local, id_campanha: c.campanha, nome_local: "Local " + c.nome });
    const caminho = "uploads/evidencias/arquivo-" + c.nome + ".jpg";
    estado.evidencias.set(c.evidencia, { id_evidencia: c.evidencia, id_local: c.local,
      id_usuario: c.criador, caminho_arquivo: caminho, tipo: "FOTO", descricao: "Evidência " + c.nome });
    estado.arquivos.set(caminho, { absoluto: "C:\\ARMAZENAMENTO_SIMULADO\\arquivo-" + c.nome + ".jpg",
      bytes: Buffer.from("BYTES_FICTICIOS_EXCLUSIVOS_" + c.nome) });
  }
  function associar(id) {
    const evidencia = estado.evidencias.get(id);
    const local = evidencia && estado.locais.get(evidencia.id_local);
    const campanha = local && estado.campanhas.get(local.id_campanha);
    const criador = evidencia && estado.usuarios.get(evidencia.id_usuario);
    return { evidencia, local, campanha, criador };
  }
  function linha(vinculo) {
    return { ...vinculo.evidencia, nome_local: vinculo.local.nome_local, usuario_responsavel: vinculo.criador.nome };
  }
  const pool = {
    async query(texto, params = []) {
      const sql = texto.replace(/\s+/g, " ").trim().replace(/;$/, "");
      estado.consultas.push({ sql, params: [...params] });
      if (/^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql)) {
        estado.escritas.push(sql);
        throw new Error("Escrita proibida no teste de download");
      }
      const resultado = (rows) => ({ rows, rowCount: rows.length });
      const falhar = (etapa) => {
        if (estado.erroConsulta === etapa) {
          estado.falhasConsultas.push(etapa);
          throw Object.assign(new Error(SENSIVEL), { code: "XX000" });
        }
      };
      if (sql === SQL_IDENTIDADE) {
        assert.equal(params.length, 1);
        estado.identidades.push(params[0]);
        estado.eventos.push("IDENTIDADE");
        falhar("identidade");
        const usuario = estado.usuarios.get(params[0]);
        return resultado(usuario?.ativo === true && estado.ambientes.get(usuario.id_ambiente) === true
          ? [{ id_usuario: usuario.id_usuario, id_ambiente: usuario.id_ambiente,
            perfil_acesso: usuario.perfil_acesso, nome: usuario.nome, email: "pessoa@example.invalid" }] : []);
      }
      if (sql === SQL_EVIDENCIA || sql === SQL_AUTORIZADO) {
        falhar("evidência");
        const global = sql === SQL_EVIDENCIA;
        assert.equal(params.length, global ? 1 : 3);
        if (!global) {
          assert.equal(typeof params[0], "string");
          assert.ok(Number.isSafeInteger(params[1]) && params[1] > 0);
          assert.ok(Number.isSafeInteger(params[2]) && params[2] > 0);
          // Local e campanha integram esta mesma instrução SQL. A injeção
          // representa falha técnica da consulta com JOINs, não ausência de linha
          // nem execução de consultas separadas pelo PostgreSQL.
          falhar("local");
          falhar("campanha");
        }
        const id = params[global ? 0 : 2];
        const v = associar(id);
        let permitido = !!(v.evidencia && v.local && v.criador);
        if (global) estado.globais.push({ id, sql });
        else {
          const usuario = estado.usuarios.get(params[1]);
          permitido = permitido && !!v.campanha && v.campanha.id_ambiente === params[0] &&
            v.criador.id_ambiente === params[0] && usuario?.id_ambiente === params[0] &&
            usuario.ativo === true && estado.ambientes.get(params[0]) === true &&
            (usuario.perfil_acesso === "ADMINISTRADOR" || v.campanha.id_usuario === usuario.id_usuario);
          estado.autorizadas.push({ params: [...params], permitido });
        }
        estado.eventos.push(global ? "EVIDENCIA_GLOBAL" : "EVIDENCIA_AUTORIZADA");
        if (estado.iniciarDuranteLeitura) estado.respostaDuranteLeitura();
        return resultado(permitido ? [linha(v)] : []);
      }
      if (sql === SQL_LOCAL) {
        assert.equal(params.length, 1);
        falhar("local");
        const local = estado.locais.get(params[0]);
        const campanha = local && estado.campanhas.get(local.id_campanha);
        estado.eventos.push("LOCAL");
        return resultado(local && campanha ? [{ ...local, nome_campanha: campanha.nome_campanha }] : []);
      }
      if (sql === SQL_CAMPANHA) {
        assert.equal(params.length, 1);
        falhar("campanha");
        const campanha = estado.campanhas.get(params[0]);
        const responsavel = campanha && estado.usuarios.get(campanha.id_usuario);
        estado.eventos.push("CAMPANHA");
        // O SELECT legado não contém id_ambiente; não o acrescenta artificialmente.
        if (!campanha || !responsavel) return resultado([]);
        const { id_ambiente, ...campos } = campanha;
        return resultado([{ ...campos, usuario_responsavel: responsavel.nome }]);
      }
      estado.inesperadas.push(sql);
      throw new Error("SQL desconhecido no simulador de download");
    },
    connect() { estado.conexoes++; throw new Error("Conexão real/transacional proibida"); },
  };
  const consultar = pool.query;
  pool.query = async (...args) => {
    try { return await consultar(...args); }
    catch (erro) { if (erro?.code === "ERR_ASSERTION") estado.falhasSimulador.push(erro); throw erro; }
  };
  const externo = (nome) => new Proxy(Object.create(null), { get(_objeto, chave) {
    estado.externas.push(nome + "." + String(chave));
    throw new Error("Dependência fora do escopo do download");
  } });
  const arquivos = {
    obterCaminhoCompleto(caminho) {
      estado.resolucoes.push(caminho);
      estado.eventos.push("RESOLVER_CAMINHO");
      return estado.caminhoRejeitado ? null : estado.arquivos.get(caminho)?.absoluto ?? null;
    },
    removerArquivo() { estado.externas.push("removerArquivo"); throw new Error("Exclusão física proibida"); },
    removerArquivos() { estado.externas.push("removerArquivos"); throw new Error("Exclusão física proibida"); },
  };
  const jwt = { verify(token, segredo, opcoes) {
    assert.equal(segredo, SEGREDO);
    assert.deepEqual(opcoes.algorithms, ["HS256"]);
    if (!tokens.has(token)) throw Object.assign(new Error("JWT inválido simulado"), { name: "JsonWebTokenError" });
    return { ...tokens.get(token) };
  } };
  const upload = { uploadEvidencia: { single(campo) {
    assert.equal(campo, "arquivo");
    return () => { estado.externas.push("upload"); throw new Error("Upload proibido no teste de download"); };
  } } };
  for (const nome of ["error", "warn", "info", "log"]) t.mock.method(console, nome, (...args) => estado.logs.push(args));
  const cache = new Map(Object.values(CAMINHOS).map((p) => [p, require.cache[p]]));
  const load = Module._load;
  const segredoAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SEGREDO;
  const dependencias = new Map();
  const modulos = {};
  const registrados = [];
  // Captura somente o handler global real. Não cria aplicação Express real,
  // não executa middlewares gerais nem carrega routers da aplicação principal.
  const registroApp = { get() { return this; }, use(...args) { registrados.push(args); return this; } };
  const expressRegistro = () => registroApp;
  const neutro = (_req, _res, next) => next();
  expressRegistro.json = () => neutro;
  expressRegistro.urlencoded = () => neutro;
  let tratarErro;
  t.after(() => {
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
    assert.strictEqual(Module._load, load);
    for (const [p, anterior] of cache) assert.strictEqual(require.cache[p], anterior);
    assert.deepEqual(estado.proibidas, []);
    assert.deepEqual(estado.inesperadas, [], "SQL desconhecido não é uma recusa de autorização válida");
    assert.deepEqual(estado.falhasSimulador, []);
    assert.deepEqual(estado.externas, []);
    assert.deepEqual(estado.escritas, []);
    assert.equal(estado.conexoes, 0);
    assert.deepEqual(estado.falhasConsultas, estado.erroConsulta ? [estado.erroConsulta] : [],
      "O cenário técnico deve atingir a consulta prevista, sem sucesso por erro do simulador");
  });
  try {
    for (const p of cache.keys()) delete require.cache[p];
    Module._load = function (request, parent, ...resto) {
      // Utilitario puro real, restrito aos tres consumidores autorizados.
      if (request === '../utils/normalizarIdDominio' && ['middlewares/autenticacaoMiddleware', 'services/authService', 'services/relatorioMultiTenantService'].some(p => parent?.filename === require.resolve('../src/' + p))) return require('../src/utils/normalizarIdDominio');
      if (cache.has(parent?.filename)) {
        const permitidas = dependencias.get(parent.filename);
        if (!permitidas?.has(request)) {
          estado.proibidas.push(request);
          throw new Error("Dependência real proibida no teste de download");
        }
        return permitidas.get(request);
      }
      return load.call(this, request, parent, ...resto);
    };
    for (const nome of ["evidencia", "evidenciaMultiTenant", "local", "campanha"]) {
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
    dependencias.set(CAMINHOS.serviceMultiTenant, new Map([
      ["../repositories/evidenciaMultiTenantRepository", modulos.evidenciaMultiTenant],
    ]));
    modulos.serviceMultiTenant = require(CAMINHOS.serviceMultiTenant);
    dependencias.set(CAMINHOS.controller, new Map([
      ["../services/evidenciaService", modulos.service],
      ["../services/evidenciaMultiTenantService", modulos.serviceMultiTenant],
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
      ["express", expressRegistro], ["cors", () => neutro],
      ...["auth", "usuario", "campanha", "local", "checklist", "evidencia", "dadosTecnicos", "relatorio", "sincronizacao"]
        .map((nome) => ["./routes/" + nome + "Routes", neutro]),
    ]));
    assert.strictEqual(require(CAMINHOS.app), registroApp);
    const handlers = registrados.filter((args) => args.length === 1 && typeof args[0] === "function" && args[0].length === 4);
    assert.equal(handlers.length, 1);
    tratarErro = handlers[0][0];
  } finally {
    Module._load = load;
    for (const [p, anterior] of cache) { if (anterior) require.cache[p] = anterior; else delete require.cache[p]; }
  }
  async function solicitar(id = 501, token = "admin-A", opcoes = {}) {
    const req = { method: "GET", url: "/" + encodeURIComponent(String(id)) + "/arquivo",
      originalUrl: "/api/evidencias/" + encodeURIComponent(String(id)) + "/arquivo", baseUrl: "/api/evidencias",
      headers: token === null ? {} : { authorization: "Bearer " + token },
      body: opcoes.body || {}, query: opcoes.query || {}, params: opcoes.params || {}, usuario: opcoes.usuario };
    let concluir;
    let rejeitar;
    const fim = new Promise((resolve, reject) => { concluir = resolve; rejeitar = reject; });
    const anterior = Buffer.from("RESPOSTA_SIMULADA_JA_INICIADA");
    let enviada = opcoes.iniciada === true;
    const res = { statusCode: enviada ? 202 : 200, body: enviada ? anterior : undefined };
    Object.defineProperty(res, "headersSent", {
      get() { if (opcoes.iniciada && enviada) concluir(); return enviada; },
    });
    estado.respostaDuranteLeitura = () => { enviada = true; res.body = anterior; res.statusCode = 202; concluir(); };
    res.status = t.mock.fn((codigo) => { res.statusCode = codigo; return res; });
    res.json = t.mock.fn((body) => { res.body = body; enviada = true; concluir(); return res; });
    for (const nome of ["send", "write", "end", "download", "redirect"]) {
      res[nome] = t.mock.fn(() => { estado.externas.push("res." + nome); concluir(); return res; });
    }
    res.sendFile = t.mock.fn((caminho, callback) => {
      estado.entregas.push(caminho);
      estado.eventos.push("SEND_FILE");
      assert.equal(typeof callback, "function");
      if (opcoes.erroAposInicio) {
        enviada = true;
        res.body = anterior;
        callback(Object.assign(new Error(SENSIVEL), { code: "ECONNRESET" }));
      } else if (estado.erroArquivo) callback(estado.erroArquivo);
      else if (!enviada) {
        const arquivo = [...estado.arquivos.values()].find((a) => a.absoluto === caminho);
        assert.ok(arquivo, "sendFile só pode receber caminho fictício registrado");
        res.body = arquivo.bytes;
        enviada = true;
        callback();
      } else callback();
      concluir();
      return res;
    });
    const erros = [];
    let temporizador;
    try {
      const prazo = new Promise((_resolve, reject) => {
        temporizador = setTimeout(() => reject(new Error("Router de download não concluiu")), 1000);
      });
      modulos.router.handle(req, res, (erro) => {
        if (!erro) return rejeitar(new Error("Endpoint de arquivo não atendido"));
        erros.push(erro);
        try { tratarErro(erro, req, res, (original) => { erros.push(original); concluir(); }); }
        catch (falha) { rejeitar(falha); }
      });
      await Promise.race([fim, prazo]);
      await new Promise((resolve) => setImmediate(resolve));
    } finally { clearTimeout(temporizador); }
    assert.ok(res.json.mock.callCount() <= 1, "Nenhuma resposta JSON duplicada");
    assert.ok(res.status.mock.callCount() <= 1);
    assert.ok(res.sendFile.mock.callCount() <= 1);
    if (opcoes.iniciada || estado.iniciarDuranteLeitura) {
      assert.equal(res.json.mock.callCount(), 0);
      assert.equal(res.status.mock.callCount(), 0);
      assert.strictEqual(res.body, anterior);
      assert.equal(res.statusCode, 202);
    }
    return { req, res, erros, anterior };
  }
  return { estado, solicitar };
}

function semArquivo(ctx, inicioResolucao = 0, inicioEntrega = 0) {
  assert.equal(ctx.estado.resolucoes.length, inicioResolucao, "Recusa deve preceder resolução do caminho");
  assert.equal(ctx.estado.entregas.length, inicioEntrega, "Recusa deve preceder sendFile");
}
function erroPublico(res, codigo) {
  assert.equal(res.statusCode, codigo);
  assert.equal(res.json.mock.callCount(), 1);
  assert.deepEqual(Object.keys(res.body).sort(), ["message", "status"]);
  assert.equal(res.body.status, "error");
  assert.equal(typeof res.body.message, "string");
  const texto = JSON.stringify(res.body);
  for (const valor of [SENSIVEL, "ARMAZENAMENTO_SIMULADO", "uploads/evidencias", "C:\\"]) {
    assert.equal(texto.includes(valor), false, "Erro não pode expor caminho ou informação interna");
  }
}
function entregaLegitima(ctx, contexto, res) {
  const evidencia = ctx.estado.evidencias.get(contexto.evidencia);
  const arquivo = ctx.estado.arquivos.get(evidencia.caminho_arquivo);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json.mock.callCount(), 0);
  assert.equal(res.sendFile.mock.callCount(), 1);
  assert.deepEqual(ctx.estado.resolucoes, [evidencia.caminho_arquivo]);
  assert.deepEqual(ctx.estado.entregas, [arquivo.absoluto]);
  assert.strictEqual(res.body, arquivo.bytes);
  const consultas = ctx.estado.consultas;
  assert.ok(consultas.length > 0);
  assert.ok(ctx.estado.eventos.indexOf("RESOLVER_CAMINHO") < ctx.estado.eventos.indexOf("SEND_FILE"));
  assert.ok(ctx.estado.eventos.indexOf("EVIDENCIA_GLOBAL") >= 0 || ctx.estado.eventos.indexOf("EVIDENCIA_AUTORIZADA") >= 0);
}

for (const c of CONTEXTOS) {
  for (const papel of ["admin", "responsavel"]) {
    test("Arquivo " + c.nome + ": " + papel + " acessa legitimamente evidência do próprio ambiente", async (t) => {
      const ctx = preparar(t);
      entregaLegitima(ctx, c, (await ctx.solicitar(c.evidencia, papel + "-" + c.nome)).res);
    });
  }
  test("Arquivo " + c.nome + ": administrador não acessa evidência do outro ambiente", async (t) => {
    const ctx = preparar(t);
    const { res } = await ctx.solicitar(c.externa, "admin-" + c.nome);
    semArquivo(ctx);
    erroPublico(res, 404);
  });
  test("Arquivo " + c.nome + ": engenheiro não responsável recebe 404 sem caminho ou bytes", async (t) => {
    const ctx = preparar(t);
    const { res } = await ctx.solicitar(c.evidencia, "engenheiro-" + c.nome);
    semArquivo(ctx);
    erroPublico(res, 404);
  });
  test("Arquivo " + c.nome + ": responsabilidade não permite atravessar ambientes", async (t) => {
    const ctx = preparar(t);
    const outro = CONTEXTOS.find((item) => item.ambiente === c.outro);
    // Relação propositalmente inconsistente para verificar defesa em profundidade;
    // não pressupõe que as constraints reais permitam armazená-la.
    ctx.estado.campanhas.get(outro.campanha).id_usuario = c.responsavel;
    const { res } = await ctx.solicitar(c.externa, "responsavel-" + c.nome);
    semArquivo(ctx);
    erroPublico(res, 404);
  });
  test("Arquivo " + c.nome + ": evidência externa e inexistente têm resposta indistinguível", async (t) => {
    const ctx = preparar(t);
    const externa = await ctx.solicitar(c.externa, "admin-" + c.nome);
    const inexistente = await ctx.solicitar(999999, "admin-" + c.nome);
    semArquivo(ctx);
    erroPublico(externa.res, 404);
    erroPublico(inexistente.res, 404);
    assert.deepEqual(externa.res.body, inexistente.res.body);
  });
  for (const alvo of ["usuário", "ambiente"]) {
    test("Arquivo " + c.nome + ": " + alvo + " inativo recebe 401 antes de resolver caminho", async (t) => {
      const ctx = preparar(t);
      if (alvo === "usuário") ctx.estado.usuarios.get(c.admin).ativo = false;
      else ctx.estado.ambientes.set(c.ambiente, false);
      const { res } = await ctx.solicitar(c.evidencia, "admin-" + c.nome);
      semArquivo(ctx);
      erroPublico(res, 401);
      assert.deepEqual(ctx.estado.identidades, [c.admin]);
    });
  }
  test("Arquivo " + c.nome + ": perfil administrativo revogado é revalidado", async (t) => {
    const ctx = preparar(t);
    ctx.estado.usuarios.get(c.admin).perfil_acesso = "ENGENHEIRO_SEGURANCA";
    const { res, req } = await ctx.solicitar(c.evidencia, "admin-" + c.nome);
    semArquivo(ctx);
    erroPublico(res, 404);
    assert.deepEqual(ctx.estado.identidades, [c.admin]);
    assert.equal(req.usuario.perfil_acesso, "ENGENHEIRO_SEGURANCA");
  });
  for (const fonte of ["body", "query", "params"]) {
    test("Arquivo " + c.nome + ": identidade forjada em " + fonte + " não autoriza evidência externa", async (t) => {
      const ctx = preparar(t);
      const forjada = { id_usuario: 999, id_ambiente: c.outro, perfil_acesso: "ADMINISTRADOR" };
      const { res } = await ctx.solicitar(c.externa, "admin-" + c.nome, { [fonte]: forjada, usuario: forjada });
      semArquivo(ctx);
      erroPublico(res, 404);
    });
  }
  test("Arquivo " + c.nome + ": ser criador não concede autorização automática", async (t) => {
    const ctx = preparar(t);
    const { res } = await ctx.solicitar(c.evidencia, "criador-" + c.nome);
    semArquivo(ctx);
    erroPublico(res, 404);
  });
}

for (const id of [0, -1, "abc", "1.5", Number.MAX_SAFE_INTEGER + 1, "9007199254740993", "Infinity", "NaN"]) {
  test("Arquivo: ID inválido " + String(id) + " recebe 400 sem consulta à evidência", async (t) => {
    const ctx = preparar(t);
    const { res } = await ctx.solicitar(id);
    semArquivo(ctx);
    erroPublico(res, 400);
    assert.equal(ctx.estado.consultas.filter((q) => q.sql !== SQL_IDENTIDADE).length, 0);
  });
}
for (const [nome, token] of [["ausente", null], ["inválido", "invalido"]]) {
  test("Arquivo: JWT " + nome + " recebe 401 sem consultas ou arquivo", async (t) => {
    const ctx = preparar(t);
    const { res } = await ctx.solicitar(501, token, { usuario: { id_usuario: 11, id_ambiente: A, perfil_acesso: "ADMINISTRADOR" } });
    semArquivo(ctx);
    erroPublico(res, 401);
    assert.deepEqual(ctx.estado.consultas, []);
  });
}

test("Arquivo: evidência autorizada sem caminho continua retornando 404", async (t) => {
  const ctx = preparar(t);
  ctx.estado.evidencias.get(501).caminho_arquivo = null;
  const { res } = await ctx.solicitar();
  semArquivo(ctx);
  erroPublico(res, 404);
  assert.equal(res.body.message, "Esta evidência não possui arquivo.");
});
test("Arquivo: caminho rejeitado não alcança sendFile", async (t) => {
  const ctx = preparar(t);
  ctx.estado.caminhoRejeitado = true;
  const { res } = await ctx.solicitar();
  assert.equal(ctx.estado.resolucoes.length, 1);
  assert.equal(ctx.estado.entregas.length, 0);
  erroPublico(res, 404);
  assert.equal(res.body.message, "Arquivo da evidência inválido.");
});

for (const [nome, code, statusCode, esperado] of [
  ["inexistente", "ENOENT", 404, 404],
  ["permissão do filesystem", "EACCES", 403, 500],
  ["transporte antes do envio", "EIO", undefined, 500],
]) {
  test("Arquivo: falha de " + nome + " não expõe caminho físico", async (t) => {
    const ctx = preparar(t);
    const erro = Object.assign(new Error(SENSIVEL + " C:\\ARMAZENAMENTO_SIMULADO\\privado.jpg"), { code });
    if (statusCode !== undefined) erro.statusCode = statusCode;
    ctx.estado.erroArquivo = erro;
    const { res } = await ctx.solicitar();
    assert.equal(ctx.estado.entregas.length, 1);
    erroPublico(res, esperado);
    // EACCES é falha técnica do servidor, não autorização de negócio 403.
  });
}

test("Arquivo: headersSent prévio impede resolução e nova tentativa de entrega", async (t) => {
  const ctx = preparar(t);
  await ctx.solicitar(501, "admin-A", { iniciada: true });
  semArquivo(ctx);
});
test("Arquivo: resposta iniciada durante leitura não é sobrescrita", async (t) => {
  const ctx = preparar(t);
  ctx.estado.iniciarDuranteLeitura = true;
  await ctx.solicitar();
  semArquivo(ctx);
});
test("Arquivo: erro de transporte após início não produz JSON ou segunda entrega", async (t) => {
  const ctx = preparar(t);
  const { res, anterior } = await ctx.solicitar(501, "admin-A", { erroAposInicio: true });
  assert.equal(res.sendFile.mock.callCount(), 1);
  assert.equal(res.json.mock.callCount(), 0);
  assert.equal(res.status.mock.callCount(), 0);
  assert.strictEqual(res.body, anterior);
});

for (const etapa of ["identidade", "evidência", "local", "campanha"]) {
  test("Arquivo: erro técnico na consulta de " + etapa + " não vira recusa 403/404", async (t) => {
    const ctx = preparar(t);
    ctx.estado.erroConsulta = etapa;
    const { res } = await ctx.solicitar();
    semArquivo(ctx);
    erroPublico(res, 500);
    assert.ok(ctx.estado.consultas.length > 0);
  });
}
test("Arquivo: leitura autorizada exige ambiente, solicitante e vínculo completo no SQL", async (t) => {
  const ctx = preparar(t);
  const { res } = await ctx.solicitar();
  entregaLegitima(ctx, CONTEXTOS[0], res);
  assert.deepEqual(ctx.estado.identidades, [11]);
  assert.deepEqual(ctx.estado.globais, [], "Busca global por ID não substitui autorização por ambiente");
  assert.deepEqual(ctx.estado.autorizadas, [{ params: [A, 11, 501], permitido: true }]);
  assert.ok(ctx.estado.eventos.indexOf("EVIDENCIA_AUTORIZADA") < ctx.estado.eventos.indexOf("RESOLVER_CAMINHO"));
});
test("Arquivo: acessos consecutivos A/B/A não reutilizam caminho ou conteúdo externo", async (t) => {
  const ctx = preparar(t);
  for (const c of [CONTEXTOS[0], CONTEXTOS[1], CONTEXTOS[0]]) {
    const { res } = await ctx.solicitar(c.evidencia, "admin-" + c.nome);
    const arquivo = ctx.estado.arquivos.get(ctx.estado.evidencias.get(c.evidencia).caminho_arquivo);
    assert.equal(res.statusCode, 200);
    assert.strictEqual(res.body, arquivo.bytes);
    assert.equal(ctx.estado.entregas.at(-1), arquivo.absoluto);
  }
  assert.equal(ctx.estado.entregas.length, 3);
  assert.equal(ctx.estado.resolucoes.length, 3);
});

// Limitações: não lê o filesystem e não testa MIME, headers gerados pelo
// sendFile real, links simbólicos, junctions ou permissões físicas. O resolvedor
// é um sentinela, não uma implementação de validação de caminhos. Bytes são
// buffers fictícios. Não comprova constraints, RLS, bloqueios ou concorrência
// PostgreSQL. Captura o handler global com registros inertes, sem iniciar app.
// Consultas/imports novos exigirão adaptação explícita, nunca sucesso padrão.
// Falhas de local/campanha são injetadas na leitura multi-tenant com JOINs;
// não simulam etapas independentes de execução interna do PostgreSQL.
// A política de erro proposta é 404 para arquivo ausente e 500 para falha
// técnica de permissão/transporte antes do envio; não altera produção.
