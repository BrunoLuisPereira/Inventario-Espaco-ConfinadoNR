const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const ExcelJS = require("exceljs");

const CAMINHOS = Object.fromEntries(Object.entries({
  usuarioRepository: "../src/repositories/usuarioRepository",
  localRepository: "../src/repositories/localRepository",
  excel: "../src/services/excelService",
  controller: "../src/controllers/localController",
  autenticacao: "../src/middlewares/autenticacaoMiddleware",
  router: "../src/routes/localRoutes",
}).map(([nome, caminho]) => [nome, require.resolve(caminho)]));
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const SEGREDO = "SEGREDO_FICTICIO_TESTE_EXPORTACAO";
const SENSIVEL = "SQL_STACK_TOKEN_CAMINHO_FICTICIOS_NAO_PUBLICAR";
const TIPO = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CABECALHOS = ["Campanha", "Local", "Setor", "Endereço", "Latitude do Local",
  "Longitude do Local", "Status", "Foto", "Latitude Foto", "Longitude Foto", "Origem", "Precisão"];
const CONTEXTOS = [
  { nome: "A", ambiente: A, outro: B, admin: 11, engenheiro: 12, local: 101, semFoto: 102 },
  { nome: "B", ambiente: B, outro: A, admin: 21, engenheiro: 22, local: 201, semFoto: 202 },
];
const SQL_IDENTIDADE = "SELECT u.id_usuario, u.id_ambiente, u.nome, u.email, u.perfil_acesso FROM usuario AS u INNER JOIN ambiente AS a ON a.id_ambiente = u.id_ambiente WHERE u.id_usuario = $1 AND u.ativo = TRUE AND a.ativo = TRUE LIMIT 1";
const SELECAO = "SELECT c.nome_campanha, l.id_local, l.nome_local, l.setor, l.endereco, l.latitude AS latitude_local, l.longitude AS longitude_local, l.status, e.id_evidencia, e.tipo AS tipo_evidencia, e.descricao AS descricao_evidencia, e.latitude AS latitude_foto, e.longitude AS longitude_foto, e.origem_coordenadas, e.precisao_gps FROM local l INNER JOIN campanha c ON c.id_campanha = l.id_campanha LEFT JOIN evidencia e ON e.id_local = l.id_local";
const ORDEM = " ORDER BY c.nome_campanha ASC, l.nome_local ASC, e.id_evidencia ASC";
const SQL_GLOBAL = SELECAO + ORDEM;
// Variante mínima prevista. SQL futuro diferente deverá ser revisado e
// reconhecido explicitamente, nunca aprovado por presença parcial de palavras.
const SQL_AMBIENTE = SELECAO + " WHERE c.id_ambiente = $1 AND EXISTS ( SELECT 1 FROM usuario AS u INNER JOIN ambiente AS a ON a.id_ambiente = u.id_ambiente WHERE u.id_usuario = $2 AND u.id_ambiente = c.id_ambiente AND u.ativo = TRUE AND a.ativo = TRUE AND (u.perfil_acesso = 'ADMINISTRADOR' OR c.id_usuario = u.id_usuario) )" + ORDEM;

function preparar(t) {
  const estado = { consultas: [], globais: [], exportacoes: [], identidades: [],
    proibidas: [], inesperadas: [], externas: [], escritas: [], conexoes: 0, logs: [], falhasSimulador: [],
    erroIdentidade: null, erroExportacao: null,
    ambientes: new Map([[A, true], [B, true]]),
    usuarios: new Map(), campanhas: [], locais: [], evidencias: [] };
  for (const [indice, contexto] of CONTEXTOS.entries()) {
    for (const [id, perfil] of [[contexto.admin, "ADMINISTRADOR"], [contexto.engenheiro, "ENGENHEIRO_SEGURANCA"]]) {
      estado.usuarios.set(id, { id_usuario: id, id_ambiente: contexto.ambiente, perfil_acesso: perfil, ativo: true });
    }
    const campanha = { id_campanha: indice + 1, id_ambiente: contexto.ambiente,
      nome_campanha: "CAMPANHA_EXCLUSIVA_" + contexto.nome, id_usuario: contexto.engenheiro };
    estado.campanhas.push(campanha);
    for (const [id, nome] of [[contexto.local, "COM_FOTOS"], [contexto.semFoto, "SEM_FOTOS"]]) {
      estado.locais.push({ id_local: id, id_campanha: campanha.id_campanha,
        nome_local: "LOCAL_" + contexto.nome + "_" + nome, setor: "SETOR_EXCLUSIVO_" + contexto.nome,
        endereco: "ENDERECO_EXCLUSIVO_" + contexto.nome,
        latitude: id === contexto.semFoto ? "0" : String(-10 - indice),
        longitude: id === contexto.semFoto ? "0" : String(-40 - indice), status: "ATIVO" });
    }
    for (let foto = 1; foto <= 2; foto++) {
      estado.evidencias.push({ id_evidencia: contexto.local * 10 + foto, id_local: contexto.local,
        tipo: "FOTO", descricao: "EVIDENCIA_EXCLUSIVA_" + contexto.nome + "_" + foto,
        latitude: String(-20 - indice - foto / 10), longitude: String(-50 - indice - foto / 10),
        origem_coordenadas: "GPS", precisao_gps: String(3 + indice + foto / 10) });
    }
  }
  function juntar(ambiente, idUsuario) {
    const rows = [];
    for (const local of estado.locais) {
      const campanha = estado.campanhas.find((c) => c.id_campanha === local.id_campanha);
      if (!campanha || (ambiente !== undefined && campanha.id_ambiente !== ambiente)) continue;
      if (idUsuario !== undefined) {
        const u = estado.usuarios.get(idUsuario);
        if (!u?.ativo || !estado.ambientes.get(u.id_ambiente) || u.id_ambiente !== campanha.id_ambiente ||
          (u.perfil_acesso !== "ADMINISTRADOR" && campanha.id_usuario !== u.id_usuario)) continue;
      }
      const evidencias = estado.evidencias.filter((e) => e.id_local === local.id_local);
      // LEFT JOIN: um local autorizado sem evidência ainda produz uma linha.
      for (const evidencia of evidencias.length ? evidencias : [null]) {
        rows.push({ nome_campanha: campanha.nome_campanha, id_local: local.id_local,
          nome_local: local.nome_local, setor: local.setor, endereco: local.endereco,
          latitude_local: local.latitude, longitude_local: local.longitude, status: local.status,
          id_evidencia: evidencia?.id_evidencia ?? null, tipo_evidencia: evidencia?.tipo ?? null,
          descricao_evidencia: evidencia?.descricao ?? null, latitude_foto: evidencia?.latitude ?? null,
          longitude_foto: evidencia?.longitude ?? null, origem_coordenadas: evidencia?.origem_coordenadas ?? null,
          precisao_gps: evidencia?.precisao_gps ?? null });
      }
    }
    return rows.sort((a, b) => a.nome_campanha.localeCompare(b.nome_campanha) ||
      a.nome_local.localeCompare(b.nome_local) || (a.id_evidencia ?? 0) - (b.id_evidencia ?? 0));
  }
  const pool = {
    async query(texto, params = []) {
      const sql = texto.replace(/\s+/g, " ").trim();
      estado.consultas.push({ sql, params: [...params] });
      if (/^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql)) {
        estado.escritas.push(sql);
        throw new Error("Escrita proibida no teste de exportação");
      }
      if (sql === SQL_IDENTIDADE) {
        assert.equal(params.length, 1);
        estado.identidades.push(params[0]);
        if (estado.erroIdentidade) throw estado.erroIdentidade;
        const usuario = estado.usuarios.get(params[0]);
        const rows = usuario?.ativo === true && estado.ambientes.get(usuario.id_ambiente) === true
          ? [{ id_usuario: usuario.id_usuario, id_ambiente: usuario.id_ambiente,
            perfil_acesso: usuario.perfil_acesso, nome: "Pessoa simulada", email: "pessoa@example.invalid" }] : [];
        return { rows, rowCount: rows.length };
      }
      if (sql === SQL_GLOBAL || sql === SQL_AMBIENTE) {
        const global = sql === SQL_GLOBAL;
        if (global) {
          assert.deepEqual(params, []);
          estado.globais.push(sql);
        } else {
          assert.equal(params.length, 2);
          assert.ok([A, B].includes(params[0]));
          assert.ok(estado.usuarios.has(params[1]));
        }
        estado.exportacoes.push({ sql, params: [...params], global });
        if (estado.erroExportacao) throw estado.erroExportacao;
        // GLOBAL retorna realmente os dois ambientes. O mock não filtra usando
        // token, req.usuario ou o ambiente esperado pelo caso de teste.
        if (estado.antesExportar) estado.antesExportar();
        const rows = juntar(global ? undefined : params[0], global ? undefined : params[1]);
        return { rows, rowCount: rows.length };
      }
      estado.inesperadas.push(sql);
      throw new Error("SQL desconhecido no simulador de exportação");
    },
    connect() { estado.conexoes++; throw new Error("Conexão real ou transacional proibida"); },
  };
  // Uma falha de asserção do mock não pode ser confundida com a exceção
  // técnica proposital quando o middleware/controller a converte em HTTP 500.
  const consultarSimulado = pool.query;
  pool.query = async (...args) => {
    try { return await consultarSimulado(...args); }
    catch (erro) {
      if (erro?.code === "ERR_ASSERTION") estado.falhasSimulador.push(erro);
      throw erro;
    }
  };
  const externo = (nome) => new Proxy(Object.create(null), { get(_alvo, propriedade) {
    estado.externas.push(nome + "." + String(propriedade));
    throw new Error("Operação fora do escopo da exportação");
  } });
  const tokens = new Map();
  for (const contexto of CONTEXTOS) {
    for (const [papel, id] of [["admin", contexto.admin], ["engenheiro", contexto.engenheiro]]) {
      // Claims deliberadamente desatualizadas: só o banco pode definir ambiente
      // e perfil atuais. Engenheiros também têm permissão legítima de exportar.
      tokens.set(papel + "-" + contexto.nome, { sub: String(id), perfil: "ADMINISTRADOR", id_ambiente: contexto.outro });
    }
  }
  const jwt = { verify(token, segredo, opcoes) {
    assert.equal(segredo, SEGREDO);
    assert.deepEqual(opcoes.algorithms, ["HS256"]);
    if (!tokens.has(token)) throw Object.assign(new Error("Token inválido simulado"), { name: "JsonWebTokenError" });
    return { ...tokens.get(token) };
  } };
  for (const nome of ["error", "warn", "info", "log"]) {
    t.mock.method(console, nome, (...args) => estado.logs.push(args));
  }
  const cache = new Map(Object.values(CAMINHOS).map((p) => [p, require.cache[p]]));
  const load = Module._load;
  const segredoAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SEGREDO;
  const dependencias = new Map();
  const modulos = {};
  t.after(() => {
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
    assert.strictEqual(Module._load, load);
    for (const [p, anterior] of cache) assert.strictEqual(require.cache[p], anterior);
    assert.deepEqual(estado.proibidas, []);
    assert.deepEqual(estado.inesperadas, [], "SQL desconhecido não pode parecer recusa esperada");
    assert.deepEqual(estado.falhasSimulador, [], "Asserções do simulador não são falhas técnicas esperadas");
    assert.deepEqual(estado.externas, []);
    assert.deepEqual(estado.escritas, []);
    assert.equal(estado.conexoes, 0);
  });
  try {
    for (const p of cache.keys()) delete require.cache[p];
    Module._load = function (request, parent, ...resto) {
      if (cache.has(parent?.filename)) {
        const permitidas = dependencias.get(parent.filename);
        if (!permitidas?.has(request)) {
          estado.proibidas.push(request);
          throw new Error("Dependência real proibida no teste de exportação");
        }
        return permitidas.get(request);
      }
      return load.call(this, request, parent, ...resto);
    };
    dependencias.set(CAMINHOS.usuarioRepository, new Map([
      ["../config/database", pool], ["./emailLockRepository", externo("emailLock")],
      ["./conviteRepository", externo("convite")],
    ]));
    modulos.usuarioRepository = require(CAMINHOS.usuarioRepository);
    dependencias.set(CAMINHOS.localRepository, new Map([["../config/database", pool]]));
    modulos.localRepository = require(CAMINHOS.localRepository);
    dependencias.set(CAMINHOS.excel, new Map([["exceljs", ExcelJS], ["../repositories/localRepository", modulos.localRepository]]));
    modulos.excel = require(CAMINHOS.excel);
    dependencias.set(CAMINHOS.controller, new Map([
      ["../services/localMultiTenantService", externo("localService não usado na exportação legada")],
      ["../services/excelService", modulos.excel],
    ]));
    modulos.controller = require(CAMINHOS.controller);
    dependencias.set(CAMINHOS.autenticacao, new Map([["jsonwebtoken", jwt], ["../repositories/usuarioRepository", modulos.usuarioRepository]]));
    modulos.autenticacao = require(CAMINHOS.autenticacao);
    dependencias.set(CAMINHOS.router, new Map([
      ["express", express], ["../controllers/localController", modulos.controller],
      ["../middlewares/autenticacaoMiddleware", modulos.autenticacao],
    ]));
    modulos.router = require(CAMINHOS.router);
  } finally {
    Module._load = load;
    for (const [p, anterior] of cache) {
      if (anterior) require.cache[p] = anterior;
      else delete require.cache[p];
    }
  }
  async function exportar(token = "admin-A", forjados = {}) {
    const req = { method: "GET", url: "/exportar", originalUrl: "/api/locais/exportar",
      baseUrl: "/api/locais", headers: token === null ? {} : { authorization: "Bearer " + token },
      body: forjados.body || {}, query: forjados.query || {}, params: forjados.params || {}, usuario: forjados.usuario };
    let concluir;
    let rejeitar;
    const fim = new Promise((resolve, reject) => { concluir = resolve; rejeitar = reject; });
    const res = { statusCode: 200, headersSent: false, body: undefined, headers: new Map() };
    res.status = t.mock.fn((codigo) => { res.statusCode = codigo; return res; });
    res.setHeader = t.mock.fn((nome, valor) => { res.headers.set(nome.toLowerCase(), valor); return res; });
    res.send = t.mock.fn((buffer) => { res.body = buffer; res.headersSent = true; concluir(); return res; });
    res.json = t.mock.fn((body) => { res.body = body; res.headersSent = true; concluir(); return res; });
    let temporizador;
    try {
      const prazo = new Promise((_resolve, reject) => {
        temporizador = setTimeout(() => reject(new Error("Exportação simulada não concluiu")), 10000);
      });
      modulos.router.handle(req, res, (erro) => rejeitar(erro || new Error("Rota de exportação não atendida")));
      await Promise.race([fim, prazo]);
    } finally { clearTimeout(temporizador); }
    assert.equal(res.status.mock.callCount(), 1);
    assert.equal(res.send.mock.callCount() + res.json.mock.callCount(), 1);
    return { req, res };
  }
  return { estado, exportar, juntar };
}

async function abrir(res) {
  assert.equal(res.statusCode, 200);
  assert.equal(res.json.mock.callCount(), 0);
  assert.ok(Buffer.isBuffer(res.body));
  assert.equal(res.body.subarray(0, 2).toString("ascii"), "PK");
  assert.equal(res.headers.get("content-type"), TIPO);
  assert.equal(res.headers.get("content-disposition"), 'attachment; filename="inventario-locais.xlsx"');
  assert.equal(res.headers.get("content-length"), res.body.length);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(res.body);
  assert.equal(workbook.worksheets.length, 1);
  const worksheet = workbook.getWorksheet("Locais");
  assert.ok(worksheet);
  assert.equal(worksheet.columnCount, 12);
  assert.deepEqual(linha(worksheet, 1), CABECALHOS);
  return worksheet;
}
function linha(worksheet, numero) {
  // ExcelJS pode representar uma célula vazia como null ou texto vazio.
  // Ambos são vazios na planilha; números zero permanecem números zero.
  return Array.from({ length: 12 }, (_, i) => worksheet.getRow(numero).getCell(i + 1).value ?? "");
}
function linhas(worksheet) {
  return Array.from({ length: worksheet.rowCount - 1 }, (_, i) => linha(worksheet, i + 2));
}
function esperado(registros) {
  let localAnterior;
  let foto = 0;
  const numero = (valor) => valor == null ? "" : Number(valor);
  return registros.map((r) => {
    if (r.id_local !== localAnterior) { localAnterior = r.id_local; foto = 0; }
    return [r.nome_campanha, r.nome_local, r.setor || "", r.endereco || "",
      numero(r.latitude_local), numero(r.longitude_local), r.status,
      r.id_evidencia ? ++foto : "", numero(r.latitude_foto), numero(r.longitude_foto),
      r.origem_coordenadas || "", numero(r.precisao_gps)];
  });
}
async function verificarIsolamento(ctx, contexto, resposta) {
  const worksheet = await abrir(resposta.res);
  // Resultados completos: também detecta fotos estrangeiras anexadas a locais
  // autorizados, linhas extras, dados omitidos e coordenadas trocadas.
  assert.deepEqual(linhas(worksheet), esperado(ctx.juntar(contexto.ambiente)));
  const outroNome = contexto.nome === "A" ? "B" : "A";
  worksheet.eachRow((row) => row.eachCell((cell) => {
    const texto = JSON.stringify(cell.value);
    for (const marcador of ["CAMPANHA_EXCLUSIVA_", "LOCAL_", "SETOR_EXCLUSIVO_", "ENDERECO_EXCLUSIVO_"]) {
      assert.equal(texto.includes(marcador + outroNome), false);
    }
  }));
  assert.equal(ctx.estado.globais.length, 0, "SELECT global não é uma exportação isolada");
  assert.deepEqual(ctx.estado.exportacoes.at(-1).params, [contexto.ambiente, resposta.req.usuario.id_usuario]);
  assert.equal(resposta.req.usuario.id_ambiente, contexto.ambiente);
  return worksheet;
}
function verificarErro(res, codigo) {
  assert.equal(res.statusCode, codigo);
  assert.equal(res.send.mock.callCount(), 0, "Erro não pode enviar XLSX parcial");
  assert.equal(res.json.mock.callCount(), 1);
  assert.deepEqual(Object.keys(res.body).sort(), ["message", "status"]);
  assert.equal(res.body.status, "error");
  assert.equal(typeof res.body.message, "string");
  assert.equal(JSON.stringify(res.body).includes(SENSIVEL), false);
  assert.equal(res.headers.has("content-disposition"), false);
  assert.equal(res.headers.has("content-length"), false);
}

for (const contexto of CONTEXTOS) {
  for (const papel of ["admin", "engenheiro"]) {
    test("Exportação " + contexto.nome + ": " + papel + " recebe somente campanhas, locais e fotos do próprio ambiente", async (t) => {
      const ctx = preparar(t);
      await verificarIsolamento(ctx, contexto, await ctx.exportar(papel + "-" + contexto.nome));
    });
  }
  test("Exportação " + contexto.nome + ": preserva local autorizado sem evidências", async (t) => {
    const ctx = preparar(t);
    const worksheet = await verificarIsolamento(ctx, contexto, await ctx.exportar("admin-" + contexto.nome));
    const semFoto = linhas(worksheet).filter((r) => r[1] === "LOCAL_" + contexto.nome + "_SEM_FOTOS");
    assert.equal(semFoto.length, 1);
    assert.deepEqual(semFoto[0].slice(7), ["", "", "", "", ""]);
    assert.equal(semFoto[0][4], 0);
    assert.equal(semFoto[0][5], 0);
  });
  for (const fonte of ["body", "query", "params"]) {
    test("Exportação " + contexto.nome + ": identidade forjada em " + fonte + " não troca ambiente", async (t) => {
      const ctx = preparar(t);
      const forjada = { id_usuario: 999, id_ambiente: contexto.outro, perfil_acesso: "ADMINISTRADOR" };
      await verificarIsolamento(ctx, contexto, await ctx.exportar("admin-" + contexto.nome, {
        [fonte]: { ...forjada, usuario: forjada }, usuario: forjada,
      }));
    });
  }
  test("Exportação " + contexto.nome + ": revalida identidade e ignora perfil/ambiente desatualizados do JWT", async (t) => {
    const ctx = preparar(t);
    const resposta = await ctx.exportar("engenheiro-" + contexto.nome);
    assert.deepEqual(ctx.estado.identidades, [contexto.engenheiro]);
    assert.equal(resposta.req.usuario.perfil_acesso, "ENGENHEIRO_SEGURANCA");
    await verificarIsolamento(ctx, contexto, resposta);
  });
  test("Exportação " + contexto.nome + ": ambiente sem locais gera somente cabeçalho, sem aproveitar o outro ambiente", async (t) => {
    const ctx = preparar(t);
    const campanha = ctx.estado.campanhas.find((c) => c.id_ambiente === contexto.ambiente);
    ctx.estado.locais = ctx.estado.locais.filter((l) => l.id_campanha !== campanha.id_campanha);
    assert.ok(ctx.juntar(contexto.outro).length > 0);
    const worksheet = await verificarIsolamento(ctx, contexto, await ctx.exportar("admin-" + contexto.nome));
    assert.equal(worksheet.rowCount, 1);
  });
  for (const alvo of ["usuário", "ambiente"]) {
    test("Exportação " + contexto.nome + ": " + alvo + " inativo recebe 401 sem consultar exportação", async (t) => {
      const ctx = preparar(t);
      if (alvo === "usuário") ctx.estado.usuarios.get(contexto.admin).ativo = false;
      else ctx.estado.ambientes.set(contexto.ambiente, false);
      const { res } = await ctx.exportar("admin-" + contexto.nome);
      verificarErro(res, 401);
      assert.deepEqual(ctx.estado.identidades, [contexto.admin]);
      assert.equal(ctx.estado.exportacoes.length, 0);
    });
  }
  for (const etapa of ["identidade", "exportação"]) {
    test("Exportação " + contexto.nome + ": falha técnica de " + etapa + " retorna 500 seguro sem arquivo", async (t) => {
      const ctx = preparar(t);
      const erro = Object.assign(new Error(SENSIVEL), { code: "XX000", query: SENSIVEL, detail: SENSIVEL });
      if (etapa === "identidade") ctx.estado.erroIdentidade = erro;
      else ctx.estado.erroExportacao = erro;
      const { res } = await ctx.exportar("admin-" + contexto.nome);
      verificarErro(res, 500);
      if (etapa === "identidade") {
        assert.deepEqual(ctx.estado.identidades, [contexto.admin]);
        assert.equal(ctx.estado.exportacoes.length, 0);
      } else {
        assert.equal(ctx.estado.exportacoes.length, 1);
        assert.equal(res.body.message, "Erro interno ao exportar locais para Excel.");
      }
    });
  }
}

for (const [nome, token] of [["JWT ausente", null], ["JWT inválido", "invalido"]]) {
  test("Exportação: " + nome + " recebe 401 sem qualquer consulta", async (t) => {
    const ctx = preparar(t);
    const { res } = await ctx.exportar(token, { usuario: { id_usuario: 11, id_ambiente: A, perfil_acesso: "ADMINISTRADOR" } });
    verificarErro(res, 401);
    assert.equal(ctx.estado.consultas.length, 0);
  });
}

test("Contrato: buffer XLSX reabre com nome e cabeçalhos HTTP legados", async (t) => {
  const ctx = preparar(t);
  const { res } = await ctx.exportar();
  await abrir(res);
  assert.equal(res.setHeader.mock.callCount(), 3);
});

test("Contrato: mantém colunas, autofiltro, congelamento, larguras e formatos numéricos", async (t) => {
  const ctx = preparar(t);
  const worksheet = await abrir((await ctx.exportar()).res);
  assert.equal(worksheet.autoFilter, "A1:L1");
  assert.equal(worksheet.views[0].state, "frozen");
  assert.equal(worksheet.views[0].ySplit, 1);
  assert.deepEqual(worksheet.columns.map((c) => c.width), [28, 28, 22, 38, 20, 20, 14, 12, 20, 20, 15, 15]);
  for (const coluna of [5, 6, 9, 10]) assert.equal(worksheet.getColumn(coluna).numFmt, "0.0000000");
  assert.equal(worksheet.getColumn(12).numFmt, '0.00 "m"');
  assert.equal(worksheet.getRow(1).font.bold, true);
});

test("Contrato: valores GPS e numeração das fotos permanecem numéricos", async (t) => {
  const ctx = preparar(t);
  const worksheet = await abrir((await ctx.exportar()).res);
  const fotos = linhas(worksheet).filter((r) => r[1] === "LOCAL_A_COM_FOTOS");
  assert.deepEqual(fotos.map((r) => r.slice(7)), [[1, -20.1, -50.1, "GPS", 3.1], [2, -20.2, -50.2, "GPS", 3.2]]);
});

test("Exportação: erro ao gerar XLSX retorna 500 genérico sem enviar buffer parcial", async (t) => {
  const ctx = preparar(t);
  const prototipo = Object.getPrototypeOf(new ExcelJS.Workbook().xlsx);
  const gerar = t.mock.method(prototipo, "writeBuffer", async () => { throw new Error(SENSIVEL); });
  const { res } = await ctx.exportar();
  verificarErro(res, 500);
  assert.equal(res.body.message, "Erro interno ao exportar locais para Excel.");
  assert.equal(gerar.mock.callCount(), 1);
});

test("Exportação: chamadas A, B e A não misturam resultados entre requisições", async (t) => {
  const ctx = preparar(t);
  for (const contexto of [CONTEXTOS[0], CONTEXTOS[1], CONTEXTOS[0]]) {
    await verificarIsolamento(ctx, contexto, await ctx.exportar("admin-" + contexto.nome));
  }
  assert.deepEqual(ctx.estado.identidades, [11, 21, 11]);
  assert.deepEqual(ctx.estado.exportacoes.map((c) => c.params), [[A, 11], [B, 21], [A, 11]]);
});

test("Exportação: consulta efetivamente produzida exige filtro parametrizado do ambiente autenticado", async (t) => {
  const ctx = preparar(t);
  const resposta = await ctx.exportar("admin-A");
  assert.equal(ctx.estado.globais.length, 0, "Consulta global não é aceita como segura");
  assert.equal(ctx.estado.exportacoes.length, 1);
  assert.equal(ctx.estado.exportacoes[0].sql, SQL_AMBIENTE);
  assert.deepEqual(ctx.estado.exportacoes[0].params, [A, 11]);
  await verificarIsolamento(ctx, CONTEXTOS[0], resposta);
});

for (const contexto of CONTEXTOS) {
  test("Excel " + contexto.nome + ": engenheiro não recebe locais de outra campanha do mesmo ambiente", async (t) => {
    const ctx = preparar(t);
    const idCampanha = contexto.local + 500;
    ctx.estado.campanhas.push({ id_campanha: idCampanha, id_ambiente: contexto.ambiente, id_usuario: 999, nome_campanha: "CAMPANHA_NAO_AUTORIZADA" });
    ctx.estado.locais.push({ id_local: idCampanha, id_campanha: idCampanha, nome_local: "LOCAL_NAO_AUTORIZADO", status: "ATIVO" });
    ctx.estado.evidencias.push({ id_local: idCampanha, id_evidencia: 999, descricao: "EVIDENCIA_NAO_AUTORIZADA", latitude: 88 });
    const resposta = await ctx.exportar("engenheiro-" + contexto.nome);
    const worksheet = await abrir(resposta.res);
    assert.deepEqual(linhas(worksheet), esperado(ctx.juntar(contexto.ambiente, contexto.engenheiro)));
    assert.equal(worksheet.rowCount, 4);
    assert.equal(JSON.stringify(linhas(worksheet)).includes("NAO_AUTORIZAD"), false);
    const admin = await abrir((await ctx.exportar("admin-" + contexto.nome)).res);
    assert.equal(admin.rowCount, 5);
    assert.equal(JSON.stringify(linhas(admin)).includes("LOCAL_NAO_AUTORIZADO"), true);
  });
  test("Excel " + contexto.nome + ": revogação da responsabilidade é revalidada na consulta", async (t) => {
    const ctx = preparar(t);
    ctx.estado.antesExportar = () => { ctx.estado.campanhas.find(c => c.id_ambiente === contexto.ambiente).id_usuario = 999; };
    const worksheet = await abrir((await ctx.exportar("engenheiro-" + contexto.nome)).res);
    assert.equal(worksheet.rowCount, 1);
    assert.deepEqual(linhas(worksheet), []);
  });
  test("Excel " + contexto.nome + ": perfil administrativo revogado não exporta campanha alheia", async (t) => {
    const ctx = preparar(t);
    ctx.estado.antesExportar = () => { ctx.estado.usuarios.get(contexto.admin).perfil_acesso = "ENGENHEIRO_SEGURANCA"; };
    const worksheet = await abrir((await ctx.exportar("admin-" + contexto.nome)).res);
    assert.equal(worksheet.rowCount, 1);
  });
  test("Excel " + contexto.nome + ": corpo e query não restauram responsabilidade revogada", async (t) => {
    const ctx = preparar(t);
    ctx.estado.campanhas.find(c => c.id_ambiente === contexto.ambiente).id_usuario = 999;
    const forjado = { id_usuario: contexto.admin, id_ambiente: contexto.ambiente, perfil_acesso: "ADMINISTRADOR" };
    const resposta = await ctx.exportar("engenheiro-" + contexto.nome, { body: forjado, query: forjado, params: forjado, usuario: forjado });
    const worksheet = await abrir(resposta.res);
    assert.equal(worksheet.rowCount, 1);
    assert.equal(resposta.req.usuario.id_usuario, contexto.engenheiro);
  });
  test("Excel " + contexto.nome + ": local sem evidências exige responsabilidade igualmente", async (t) => {
    const ctx = preparar(t);
    ctx.estado.evidencias = [];
    const worksheet = await abrir((await ctx.exportar("engenheiro-" + contexto.nome)).res);
    assert.equal(worksheet.rowCount, 3);
    assert.ok(linhas(worksheet).every(l => l.slice(7).every(v => v === "")));
  });
}

// Limitações: junções são simuladas com tabelas independentes em memória;
// não validam constraints, RLS, triggers, concorrência ou execução PostgreSQL.
// O XLSX é real e só usa buffers. JWT criptográfico é mock. localService e
// operações alheias à exportação são bloqueados. app.js e arquivos físicos
// não são carregados. A montagem principal foi confirmada na auditoria estática.
// Futuras importações multi-tenant ou SQLs diferentes exigirão adaptação
// explícita do simulador, preservando as asserções sobre o conteúdo do arquivo.
