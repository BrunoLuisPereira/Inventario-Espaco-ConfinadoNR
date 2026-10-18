
const pool = require("../config/database");

const PERMISSAO_LEITURA = `AND EXISTS (
  SELECT 1 FROM usuario AS solicitante
  INNER JOIN ambiente AS a ON a.id_ambiente = solicitante.id_ambiente
  WHERE solicitante.id_usuario = $2 AND solicitante.id_ambiente = c.id_ambiente
    AND solicitante.ativo = TRUE AND a.ativo = TRUE
    AND (solicitante.perfil_acesso = 'ADMINISTRADOR' OR c.id_usuario = solicitante.id_usuario)
)`;

function validarIdentidadeAtual(usuario) {
  if (!usuario || typeof usuario !== "object" || Array.isArray(usuario) ||
    !["number", "string"].includes(typeof usuario.id_usuario) ||
    !Number.isSafeInteger(Number(usuario.id_usuario)) || Number(usuario.id_usuario) <= 0) {
    throw Object.assign(new Error("Usuário não autenticado."), { statusCode: 401 });
  }
  validarIdAmbiente(usuario.id_ambiente);
  return { id_usuario: Number(usuario.id_usuario), id_ambiente: usuario.id_ambiente };
}

async function listarPermitidasNoAmbiente(usuarioAutenticado) {
  const u = validarIdentidadeAtual(usuarioAutenticado);
  const resultado = await pool.query(`
    SELECT c.*, u.nome AS usuario_responsavel FROM campanha AS c
    INNER JOIN usuario AS u ON u.id_usuario = c.id_usuario AND u.id_ambiente = c.id_ambiente
    WHERE c.id_ambiente = $1 ${PERMISSAO_LEITURA} ORDER BY c.data_criacao DESC
  `, [u.id_ambiente, u.id_usuario]);
  return resultado.rows;
}

async function buscarPermitidaPorIdNoAmbiente(idCampanha, usuarioAutenticado) {
  const u = validarIdentidadeAtual(usuarioAutenticado);
  if (!["number", "string"].includes(typeof idCampanha) || !Number.isSafeInteger(Number(idCampanha)) || Number(idCampanha) <= 0) {
    throw Object.assign(new Error("ID da campanha inválido."), { statusCode: 400 });
  }
  const resultado = await pool.query(`
    SELECT c.*, u.nome AS usuario_responsavel FROM campanha AS c
    INNER JOIN usuario AS u ON u.id_usuario = c.id_usuario AND u.id_ambiente = c.id_ambiente
    WHERE c.id_ambiente = $1 ${PERMISSAO_LEITURA} AND c.id_campanha = $3 LIMIT 1
  `, [u.id_ambiente, u.id_usuario, Number(idCampanha)]);
  return resultado.rows[0] || null;
}

// Ordem única de locks: ambiente -> solicitante -> campanha. A própria escrita
// mantém os filtros SQL; não existe fallback para UPDATE global por ID.
async function executarEscritaComBloqueios(query, valores, usuario, idCampanha) {
  const client = await pool.connect();
  let aberta = false;
  let descartar;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    aberta = true;
    const comCampanha = idCampanha !== undefined;
    const identidade = [usuario.id_ambiente, usuario.id_usuario, ...(comCampanha ? [idCampanha] : [])];
    for (const alias of comCampanha ? ["a", "u", "c"] : ["a", "u"]) {
      const bloqueio = await client.query(`
        SELECT u.id_usuario ${comCampanha ? ", c.id_campanha" : ""}
        FROM ambiente AS a INNER JOIN usuario AS u ON u.id_ambiente = a.id_ambiente
        ${comCampanha ? "INNER JOIN campanha AS c ON c.id_ambiente = a.id_ambiente" : ""}
        WHERE a.id_ambiente = $1 AND u.id_usuario = $2 AND u.ativo = TRUE AND a.ativo = TRUE
          ${comCampanha
            ? "AND c.id_campanha = $3 AND (u.perfil_acesso = 'ADMINISTRADOR' OR c.id_usuario = u.id_usuario)"
            : "AND u.perfil_acesso IN ('ADMINISTRADOR', 'ENGENHEIRO_SEGURANCA')"}
        FOR ${alias === "c" ? "UPDATE" : "SHARE"} OF ${alias}
      `, identidade);
      if (!bloqueio.rows[0]) {
        await client.query("ROLLBACK");
        aberta = false;
        return null;
      }
    }
    const resultado = await client.query(query, valores);
    if (!resultado.rows[0]) throw Object.assign(new Error("Falha interna ao salvar campanha."), { statusCode: 500 });
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

/**
 * Valida o identificador UUID do ambiente.
 *
 * O identificador deve vir exclusivamente
 * da autenticação realizada pelo backend.
 */
function validarIdAmbiente(idAmbiente) {
  if (
    typeof idAmbiente !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idAmbiente
    )
  ) {
    const erro = new Error(
      "Identificação do ambiente inválida."
    );

    erro.statusCode = 403;
    throw erro;
  }
}

/**
 * Lista somente as campanhas de um ambiente.
 *
 * IMPORTANTE:
 * Depende da migração 020.
 * Não utilizar antes da homologação.
 */
async function listarPorAmbiente(idAmbiente) {
  validarIdAmbiente(idAmbiente);

  const query = `
    SELECT
      c.id_campanha,
      c.id_ambiente,
      c.nome_campanha,
      c.empresa,
      c.responsavel,
      c.data_inicio,
      c.status,
      c.id_usuario,
      u.nome AS usuario_responsavel,
      c.data_criacao,
      c.data_atualizacao
    FROM campanha AS c
    INNER JOIN usuario AS u
      ON u.id_usuario = c.id_usuario
      AND u.id_ambiente = c.id_ambiente
    WHERE c.id_ambiente = $1
    ORDER BY c.data_criacao DESC
  `;

  const resultado = await pool.query(
    query,
    [idAmbiente]
  );

  return resultado.rows;
}

/**
 * Busca uma campanha pertencente ao ambiente.
 *
 * Campanhas de outros ambientes não são
 * retornadas, mesmo que seu ID seja conhecido.
 */
async function buscarPorIdEAmbiente(
  idCampanha,
  idAmbiente
) {
  validarIdAmbiente(idAmbiente);

  const id = Number(idCampanha);

  if (!Number.isSafeInteger(id) || id <= 0) {
    const erro = new Error(
      "ID da campanha inválido."
    );

    erro.statusCode = 400;
    throw erro;
  }

  const query = `
    SELECT
      c.id_campanha,
      c.id_ambiente,
      c.nome_campanha,
      c.empresa,
      c.responsavel,
      c.data_inicio,
      c.status,
      c.id_usuario,
      u.nome AS usuario_responsavel,
      c.data_criacao,
      c.data_atualizacao
    FROM campanha AS c
    INNER JOIN usuario AS u
      ON u.id_usuario = c.id_usuario
      AND u.id_ambiente = c.id_ambiente
    WHERE c.id_campanha = $1
      AND c.id_ambiente = $2
    LIMIT 1
  `;

  const resultado = await pool.query(
    query,
    [id, idAmbiente]
  );

  return resultado.rows[0] || null;
}

/**
 * Cria uma campanha no ambiente autenticado.
 *
 * O id_ambiente deve ser obtido exclusivamente
 * da identidade validada pelo backend.
 *
 * IMPORTANTE:
 * Depende da migração 020.
 * Não utilizar antes da homologação.
 */
async function criarNoAmbiente(dados, idAmbiente, opcoes) {
  validarIdAmbiente(idAmbiente);

  if (!dados || typeof dados !== "object") {
    const erro = new Error(
      "Dados da campanha inválidos."
    );
    erro.statusCode = 400;
    throw erro;
  }

  const {
    nomeCampanha,
    empresa,
    responsavel,
    dataInicio,
    status,
    idUsuario,
  } = dados;

  const id = Number(idUsuario);

  if (!Number.isSafeInteger(id) || id <= 0) {
    const erro = new Error(
      "Identificação do usuário inválida."
    );
    erro.statusCode = 400;
    throw erro;
  }

  const query = `
    INSERT INTO campanha (
      id_ambiente,
      nome_campanha,
      empresa,
      responsavel,
      data_inicio,
      status,
      id_usuario
    )
    SELECT
      u.id_ambiente,
      $1,
      $2,
      $3,
      $4,
      $5,
      u.id_usuario
    FROM usuario AS u
    INNER JOIN ambiente AS a
      ON a.id_ambiente = u.id_ambiente
    WHERE u.id_usuario = $6
      AND u.id_ambiente = $7
      AND u.ativo = TRUE
      AND a.ativo = TRUE
      AND u.perfil_acesso IN ('ADMINISTRADOR', 'ENGENHEIRO_SEGURANCA')
    RETURNING
      id_campanha,
      id_ambiente,
      nome_campanha,
      empresa,
      responsavel,
      data_inicio,
      status,
      id_usuario,
      data_criacao,
      data_atualizacao
  `;

  const valores = [
    nomeCampanha,
    empresa,
    responsavel,
    dataInicio,
    status,
    id,
    idAmbiente,
  ];

  if (opcoes?.bloquearAutorizacao === true) {
    return executarEscritaComBloqueios(query, valores, { id_usuario: id, id_ambiente: idAmbiente });
  }
  const resultado = await pool.query(
    query,
    valores
  );

  return resultado.rows[0] || null;
}

/**
 * Atualiza uma campanha somente quando:
 *
 * 1. Pertence ao ambiente autenticado;
 * 2. O usuário é administrador ou responsável;
 * 3. O usuário e o ambiente estão ativos.
 *
 * IMPORTANTE:
 * Depende da migração 020.
 * Não utilizar antes da homologação.
 */
async function atualizarNoAmbiente(
  idCampanha,
  dados,
  usuarioAutenticado,
  opcoes
) {
  const id = Number(idCampanha);

  if (!Number.isSafeInteger(id) || id <= 0) {
    const erro = new Error("ID da campanha inválido.");
    erro.statusCode = 400;
    throw erro;
  }

  if (!usuarioAutenticado) {
    const erro = new Error("Usuário não autenticado.");
    erro.statusCode = 401;
    throw erro;
  }

  const {
    id_usuario: idUsuario,
    id_ambiente: idAmbiente,
  } = usuarioAutenticado;

  validarIdAmbiente(idAmbiente);

  const idUsuarioNumerico = Number(idUsuario);

  if (
    !Number.isSafeInteger(idUsuarioNumerico) ||
    idUsuarioNumerico <= 0
  ) {
    const erro = new Error("Usuário inválido.");
    erro.statusCode = 403;
    throw erro;
  }

  if (!dados || typeof dados !== "object") {
    const erro = new Error("Dados da campanha inválidos.");
    erro.statusCode = 400;
    throw erro;
  }

  const {
    nomeCampanha,
    empresa,
    responsavel,
    dataInicio,
  } = dados;

  const query = `
    UPDATE campanha AS c
    SET
      nome_campanha = $1,
      empresa = $2,
      responsavel = $3,
      data_inicio = $4,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE c.id_campanha = $5
      AND c.id_ambiente = $6
      AND EXISTS (
        SELECT 1
        FROM usuario AS u
        INNER JOIN ambiente AS a
          ON a.id_ambiente = u.id_ambiente
        WHERE u.id_usuario = $7
          AND u.id_ambiente = c.id_ambiente
          AND u.ativo = TRUE
          AND a.ativo = TRUE
          AND (
            u.perfil_acesso = 'ADMINISTRADOR'
            OR c.id_usuario = u.id_usuario
          )
      )
    RETURNING
      c.id_campanha,
      c.id_ambiente,
      c.nome_campanha,
      c.empresa,
      c.responsavel,
      c.data_inicio,
      c.status,
      c.id_usuario,
      c.data_criacao,
      c.data_atualizacao
  `;

  const valores = [
    nomeCampanha,
    empresa,
    responsavel,
    dataInicio,
    id,
    idAmbiente,
    idUsuarioNumerico,
  ];

  if (opcoes?.bloquearAutorizacao === true) {
    return executarEscritaComBloqueios(query, valores, { id_usuario: idUsuarioNumerico, id_ambiente: idAmbiente }, id);
  }
  const resultado = await pool.query(query, valores);

  return resultado.rows[0] || null;
}

/**
 * Altera o status somente no ambiente autenticado,
 * para administrador ou responsável, ambos os vínculos ativos.
 *
 * Depende das migrações multi-tenant homologadas.
 * Não utilizar nas rotas antes da homologação.
 */
async function atualizarStatusNoAmbiente(
  idCampanha,
  status,
  usuarioAutenticado,
  opcoes
) {
  const id = Number(idCampanha);

  if (!Number.isSafeInteger(id) || id <= 0) {
    const erro = new Error("ID da campanha inválido.");
    erro.statusCode = 400;
    throw erro;
  }

  if (!usuarioAutenticado) {
    const erro = new Error("Usuário não autenticado.");
    erro.statusCode = 401;
    throw erro;
  }

  const {
    id_usuario: idUsuario,
    id_ambiente: idAmbiente,
  } = usuarioAutenticado;

  validarIdAmbiente(idAmbiente);

  const idUsuarioNumerico = Number(idUsuario);

  if (
    !Number.isSafeInteger(idUsuarioNumerico) ||
    idUsuarioNumerico <= 0
  ) {
    const erro = new Error("Usuário inválido.");
    erro.statusCode = 403;
    throw erro;
  }

  const statusPermitidos = [
    "EM ANDAMENTO",
    "CONCLUIDO",
    "CANCELADA",
  ];

  if (!statusPermitidos.includes(status)) {
    const erro = new Error(
      "O status deve ser EM ANDAMENTO, CONCLUIDO ou CANCELADA."
    );
    erro.statusCode = 400;
    throw erro;
  }

  const query = `
    UPDATE campanha AS c
    SET
      status = $1,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE c.id_campanha = $2
      AND c.id_ambiente = $3
      AND EXISTS (
        SELECT 1
        FROM usuario AS u
        INNER JOIN ambiente AS a
          ON a.id_ambiente = u.id_ambiente
        WHERE u.id_usuario = $4
          AND u.id_ambiente = c.id_ambiente
          AND u.ativo = TRUE
          AND a.ativo = TRUE
          AND (
            u.perfil_acesso = 'ADMINISTRADOR'
            OR c.id_usuario = u.id_usuario
          )
      )
    RETURNING
      c.id_campanha,
      c.id_ambiente,
      c.nome_campanha,
      c.empresa,
      c.responsavel,
      c.data_inicio,
      c.status,
      c.id_usuario,
      c.data_criacao,
      c.data_atualizacao
  `;

  const valores = [
    status,
    id,
    idAmbiente,
    idUsuarioNumerico,
  ];

  if (opcoes?.bloquearAutorizacao === true) {
    return executarEscritaComBloqueios(query, valores, { id_usuario: idUsuarioNumerico, id_ambiente: idAmbiente }, id);
  }
  const resultado = await pool.query(query, valores);

  return resultado.rows[0] || null;
}

module.exports = {
  listarPermitidasNoAmbiente,
  buscarPermitidaPorIdNoAmbiente,
  listarPorAmbiente,
  buscarPorIdEAmbiente,
  criarNoAmbiente,
  atualizarNoAmbiente,
  atualizarStatusNoAmbiente,
};
