const { sqlCapacidade } = require('../utils/permissoes');
const pool = require("../config/database");

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

async function criarNoAmbiente(dados, usuarioAutenticado, opcoes) {
  const usuario = validarIdentidade(usuarioAutenticado);
  validarDados(dados);
  const idLocal = validarIdentificador(dados.id_local, "ID do local inválido.");
  const { status = "PENDENTE" } = dados;
  validarStatus(status);

  const query = `
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
      id_usuario
    )
    SELECT
      l.id_local,
      $4, $5, $6, $7, $8, $9, $10,
      NULLIF($11::text, ''),
      $12,
      $3
    FROM local AS l
    INNER JOIN campanha AS c
      ON c.id_campanha = l.id_campanha
    WHERE l.id_local = $1
      AND c.id_ambiente = $2
      ${AUTORIZACAO_ESCRITA}
    RETURNING ch.*
  `;
  const valores = [
    idLocal,
    usuario.id_ambiente,
    usuario.id_usuario,
    ...CAMPOS_RESPOSTAS.map((campo) => dados[campo]),
    dados.observacoes ?? null,
    status,
  ];

  try {
    // Apenas um local autorizado chega ao INSERT e à restrição UNIQUE.
    if (opcoes?.bloquearAutorizacao === true) {
      return await executarEscritaComBloqueios(query, valores, usuario, idLocal, true);
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

  // Não inclui id_local, id_usuario ou status no SET.
  // NULL preserva valores; observação vazia limpa o campo para NULL.
  const query = `
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
    ...CAMPOS_RESPOSTAS.map((campo) => dados[campo] ?? null),
    dados.observacoes ?? null,
  ];
  if (opcoes?.bloquearAutorizacao === true) {
    return executarEscritaComBloqueios(query, valores, usuario, id, false);
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
  if (opcoes?.bloquearAutorizacao === true) {
    return executarEscritaComBloqueios(query, valores, usuario, id, false);
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
async function executarEscritaComBloqueios(query, valores, usuario, id, criacao) {
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
      const bloqueio = await client.query(`
        SELECT c.id_campanha, l.id_local
        FROM ambiente AS a INNER JOIN usuario AS u ON u.id_ambiente = a.id_ambiente
        INNER JOIN campanha AS c ON c.id_ambiente = a.id_ambiente
        INNER JOIN local AS l ON l.id_campanha = c.id_campanha
        ${criacao ? "" : "INNER JOIN checklist_nr33 AS ch ON ch.id_local = l.id_local"}
        WHERE ${criacao ? "l.id_local" : "ch.id_checklist"} = $1
          AND a.id_ambiente = $2 AND u.id_usuario = $3
          AND u.ativo = TRUE AND a.ativo = TRUE
          AND ${sqlCapacidade('u', 'checklists.editar')}
          ${pais ? "AND c.id_campanha = $4 AND l.id_local = $5" : ""}
        FOR ${["a", "u"].includes(alias) ? "SHARE" : "UPDATE"} OF ${alias}
      `, parametros);
      if (!bloqueio.rows[0]) {
        await client.query("ROLLBACK");
        aberta = false;
        return null;
      }
      pais = bloqueio.rows[0];
    }
    const resultado = await client.query(query, valores);
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
  listarPermitidosNoAmbiente,
  buscarPermitidoPorIdNoAmbiente,
  criarNoAmbiente,
  listarPorAmbiente,
  buscarPorIdEAmbiente,
  buscarPorLocalEAmbiente,
  atualizarNoAmbiente,
  atualizarStatusNoAmbiente,
};
