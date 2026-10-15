const pool = require("../config/database");

// Requer o esquema das migrações 015/019 e a homologação multi-tenant/versionamento.
// Não utilizar nas rotas antes da homologação. Não realiza operações de arquivo.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS = ["FOTO", "TEXTO", "DOCUMENTO"];
const INDICE_IDEMPOTENCIA = "uq_evidencia_id_operacao_cliente";

// Fragmentos estáticos: $1 é o ambiente e $2 é o usuário solicitante.
const AUTORIZACAO = `
  AND EXISTS (
    SELECT 1
    FROM usuario AS solicitante
    INNER JOIN ambiente AS a
      ON a.id_ambiente = solicitante.id_ambiente
    WHERE solicitante.id_usuario = $2
      AND solicitante.id_ambiente = c.id_ambiente
      AND solicitante.ativo = TRUE
      AND a.ativo = TRUE
      AND (
        solicitante.perfil_acesso = 'ADMINISTRADOR'
        OR c.id_usuario = solicitante.id_usuario
      )
  )
`;
const LEITURA = `
  SELECT e.*, l.nome_local, criador.nome AS usuario_responsavel
  FROM evidencia AS e
  INNER JOIN local AS l
    ON l.id_local = e.id_local
  INNER JOIN campanha AS c
    ON c.id_campanha = l.id_campanha
  INNER JOIN usuario AS criador
    ON criador.id_usuario = e.id_usuario
    AND criador.id_ambiente = c.id_ambiente
  WHERE c.id_ambiente = $1
  ${AUTORIZACAO}
`;

function criarErro(message, statusCode = 400) {
  const erro = new Error(message);
  erro.statusCode = statusCode;
  return erro;
}

function validarIdentificador(valor, mensagem, statusCode = 400) {
  if (
    (typeof valor !== "number" && typeof valor !== "string") ||
    !Number.isSafeInteger(Number(valor)) || Number(valor) <= 0
  ) {
    throw criarErro(mensagem, statusCode);
  }
  return Number(valor);
}

function validarUuid(valor, mensagem, statusCode = 400) {
  if (typeof valor !== "string" || !UUID.test(valor)) {
    throw criarErro(mensagem, statusCode);
  }
  return valor;
}

function validarIdentidade(usuarioAutenticado) {
  if (
    !usuarioAutenticado || typeof usuarioAutenticado !== "object" ||
    Array.isArray(usuarioAutenticado)
  ) {
    throw criarErro("Usuário não autenticado.", 401);
  }
  return {
    id_usuario: validarIdentificador(
      usuarioAutenticado.id_usuario, "Identidade autenticada inválida.", 401
    ),
    id_ambiente: validarUuid(
      usuarioAutenticado.id_ambiente, "Identidade autenticada inválida.", 401
    ),
  };
}

function validarDados(dados) {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    throw criarErro("Dados da evidência inválidos.");
  }
}

function validarTipo(valor) {
  if (!TIPOS.includes(valor)) {
    throw criarErro("Tipo inválido. Use FOTO, TEXTO ou DOCUMENTO.");
  }
  return valor;
}

function textoOpcional(valor, campo, limite) {
  if (valor == null || valor === "") return null;
  if (typeof valor !== "string" || (limite && valor.length > limite)) {
    throw criarErro(`O campo ${campo} é inválido.`);
  }
  // Mantém caminhos e textos legados sem reescrever ou resolver arquivos.
  return valor;
}

function numeroOpcional(valor, campo, minimo, maximo) {
  if (valor == null || (typeof valor === "string" && !valor.trim())) return null;
  if (
    (typeof valor !== "number" && typeof valor !== "string") ||
    !Number.isFinite(Number(valor)) || Number(valor) < minimo || Number(valor) > maximo
  ) {
    throw criarErro(`O campo ${campo} é inválido.`);
  }
  return Number(valor);
}

function origemOpcional(valor) {
  if (valor == null || valor === "") return null;
  if (!["GPS", "MANUAL"].includes(valor)) {
    throw criarErro("Origem inválida. Utilize GPS ou MANUAL.");
  }
  return valor;
}

function dataOpcional(valor) {
  if (valor == null || valor === "") return null;
  if (typeof valor !== "string" && !(valor instanceof Date)) {
    throw criarErro("Data de captura do GPS inválida.");
  }
  const data = new Date(valor);
  if (!Number.isFinite(data.getTime())) {
    throw criarErro("Data de captura do GPS inválida.");
  }
  return data.toISOString();
}

const NORMALIZADORES = {
  tipo: validarTipo,
  caminho_arquivo: (valor) => textoOpcional(valor, "caminho_arquivo", 500),
  descricao: (valor) => textoOpcional(valor, "descricao"),
  latitude: (valor) => numeroOpcional(valor, "latitude", -90, 90),
  longitude: (valor) => numeroOpcional(valor, "longitude", -180, 180),
  precisao_gps: (valor) => numeroOpcional(valor, "precisao_gps", 0, 99999999.99),
  origem_coordenadas: origemOpcional,
  data_captura_gps: dataOpcional,
};

async function criarNoAmbiente(dados, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  validarDados(dados);
  const idLocal = validarIdentificador(dados.id_local, "ID do local inválido.");
  const tipo = validarTipo(dados.tipo);
  const caminho = NORMALIZADORES.caminho_arquivo(dados.caminho_arquivo);
  const descricao = NORMALIZADORES.descricao(dados.descricao);
  const operacao = dados.id_operacao_cliente == null || dados.id_operacao_cliente === ""
    ? null
    : validarUuid(dados.id_operacao_cliente, "ID da operação do cliente inválido.");
  const latitude = NORMALIZADORES.latitude(dados.latitude);
  const longitude = NORMALIZADORES.longitude(dados.longitude);
  if ((latitude === null) !== (longitude === null)) {
    throw criarErro("Informe latitude e longitude juntas.");
  }
  const precisao = NORMALIZADORES.precisao_gps(dados.precisao_gps);
  const origem = NORMALIZADORES.origem_coordenadas(dados.origem_coordenadas);
  const dataCaptura = NORMALIZADORES.data_captura_gps(dados.data_captura_gps);

  const query = `
    INSERT INTO evidencia AS e (
      id_local, tipo, caminho_arquivo, descricao, id_usuario,
      id_operacao_cliente, latitude, longitude, precisao_gps,
      origem_coordenadas, data_captura_gps
    )
    SELECT l.id_local, $4, $5, $6, $2, $7, $8, $9, $10, $11, $12
    FROM local AS l
    INNER JOIN campanha AS c
      ON c.id_campanha = l.id_campanha
    WHERE c.id_ambiente = $1
      AND l.id_local = $3
      ${AUTORIZACAO}
    RETURNING e.*
  `;
  const valores = [
    usuario.id_ambiente, usuario.id_usuario, idLocal, tipo, caminho, descricao,
    operacao, latitude, longitude, precisao, origem, dataCaptura,
  ];

  try {
    const resultado = await pool.query(query, valores);
    return resultado.rows[0] || null;
  } catch (erro) {
    if (
      erro?.code === "23505" && erro.constraint === INDICE_IDEMPOTENCIA &&
      (!erro.table || erro.table === "evidencia")
    ) {
      // Sinaliza ao serviço sem recuperar registro global ou expor detail.
      const conflito = criarErro("Não foi possível processar esta chave de operação.", 409);
      conflito.code = "23505";
      conflito.constraint = INDICE_IDEMPOTENCIA;
      throw conflito;
    }
    throw erro;
  }
}

async function listarPermitidasNoAmbiente(usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const resultado = await pool.query(
    `${LEITURA} ORDER BY e.id_evidencia ASC`,
    [usuario.id_ambiente, usuario.id_usuario]
  );
  return resultado.rows;
}

async function buscarPorIdEAmbiente(idEvidencia, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idEvidencia, "ID da evidência inválido.");
  const resultado = await pool.query(
    `${LEITURA} AND e.id_evidencia = $3 LIMIT 1`,
    [usuario.id_ambiente, usuario.id_usuario, id]
  );
  return resultado.rows[0] || null;
}

async function listarPorLocalEAmbiente(idLocal, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idLocal, "ID do local inválido.");
  const resultado = await pool.query(
    `${LEITURA} AND e.id_local = $3 ORDER BY e.id_evidencia ASC`,
    [usuario.id_ambiente, usuario.id_usuario, id]
  );
  return resultado.rows;
}

async function buscarPorOperacaoClienteNoAmbiente(idOperacaoCliente, idLocal, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idLocal, "ID do local inválido.");
  const operacao = validarUuid(idOperacaoCliente, "ID da operação do cliente inválido.");
  const resultado = await pool.query(
    `${LEITURA} AND e.id_local = $3 AND e.id_operacao_cliente = $4 LIMIT 1`,
    [usuario.id_ambiente, usuario.id_usuario, id, operacao]
  );
  return resultado.rows[0] || null;
}

async function atualizarNoAmbiente(idEvidencia, dados, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idEvidencia, "ID da evidência inválido.");
  validarDados(dados);

  // Apenas campos fixos e permitidos: nunca altera local, criador ou operação.
  // Cada campo tem flag de presença para distinguir omissão de limpeza por NULL.
  const valores = [usuario.id_ambiente, usuario.id_usuario, id];
  for (const campo of Object.keys(NORMALIZADORES)) {
    const informado = Object.hasOwn(dados, campo) && dados[campo] !== undefined;
    valores.push(informado, informado ? NORMALIZADORES[campo](dados[campo]) : null);
  }

  const query = `
    UPDATE evidencia AS e
    SET
      tipo = CASE WHEN $4::boolean THEN $5 ELSE e.tipo END,
      caminho_arquivo = CASE WHEN $6::boolean THEN $7 ELSE e.caminho_arquivo END,
      descricao = CASE WHEN $8::boolean THEN $9 ELSE e.descricao END,
      latitude = CASE WHEN $10::boolean THEN $11::numeric ELSE e.latitude END,
      longitude = CASE WHEN $12::boolean THEN $13::numeric ELSE e.longitude END,
      precisao_gps = CASE WHEN $14::boolean THEN $15::numeric ELSE e.precisao_gps END,
      origem_coordenadas = CASE WHEN $16::boolean THEN $17 ELSE e.origem_coordenadas END,
      data_captura_gps = CASE WHEN $18::boolean THEN $19::timestamptz ELSE e.data_captura_gps END,
      data_atualizacao = CURRENT_TIMESTAMP
    FROM local AS l
    INNER JOIN campanha AS c
      ON c.id_campanha = l.id_campanha
    WHERE c.id_ambiente = $1
      AND e.id_evidencia = $3
      AND l.id_local = e.id_local
      ${AUTORIZACAO}
    RETURNING e.*
  `;
  // A CHECK de par latitude/longitude também valida o estado final combinado
  // com os valores atuais, inclusive quando só uma coordenada é informada.
  const resultado = await pool.query(query, valores);
  return resultado.rows[0] || null;
}

async function excluirNoAmbiente(idEvidencia, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idEvidencia, "ID da evidência inválido.");
  const query = `
    DELETE FROM evidencia AS e
    USING local AS l, campanha AS c
    WHERE c.id_ambiente = $1
      AND e.id_evidencia = $3
      AND l.id_local = e.id_local
      AND c.id_campanha = l.id_campanha
      ${AUTORIZACAO}
    RETURNING e.*
  `;
  const resultado = await pool.query(query, [usuario.id_ambiente, usuario.id_usuario, id]);
  return resultado.rows[0] || null;
}

module.exports = {
  criarNoAmbiente,
  listarPermitidasNoAmbiente,
  buscarPorIdEAmbiente,
  listarPorLocalEAmbiente,
  buscarPorOperacaoClienteNoAmbiente,
  atualizarNoAmbiente,
  excluirNoAmbiente,
};
