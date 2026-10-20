const { sqlCapacidade } = require('../utils/permissoes');
const pool = require("../config/database");

// Fragmentos estáticos; nenhum nome de coluna ou predicado vem do cliente.
const CAMPOS = [
  "pressao_atmosferica", "ventilacao", "oxigenio", "gas_inflamavel",
  "monoxido_carbono", "sulfeto_hidrogenio", "temperatura", "umidade",
  "observacoes", "status",
];
const PERMISSAO = `AND EXISTS (
  SELECT 1 FROM usuario AS u
  INNER JOIN ambiente AS a ON a.id_ambiente = u.id_ambiente
  WHERE u.id_usuario = $3 AND u.id_ambiente = c.id_ambiente
    AND u.ativo = TRUE AND a.ativo = TRUE
    AND ${sqlCapacidade('u', 'dados_tecnicos.consultar')}
)`;

const PERMISSAO_ESCRITA = PERMISSAO.replace(sqlCapacidade('u', 'dados_tecnicos.consultar'), sqlCapacidade('u', 'dados_tecnicos.editar'));

function erro(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}
function idValido(valor, mensagem, statusCode = 400) {
  if (!["number", "string"].includes(typeof valor) || !Number.isSafeInteger(Number(valor)) || Number(valor) <= 0) {
    throw erro(mensagem, statusCode);
  }
  return Number(valor);
}
function identidade(usuario) {
  if (!usuario || typeof usuario !== "object" || Array.isArray(usuario) ||
    typeof usuario.id_ambiente !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usuario.id_ambiente)) {
    throw erro("Usuário não autenticado.", 401);
  }
  return { id_usuario: idValido(usuario.id_usuario, "Usuário não autenticado.", 401), id_ambiente: usuario.id_ambiente };
}
function validarDados(dados) {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) throw erro("Dados técnicos inválidos.", 400);
  for (const campo of CAMPOS) {
    const valor = dados[campo];
    if (valor == null) continue;
    if (campo === "ventilacao") {
      if (!["NATURAL", "MECANICA", "FORCADA", "NAO_INFORMADA"].includes(valor)) throw erro("Ventilação inválida. Use NATURAL, MECANICA, FORCADA ou NAO_INFORMADA.", 400);
    } else if (campo === "status") {
      if (!["PENDENTE", "CONCLUIDO"].includes(valor)) throw erro("Status inválido. Use PENDENTE ou CONCLUIDO.", 400);
    } else if (campo === "observacoes") {
      if (typeof valor !== "string") throw erro("O campo observacoes deve ser um texto.", 400);
    } else if (!["number", "string"].includes(typeof valor) ||
      typeof valor === "string" && !valor.trim() || !Number.isFinite(Number(valor))) {
      throw erro(`O campo ${campo} deve possuir um valor numérico válido.`, 400);
    }
  }
}

async function consultar(usuarioAutenticado, valor, porLocal = false) {
  const u = identidade(usuarioAutenticado);
  const individual = valor !== undefined;
  const id = individual ? idValido(valor, porLocal ? "ID do local inválido." : "ID dos dados técnicos inválido.") : undefined;
  const parametros = individual ? [id, u.id_ambiente, u.id_usuario] : [u.id_ambiente, u.id_usuario];
  const resultado = await pool.query(`
    SELECT d.*, ${porLocal ? "" : "l.nome_local,"} criador.nome AS usuario_responsavel
    FROM dados_tecnicos AS d
    INNER JOIN local AS l ON l.id_local = d.id_local
    INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
    LEFT JOIN usuario AS criador ON criador.id_usuario = d.id_usuario
      AND criador.id_ambiente = c.id_ambiente
    WHERE ${individual ? `${porLocal ? "d.id_local" : "d.id_dados"} = $1 AND c.id_ambiente = $2` : "c.id_ambiente = $1"}
      ${individual ? PERMISSAO : PERMISSAO.replace(/\$3/g, "$2")}
    ${individual ? "LIMIT 1" : "ORDER BY d.id_dados ASC"}
  `, parametros);
  return individual ? resultado.rows[0] || null : resultado.rows;
}
async function listarPermitidosNoAmbiente(usuario) { return consultar(usuario); }
async function buscarPorIdNoAmbiente(id, usuario) {
  return consultar(usuario, idValido(id, "ID dos dados técnicos inválido."));
}
async function buscarPorLocalNoAmbiente(id, usuario) {
  return consultar(usuario, idValido(id, "ID do local inválido."), true);
}
async function buscarLocalAutorizadoNoAmbiente(idLocal, usuarioAutenticado) {
  const id = idValido(idLocal, "ID do local inválido.");
  const u = identidade(usuarioAutenticado);
  const resultado = await pool.query(`
    SELECT l.id_local FROM local AS l
    INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
    WHERE l.id_local = $1 AND c.id_ambiente = $2 ${PERMISSAO}
    LIMIT 1
  `, [id, u.id_ambiente, u.id_usuario]);
  return resultado.rows[0] || null;
}

// Ordem comum aos módulos protegidos: ambiente -> solicitante -> campanha
// -> local -> dados técnicos. Pais fixados desde a primeira consulta autorizada.
async function escrever(query, parametros, u, id, criacao, capacidade = 'dados_tecnicos.editar') {
  const client = await pool.connect();
  let aberta = false;
  let descartar;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    aberta = true;
    let pais;
    for (const alias of criacao ? ["a", "u", "c", "l"] : ["a", "u", "c", "l", "d"]) {
      const valores = [id, u.id_ambiente, u.id_usuario];
      if (pais) valores.push(pais.id_campanha, pais.id_local);
      const bloqueio = await client.query(`
        SELECT c.id_campanha, l.id_local
        FROM ambiente AS a INNER JOIN usuario AS u ON u.id_ambiente = a.id_ambiente
        INNER JOIN campanha AS c ON c.id_ambiente = a.id_ambiente
        INNER JOIN local AS l ON l.id_campanha = c.id_campanha
        ${criacao ? "" : "INNER JOIN dados_tecnicos AS d ON d.id_local = l.id_local"}
        WHERE ${criacao ? "l.id_local" : "d.id_dados"} = $1
          AND a.id_ambiente = $2 AND u.id_usuario = $3
          AND u.ativo = TRUE AND a.ativo = TRUE
          AND ${sqlCapacidade('u', capacidade)}
          ${pais ? "AND c.id_campanha = $4 AND l.id_local = $5" : ""}
        FOR ${["a", "u"].includes(alias) ? "SHARE" : "UPDATE"} OF ${alias}
      `, valores);
      if (!bloqueio.rows[0]) {
        await client.query("ROLLBACK"); aberta = false; return null;
      }
      pais = bloqueio.rows[0];
    }
    const resultado = await client.query(query, parametros);
    if (!resultado.rows[0]) throw erro("Falha interna ao salvar dados técnicos.", 500);
    await client.query("COMMIT"); aberta = false;
    return resultado.rows[0];
  } catch (falha) {
    if (aberta) {
      try { await client.query("ROLLBACK"); } catch (falhaRollback) { descartar = falhaRollback; }
    } else descartar = falha;
    throw falha;
  } finally {
    if (descartar) client.release(descartar); else client.release();
  }
}
function duplicidadeLocal(falha) {
  return falha?.code === "23505" && (!falha.table || falha.table === "dados_tecnicos") &&
    (falha.constraint === "dados_tecnicos_id_local_key" ||
      !falha.constraint && falha.table === "dados_tecnicos" && falha.column === "id_local");
}
async function criarNoAmbiente(dados, usuarioAutenticado) {
  const u = identidade(usuarioAutenticado); validarDados(dados);
  const id = idValido(dados.id_local, "ID do local inválido.");
  const campos = { ...dados, ventilacao: dados.ventilacao ?? "NAO_INFORMADA", status: dados.status ?? "PENDENTE" };
  try {
    return await escrever(`
      INSERT INTO dados_tecnicos AS d (id_local, ${CAMPOS.join(", ")}, id_usuario)
      SELECT l.id_local, ${CAMPOS.map((_, i) => `$${i + 4}`).join(", ")}, $3
      FROM local AS l INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
      WHERE l.id_local = $1 AND c.id_ambiente = $2 ${PERMISSAO_ESCRITA}
      RETURNING d.*
    `, [id, u.id_ambiente, u.id_usuario, ...CAMPOS.map(c => campos[c] ?? null)], u, id, true);
  } catch (falha) {
    if (duplicidadeLocal(falha)) throw erro("Este local já possui dados técnicos cadastrados.", 409);
    throw falha;
  }
}
async function atualizarNoAmbiente(idDados, dados, usuarioAutenticado) {
  const u = identidade(usuarioAutenticado); validarDados(dados);
  const id = idValido(idDados, "ID dos dados técnicos inválido.");
  return escrever(`
    UPDATE dados_tecnicos AS d
    SET ${CAMPOS.map((c, i) => `${c} = COALESCE($${i + 4}, d.${c})`).join(", ")}, data_atualizacao = CURRENT_TIMESTAMP
    FROM local AS l INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
    WHERE d.id_dados = $1 AND l.id_local = d.id_local AND c.id_ambiente = $2 ${PERMISSAO_ESCRITA}
    RETURNING d.*
  `, [id, u.id_ambiente, u.id_usuario, ...CAMPOS.map(c => dados[c] ?? null)], u, id, false);
}
async function excluirNoAmbiente(idDados, usuarioAutenticado) {
  const u = identidade(usuarioAutenticado);
  const id = idValido(idDados, "ID dos dados técnicos inválido.");
  return escrever(`
    DELETE FROM dados_tecnicos AS d
    USING local AS l, campanha AS c
    WHERE d.id_dados = $1 AND l.id_local = d.id_local
      AND c.id_campanha = l.id_campanha AND c.id_ambiente = $2 ${PERMISSAO.replace(sqlCapacidade('u', 'dados_tecnicos.consultar'), sqlCapacidade('u', 'dados_tecnicos.excluir'))}
    RETURNING d.*
  `, [id, u.id_ambiente, u.id_usuario], u, id, false, 'dados_tecnicos.excluir');
}
module.exports = { criarNoAmbiente, listarPermitidosNoAmbiente, buscarPorIdNoAmbiente,
  buscarPorLocalNoAmbiente, buscarLocalAutorizadoNoAmbiente, atualizarNoAmbiente, excluirNoAmbiente };
