const { CAMPOS: CAMPOS_CARACTERIZACAO, selecionarCaracterizacao } = require("../utils/caracterizacaoChecklist");
const { CAMPOS_NR33, selecionarCamposNr33, validarEstruturaNr33, mesclarCamposNr33 } = require("../utils/adaptadorCamposNr33");
const { sqlCapacidade } = require('../utils/permissoes');
const pool = require("../config/database");

// Sinal privado (nao Symbol.for, nao serializavel). API apenas para callbacks
// internos: retornar statusConcluidoSemAlteracao() em validarEstado de status.
// Nao e um campo do checklist nem uma opcao que possa vir do corpo HTTP.
const STATUS_CONCLUIDO_SEM_ALTERACAO = Symbol("STATUS_CONCLUIDO_SEM_ALTERACAO");
function statusConcluidoSemAlteracao() {
  return STATUS_CONCLUIDO_SEM_ALTERACAO;
}

// Requer os critérios da migração 018 e a homologação multi-tenant/versionamento.
// A compatibilidade real deve ser verificada em homologação PostgreSQL.
const CAMPOS_RESPOSTAS = [
  "criterio_a",
  "criterio_b",
  "criterio_c",
  "acesso_controlado",
  "ventilacao_adequada",
  "monitoramento_atmosferico",
  "procedimento_emergencia",
];

// Fragmento estático. Nas três escritas, $3 é o usuário autenticado.
const AUTORIZACAO_LEITURA = `
  AND EXISTS (
    SELECT 1
    FROM usuario AS u
    INNER JOIN ambiente AS a
      ON a.id_ambiente = u.id_ambiente
    WHERE u.id_usuario = $3
      AND u.id_ambiente = c.id_ambiente
      AND u.ativo = TRUE
      AND a.ativo = TRUE
      AND ${sqlCapacidade('u', 'checklists.consultar')}
  )
`;

const AUTORIZACAO_ESCRITA = AUTORIZACAO_LEITURA.replace(sqlCapacidade('u', 'checklists.consultar'), sqlCapacidade('u', 'checklists.editar'));

function criarErro(message, statusCode) {
  const erro = new Error(message);
  erro.statusCode = statusCode;
  return erro;
}

function erroEsquemaNr33() {
  const erro = criarErro("Avaliação NR-33 temporariamente indisponível.", 503);
  erro.code = "NR33_ESQUEMA_INCOMPATIVEL";
  return erro;
}

function conferirEsquemaNr33(estado) {
  if (CAMPOS_NR33.some(campo => !Object.hasOwn(estado, campo))) throw erroEsquemaNr33();
}

function validarIdAmbiente(idAmbiente) {
  if (
    typeof idAmbiente !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idAmbiente)
  ) {
    throw criarErro("Identificação do ambiente inválida.", 403);
  }
}

function validarIdentificador(valor, message, statusCode = 400) {
  if (
    (typeof valor !== "number" && typeof valor !== "string") ||
    !Number.isSafeInteger(Number(valor)) ||
    Number(valor) <= 0
  ) {
    throw criarErro(message, statusCode);
  }
  return Number(valor);
}

function validarIdentidade(usuarioAutenticado) {
  if (!usuarioAutenticado) {
    throw criarErro("Usuário não autenticado.", 401);
  }
  const { id_usuario: idUsuario, id_ambiente: idAmbiente } = usuarioAutenticado;
  validarIdAmbiente(idAmbiente);
  return {
    id_usuario: validarIdentificador(idUsuario, "Usuário inválido.", 403),
    id_ambiente: idAmbiente,
  };
}

function validarDados(dados, parcial = false) {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    throw criarErro("Dados do checklist inválidos.", 400);
  }
  for (const campo of CAMPOS_RESPOSTAS) {
    const valor = dados[campo];
    if (parcial && valor == null) continue;
    if (!["SIM", "NAO"].includes(valor)) {
      throw criarErro(`${campo} deve ser SIM ou NAO.`, 400);
    }
  }
  if (dados.observacoes != null && typeof dados.observacoes !== "string") {
    throw criarErro("O campo observacoes deve ser um texto.", 400);
  }
}

function validarStatus(status) {
  if (!["PENDENTE", "CONCLUIDO"].includes(status)) {
    throw criarErro("Status inválido. Use PENDENTE ou CONCLUIDO.", 400);
  }
}

function ehDuplicidadePorLocal(erro) {
  if (erro?.code !== "23505") return false;
  if (erro.table && erro.table !== "checklist_nr33") return false;

  if (erro.constraint) {
    // Nome padrão gerado pelo UNIQUE inline da migração 004.
    return erro.constraint === "checklist_nr33_id_local_key";
  }

  // Sem nome de restrição, exige metadados específicos; não interpreta
  // mensagens/detail nem converte todo 23505 em duplicidade de checklist.
  return erro.table === "checklist_nr33" && erro.column === "id_local";
}

// Extensao opt-in interna: validarEstado({ estadoAtual, dadosPropostos }) pode
// ser assincrona e deve devolver o objeto completo de campos aprovados para esta
// operacao. Nao recebe client, SQL, parametros internos ou identidade mutavel.
// A lista permitida impede devolver IDs, autoria, campos derivados ou outros SETs.
function prepararValidacaoEstado(opcoes, dados, camposPermitidos, montarEscrita, prepararSemAlteracao = null) {
  const callback = opcoes?.validarEstado;
  if (callback === undefined) return null;
  if (typeof callback !== "function") {
    throw criarErro("validarEstado deve ser uma função.", 400);
  }
  const propostos = structuredClone(Object.fromEntries(
    camposPermitidos.filter(campo => Object.hasOwn(dados, campo))
      .map(campo => [campo, dados[campo]])
  ));
  return async estadoAtual => {
    const aprovados = await callback({
      estadoAtual: structuredClone(estadoAtual),
      dadosPropostos: structuredClone(propostos),
    });
    if (aprovados === STATUS_CONCLUIDO_SEM_ALTERACAO && prepararSemAlteracao) {
      return prepararSemAlteracao(estadoAtual);
    }
    if (!aprovados || typeof aprovados !== "object" || Array.isArray(aprovados) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(aprovados))) {
      throw criarErro("A validação deve retornar os campos aprovados da operação.", 400);
    }
    for (const campo of Reflect.ownKeys(aprovados)) {
      if (!camposPermitidos.includes(campo) ||
          !Object.hasOwn(Object.getOwnPropertyDescriptor(aprovados, campo), "value")) {
        throw criarErro("A validação retornou um campo não permitido para a operação.", 400);
      }
    }
    // Destaca tambem o retorno, para que referencias retidas pelo callback nao
    // possam mudar os valores enquanto a escrita assincrona estiver em andamento.
    return montarEscrita(structuredClone(aprovados), estadoAtual);
  };
}

async function criarNoAmbiente(dados, usuarioAutenticado, opcoes) {
  const usuario = validarIdentidade(usuarioAutenticado);
  validarDados(dados);
  const caracterizacao = selecionarCaracterizacao(dados);
  const camposNr33 = validarEstruturaNr33(dados);
  const idLocal = validarIdentificador(dados.id_local, "ID do local inválido.");
  const { status = "PENDENTE" } = dados;
  validarStatus(status);

  // Nomes vindos exclusivamente do adaptador/lista fechada, nunca do corpo bruto.
  // Omissao total preserva exatamente o SQL anterior, inclusive em schema pre-026.
  const montarQuery = (novos = []) => `
    INSERT INTO checklist_nr33 AS ch (
      id_local,
      criterio_a,
      criterio_b,
      criterio_c,
      acesso_controlado,
      ventilacao_adequada,
      monitoramento_atmosferico,
      procedimento_emergencia,
      observacoes,
      status,
      id_usuario,
      ${CAMPOS_CARACTERIZACAO.join(", ")}${novos.length ? ", " + novos.join(", ") : ""}
    )
    SELECT
      l.id_local,
      $4, $5, $6, $7, $8, $9, $10,
      NULLIF($11::text, ''),
      $12,
      $3,
      ${CAMPOS_CARACTERIZACAO.map((_, i) => `$${i + 13}`).join(", ")}${novos.length ? ", " + novos.map((_, i) => `$${21 + i}`).join(", ") : ""}
    FROM local AS l
    INNER JOIN campanha AS c
      ON c.id_campanha = l.id_campanha
    WHERE l.id_local = $1
      AND c.id_ambiente = $2
      ${AUTORIZACAO_ESCRITA}
    RETURNING ch.*
  `;
  const query = montarQuery(Object.keys(camposNr33));
  const valores = [
    idLocal,
    usuario.id_ambiente,
    usuario.id_usuario,
    ...CAMPOS_RESPOSTAS.map((campo) => dados[campo]),
    dados.observacoes ?? null,
    status,
    ...CAMPOS_CARACTERIZACAO.map(campo => caracterizacao[campo] ?? null),
    ...Object.values(camposNr33),
  ];
  const prepararEscrita = prepararValidacaoEstado(opcoes, { ...dados, status },
    [...CAMPOS_RESPOSTAS, "observacoes", "status", ...CAMPOS_CARACTERIZACAO, ...CAMPOS_NR33], aprovados => {
      validarDados(aprovados);
      validarStatus(aprovados.status);
      const campos = selecionarCaracterizacao(aprovados);
      const novos = validarEstruturaNr33(aprovados);
      return { query: montarQuery(Object.keys(novos)), valores: [idLocal, usuario.id_ambiente, usuario.id_usuario,
        ...CAMPOS_RESPOSTAS.map(campo => aprovados[campo]),
        aprovados.observacoes ?? null, aprovados.status,
        ...CAMPOS_CARACTERIZACAO.map(campo => campos[campo] ?? null), ...Object.values(novos)] };
    });

  try {
    // Apenas um local autorizado chega ao INSERT e à restrição UNIQUE.
    if (opcoes?.exigirEsquemaNr33 === true || opcoes?.bloquearAutorizacao === true || prepararEscrita || Object.keys(camposNr33).length) {
      return await executarEscritaComBloqueios(query, valores, usuario, idLocal, true, prepararEscrita, opcoes?.exigirEsquemaNr33 === true);
    }
    const resultado = await pool.query(query, valores);
    return resultado.rows[0] || null;
  } catch (erro) {
    if (ehDuplicidadePorLocal(erro)) {
      throw criarErro("Este local já possui um checklist NR-33.", 409);
    }
    throw erro;
  }
}

async function listarPorAmbiente(idAmbiente) {
  validarIdAmbiente(idAmbiente);
  const query = `
    SELECT ch.*, l.nome_local, u.nome AS usuario_responsavel
    FROM checklist_nr33 AS ch
    INNER JOIN local AS l
      ON l.id_local = ch.id_local
    INNER JOIN campanha AS c
      ON c.id_campanha = l.id_campanha
    INNER JOIN usuario AS u
      ON u.id_usuario = ch.id_usuario
      AND u.id_ambiente = c.id_ambiente
    WHERE c.id_ambiente = $1
    ORDER BY ch.id_checklist ASC
  `;
  const resultado = await pool.query(query, [idAmbiente]);
  return resultado.rows;
}

async function buscarPorIdEAmbiente(idChecklist, idAmbiente) {
  validarIdAmbiente(idAmbiente);
  const id = validarIdentificador(idChecklist, "ID do checklist inválido.");
  const query = `
    SELECT ch.*, l.nome_local, u.nome AS usuario_responsavel
    FROM checklist_nr33 AS ch
    INNER JOIN local AS l
      ON l.id_local = ch.id_local
    INNER JOIN campanha AS c
      ON c.id_campanha = l.id_campanha
    INNER JOIN usuario AS u
      ON u.id_usuario = ch.id_usuario
      AND u.id_ambiente = c.id_ambiente
    WHERE ch.id_checklist = $1
      AND c.id_ambiente = $2
    LIMIT 1
  `;
  const resultado = await pool.query(query, [id, idAmbiente]);
  return resultado.rows[0] || null;
}

async function buscarPorLocalEAmbiente(idLocal, idAmbiente) {
  validarIdAmbiente(idAmbiente);
  const id = validarIdentificador(idLocal, "ID do local inválido.");
  const query = `
    SELECT ch.*
    FROM checklist_nr33 AS ch
    INNER JOIN local AS l
      ON l.id_local = ch.id_local
    INNER JOIN campanha AS c
      ON c.id_campanha = l.id_campanha
    WHERE ch.id_local = $1
      AND c.id_ambiente = $2
    LIMIT 1
  `;
  const resultado = await pool.query(query, [id, idAmbiente]);
  return resultado.rows[0] || null;
}

async function atualizarNoAmbiente(idChecklist, dados, usuarioAutenticado, opcoes) {
  const id = validarIdentificador(idChecklist, "ID do checklist inválido.");
  const usuario = validarIdentidade(usuarioAutenticado);
  validarDados(dados, true);
  const caracterizacao = selecionarCaracterizacao(dados);
  // O PATCH isolado pode depender do marcador ja persistido. A coerencia do
  // resultado so e verificada depois de carregar o estado autorizado sob locks.
  const camposNr33 = selecionarCamposNr33(dados);

  // Não inclui id_local, id_usuario ou status no SET.
  // Respostas/observações mantêm o contrato anterior. Na caracterização,
  // o booleano de presença distingue omissão de limpeza explícita com NULL.
  const montarQuery = (novos = []) => `
    UPDATE checklist_nr33 AS ch
    SET
      criterio_a = COALESCE($4, ch.criterio_a),
      criterio_b = COALESCE($5, ch.criterio_b),
      criterio_c = COALESCE($6, ch.criterio_c),
      acesso_controlado = COALESCE($7, ch.acesso_controlado),
      ventilacao_adequada = COALESCE($8, ch.ventilacao_adequada),
      monitoramento_atmosferico = COALESCE($9, ch.monitoramento_atmosferico),
      procedimento_emergencia = COALESCE($10, ch.procedimento_emergencia),
      observacoes = CASE
        WHEN $11::text IS NULL THEN ch.observacoes
        ELSE NULLIF($11::text, '')
      END,
      ${CAMPOS_CARACTERIZACAO.map((campo, i) => `${campo} = CASE WHEN $${12 + i * 2}::boolean THEN $${13 + i * 2} ELSE ch.${campo} END`).join(",\n      ")},
      ${novos.map((campo, i) => `${campo} = $${28 + i},\n      `).join("")}data_atualizacao = CURRENT_TIMESTAMP
    FROM local AS l
    INNER JOIN campanha AS c
      ON c.id_campanha = l.id_campanha
    WHERE ch.id_checklist = $1
      AND l.id_local = ch.id_local
      AND c.id_ambiente = $2
      ${AUTORIZACAO_ESCRITA}
    RETURNING ch.*
  `;
  const query = montarQuery(Object.keys(camposNr33));
  const valores = [
    id,
    usuario.id_ambiente,
    usuario.id_usuario,
    ...CAMPOS_RESPOSTAS.map((campo) => dados[campo] ?? null),
    dados.observacoes ?? null,
    ...CAMPOS_CARACTERIZACAO.flatMap(campo => [Object.hasOwn(caracterizacao, campo), caracterizacao[campo] ?? null]),
    ...Object.values(camposNr33),
  ];
  let prepararEscrita = prepararValidacaoEstado(opcoes, dados,
    [...CAMPOS_RESPOSTAS, "observacoes", ...CAMPOS_CARACTERIZACAO, ...CAMPOS_NR33], (aprovados, estadoAtual) => {
      validarDados(aprovados, true);
      const campos = selecionarCaracterizacao(aprovados);
      const novos = selecionarCamposNr33(aprovados);
      if (Object.keys(novos).length) mesclarCamposNr33(estadoAtual, novos);
      return { query: montarQuery(Object.keys(novos)), valores: [id, usuario.id_ambiente, usuario.id_usuario,
        ...CAMPOS_RESPOSTAS.map(campo => aprovados[campo] ?? null),
        aprovados.observacoes ?? null,
        ...CAMPOS_CARACTERIZACAO.flatMap(campo => [Object.hasOwn(campos, campo), campos[campo] ?? null]),
        ...Object.values(novos)] };
    });
  if (!prepararEscrita && Object.keys(camposNr33).length) {
    prepararEscrita = estadoAtual => {
      mesclarCamposNr33(estadoAtual, camposNr33);
      return { query, valores };
    };
  }
  if (opcoes?.exigirEsquemaNr33 === true || opcoes?.bloquearAutorizacao === true || prepararEscrita) {
    return executarEscritaComBloqueios(query, valores, usuario, id, false, prepararEscrita, opcoes?.exigirEsquemaNr33 === true);
  }
  const resultado = await pool.query(query, valores);
  return resultado.rows[0] || null;
}

async function atualizarStatusNoAmbiente(idChecklist, status, usuarioAutenticado, opcoes) {
  const id = validarIdentificador(idChecklist, "ID do checklist inválido.");
  const usuario = validarIdentidade(usuarioAutenticado);
  validarStatus(status);
  const query = `
    UPDATE checklist_nr33 AS ch
    SET
      status = $4,
      data_atualizacao = CURRENT_TIMESTAMP
    FROM local AS l
    INNER JOIN campanha AS c
      ON c.id_campanha = l.id_campanha
    WHERE ch.id_checklist = $1
      AND l.id_local = ch.id_local
      AND c.id_ambiente = $2
      ${AUTORIZACAO_ESCRITA}
    RETURNING ch.*
  `;
  const valores = [
    id,
    usuario.id_ambiente,
    usuario.id_usuario,
    status,
  ];
  const prepararEscrita = prepararValidacaoEstado(opcoes, { status }, ["status"], aprovados => {
    validarStatus(aprovados.status);
    return { query, valores: [id, usuario.id_ambiente, usuario.id_usuario, aprovados.status] };
  }, estadoAtual => {
    // Usa o pedido capturado e o snapshot privado, nunca as copias mutaveis
    // entregues ao callback. Nao permite NO-OP em transicoes reais ou reabertura.
    if (status !== "CONCLUIDO" || estadoAtual?.status !== "CONCLUIDO") {
      throw criarErro("Operação sem alteração exige status solicitado e atual CONCLUIDO.", 400);
    }
    return { semAlteracao: STATUS_CONCLUIDO_SEM_ALTERACAO, estado: structuredClone(estadoAtual) };
  });
  if (opcoes?.exigirEsquemaNr33 === true || opcoes?.bloquearAutorizacao === true || prepararEscrita) {
    return executarEscritaComBloqueios(query, valores, usuario, id, false, prepararEscrita, opcoes?.exigirEsquemaNr33 === true);
  }
  const resultado = await pool.query(query, valores);
  return resultado.rows[0] || null;
}

async function listarPermitidosNoAmbiente(usuarioAutenticado) {
  const u = validarIdentidade(usuarioAutenticado);
  const resultado = await pool.query(`
    SELECT ch.*, l.nome_local, criador.nome AS usuario_responsavel
    FROM checklist_nr33 AS ch
    INNER JOIN local AS l ON l.id_local = ch.id_local
    INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
    INNER JOIN usuario AS criador ON criador.id_usuario = ch.id_usuario
      AND criador.id_ambiente = c.id_ambiente
    WHERE c.id_ambiente = $1 ${AUTORIZACAO_LEITURA.replace(/\$3/g, "$2")}
    ORDER BY ch.id_checklist ASC
  `, [u.id_ambiente, u.id_usuario]);
  return resultado.rows;
}

async function buscarPermitidoPorIdNoAmbiente(idChecklist, usuarioAutenticado) {
  const id = validarIdentificador(idChecklist, "ID do checklist inválido.");
  const u = validarIdentidade(usuarioAutenticado);
  const resultado = await pool.query(`
    SELECT ch.*, l.nome_local, criador.nome AS usuario_responsavel
    FROM checklist_nr33 AS ch
    INNER JOIN local AS l ON l.id_local = ch.id_local
    INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
    INNER JOIN usuario AS criador ON criador.id_usuario = ch.id_usuario
      AND criador.id_ambiente = c.id_ambiente
    WHERE ch.id_checklist = $1 AND c.id_ambiente = $2 ${AUTORIZACAO_LEITURA}
    LIMIT 1
  `, [id, u.id_ambiente, u.id_usuario]);
  return resultado.rows[0] || null;
}

// Ordem compatível com os módulos anteriores: ambiente -> usuário -> campanha
// -> local -> checklist. IDs dos pais são fixados desde a primeira leitura.
// Opt-in interno exigirEsquemaNr33: capturado antes de abrir a transacao, nao
// pode ser removido pelo callback nem obtido do payload. Sem true, SQL anterior.
async function executarEscritaComBloqueios(query, valores, usuario, id, criacao, prepararEscrita = null, exigirEsquemaNr33 = false) {
  const client = await pool.connect();
  let aberta = false;
  let descartar;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    aberta = true;
    let pais;
    for (const alias of criacao ? ["a", "u", "c", "l"] : ["a", "u", "c", "l", "ch"]) {
      const parametros = [id, usuario.id_ambiente, usuario.id_usuario];
      if (pais) parametros.push(pais.id_campanha, pais.id_local);
      // A ultima consulta de criacao ja ocorre apos autorizar e bloquear a/u/c.
      // LEFT JOIN ON FALSE nao le checklists: apenas vincula explicitamente as
      // colunas no parser. Os NULLs projetados sao prova estrutural, nao respostas.
      // O lock de relacao adquirido pelo SELECT permanece ate o fim da transacao.
      const provarEsquema = exigirEsquemaNr33 && criacao && alias === "l";
      let bloqueio;
      try {
        bloqueio = await client.query(`
        SELECT c.id_campanha, l.id_local${provarEsquema ? ", " + CAMPOS_NR33.map(campo => `estrutura_nr33.${campo}`).join(", ") : ""}
        FROM ambiente AS a INNER JOIN usuario AS u ON u.id_ambiente = a.id_ambiente
        INNER JOIN campanha AS c ON c.id_ambiente = a.id_ambiente
        INNER JOIN local AS l ON l.id_campanha = c.id_campanha
        ${criacao ? "" : "INNER JOIN checklist_nr33 AS ch ON ch.id_local = l.id_local"}
        ${provarEsquema ? "LEFT JOIN checklist_nr33 AS estrutura_nr33 ON FALSE" : ""}
        WHERE ${criacao ? "l.id_local" : "ch.id_checklist"} = $1
          AND a.id_ambiente = $2 AND u.id_usuario = $3
          AND u.ativo = TRUE AND a.ativo = TRUE
          AND ${sqlCapacidade('u', 'checklists.editar')}
          ${pais ? "AND c.id_campanha = $4 AND l.id_local = $5" : ""}
        FOR ${["a", "u"].includes(alias) ? "SHARE" : "UPDATE"} OF ${alias}
      `, parametros);
      } catch (erro) {
        // Apenas a consulta estaticamente conhecida da prova; nao converte
        // undefined_column de DML, callback ou consultas arbitrarias.
        if (provarEsquema && erro?.code === "42703") throw erroEsquemaNr33();
        throw erro;
      }
      if (!bloqueio.rows[0]) {
        await client.query("ROLLBACK");
        aberta = false;
        return null;
      }
      if (provarEsquema) conferirEsquemaNr33(bloqueio.rows[0]);
      pais = bloqueio.rows[0];
    }
    let escrita = { query, valores };
    if (prepararEscrita || exigirEsquemaNr33) {
      let estadoAtual = null;
      if (!criacao) {
        // Todos os locks acima permanecem retidos nesta mesma conexao. ch.* nao
        // pressupoe novas colunas nem exige a migration 026. Revalida acesso e pais.
        const leitura = await client.query(`
          SELECT ch.*
          FROM checklist_nr33 AS ch
          INNER JOIN local AS l ON l.id_local = ch.id_local
          INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
          WHERE ch.id_checklist = $1 AND c.id_ambiente = $2
            AND c.id_campanha = $4 AND l.id_local = $5
            ${AUTORIZACAO_ESCRITA}
        `, [id, usuario.id_ambiente, usuario.id_usuario, pais.id_campanha, pais.id_local]);
        if (!leitura.rows[0]) {
          await client.query("ROLLBACK");
          aberta = false;
          return null;
        }
        estadoAtual = leitura.rows[0];
        if (exigirEsquemaNr33) conferirEsquemaNr33(estadoAtual);
      }
      if (prepararEscrita) escrita = await prepararEscrita(estadoAtual);
    }
    if (escrita.semAlteracao === STATUS_CONCLUIDO_SEM_ALTERACAO) {
      await client.query("COMMIT");
      aberta = false;
      return structuredClone(escrita.estado);
    }
    const resultado = await client.query(escrita.query, escrita.valores);
    if (!resultado.rows[0]) throw criarErro("Falha interna ao salvar checklist.", 500);
    await client.query("COMMIT");
    aberta = false;
    return resultado.rows[0];
  } catch (erro) {
    if (aberta) {
      try { await client.query("ROLLBACK"); } catch (falha) { descartar = falha; }
    } else descartar = erro;
    throw erro;
  } finally {
    if (descartar) client.release(descartar); else client.release();
  }
}

module.exports = {
  statusConcluidoSemAlteracao,
  listarPermitidosNoAmbiente,
  buscarPermitidoPorIdNoAmbiente,
  criarNoAmbiente,
  listarPorAmbiente,
  buscarPorIdEAmbiente,
  buscarPorLocalEAmbiente,
  atualizarNoAmbiente,
  atualizarStatusNoAmbiente,
};
