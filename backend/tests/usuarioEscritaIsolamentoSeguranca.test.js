const politicaRbac723 = require('../src/utils/permissoes');
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");

const CAMINHOS = Object.fromEntries(Object.entries({
  repository: "../src/repositories/usuarioRepository",
  service: "../src/services/usuarioService",
  controller: "../src/controllers/usuarioController",
  autenticacao: "../src/middlewares/autenticacaoMiddleware",
  autorizacao: "../src/middlewares/autorizacaoMiddleware",
  router: "../src/routes/usuarioRoutes",
}).map(([nome, caminho]) => [nome, require.resolve(caminho)]));
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const SEGREDO = "SEGREDO_FICTICIO_EXCLUSIVO_DO_TESTE";
const SENSIVEL = "SQL_STACK_TOKEN_CREDENCIAL_FICTICIOS_NAO_PUBLICAR";
const COLUNAS = "id_usuario, nome, email, perfil_acesso, eh_fundador, id_convite_origem, ativo, data_criacao, data_atualizacao";
const SQL_IDENTIDADE = "SELECT u.id_usuario, u.id_ambiente, u.nome, u.email, u.perfil_acesso, u.eh_fundador FROM usuario AS u INNER JOIN ambiente AS a ON a.id_ambiente = u.id_ambiente WHERE u.id_usuario = $1 AND u.ativo = TRUE AND a.ativo = TRUE LIMIT 1";
const CONTEXTOS = [
  { nome: "A", ambiente: A, outro: B, admin: 11, alvo: 101, externo: 202, token: "admin-a" },
  { nome: "B", ambiente: B, outro: A, admin: 22, alvo: 202, externo: 101, token: "admin-b" },
];
const OPERACOES = [
  { metodo: "PUT", mensagem: "Usuário atualizado com sucesso.", interno: "Erro interno ao atualizar usuário." },
  { metodo: "PATCH", mensagem: "Usuário desativado com sucesso.", interno: "Erro interno ao alterar status do usuário." },
];
function publico(usuario) {
  return Object.fromEntries(COLUNAS.split(", ").map((campo) => [campo, usuario[campo]]));
}
function tecnico() { return Object.assign(new Error(SENSIVEL), { code: "XX000" }); }

function preparar(t) {
  const usuarios = [
    [11, A, "ADMINISTRADOR"], [22, B, "ADMINISTRADOR"],
    [33, A, "ENGENHEIRO_SEGURANCA"], [101, A, "ENGENHEIRO_SEGURANCA"], [202, B, "ENGENHEIRO_SEGURANCA"],
  ].map(([id_usuario, id_ambiente, perfil_acesso]) => ({
    id_usuario, id_ambiente, perfil_acesso, eh_fundador: perfil_acesso === "ADMINISTRADOR", id_convite_origem: null, ativo: true, nome: "Usuário " + id_usuario,
    email: "usuario" + id_usuario + "@example.invalid",
    data_criacao: "2026-01-01T00:00:00.000Z", data_atualizacao: "2026-01-01T00:00:00.000Z",
  }));
  const ambientes = new Map([[A, { ativo: true }], [B, { ativo: true }]]);
  const estado = {
    usuarios, ambientes, consultas: [], updates: [], identidades: [], inesperadas: [],
    erroIdentidade: null, erroBusca: null, erroUpdate: null, logs: [], conexoes: 0,
    revogarAoLerAlvo: null, revogada: false, sequencia: [],
    transacoes: [], convitesPendentes: new Set(), consultasConvites: [],
    erroRollback: null, requisicao: null, falhasSimulador: [], revogacoes: [],
  };
  const usuario = (id) => usuarios.find((u) => u.id_usuario === id);
  const alvos = () => usuarios.filter((u) => u.id_usuario === 101 || u.id_usuario === 202).map((u) => ({ ...u }));
  for (const nome of ["error", "warn", "log", "info"]) {
    t.mock.method(console, nome, (...args) => estado.logs.push(args));
  }
  const tokens = new Map([
    ["admin-a", { sub: "11", perfil: "ADMINISTRADOR" }],
    ["admin-b", { sub: "22", perfil: "ADMINISTRADOR" }],
    ["engenheiro-a", { sub: "33", perfil: "ENGENHEIRO_SEGURANCA" }],
  ]);
  const jwt = { verify(token, segredo, opcoes) {
    assert.equal(segredo, SEGREDO);
    assert.deepEqual(opcoes.algorithms, ["HS256"]);
    if (!tokens.has(token)) throw Object.assign(new Error("Token inválido simulado"), { name: "JsonWebTokenError" });
    estado.sequencia.push("JWT");
    return { ...tokens.get(token) };
  } };
  const pool = {
    async query(texto, params = [], transacao = null) {
      const sql = texto.replace(/\s+/g, " ").trim();
      estado.consultas.push({ sql, params: [...params], transacional: transacao !== null });
      const resultado = (rows) => ({ rows, rowCount: rows.length });
      if (transacao) {
        assert.equal(transacao.liberacoes.length, 0, "Cliente liberado não pode consultar");
        transacao.comandos.push(sql);
        if (sql === "BEGIN") {
          assert.deepEqual(params, []);
          assert.equal(transacao.comandos.length, 1);
          transacao.ativa = true;
          transacao.antes = usuarios.map((u) => ({ ...u }));
          return resultado([]);
        }
        assert.equal(transacao.ativa, true, "Consulta exige BEGIN e transação aberta");
        if (sql === "COMMIT") {
          assert.deepEqual(params, []);
          assert.equal(transacao.autorizada, true);
          assert.equal(transacao.escritas, 1);
          assert.equal(transacao.falhou, false);
          transacao.commit = true;
          transacao.ativa = false;
          return resultado([]);
        }
        if (sql === "ROLLBACK") {
          assert.deepEqual(params, []);
          transacao.rollback = true;
          if (estado.erroRollback) {
            transacao.falhaRollback = true;
            throw estado.erroRollback;
          }
          for (const anterior of transacao.antes) Object.assign(usuario(anterior.id_usuario), anterior);
          transacao.ativa = false;
          return resultado([]);
        }
      }
      // Toda tentativa é registrada antes de reconhecer ou executar a escrita.
      let tentativa;
      if (/^UPDATE\b/i.test(sql)) {
        tentativa = { sql, params: [...params], global: false };
        estado.updates.push(tentativa);
        estado.sequencia.push("UPDATE");
      }
      if (sql === SQL_IDENTIDADE) {
        assert.equal(transacao, null);
        assert.equal(params.length, 1);
        estado.identidades.push(params[0]);
        estado.sequencia.push("IDENTIDADE");
        if (estado.erroIdentidade) throw estado.erroIdentidade;
        const atual = usuario(params[0]);
        const rows = atual?.ativo === true && ambientes.get(atual.id_ambiente)?.ativo === true
          ? [{ id_usuario: atual.id_usuario, id_ambiente: atual.id_ambiente,
            nome: atual.nome, email: atual.email, eh_fundador: atual.eh_fundador, perfil_acesso: atual.perfil_acesso }] : [];
        return { rows, rowCount: rows.length };
      }
      const sqlEmailLock = "SELECT pg_advisory_xact_lock( hashtextextended($1::text, 0) )";
      const sqlAmbiente = "SELECT id_ambiente FROM ambiente WHERE id_ambiente = $1 AND ativo = TRUE FOR SHARE";
      const sqlUsuarios = "SELECT id_usuario, id_ambiente, perfil_acesso, eh_fundador, id_convite_origem, ativo, email FROM usuario WHERE id_usuario = $1 OR (id_usuario = $2 AND id_ambiente = $3) ORDER BY id_usuario FOR UPDATE";
      const sqlEmail = "SELECT 1 FROM usuario WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1)) AND id_usuario <> $2 LIMIT 1";
      const autorizacao = "AND EXISTS ( SELECT 1 FROM usuario AS administrador INNER JOIN ambiente AS a ON a.id_ambiente = administrador.id_ambiente WHERE administrador.id_usuario = $3 AND administrador.id_ambiente = $2 AND administrador.ativo = TRUE AND administrador.perfil_acesso = 'ADMINISTRADOR' AND administrador.eh_fundador = TRUE AND a.ativo = TRUE )";
      const retorno = COLUNAS.split(", ").map((c) => "alvo." + c).join(", ");
      const filtro = "WHERE alvo.id_usuario = $1 AND alvo.id_ambiente = $2 " + autorizacao + " RETURNING " + retorno;
      const sqlPutAmbiente = "UPDATE usuario AS alvo SET nome = $4, email = $5, perfil_acesso = $6, data_atualizacao = CURRENT_TIMESTAMP " + filtro;
      const sqlPatchAmbiente = "UPDATE usuario AS alvo SET ativo = $4, data_atualizacao = CURRENT_TIMESTAMP " + filtro;
      if ([sqlEmailLock, sqlAmbiente, sqlUsuarios, sqlEmail, sqlPutAmbiente, sqlPatchAmbiente].includes(sql)) {
        assert.ok(transacao, "Operação protegida exige o mesmo cliente transacional");
        const { req, id, metodo } = transacao.requisicao;
        const identidade = req.usuario;
        if (sql === sqlEmailLock) {
          assert.equal(metodo, "PUT");
          assert.deepEqual(transacao.bloqueios, []);
          assert.deepEqual(params, [req.body.email.trim().toLowerCase()]);
          transacao.bloqueios.push("EMAIL");
          transacao.email = params[0];
          return resultado([]);
        }
        if (sql === sqlAmbiente) {
          assert.deepEqual(params, [identidade.id_ambiente]);
          assert.deepEqual(transacao.bloqueios, metodo === "PUT" ? ["EMAIL"] : []);
          const ativo = ambientes.get(params[0])?.ativo === true;
          if (ativo) transacao.bloqueios.push("AMBIENTE");
          return resultado(ativo ? [{ id_ambiente: params[0] }] : []);
        }
        if (sql === sqlUsuarios) {
          assert.deepEqual(params, [identidade.id_usuario, id, identidade.id_ambiente]);
          assert.equal(transacao.bloqueios.at(-1), "AMBIENTE");
          estado.sequencia.push("LEITURA_ALVO");
          if (estado.erroBusca) throw estado.erroBusca;
          const rows = usuarios.filter((u) => u.id_usuario === params[0] ||
            (u.id_usuario === params[1] && u.id_ambiente === params[2]))
            .sort((a, b) => a.id_usuario - b.id_usuario)
            .map((u) => ({ id_usuario: u.id_usuario, id_ambiente: u.id_ambiente,
              eh_fundador: u.eh_fundador, id_convite_origem: u.id_convite_origem, perfil_acesso: u.perfil_acesso, ativo: u.ativo, email: u.email }));
          transacao.usuariosBloqueados = rows.map((u) => u.id_usuario);
          transacao.bloqueios.push("USUARIOS");
          const administrador = rows.find((u) => u.id_usuario === params[0]);
          const alvo = rows.find((u) => u.id_usuario === params[1] && u.id_ambiente === params[2]);
          transacao.autorizada = !!(administrador?.ativo === true &&
            administrador.id_ambiente === params[2] && administrador.perfil_acesso === "ADMINISTRADOR" && alvo);
          return resultado(rows);
        }
        assert.equal(transacao.autorizada, true, "Nenhuma consulta posterior pode ignorar a recusa transacional");
        if (sql === sqlEmail) {
          assert.equal(metodo, "PUT");
          assert.deepEqual(params, [transacao.email, id]);
          estado.sequencia.push("EMAIL_GLOBAL");
          const existe = usuarios.some((u) => u.email.trim().toLowerCase() === params[0] && u.id_usuario !== params[1]);
          transacao.emailVerificado = true;
          return resultado(existe ? [{ "?column?": 1 }] : []);
        }
        assert.deepEqual(params, metodo === "PUT"
          ? [id, identidade.id_ambiente, identidade.id_usuario, req.body.nome.trim(), req.body.email.trim().toLowerCase(), req.body.perfil_acesso]
          : [id, identidade.id_ambiente, identidade.id_usuario, req.body.ativo]);
        assert.equal(sql, metodo === "PUT" ? sqlPutAmbiente : sqlPatchAmbiente);
        assert.ok(transacao.usuariosBloqueados.includes(id));
        assert.ok(transacao.usuariosBloqueados.includes(identidade.id_usuario));
        const administrador = usuario(params[2]);
        const alvo = usuario(params[0]);
        const autorizado = administrador?.ativo === true && administrador.id_ambiente === params[1] &&
          administrador.perfil_acesso === "ADMINISTRADOR" && ambientes.get(params[1])?.ativo === true &&
          alvo?.id_ambiente === params[1];
        assert.equal(autorizado, true, "A autorização também deve valer no próprio UPDATE");
        if (metodo === "PUT") {
          assert.equal(transacao.emailVerificado, true);
          if (alvo.email.trim().toLowerCase() !== params[4]) {
            assert.equal(transacao.conviteVerificado, true);
            assert.equal(estado.convitesPendentes.has(params[4]), false);
          }
          assert.equal(usuarios.some((u) => u.id_usuario !== id && u.email.trim().toLowerCase() === params[4]), false);
        }
        if (estado.erroUpdate) throw estado.erroUpdate;
        if (metodo === "PUT") Object.assign(alvo, { nome: params[3], email: params[4], perfil_acesso: params[5] });
        else alvo.ativo = params[3];
        transacao.escritas += 1;
        return resultado([publico(alvo)]);
      }
      if (sql === `SELECT ${COLUNAS} FROM usuario WHERE id_usuario = $1 LIMIT 1`) {
        assert.equal(params.length, 1);
        estado.sequencia.push("LEITURA_ALVO");
        if (estado.erroBusca) throw estado.erroBusca;
        const atual = usuario(params[0]);
        const rows = atual ? [publico(atual)] : [];
        // Ponto determinístico após obter o alvo e antes de entregar a leitura
        // ao serviço. Não altera o JWT: a permissão persistida é que é revogada.
        if (estado.revogarAoLerAlvo && !estado.revogada) {
          estado.revogarAoLerAlvo();
          estado.revogada = true;
          estado.sequencia.push("REVOGACAO");
        }
        return { rows, rowCount: rows.length };
      }
      if (sql === "SELECT id_usuario, nome, email, senha_hash, perfil_acesso, eh_fundador, id_convite_origem, ativo, data_criacao, data_atualizacao FROM usuario WHERE LOWER(email) = LOWER($1) LIMIT 1") {
        assert.equal(params.length, 1);
        assert.equal(typeof params[0], "string");
        estado.sequencia.push("EMAIL_GLOBAL");
        if (estado.erroBusca) throw estado.erroBusca;
        const atual = usuarios.find((u) => u.email.toLowerCase() === params[0].toLowerCase());
        const rows = atual ? [{ ...publico(atual), senha_hash: "HASH_FICTICIO_NUNCA_PUBLICO" }] : [];
        return { rows, rowCount: rows.length };
      }
      const sqlPut = `UPDATE usuario SET nome = $1, email = $2, perfil_acesso = $3, data_atualizacao = CURRENT_TIMESTAMP WHERE id_usuario = $4 RETURNING ${COLUNAS}`;
      const sqlPatch = `UPDATE usuario SET ativo = $1, data_atualizacao = CURRENT_TIMESTAMP WHERE id_usuario = $2 RETURNING ${COLUNAS}`;
      if (sql === sqlPut || sql === sqlPatch) {
        tentativa.global = true; // Não contém ambiente ou autorização do ator.
        assert.equal(params.length, sql === sqlPut ? 4 : 2);
        if (estado.erroUpdate) throw estado.erroUpdate;
        const atual = usuario(params[sql === sqlPut ? 3 : 1]);
        if (!atual) return { rows: [], rowCount: 0 };
        // Reproduz o defeito real: não inventa uma proteção que o SQL não tem.
        // As asserções detectam tanto a tentativa quanto a mutação indevida.
        if (sql === sqlPut) Object.assign(atual, { nome: params[0], email: params[1], perfil_acesso: params[2] });
        else atual.ativo = params[0];
        return { rows: [publico(atual)], rowCount: 1 };
      }
      estado.inesperadas.push(sql);
      throw new Error("SQL desconhecido no simulador de escrita");
    },
    async connect() {
      estado.conexoes += 1;
      assert.ok(estado.requisicao);
      // Compatibilidade do hook antigo: LEITURA_ALVO aqui é observação da
      // fixture, não uma consulta inventada. A revogação vence antes dos locks,
      // após a identidade inicial; não simulamos mudança numa linha bloqueada.
      if (estado.revogarAoLerAlvo && !estado.revogada) {
        assert.ok(estado.identidades.length > 0);
        const { req, id } = estado.requisicao;
        const alvoObservado = usuario(id);
        assert.ok(alvoObservado, "A fixture de revogação deve observar um alvo existente");
        const autorizadores = () => ({
          usuario: { ...usuario(req.usuario.id_usuario) },
          ambiente: { ...ambientes.get(req.usuario.id_ambiente) },
        });
        const antes = autorizadores();
        estado.sequencia.push("LEITURA_ALVO");
        estado.revogarAoLerAlvo();
        const depois = autorizadores();
        assert.notDeepEqual(depois, antes, "O hook deve realmente alterar o estado autorizador");
        estado.revogacoes.push({ alvo: publico(alvoObservado), antes, depois });
        estado.revogada = true;
        estado.sequencia.push("REVOGACAO");
      }
      const transacao = { requisicao: estado.requisicao, comandos: [], bloqueios: [],
        liberacoes: [], ativa: false, autorizada: false, escritas: 0,
        falhou: false, commit: false, rollback: false, falhaRollback: false };
      estado.transacoes.push(transacao);
      const client = {
        async query(sql, params = []) {
          try { return await pool.query(sql, params, transacao); }
          catch (erro) { transacao.falhou = true; throw erro; }
        },
        release(descartar) {
          assert.equal(transacao.liberacoes.length, 0, "Liberação deve ocorrer uma única vez");
          if (transacao.falhaRollback || transacao.ativa) assert.equal(descartar, true);
          transacao.liberacoes.push(descartar);
        },
      };
      transacao.client = client;
      return client;
    },
  };
  // Uma asserção do simulador não pode virar um HTTP 500 aparentemente válido
  // ao ser capturada pelo controller em um cenário de falha técnica.
  const consultarSimulado = pool.query;
  pool.query = async (...args) => {
    try { return await consultarSimulado(...args); }
    catch (erro) {
      if (erro?.code === "ERR_ASSERTION") estado.falhasSimulador.push(erro);
      throw erro;
    }
  };
  // Dependências substituídas antes do require: nenhum módulo de banco real
  // é carregado. A consulta interna de convites é representada pelo contrato
  // da dependência, sem alegar cobertura do SQL do conviteRepository.
  const emailLock = { async bloquearEmail(client, email) {
    await client.query("SELECT pg_advisory_xact_lock( hashtextextended($1::text, 0) )", [email]);
  } };
  const convite = { async existeConvitePendente(client, email) {
    const transacao = estado.transacoes.find((tx) => tx.client === client);
    assert.ok(transacao?.ativa);
    assert.equal(transacao.autorizada, true);
    assert.equal(transacao.emailVerificado, true);
    assert.equal(email, transacao.email);
    assert.deepEqual(transacao.bloqueios, ["EMAIL", "AMBIENTE", "USUARIOS"]);
    estado.consultasConvites.push({ email, client });
    transacao.conviteVerificado = true;
    return estado.convitesPendentes.has(email);
  } };
  const bcrypt = new Proxy({}, { get() { throw new Error("PUT/PATCH não devem executar bcrypt"); } });
  const cache = new Map(Object.values(CAMINHOS).map((p) => [p, require.cache[p]]));
  const carregar = Module._load;
  const anteriores = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SEGREDO;
  const dependencias = new Map();
  const proibidas = [];
  const modulos = {};
  t.after(() => {
    if (anteriores === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = anteriores;
    assert.strictEqual(Module._load, carregar);
    for (const [p, anterior] of cache) assert.strictEqual(require.cache[p], anterior);
    assert.deepEqual(proibidas, []);
    assert.deepEqual(estado.inesperadas, [], "SQL desconhecido não pode mascarar recusa ou falha técnica");
    assert.deepEqual(estado.falhasSimulador, [], "Falhas de asserção do simulador não são erros técnicos simulados");
    assert.equal(estado.conexoes, estado.transacoes.length);
    assert.equal(estado.revogacoes.length, estado.revogada ? 1 : 0);
    for (const tx of estado.transacoes) {
      assert.equal(tx.liberacoes.length, 1);
      assert.equal(tx.comandos[0], "BEGIN");
      assert.equal(tx.commit && tx.rollback, false);
      if (tx.falhaRollback) {
        assert.equal(tx.commit, false);
        assert.deepEqual(tx.liberacoes, [true], "Rollback falho exige descarte");
      } else {
        assert.equal(tx.ativa, false);
        assert.ok(tx.commit || tx.rollback);
        assert.deepEqual(tx.liberacoes, [undefined]);
      }
    }
  });
  try {
    for (const p of cache.keys()) delete require.cache[p];
    Module._load = function (request, parent, ...resto) {
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (request === '../utils/permissoes') return politicaRbac723;
      if (['../controllers/usuarioPermissoesController', '../controllers/auditoriaExportacaoController'].includes(request)) return new Proxy({}, { get(_t,k) { return () => { estado.inesperadas.push('permissoes.'+String(k)); throw new Error('Operacao fora do escopo deste teste'); }; } });
      // Utilitario puro real, restrito aos tres consumidores autorizados.
      if (request === '../utils/normalizarIdDominio' && ['middlewares/autenticacaoMiddleware', 'services/authService', 'services/relatorioMultiTenantService'].some(p => parent?.filename === require.resolve('../src/' + p))) return require('../src/utils/normalizarIdDominio');
      if (cache.has(parent?.filename)) {
        const permitidas = dependencias.get(parent.filename);
        if (!permitidas?.has(request)) {
          proibidas.push(request);
          throw new Error("Dependência real proibida: " + request);
        }
        return permitidas.get(request);
      }
      return carregar.call(this, request, parent, ...resto);
    };
    dependencias.set(CAMINHOS.repository, new Map([
      ["../config/database", pool], ["./emailLockRepository", emailLock], ["./conviteRepository", convite],
    ]));
    modulos.repository = require(CAMINHOS.repository);
    dependencias.set(CAMINHOS.service, new Map([["bcryptjs", bcrypt], ["../repositories/usuarioRepository", modulos.repository]]));
    modulos.service = require(CAMINHOS.service);
    dependencias.set(CAMINHOS.controller, new Map([["../services/usuarioService", modulos.service]]));
    modulos.controller = require(CAMINHOS.controller);
    dependencias.set(CAMINHOS.autenticacao, new Map([["jsonwebtoken", jwt], ["../repositories/usuarioRepository", modulos.repository]]));
    modulos.autenticacao = require(CAMINHOS.autenticacao);
    dependencias.set(CAMINHOS.autorizacao, new Map());
    modulos.autorizacao = require(CAMINHOS.autorizacao);
    dependencias.set(CAMINHOS.router, new Map([
      ["express", express], ["../controllers/usuarioController", modulos.controller],
      ["../middlewares/autenticacaoMiddleware", modulos.autenticacao], ["../middlewares/autorizacaoMiddleware", modulos.autorizacao],
    ]));
    modulos.router = require(CAMINHOS.router);
  } finally {
    Module._load = carregar;
    for (const [p, anterior] of cache) {
      if (anterior) require.cache[p] = anterior;
      else delete require.cache[p];
    }
  }
  async function requisitar(op, id, token = "admin-a", entradas = {}) {
    const corpo = entradas.body || (op.metodo === "PUT"
      ? { nome: "Nome atualizado", email: "alterado" + id + "@example.invalid", eh_fundador: false, perfil_acesso: "ENGENHEIRO_SEGURANCA" }
      : { ativo: false });
    const url = "/" + id + (op.metodo === "PATCH" ? "/status" : "");
    const req = {
      method: op.metodo, url, originalUrl: "/api/usuarios" + url, baseUrl: "/api/usuarios",
      headers: token === null ? {} : { authorization: "Bearer " + token },
      body: corpo, query: entradas.query || {}, params: entradas.params || {}, usuario: entradas.usuario,
    };
    const inicioTransacoes = estado.transacoes.length;
    estado.requisicao = { req, id: Number(id), metodo: op.metodo };
    let concluir;
    let rejeitar;
    const resposta = new Promise((resolve, reject) => { concluir = resolve; rejeitar = reject; });
    const res = { statusCode: 200, headersSent: false, body: undefined };
    res.status = t.mock.fn((codigo) => { res.statusCode = codigo; return res; });
    res.json = t.mock.fn((body) => { res.body = body; res.headersSent = true; concluir(res); return res; });
    modulos.router.handle(req, res, (erro) => rejeitar(erro || new Error("Endpoint de escrita não atendido")));
    await resposta;
    assert.equal(res.json.mock.callCount(), 1);
    assert.equal(res.status.mock.callCount(), 1);
    const transacoes = estado.transacoes.slice(inicioTransacoes);
    assert.ok(transacoes.length <= 1, "Uma única transação por escrita");
    if (res.statusCode === 200) assert.equal(transacoes.length, 1);
    for (const tx of transacoes) {
      assert.equal(tx.commit, res.statusCode === 200);
      assert.equal(tx.rollback, res.statusCode !== 200);
      assert.equal(tx.comandos.at(-1), res.statusCode === 200 ? "COMMIT" : "ROLLBACK");
      assert.equal(tx.liberacoes.length, 1);
      if (tx.commit) assert.equal(tx.escritas, 1);
      if (tx.falhaRollback) assert.deepEqual(tx.liberacoes, [true]);
      else if (tx.rollback) assert.deepEqual(usuarios, tx.antes, "ROLLBACK restaura o estado transacional");
    }
    return { req, res };
  }
  return { estado, usuario, alvos, requisitar };
}

function verificarErro(res, codigo) {
  assert.equal(res.statusCode, codigo);
  assert.equal(res.body.status, "error");
  assert.deepEqual(Object.keys(res.body).sort(), ["message", "status"]);
  assert.equal(typeof res.body.message, "string");
  assert.equal(JSON.stringify(res.body).includes(SENSIVEL), false);
  assert.equal(JSON.stringify(res.body).includes("HASH_FICTICIO_NUNCA_PUBLICO"), false);
}
function semEscrita(ctx, antes) {
  assert.equal(ctx.estado.updates.length, 0, "Nem uma tentativa de UPDATE é permitida após recusa");
  assert.deepEqual(ctx.alvos(), antes, "Usuários-alvo não podem mudar");
}
function sucessoSeguro(ctx, op, res, id, mensagem = op.mensagem) {
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: "success", message: mensagem, data: publico(ctx.usuario(id)) });
  assert.equal(ctx.estado.updates.length, 1);
  assert.equal(ctx.estado.updates[0].global, false, "UPDATE global não é caminho administrativo autorizado");
}

for (const op of OPERACOES) {
  for (const contexto of CONTEXTOS) {
    test(op.metodo + ": administrador " + contexto.nome + " altera somente o usuário do próprio ambiente", async (t) => {
      const ctx = preparar(t);
      const outroAntes = { ...ctx.usuario(contexto.externo) };
      const { res } = await ctx.requisitar(op, contexto.alvo, contexto.token);
      assert.deepEqual(ctx.usuario(contexto.externo), outroAntes);
      if (op.metodo === "PUT") {
        assert.equal(ctx.usuario(contexto.alvo).nome, "Nome atualizado");
        assert.equal(ctx.usuario(contexto.alvo).email, "alterado" + contexto.alvo + "@example.invalid");
      } else assert.equal(ctx.usuario(contexto.alvo).ativo, false);
      sucessoSeguro(ctx, op, res, contexto.alvo);
    });

    test(op.metodo + ": administrador " + contexto.nome + " não produz UPDATE em usuário externo", async (t) => {
      const ctx = preparar(t);
      const antes = ctx.alvos();
      const { res } = await ctx.requisitar(op, contexto.externo, contexto.token);
      semEscrita(ctx, antes);
      verificarErro(res, 404);
    });

    test(op.metodo + ": para " + contexto.nome + ", externo e inexistente são indistinguíveis", async (t) => {
      const ctx = preparar(t);
      const antes = ctx.alvos();
      const externo = await ctx.requisitar(op, contexto.externo, contexto.token);
      const inexistente = await ctx.requisitar(op, 999999, contexto.token);
      semEscrita(ctx, antes);
      verificarErro(externo.res, 404);
      verificarErro(inexistente.res, 404);
      assert.deepEqual(externo.res.body, inexistente.res.body);
    });

    test(op.metodo + ": identidade/ambiente forjados não dão a " + contexto.nome + " acesso ao outro ambiente", async (t) => {
      const ctx = preparar(t);
      const antes = ctx.alvos();
      const forjada = { id_usuario: contexto.nome === "A" ? 22 : 11, id_ambiente: contexto.outro, eh_fundador: true, perfil_acesso: "ADMINISTRADOR" };
      const dados = op.metodo === "PUT"
        ? { nome: "Nome forjado", email: "forjado@example.invalid", eh_fundador: true, perfil_acesso: "ADMINISTRADOR" }
        : { ativo: false };
      const { res, req } = await ctx.requisitar(op, contexto.externo, contexto.token, {
        body: { ...dados, ...forjada, usuario: forjada }, query: forjada, params: forjada, usuario: forjada,
      });
      assert.equal(req.usuario.id_usuario, contexto.admin);
      semEscrita(ctx, antes);
      verificarErro(res, 404);
    });
  }

  for (const [nome, token, alterar, codigo] of [
    ["sem JWT", null, () => {}, 401],
    ["JWT inválido", "invalido", () => {}, 401],
    ["engenheiro ativo com perfil forjado", "engenheiro-a", () => {}, 403],
    ["administrador rebaixado no banco", "admin-a", (ctx) => { ctx.usuario(11).perfil_acesso = "ENGENHEIRO_SEGURANCA"; }, 403],
    ["administrador inativo", "admin-a", (ctx) => { ctx.usuario(11).ativo = false; }, 401],
    ["ambiente inativo", "admin-a", (ctx) => { ctx.estado.ambientes.get(A).ativo = false; }, 401],
    ["erro técnico na identidade", "admin-a", (ctx) => { ctx.estado.erroIdentidade = tecnico(); }, 500],
    ["erro técnico na busca do alvo", "admin-a", (ctx) => { ctx.estado.erroBusca = tecnico(); }, 500],
  ]) {
    test(op.metodo + ": " + nome + " recusa sem qualquer UPDATE", async (t) => {
      const ctx = preparar(t);
      alterar(ctx);
      const antes = ctx.alvos();
      const forjada = { id_usuario: 22, id_ambiente: B, eh_fundador: true, perfil_acesso: "ADMINISTRADOR" };
      const body = op.metodo === "PUT" ? { nome: "Teste", email: "novo@example.invalid", ...forjada } : { ativo: false, ...forjada };
      const { res } = await ctx.requisitar(op, 101, token, { body, query: forjada, params: forjada, usuario: forjada });
      semEscrita(ctx, antes);
      verificarErro(res, codigo);
    });
  }

  test(op.metodo + ": erro técnico no UPDATE retorna 500 genérico sem mutação", async (t) => {
    const ctx = preparar(t);
    const antes = ctx.alvos();
    ctx.estado.erroUpdate = tecnico();
    const { res } = await ctx.requisitar(op, 101);
    verificarErro(res, 500);
    assert.deepEqual(res.body, { status: "error", message: op.interno });
    assert.equal(ctx.estado.updates.length, 1);
    assert.deepEqual(ctx.alvos(), antes);
  });

  for (const [nome, revogar] of [
    ["perfil", (ctx) => { ctx.usuario(11).perfil_acesso = "ENGENHEIRO_SEGURANCA"; }],
    ["usuário", (ctx) => { ctx.usuario(11).ativo = false; }],
    ["ambiente", (ctx) => { ctx.estado.ambientes.get(A).ativo = false; }],
  ]) {
    test(op.metodo + ": revogação de " + nome + " entre leitura e escrita impede UPDATE", async (t) => {
      const ctx = preparar(t);
      const antes = ctx.alvos();
      ctx.estado.revogarAoLerAlvo = () => revogar(ctx);
      const { res } = await ctx.requisitar(op, 101);
      assert.equal(ctx.estado.revogada, true, "O ponto de revogação precisa ser exercitado");
      assert.ok(ctx.estado.sequencia.indexOf("LEITURA_ALVO") < ctx.estado.sequencia.indexOf("REVOGACAO"));
      semEscrita(ctx, antes);
      assert.ok([401, 403].includes(res.statusCode));
      verificarErro(res, res.statusCode);
    });
  }
}

for (const contexto of CONTEXTOS) {
  test("PUT: administrador " + contexto.nome + " recusa promover administrativamente o alvo do próprio ambiente", async (t) => {
    const ctx = preparar(t);
    const op = OPERACOES[0];
    const alvo = ctx.usuario(contexto.alvo);
    const { res } = await ctx.requisitar(op, contexto.alvo, contexto.token, {
      body: { nome: alvo.nome, email: alvo.email, eh_fundador: true, perfil_acesso: "ADMINISTRADOR" },
    });
    assert.equal(alvo.perfil_acesso, "ENGENHEIRO_SEGURANCA");
    verificarErro(res, 409);
    assert.deepEqual(ctx.estado.updates, []);
  });

  test("PUT: e-mail já pertencente ao outro ambiente não pode ser reutilizado por " + contexto.nome, async (t) => {
    const ctx = preparar(t);
    const antes = ctx.alvos();
    const op = OPERACOES[0];
    const { res } = await ctx.requisitar(op, contexto.alvo, contexto.token, {
      body: { nome: "Nome válido", email: ctx.usuario(contexto.externo).email.toUpperCase(), eh_fundador: false, perfil_acesso: "ENGENHEIRO_SEGURANCA" },
    });
    semEscrita(ctx, antes);
    verificarErro(res, 409);
    assert.equal(res.body.message, "Já existe outro usuário com este e-mail.");
    assert.ok(ctx.estado.sequencia.includes("EMAIL_GLOBAL"));
  });

  test("PATCH: administrador " + contexto.nome + " reativa usuário do próprio ambiente com mensagem original", async (t) => {
    const ctx = preparar(t);
    const op = OPERACOES[1];
    ctx.usuario(contexto.alvo).ativo = false;
    const { res } = await ctx.requisitar(op, contexto.alvo, contexto.token, { body: { ativo: true } });
    assert.equal(ctx.usuario(contexto.alvo).ativo, true);
    sucessoSeguro(ctx, op, res, contexto.alvo, "Usuário ativado com sucesso.");
  });
}

// Limitações: locks são precondições e registros de ordem no cliente simulado;
// não reproduzem espera, MVCC, deadlocks, índices ou concorrência PostgreSQL.
// A revogação vence após a autenticação inicial e antes dos locks da transação;
// LEITURA_ALVO nesse hook conserva o marcador de observação da fixture antiga,
// sem alegar uma leitura SQL anterior que a implementação nova não realiza.
// Convites pendentes são simulados pelo contrato existeConvitePendente, não
// pela execução do SQL desse repositório. Os 46 casos originais não incluem
// cenário dedicado de convite reservado ou falha no ROLLBACK; o simulador
// reconhece esses estados, mas não substitui testes específicos posteriores.
// JWT é mock. SQL desconhecido falha explicitamente. UPDATE global continua
// inseguro e não é aceito como sucesso. Falha de rollback deixa estado incerto,
// exige descarte do cliente e jamais é contabilizada como COMMIT.
