const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const CAMINHO_SERVICE = require.resolve("../src/services/sincronizacaoService");
const CAMINHO_APLICACAO = require.resolve("../src/repositories/sincronizacaoAplicacaoRepository");
const USUARIO = Object.freeze({ id_usuario: 11, perfil_acesso: "ENGENHEIRO_SEGURANCA" });
const ENTIDADES = [
  { nome: "CAMPANHA", tabela: "campanha", chave: "id_campanha", campo: "nome_campanha", valor: "Campanha atualizada" },
  { nome: "LOCAL", tabela: "local", chave: "id_local", campo: "nome_local", valor: "Local atualizado" },
  { nome: "CHECKLIST_NR33", tabela: "checklist_nr33", chave: "id_checklist", campo: "acesso_controlado", valor: "SIM" },
  { nome: "DADOS_TECNICOS", tabela: "dados_tecnicos", chave: "id_dados", campo: "oxigenio", valor: 20.9 },
];

function erroTecnico() {
  return Object.assign(new Error("FALHA_TECNICA_SIMULADA_NAO_PUBLICAR"), { code: "XX000" });
}

function resultado(rows) { return { rows, rowCount: rows.length }; }

// Carrega apenas os dois módulos sob teste, substituindo TODAS as dependências.
// Cada caso recebe módulos novos; loader/cache são restaurados mesmo se a carga falhar.
function carregarIsolado(t, dependencias) {
  const originais = new Map([CAMINHO_SERVICE, CAMINHO_APLICACAO].map((p) => [p, require.cache[p]]));
  const imports = [];
  const load = Module._load;
  let aplicacao;
  let service;
  try {
    for (const caminho of originais.keys()) delete require.cache[caminho];
    Module._load = function (request, parent, ...resto) {
      if (parent?.filename === CAMINHO_APLICACAO) {
        imports.push(["aplicacao", request]);
        if (request === "../config/database") return dependencias.pool;
        if (request === "../utils/evidenciaArquivoUtils") return dependencias.arquivos;
        throw new Error("Dependência real bloqueada: " + request);
      }
      if (parent?.filename === CAMINHO_SERVICE) {
        imports.push(["service", request]);
        if (request === "../repositories/sincronizacaoRepository") return dependencias.registros;
        if (request === "../repositories/versaoEntidadeRepository") return dependencias.versoes;
        if (request === "../repositories/sincronizacaoAplicacaoRepository") return aplicacao;
        throw new Error("Dependência real bloqueada: " + request);
      }
      return load.call(this, request, parent, ...resto);
    };
    aplicacao = require(CAMINHO_APLICACAO);
    service = require(CAMINHO_SERVICE);
  } finally {
    Module._load = load;
    for (const [caminho, anterior] of originais) {
      if (anterior) require.cache[caminho] = anterior;
      else delete require.cache[caminho];
    }
  }
  assert.deepEqual(imports, [
    ["aplicacao", "../config/database"],
    ["aplicacao", "../utils/evidenciaArquivoUtils"],
    ["service", "../repositories/sincronizacaoRepository"],
    ["service", "../repositories/versaoEntidadeRepository"],
    ["service", "../repositories/sincronizacaoAplicacaoRepository"],
  ]);
  t.after(() => {
    assert.strictEqual(Module._load, load);
    for (const [caminho, anterior] of originais) assert.strictEqual(require.cache[caminho], anterior);
  });
  return { service, aplicacao };
}

function preparar(t, entidade, autorizado) {
  // IDs idênticos entre casos positivos e negativos: a permissão depende da
  // relação real simulada, não de uma convenção de IDs "permitidos"/"proibidos".
  const campanha = { id_campanha: 101, id_usuario: autorizado ? 11 : 22 };
  const local = { id_local: 201, id_campanha: 101 };
  const alvo = entidade.nome === "CAMPANHA" ? campanha
    : entidade.nome === "LOCAL" ? local
      : { [entidade.chave]: 301, id_local: local.id_local, id_usuario: 33 };
  alvo[entidade.campo] = entidade.nome === "DADOS_TECNICOS" ? 19 : entidade.nome === "CHECKLIST_NR33" ? "NAO" : "Original";
  const dados = {
    entidade: entidade.nome, id_entidade: alvo[entidade.chave], operacao: "ATUALIZAR",
    versao_cliente: 5, dados_cliente: { [entidade.campo]: entidade.valor },
  };
  const estado = {
    campanha, local, alvo, versao: 5,
    // Identidade persistida independente da identidade recebida pelo serviço.
    // Pode ser desativada ou ter seu perfil revogado sem mudar USUARIO.
    usuario: { id_usuario: USUARIO.id_usuario, perfil_acesso: USUARIO.perfil_acesso, ativo: true },
    sync: {
      id_sincronizacao: 701, ...dados, versao_servidor: 5,
      id_usuario: USUARIO.id_usuario, status: "PENDENTE", dados_servidor: null,
    },
    eventos: [], consultas: [], escritasEntidade: [], insercoes: [],
    autorizacoes: [], releases: 0, conexoes: 0, arquivos: 0,
    erroVersao: null, erroAutorizacao: null, erroConsulta: null,
    transacaoAtiva: false, bloqueios: [], bloqueiosAtivos: new Set(),
  };
  const normalizarSql = (sql) => sql.replace(/\s+/g, " ").trim();
  // Lista exata das consultas atuais. Uma nova consulta precisa ser analisada;
  // não basta conter SELECT, JOIN ou o nome de uma tabela para ser aceita.
  const consultasAutorizacao = {
    CAMPANHA: {
      leitura: "SELECT 1 FROM campanha WHERE id_campanha = $1 AND id_usuario = $2;",
      bloqueada: "SELECT 1 FROM campanha c WHERE c.id_campanha = $1 AND (c.id_usuario = $2 OR $3::boolean) FOR UPDATE OF c;",
      aliases: ["c"],
    },
    LOCAL: {
      leitura: "SELECT 1 FROM local l INNER JOIN campanha c ON c.id_campanha = l.id_campanha WHERE l.id_local = $1 AND c.id_usuario = $2;",
      bloqueada: "SELECT 1 FROM local l INNER JOIN campanha c ON c.id_campanha = l.id_campanha WHERE l.id_local = $1 AND (c.id_usuario = $2 OR $3::boolean) FOR UPDATE OF c, l;",
      aliases: ["c", "l"],
    },
    CHECKLIST_NR33: {
      leitura: "SELECT 1 FROM checklist_nr33 ch INNER JOIN local l ON l.id_local = ch.id_local INNER JOIN campanha c ON c.id_campanha = l.id_campanha WHERE ch.id_checklist = $1 AND c.id_usuario = $2;",
      bloqueada: "SELECT 1 FROM checklist_nr33 ch INNER JOIN local l ON l.id_local = ch.id_local INNER JOIN campanha c ON c.id_campanha = l.id_campanha WHERE ch.id_checklist = $1 AND (c.id_usuario = $2 OR $3::boolean) FOR UPDATE OF c, l, ch;",
      aliases: ["c", "l", "ch"],
    },
    DADOS_TECNICOS: {
      leitura: "SELECT 1 FROM dados_tecnicos dt INNER JOIN local l ON l.id_local = dt.id_local INNER JOIN campanha c ON c.id_campanha = l.id_campanha WHERE dt.id_dados = $1 AND c.id_usuario = $2;",
      bloqueada: "SELECT 1 FROM dados_tecnicos dt INNER JOIN local l ON l.id_local = dt.id_local INNER JOIN campanha c ON c.id_campanha = l.id_campanha WHERE dt.id_dados = $1 AND (c.id_usuario = $2 OR $3::boolean) FOR UPDATE OF c, l, dt;",
      aliases: ["c", "l", "dt"],
    },
  };
  const consultaAutorizacao = consultasAutorizacao[entidade.nome];
  function registrarBloqueio(recurso, modo) {
    assert.equal(estado.transacaoAtiva, true, "Bloqueio transacional exige BEGIN");
    estado.bloqueios.push({ recurso, modo });
    estado.bloqueiosAtivos.add(recurso);
  }
  // Registra aquisição/liberação e snapshot para rollback, sem emular MVCC,
  // esperas, deadlocks, ordem física do plano ou concorrência PostgreSQL real.
  // Não protege artificialmente UPDATEs: a ausência de autorização continua
  // detectável pelas asserções de nenhuma tentativa de escrita dos 41 testes.
  let snapshot;
  const client = {
    async query(texto, params = []) {
      const sql = normalizarSql(texto);
      estado.consultas.push({ sql, params: [...params] });
      if (sql === "BEGIN") {
        assert.equal(estado.transacaoAtiva, false);
        estado.transacaoAtiva = true;
        estado.eventos.push("BEGIN");
        snapshot = { alvo: { ...alvo }, sync: { ...estado.sync }, versao: estado.versao };
        return resultado([]);
      }
      if (sql === "ROLLBACK") {
        estado.eventos.push("ROLLBACK");
        if (snapshot) {
          Object.assign(alvo, snapshot.alvo);
          estado.sync = snapshot.sync;
          estado.versao = snapshot.versao;
        }
        estado.transacaoAtiva = false;
        estado.bloqueiosAtivos.clear();
        return resultado([]);
      }
      if (sql === "COMMIT") {
        assert.equal(estado.transacaoAtiva, true);
        estado.eventos.push("COMMIT");
        estado.transacaoAtiva = false;
        estado.bloqueiosAtivos.clear();
        return resultado([]);
      }
      if (estado.erroConsulta) throw estado.erroConsulta;

      if (/^SELECT \* FROM sincronizacao WHERE id_sincronizacao = \$1(?: FOR UPDATE)?;?$/i.test(sql)) {
        assert.deepEqual(params, [estado.sync.id_sincronizacao]);
        if (/ FOR UPDATE;?$/.test(sql)) registrarBloqueio("sincronizacao", "UPDATE");
        return resultado([{ ...estado.sync }]);
      }
      if (sql === "SELECT id_usuario, perfil_acesso FROM usuario WHERE id_usuario = $1 AND ativo = TRUE FOR SHARE;") {
        assert.deepEqual(params, [USUARIO.id_usuario]);
        assert.equal(estado.transacaoAtiva, true);
        const usuario = estado.usuario;
        if (!usuario || usuario.id_usuario !== params[0] || usuario.ativo !== true) {
          return resultado([]);
        }
        registrarBloqueio("usuario", "SHARE");
        return resultado([{ id_usuario: usuario.id_usuario, perfil_acesso: usuario.perfil_acesso }]);
      }
      if (/^SELECT (?:\*|versao) FROM versao_entidade WHERE entidade = \$1 AND id_entidade = \$2(?: FOR UPDATE)?;?$/i.test(sql)) {
        assert.deepEqual(params, [entidade.nome, alvo[entidade.chave]]);
        if (/ FOR UPDATE;?$/.test(sql)) registrarBloqueio("versao_entidade", "UPDATE");
        return resultado([{ entidade: entidade.nome, id_entidade: alvo[entidade.chave], versao: estado.versao }]);
      }
      if (sql === consultaAutorizacao.leitura || sql === consultaAutorizacao.bloqueada) {
        const bloqueada = sql === consultaAutorizacao.bloqueada;
        const usuarioAtual = estado.usuario;
        const administrador = USUARIO.perfil_acesso === "ADMINISTRADOR" &&
          usuarioAtual?.ativo === true && usuarioAtual.perfil_acesso === "ADMINISTRADOR";
        assert.deepEqual(params, bloqueada
          ? [alvo[entidade.chave], USUARIO.id_usuario, administrador]
          : [alvo[entidade.chave], USUARIO.id_usuario]);
        if (bloqueada) {
          assert.equal(typeof params[2], "boolean");
          assert.equal(estado.transacaoAtiva, true);
          assert.equal(estado.bloqueiosAtivos.has("usuario"), true);
        }
        const vinculoValido = entidade.nome === "CAMPANHA"
          ? alvo.id_campanha === campanha.id_campanha
          : local.id_campanha === campanha.id_campanha &&
            alvo.id_local === local.id_local;
        // A leitura legada usa apenas responsabilidade; o novo processamento
        // combina responsabilidade/perfil com a identidade atual já consultada.
        const identidadeValida = !bloqueada || (
          usuarioAtual?.id_usuario === params[1] && usuarioAtual.ativo === true &&
          ["ADMINISTRADOR", "ENGENHEIRO_SEGURANCA"].includes(usuarioAtual.perfil_acesso)
        );
        const permitida = vinculoValido && identidadeValida &&
          (campanha.id_usuario === params[1] || (bloqueada && params[2] === true));
        estado.autorizacoes.push({ sql, params: [...params], permitida });
        estado.eventos.push("AUTORIZACAO");
        if (estado.erroAutorizacao) throw estado.erroAutorizacao;
        if (permitida && bloqueada) {
          for (const alias of consultaAutorizacao.aliases) registrarBloqueio(alias, "UPDATE");
        }
        return resultado(permitida ? [{ permitido: 1 }] : []);
      }
      if (sql === `SELECT * FROM ${entidade.tabela} WHERE ${entidade.chave} = $1;`) {
        assert.deepEqual(params, [alvo[entidade.chave]]);
        estado.eventos.push("LEITURA_ENTIDADE");
        return resultado([{ ...alvo }]);
      }
      if (sql === `UPDATE ${entidade.tabela} SET ${entidade.campo} = $1, data_atualizacao = CURRENT_TIMESTAMP WHERE ${entidade.chave} = $2 RETURNING *;`) {
        assert.deepEqual(params, [entidade.valor, alvo[entidade.chave]]);
        estado.escritasEntidade.push({ sql, params: [...params] });
        estado.eventos.push("UPDATE_ENTIDADE");
        // Não concede proteção que o SQL não contém: o UPDATE por ID realmente
        // altera o estado simulado, inclusive quando pertence a outro responsável.
        alvo[entidade.campo] = params[0];
        estado.versao += 1; // efeito de versionamento explicitamente simulado
        return resultado([{ ...alvo }]);
      }
      if (sql === "UPDATE sincronizacao SET status = 'SINCRONIZADO', versao_servidor = $1, dados_servidor = $2, mensagem_erro = NULL, data_sincronizacao = CURRENT_TIMESTAMP, data_atualizacao = CURRENT_TIMESTAMP WHERE id_sincronizacao = $3 RETURNING *;") {
        assert.deepEqual(params, [estado.versao, { ...alvo }, estado.sync.id_sincronizacao]);
        estado.sync = { ...estado.sync, status: "SINCRONIZADO", versao_servidor: params[0], dados_servidor: params[1], mensagem_erro: null };
        estado.eventos.push("FINALIZACAO");
        return resultado([estado.sync]);
      }
      // Falha fechada: não aprova consultas desconhecidas com respostas genéricas.
      throw new Error("SQL não contemplado pelo simulador: " + sql);
    },
    release() { estado.releases += 1; estado.eventos.push("RELEASE"); },
  };
  const pool = {
    async connect() { estado.conexoes += 1; return client; },
    query() { throw new Error("pool.query direto bloqueado; somente cliente simulado"); },
  };
  const registros = {
    async criar(payload) {
      estado.insercoes.push(payload);
      estado.eventos.push("INSERT_SYNC");
      estado.sync = { id_sincronizacao: 701, ...payload };
      return estado.sync;
    },
    async buscarPorId(id) {
      assert.equal(id, estado.sync.id_sincronizacao);
      estado.eventos.push("BUSCAR_SYNC");
      return estado.sync;
    },
  };
  const versoes = {
    async obterVersaoExistente(nome, id) {
      assert.deepEqual([nome, id], [entidade.nome, alvo[entidade.chave]]);
      estado.eventos.push("VERSAO");
      if (estado.erroVersao) throw estado.erroVersao;
      return { entidade: nome, id_entidade: id, versao: estado.versao };
    },
  };
  const arquivos = new Proxy({}, { get() {
    return () => { estado.arquivos += 1; throw new Error("Operação física proibida"); };
  } });
  const modulos = carregarIsolado(t, { pool, registros, versoes, arquivos });
  t.after(() => assert.equal(estado.arquivos, 0));
  return { ...modulos, estado, dados, client };
}

async function capturar(operacao) {
  try { return { valor: await operacao() }; }
  catch (erro) { return { erro }; }
}

function verificarRecusa(resultadoOperacao) {
  assert.ok(resultadoOperacao.erro, "A operação deveria ser recusada, não retornar sucesso");
  assert.ok([403, 404].includes(resultadoOperacao.erro.statusCode), "Recusa deve representar falta de autorização");
}

for (const entidade of ENTIDADES) {
  test(entidade.nome + ": criação ATUALIZAR autorizada preserva contrato com versões iguais", async (t) => {
    const { service, estado, dados } = preparar(t, entidade, true);
    const retorno = await service.criarSincronizacao(dados, USUARIO);
    assert.strictEqual(retorno, estado.sync);
    assert.equal(estado.insercoes.length, 1);
    assert.deepEqual(estado.insercoes[0], {
      entidade: entidade.nome, id_entidade: dados.id_entidade,
      id_operacao_cliente: null, id_registro_cliente: null, operacao: "ATUALIZAR",
      versao_cliente: 5, versao_servidor: 5, status: "PENDENTE",
      dados_cliente: dados.dados_cliente, dados_servidor: null, mensagem_erro: null,
      id_usuario: USUARIO.id_usuario, data_sincronizacao: null,
    });
    assert.strictEqual(estado.insercoes[0].dados_cliente, dados.dados_cliente);
    assert.equal(estado.escritasEntidade.length, 0);
  });

  test("[segurança pendente] " + entidade.nome + ": versões iguais não dispensam autorização antes de criar sincronização", async (t) => {
    const { service, estado, dados } = preparar(t, entidade, false);
    const tentativa = await capturar(() => service.criarSincronizacao(dados, USUARIO));
    assert.equal(estado.insercoes.length, 0, "Não persistir sincronização de entidade não autorizada");
    verificarRecusa(tentativa);
    assert.equal(estado.autorizacoes.length, 1);
    assert.equal(estado.autorizacoes[0].permitida, false);
    assert.equal(estado.escritasEntidade.length, 0);
  });

  test(entidade.nome + ": versões diferentes exercitam a verificação real de responsável e recusam entidade externa", async (t) => {
    const { service, estado, dados } = preparar(t, entidade, false);
    dados.versao_cliente = 4;
    const tentativa = await capturar(() => service.criarSincronizacao(dados, USUARIO));
    verificarRecusa(tentativa);
    assert.equal(estado.autorizacoes.length, 1);
    assert.equal(estado.autorizacoes[0].permitida, false);
    assert.equal(estado.insercoes.length, 0);
    assert.equal(estado.escritasEntidade.length, 0);
    assert.equal(estado.releases, estado.conexoes);
  });

  test(entidade.nome + ": processamento legitimamente autorizado atualiza apenas o campo informado", async (t) => {
    const { service, estado } = preparar(t, entidade, true);
    const anterior = { ...estado.alvo };
    const retorno = await service.processarSincronizacao("701", USUARIO);
    assert.strictEqual(retorno, estado.sync);
    assert.equal(retorno.status, "SINCRONIZADO");
    assert.equal(retorno.versao_servidor, 6);
    assert.deepEqual(estado.alvo, { ...anterior, [entidade.campo]: entidade.valor });
    assert.deepEqual(retorno.dados_servidor, estado.alvo);
    assert.equal(estado.escritasEntidade.length, 1);
    assert.equal(estado.eventos.filter((e) => e === "COMMIT").length, 1);
    assert.equal(estado.eventos.includes("ROLLBACK"), false);
    assert.ok(estado.eventos.indexOf("BEGIN") < estado.eventos.indexOf("UPDATE_ENTIDADE"));
    assert.ok(estado.eventos.indexOf("UPDATE_ENTIDADE") < estado.eventos.indexOf("COMMIT"));
    assert.equal(estado.releases, estado.conexoes);
  });

  test("[segurança pendente] " + entidade.nome + ": ser dono da sincronização não permite processar entidade alheia", async (t) => {
    const { service, estado } = preparar(t, entidade, false);
    const anterior = { ...estado.alvo };
    assert.equal(estado.sync.id_usuario, USUARIO.id_usuario);
    assert.notEqual(estado.campanha.id_usuario, USUARIO.id_usuario);
    const tentativa = await capturar(() => service.processarSincronizacao("701", USUARIO));
    assert.equal(estado.escritasEntidade.length, 0, "Nenhum UPDATE da entidade pode ser tentado");
    assert.deepEqual(estado.alvo, anterior);
    verificarRecusa(tentativa);
    assert.equal(estado.eventos.includes("COMMIT"), false);
    assert.equal(estado.releases, estado.conexoes);
  });

  test("[segurança pendente] " + entidade.nome + ": revogação após criar sincronização impede processamento", async (t) => {
    const { service, estado, dados } = preparar(t, entidade, true);
    await service.criarSincronizacao(dados, USUARIO);
    estado.campanha.id_usuario = 22;
    const anterior = { ...estado.alvo };
    const tentativa = await capturar(() => service.processarSincronizacao("701", USUARIO));
    assert.equal(estado.escritasEntidade.length, 0);
    assert.deepEqual(estado.alvo, anterior);
    verificarRecusa(tentativa);
    assert.equal(estado.sync.id_usuario, USUARIO.id_usuario);
    assert.equal(estado.releases, estado.conexoes);
  });

  test(entidade.nome + ": falha técnica na versão é propagada sem virar autorização", async (t) => {
    const { service, estado, dados } = preparar(t, entidade, true);
    const erro = erroTecnico();
    estado.erroVersao = erro;
    await assert.rejects(() => service.criarSincronizacao(dados, USUARIO), (recebido) => recebido === erro);
    assert.equal(estado.insercoes.length, 0);
    assert.equal(estado.escritasEntidade.length, 0);
  });

  test(entidade.nome + ": falha técnica da consulta de autorização não vira 403/404", async (t) => {
    const { service, estado, dados } = preparar(t, entidade, true);
    dados.versao_cliente = 4;
    const erro = erroTecnico();
    estado.erroAutorizacao = erro;
    await assert.rejects(() => service.criarSincronizacao(dados, USUARIO), (recebido) => recebido === erro);
    assert.equal(estado.autorizacoes.length, 1);
    assert.equal(estado.insercoes.length, 0);
    assert.equal(estado.escritasEntidade.length, 0);
    assert.equal(estado.releases, estado.conexoes);
  });

  test(entidade.nome + ": erro técnico transacional preserva exceção, rollback e liberação", async (t) => {
    const { service, estado } = preparar(t, entidade, true);
    const erro = erroTecnico();
    estado.erroConsulta = erro;
    await assert.rejects(() => service.processarSincronizacao("701", USUARIO), (recebido) => recebido === erro);
    assert.equal(estado.escritasEntidade.length, 0);
    assert.deepEqual(estado.eventos, ["BUSCAR_SYNC", "BEGIN", "ROLLBACK", "RELEASE"]);
    assert.equal(estado.releases, estado.conexoes);
  });

  test(entidade.nome + ": sincronização de outro usuário é recusada antes do cliente transacional", async (t) => {
    const { service, estado } = preparar(t, entidade, true);
    estado.sync.id_usuario = 22;
    const tentativa = await capturar(() => service.processarSincronizacao("701", USUARIO));
    verificarRecusa(tentativa);
    assert.equal(estado.conexoes, 0);
    assert.equal(estado.escritasEntidade.length, 0);
  });
}

test("Isolamento: serviço e aplicação reais recebem apenas dependências simuladas", async (t) => {
  const { aplicacao, estado } = preparar(t, ENTIDADES[0], true);
  const registro = await aplicacao.buscarDadosAtuaisServidor("CAMPANHA", 101, USUARIO);
  assert.deepEqual(registro, estado.alvo);
  assert.equal(estado.autorizacoes.length, 1);
  assert.equal(estado.autorizacoes[0].permitida, true);
  assert.equal(estado.escritasEntidade.length, 0);
  assert.equal(estado.releases, estado.conexoes);
});
