const { sqlCapacidade } = require('../utils/permissoes');
const pool = require("../config/database");

// O esquema multi-tenant e os bloqueios exigem homologação PostgreSQL.

// Fragmentos estáticos internos; nenhum dado do cliente compõe o SQL.
const COLUNAS_LOCAL = `
  l.id_local,
  l.nome_local,
  l.setor,
  l.descricao,
  l.endereco,
  l.latitude,
  l.longitude,
  l.status,
  l.id_campanha,
  l.data_criacao,
  l.data_atualizacao
`;

// Nas três escritas, $3 é sempre o ID do usuário autenticado.
// A campanha c também é limitada ao ambiente autenticado por cada consulta.
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
      AND ${sqlCapacidade('u', 'locais.consultar')}
  )
`;

const AUTORIZACAO_ESCRITA = AUTORIZACAO_LEITURA.replace(sqlCapacidade('u', 'locais.consultar'), sqlCapacidade('u', 'locais.editar'));

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

function validarDados(dados) {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    throw criarErro("Dados do local inválidos.", 400);
  }
}

function validarStatus(status) {
  if (!["ATIVO", "INATIVO"].includes(status)) {
    throw criarErro("O status deve ser ATIVO ou INATIVO.", 400);
  }
}

async function criarNoAmbiente(dados, usuarioAutenticado, opcoes) {
  const usuario = validarIdentidade(usuarioAutenticado);
  validarDados(dados);

  const {
    nomeLocal,
    setor,
    descricao,
    endereco,
    latitude,
    longitude,
    status = "ATIVO",
    idCampanha,
  } = dados;

  const id = validarIdentificador(idCampanha, "ID da campanha inválido.");
  validarStatus(status);

  const query = `
    INSERT INTO local AS l (
      nome_local,
      setor,
      descricao,
      endereco,
      latitude,
      longitude,
      status,
      id_campanha
    )
    SELECT
      $4, $5, $6, $7, $8, $9, $10,
      c.id_campanha
    FROM campanha AS c
    WHERE c.id_campanha = $1
      AND c.id_ambiente = $2
      ${AUTORIZACAO_ESCRITA}
    RETURNING ${COLUNAS_LOCAL}
  `;

  const valores = [
    id,
    usuario.id_ambiente,
    usuario.id_usuario,
    nomeLocal,
    setor,
    descricao,
    endereco,
    latitude,
    longitude,
    status,
  ];
  if (opcoes?.bloquearAutorizacao === true) {
    return executarEscritaComBloqueios(query, valores, usuario, id, true);
  }
  const resultado = await pool.query(query, valores);

  return resultado.rows[0] || null;
}

async function listarPorAmbiente(idAmbiente) {
  validarIdAmbiente(idAmbiente);

  const query = `
    SELECT ${COLUNAS_LOCAL}, c.nome_campanha
    FROM local AS l
    INNER JOIN campanha AS c
      ON c.id_campanha = l.id_campanha
    WHERE c.id_ambiente = $1
    ORDER BY l.data_criacao DESC
  `;

  const resultado = await pool.query(query, [idAmbiente]);
  return resultado.rows;
}

async function buscarPorIdEAmbiente(idLocal, idAmbiente) {
  validarIdAmbiente(idAmbiente);
  const id = validarIdentificador(idLocal, "ID do local inválido.");

  const query = `
    SELECT ${COLUNAS_LOCAL}, c.nome_campanha
    FROM local AS l
    INNER JOIN campanha AS c
      ON c.id_campanha = l.id_campanha
    WHERE l.id_local = $1
      AND c.id_ambiente = $2
    LIMIT 1
  `;

  const resultado = await pool.query(query, [id, idAmbiente]);
  return resultado.rows[0] || null;
}

async function atualizarNoAmbiente(idLocal, dados, usuarioAutenticado, opcoes) {
  const id = validarIdentificador(idLocal, "ID do local inválido.");
  const usuario = validarIdentidade(usuarioAutenticado);
  validarDados(dados);

  // Lista explícita: id_campanha, status e identidade não são atualizados.
  const { nomeLocal, setor, descricao, endereco, latitude, longitude } = dados;

  const query = `
    UPDATE local AS l
    SET
      nome_local = CASE WHEN $10::boolean THEN $4 ELSE l.nome_local END,
      setor = CASE WHEN $11::boolean THEN $5 ELSE l.setor END,
      descricao = CASE WHEN $12::boolean THEN $6 ELSE l.descricao END,
      endereco = CASE WHEN $13::boolean THEN $7 ELSE l.endereco END,
      latitude = CASE WHEN $14::boolean THEN $8 ELSE l.latitude END,
      longitude = CASE WHEN $15::boolean THEN $9 ELSE l.longitude END,
      data_atualizacao = CURRENT_TIMESTAMP
    FROM campanha AS c
    WHERE l.id_local = $1
      AND c.id_campanha = l.id_campanha
      AND c.id_ambiente = $2
      ${AUTORIZACAO_ESCRITA}
    RETURNING ${COLUNAS_LOCAL}
  `;

  const valores = [
    id,
    usuario.id_ambiente,
    usuario.id_usuario,
    nomeLocal,
    setor,
    descricao,
    endereco,
    latitude,
    longitude,
    ...["nomeLocal", "setor", "descricao", "endereco", "latitude", "longitude"].map(
      (campo) => Object.hasOwn(dados, campo)
    ),
  ];
  if (opcoes?.bloquearAutorizacao === true) {
    return executarEscritaComBloqueios(query, valores, usuario, id, false);
  }
  const resultado = await pool.query(query, valores);

  return resultado.rows[0] || null;
}

async function atualizarStatusNoAmbiente(idLocal, status, usuarioAutenticado, opcoes) {
  const id = validarIdentificador(idLocal, "ID do local inválido.");
  const usuario = validarIdentidade(usuarioAutenticado);
  validarStatus(status);

  const query = `
    UPDATE local AS l
    SET
      status = $4,
      data_atualizacao = CURRENT_TIMESTAMP
    FROM campanha AS c
    WHERE l.id_local = $1
      AND c.id_campanha = l.id_campanha
      AND c.id_ambiente = $2
      ${AUTORIZACAO_ESCRITA}
    RETURNING ${COLUNAS_LOCAL}
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

async function listarParaExportacaoPorAmbiente(idAmbiente, usuarioAutenticado) {
  validarIdAmbiente(idAmbiente);
  const usuario = validarIdentidade(usuarioAutenticado);
  if (usuario.id_ambiente !== idAmbiente) throw criarErro("Usuário não autenticado.", 401);

  const query = `
    SELECT
      c.nome_campanha,
      l.id_local,
      l.nome_local,
      l.setor,
      l.endereco,
      l.latitude AS latitude_local,
      l.longitude AS longitude_local,
      l.status,
      e.id_evidencia,
      e.tipo AS tipo_evidencia,
      e.descricao AS descricao_evidencia,
      e.latitude AS latitude_foto,
      e.longitude AS longitude_foto,
      e.origem_coordenadas,
      e.precisao_gps
    FROM local AS l
    INNER JOIN campanha AS c
      ON c.id_campanha = l.id_campanha
    LEFT JOIN evidencia AS e
      ON e.id_local = l.id_local
    WHERE c.id_ambiente = $1
      ${AUTORIZACAO_LEITURA.replace(sqlCapacidade('u', 'locais.consultar'), sqlCapacidade('u', 'locais.exportar')).replace(/\$3/g, "$2")}
    ORDER BY
      c.nome_campanha ASC,
      l.nome_local ASC,
      l.id_local ASC,
      e.id_evidencia ASC
  `;

  const resultado = await pool.query(query, [idAmbiente, usuario.id_usuario]);
  return resultado.rows;
}

// Leituras públicas exigem identidade, atividade e responsabilidade no SQL.
// As consultas antigas por ambiente permanecem para seus consumidores existentes.
async function listarPermitidosNoAmbiente(usuarioAutenticado) {
  const u = validarIdentidade(usuarioAutenticado);
  const resultado = await pool.query(`
    SELECT ${COLUNAS_LOCAL}, c.nome_campanha
    FROM local AS l INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
    WHERE c.id_ambiente = $1 ${AUTORIZACAO_LEITURA.replace(/\$3/g, "$2")}
    ORDER BY l.data_criacao DESC
  `, [u.id_ambiente, u.id_usuario]);
  return resultado.rows;
}

async function buscarPermitidoPorIdNoAmbiente(idLocal, usuarioAutenticado) {
  const id = validarIdentificador(idLocal, "ID do local inválido.");
  const u = validarIdentidade(usuarioAutenticado);
  const resultado = await pool.query(`
    SELECT ${COLUNAS_LOCAL}, c.nome_campanha
    FROM local AS l INNER JOIN campanha AS c ON c.id_campanha = l.id_campanha
    WHERE l.id_local = $1 AND c.id_ambiente = $2 ${AUTORIZACAO_LEITURA}
    LIMIT 1
  `, [id, u.id_ambiente, u.id_usuario]);
  return resultado.rows[0] || null;
}

// Ordem de bloqueios: ambiente -> solicitante -> campanha -> local.
// O ID da campanha observado no primeiro SELECT é fixado nos SELECTs seguintes.
// A própria escrita mantém a autorização, sem recuperação global por ID.
async function executarEscritaComBloqueios(query, valores, usuario, id, criacao) {
  const client = await pool.connect();
  let aberta = false;
  let descartar;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    aberta = true;
    let idCampanha;
    for (const alias of criacao ? ["a", "u", "c"] : ["a", "u", "c", "l"]) {
      const parametros = [id, usuario.id_ambiente, usuario.id_usuario];
      if (idCampanha !== undefined) parametros.push(idCampanha);
      const bloqueio = await client.query(`
        SELECT c.id_campanha
        FROM ambiente AS a INNER JOIN usuario AS u ON u.id_ambiente = a.id_ambiente
        INNER JOIN campanha AS c ON c.id_ambiente = a.id_ambiente
        ${criacao ? "" : "INNER JOIN local AS l ON l.id_campanha = c.id_campanha"}
        WHERE ${criacao ? "c.id_campanha" : "l.id_local"} = $1
          AND a.id_ambiente = $2 AND u.id_usuario = $3
          AND u.ativo = TRUE AND a.ativo = TRUE
          AND ${sqlCapacidade('u', 'locais.editar')}
          ${idCampanha === undefined ? "" : "AND c.id_campanha = $4"}
        FOR ${["c", "l"].includes(alias) ? "UPDATE" : "SHARE"} OF ${alias}
      `, parametros);
      if (!bloqueio.rows[0]) {
        await client.query("ROLLBACK");
        aberta = false;
        return null;
      }
      idCampanha = bloqueio.rows[0].id_campanha;
    }
    const resultado = await client.query(query, valores);
    if (!resultado.rows[0]) throw criarErro("Falha interna ao salvar local.", 500);
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
  atualizarNoAmbiente,
  atualizarStatusNoAmbiente,
  listarParaExportacaoPorAmbiente,
};
