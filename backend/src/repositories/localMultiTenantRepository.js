const pool = require("../config/database");

// Depende da homologação das migrações multi-tenant e do versionamento.
// Não utilizar nas rotas antes da homologação.

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
const AUTORIZACAO_ESCRITA = `
  AND EXISTS (
    SELECT 1
    FROM usuario AS u
    INNER JOIN ambiente AS a
      ON a.id_ambiente = u.id_ambiente
    WHERE u.id_usuario = $3
      AND u.id_ambiente = c.id_ambiente
      AND u.ativo = TRUE
      AND a.ativo = TRUE
      AND (
        u.perfil_acesso = 'ADMINISTRADOR'
        OR c.id_usuario = u.id_usuario
      )
  )
`;

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

async function criarNoAmbiente(dados, usuarioAutenticado) {
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

async function atualizarNoAmbiente(idLocal, dados, usuarioAutenticado) {
  const id = validarIdentificador(idLocal, "ID do local inválido.");
  const usuario = validarIdentidade(usuarioAutenticado);
  validarDados(dados);

  // Lista explícita: id_campanha, status e identidade não são atualizados.
  const { nomeLocal, setor, descricao, endereco, latitude, longitude } = dados;

  const query = `
    UPDATE local AS l
    SET
      nome_local = $4,
      setor = $5,
      descricao = $6,
      endereco = $7,
      latitude = $8,
      longitude = $9,
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
  ];
  const resultado = await pool.query(query, valores);

  return resultado.rows[0] || null;
}

async function atualizarStatusNoAmbiente(idLocal, status, usuarioAutenticado) {
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

  const resultado = await pool.query(query, [
    id,
    usuario.id_ambiente,
    usuario.id_usuario,
    status,
  ]);

  return resultado.rows[0] || null;
}

async function listarParaExportacaoPorAmbiente(idAmbiente) {
  validarIdAmbiente(idAmbiente);

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
    ORDER BY
      c.nome_campanha ASC,
      l.nome_local ASC,
      l.id_local ASC,
      e.id_evidencia ASC
  `;

  const resultado = await pool.query(query, [idAmbiente]);
  return resultado.rows;
}

module.exports = {
  criarNoAmbiente,
  listarPorAmbiente,
  buscarPorIdEAmbiente,
  atualizarNoAmbiente,
  atualizarStatusNoAmbiente,
  listarParaExportacaoPorAmbiente,
};
