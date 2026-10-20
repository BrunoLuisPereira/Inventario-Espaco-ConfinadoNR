const { sqlCapacidade } = require('../utils/permissoes');
const pool = require("../config/database");

// Fragmentos estáticos; nenhum nome de coluna ou predicado vem do cliente.
const CAMPOS = ['nome_responsavel_tecnico', 'crea', 'numero_art', 'data_art', 'status'];
const PERMISSAO = `AND EXISTS (
  SELECT 1 FROM usuario AS u
  INNER JOIN ambiente AS a ON a.id_ambiente = u.id_ambiente
  WHERE u.id_usuario = $3 AND u.id_ambiente = c.id_ambiente
    AND u.ativo = TRUE AND a.ativo = TRUE
    AND ${sqlCapacidade('u', 'relatorios.consultar')}
)`;

const PERMISSAO_ESCRITA = PERMISSAO.replace(sqlCapacidade('u', 'relatorios.consultar'), sqlCapacidade('u', 'relatorios.editar'));

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
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) throw erro("Dados do relatório inválidos.", 400);
  if (dados.status != null && !['RASCUNHO', 'GERADO'].includes(dados.status)) throw erro('Status invalido.', 400);

}

async function consultar(usuarioAutenticado, valor, porLocal = false) {
  const u = identidade(usuarioAutenticado);
  const individual = valor !== undefined;
  const id = individual ? idValido(valor, porLocal ? "ID do local inválido." : "ID do relatório inválido.") : undefined;
  const parametros = individual ? [id, u.id_ambiente, u.id_usuario] : [u.id_ambiente, u.id_usuario];
  const resultado = await pool.query(`
    SELECT r.*, ${porLocal ? "" : "l.nome_local,"} criador.nome AS usuario_responsavel, criador.email AS email_usuario_responsavel, criador.perfil_acesso AS perfil_usuario_responsavel
    FROM relatorio AS r
    INNER JOIN local AS l ON l.id_local = r.id_local
    INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
    LEFT JOIN usuario AS criador ON criador.id_usuario = r.id_usuario_responsavel
      AND criador.id_ambiente = c.id_ambiente
    WHERE ${individual ? `${porLocal ? "r.id_local" : "r.id_relatorio"} = $1 AND c.id_ambiente = $2` : "c.id_ambiente = $1"}
      ${individual ? PERMISSAO : PERMISSAO.replace(/\$3/g, "$2")}
    ${individual ? "LIMIT 1" : "ORDER BY r.id_relatorio ASC"}
  `, parametros);
  return individual ? resultado.rows[0] || null : resultado.rows;
}
async function listarPermitidosNoAmbiente(usuario) { return consultar(usuario); }
async function buscarPorIdNoAmbiente(id, usuario) {
  return consultar(usuario, idValido(id, "ID do relatório inválido."));
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
// -> local -> relatório. Pais fixados desde a primeira consulta autorizada.
async function escrever(query, parametros, u, id, criacao, capacidade = 'relatorios.editar') {
  const client = await pool.connect();
  let aberta = false;
  let descartar;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    aberta = true;
    let pais;
    for (const alias of criacao ? ["a", "u", "c", "l"] : ["a", "u", "c", "l", "r"]) {
      const valores = [id, u.id_ambiente, u.id_usuario];
      if (pais) valores.push(pais.id_campanha, pais.id_local);
      const bloqueio = await client.query(`
        SELECT c.id_campanha, l.id_local
        FROM ambiente AS a INNER JOIN usuario AS u ON u.id_ambiente = a.id_ambiente
        INNER JOIN campanha AS c ON c.id_ambiente = a.id_ambiente
        INNER JOIN local AS l ON l.id_campanha = c.id_campanha
        ${criacao ? "" : "INNER JOIN relatorio AS r ON r.id_local = l.id_local"}
        WHERE ${criacao ? "l.id_local" : "r.id_relatorio"} = $1
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
    const resultado = typeof query === "function" ? await query(client) : await client.query(query, parametros);
    if (!resultado.rows[0]) throw erro("Falha interna ao salvar relatório.", 500);
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
  return falha?.code === "23505" && (!falha.table || falha.table === "relatorio") &&
    (falha.constraint === "relatorio_id_local_key" ||
      !falha.constraint && falha.table === "relatorio" && falha.column === "id_local");
}
async function criarNoAmbiente(dados, usuarioAutenticado) {
  const u = identidade(usuarioAutenticado); validarDados(dados);
  const id = idValido(dados.id_local, "ID do local inválido.");
  const campos = { ...dados, status: dados.status ?? "RASCUNHO" };
  try {
    return await escrever(`
      INSERT INTO relatorio AS r (id_local, ${CAMPOS.join(", ")}, id_usuario_responsavel)
      SELECT l.id_local, ${CAMPOS.map((_, i) => `$${i + 4}`).join(", ")}, $3
      FROM local AS l INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
      WHERE l.id_local = $1 AND c.id_ambiente = $2 ${PERMISSAO_ESCRITA}
      RETURNING r.*
    `, [id, u.id_ambiente, u.id_usuario, ...CAMPOS.map(c => campos[c] ?? null)], u, id, true);
  } catch (falha) {
    if (duplicidadeLocal(falha)) throw erro("Este local já possui um relatório cadastrado.", 409);
    throw falha;
  }
}
async function atualizarNoAmbiente(idDados, dados, usuarioAutenticado) {
  const u = identidade(usuarioAutenticado); validarDados(dados);
  const id = idValido(idDados, "ID do relatório inválido.");
  return escrever(`
    UPDATE relatorio AS r
    SET ${CAMPOS.map((c, i) => `${c} = CASE WHEN $${i + 9}::boolean THEN $${i + 4} ELSE r.${c} END`).join(", ")}, data_atualizacao = CURRENT_TIMESTAMP
    FROM local AS l INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
    WHERE r.id_relatorio = $1 AND l.id_local = r.id_local AND c.id_ambiente = $2 ${PERMISSAO_ESCRITA}
    RETURNING r.*
  `, [id, u.id_ambiente, u.id_usuario, ...CAMPOS.map(c => dados[c] ?? null), ...CAMPOS.map(c => Object.hasOwn(dados, c))], u, id, false);
}
async function excluirNoAmbiente(idDados, usuarioAutenticado) {
  const u = identidade(usuarioAutenticado);
  const id = idValido(idDados, "ID do relatório inválido.");
  return escrever(`
    DELETE FROM relatorio AS r
    USING local AS l, campanha AS c
    WHERE r.id_relatorio = $1 AND l.id_local = r.id_local
      AND c.id_campanha = l.id_campanha AND c.id_ambiente = $2 ${PERMISSAO.replace(sqlCapacidade('u', 'relatorios.consultar'), sqlCapacidade('u', 'relatorios.excluir'))}
    RETURNING r.*
  `, [id, u.id_ambiente, u.id_usuario], u, id, false, 'relatorios.excluir');
}

const SQL_COMPLETO = `
    SELECT
      r.id_relatorio,
      r.nome_responsavel_tecnico,
      r.crea,
      r.numero_art,
      r.data_art,
      r.status AS status_relatorio,
      r.data_emissao,
      r.caminho_pdf,
      r.hash_pdf,

      u.id_usuario AS id_responsavel,
      u.nome AS responsavel,
      u.email AS email_responsavel,
      u.perfil_acesso AS perfil_responsavel,

      l.id_local,
      l.nome_local,
      l.setor,
      l.descricao AS descricao_local,
      l.endereco,
      l.latitude,
      l.longitude,
      l.status AS status_local,

      c.id_campanha,
      c.nome_campanha,
      c.empresa,
      c.responsavel AS responsavel_campanha,
      c.data_inicio,
      c.status AS status_campanha,

      ch.id_checklist,
      ch.criterio_a,
      ch.criterio_b,
      ch.criterio_c,
      ch.acesso_controlado,
      ch.ventilacao_adequada,
      ch.monitoramento_atmosferico,
      ch.procedimento_emergencia,
      ch.observacoes AS observacoes_checklist,
      ch.status AS status_checklist,

      dt.id_dados,
      dt.pressao_atmosferica,
      dt.ventilacao,
      dt.oxigenio,
      dt.gas_inflamavel,
      dt.monoxido_carbono,
      dt.sulfeto_hidrogenio,
      dt.temperatura,
      dt.umidade,
      dt.observacoes AS observacoes_dados_tecnicos,
      dt.status AS status_dados_tecnicos,

      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id_evidencia', e.id_evidencia,
              'tipo', e.tipo,
              'caminho_arquivo', e.caminho_arquivo,
              'descricao', e.descricao,
              'id_usuario', e.id_usuario,
              'data_criacao', e.data_criacao,

              -- Geolocalização da evidência
              'latitude', e.latitude,
              'longitude', e.longitude,
              'origem_coordenadas', e.origem_coordenadas,
              'precisao_gps', e.precisao_gps,
              'data_captura_gps', e.data_captura_gps
            )
            ORDER BY e.id_evidencia
          )
          FROM evidencia e
          WHERE e.id_local = l.id_local
        ),
        '[]'::json
      ) AS evidencias

    FROM relatorio r

    INNER JOIN local l
      ON l.id_local = r.id_local

    INNER JOIN campanha c
      ON c.id_campanha = l.id_campanha

    LEFT JOIN usuario u
      ON u.id_usuario = r.id_usuario_responsavel
      AND u.id_ambiente = c.id_ambiente

    LEFT JOIN checklist_nr33 ch
      ON ch.id_local = l.id_local

    LEFT JOIN dados_tecnicos dt
      ON dt.id_local = l.id_local

    WHERE r.id_relatorio = $1 AND c.id_ambiente = $2 ${PERMISSAO.replace(sqlCapacidade('u', 'relatorios.consultar'), sqlCapacidade('u', 'relatorios.excluir'))}
  `;

async function buscarCompletoNoAmbiente(idRelatorio, usuario) {
  const u = identidade(usuario);
  const id = idValido(idRelatorio, 'ID do relatorio invalido.');
  if (!await buscarPorIdNoAmbiente(id, u)) return null;
  const resultado = await pool.query(SQL_COMPLETO, [id, u.id_ambiente, u.id_usuario]);
  return resultado.rows[0] || null;
}
async function comRelatorioAutorizado(idRelatorio, usuario, executar) {
  const u = identidade(usuario);
  const id = idValido(idRelatorio, 'ID do relatorio invalido.');
  return escrever(async client => {
    const resultado = await client.query(`SELECT r.* FROM relatorio AS r
      INNER JOIN local AS l ON l.id_local = r.id_local
      INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
      WHERE r.id_relatorio = $1 AND c.id_ambiente = $2 ${PERMISSAO}`, [id, u.id_ambiente, u.id_usuario]);
    if (!resultado.rows[0]) throw erro('Falha interna ao carregar relatorio.', 500);
    return { rows: [await executar(resultado.rows[0])] };
  }, null, u, id, false, 'relatorios.consultar');
}
async function gerarNoAmbiente(idRelatorio, usuario, gerar) {
  const u = identidade(usuario);
  const id = idValido(idRelatorio, 'ID do relatorio invalido.');
  return escrever(async client => {
    const contexto = await client.query(SQL_COMPLETO, [id, u.id_ambiente, u.id_usuario]);
    if (!contexto.rows[0]) throw erro('Falha interna ao carregar relatorio.', 500);
    const arquivo = await gerar(contexto.rows[0]);
    const atualizado = await client.query(`UPDATE relatorio AS r SET caminho_pdf = $4,
      hash_pdf = $5, status = 'GERADO', data_emissao = CURRENT_TIMESTAMP, data_atualizacao = CURRENT_TIMESTAMP
      FROM local AS l INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
      WHERE r.id_relatorio = $1 AND l.id_local = r.id_local AND c.id_ambiente = $2 ${PERMISSAO_ESCRITA}
      RETURNING r.*`, [id, u.id_ambiente, u.id_usuario, arquivo.caminhoRelativo, arquivo.hash]);
    if (!atualizado.rows[0]) throw erro('Falha interna ao salvar relatorio.', 500);
    return { rows: [{ relatorio: atualizado.rows[0], arquivo: { caminho: arquivo.caminhoRelativo, hash_sha256: arquivo.hash } }] };
  }, null, u, id, false);
}
module.exports = { criarNoAmbiente, listarPermitidosNoAmbiente, buscarPorIdNoAmbiente,
  buscarPorLocalNoAmbiente, buscarLocalAutorizadoNoAmbiente, atualizarNoAmbiente,
  excluirNoAmbiente, buscarCompletoNoAmbiente, comRelatorioAutorizado, gerarNoAmbiente };
