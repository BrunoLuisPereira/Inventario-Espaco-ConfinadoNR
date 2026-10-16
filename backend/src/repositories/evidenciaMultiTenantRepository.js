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

// Valores de controle são textos, não Number/Date JavaScript. O timestamp
// é emitido em UTC com seis casas decimais, independentemente de DateStyle.
const ESTADO_GPS_SQL = `
  json_build_object(
    'latitude', e.latitude::text,
    'longitude', e.longitude::text,
    'precisao_gps', e.precisao_gps::text,
    'origem_coordenadas', e.origem_coordenadas::text,
    'data_captura_gps',
      to_char(e.data_captura_gps AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z'
  ) AS estado_gps
`;

// Joins internos explícitos permitem bloquear apenas uma relação por SELECT.
// Nenhum SELECT de bloqueio omite ambiente, atividade ou permissão por campanha.
const RELACOES_BLOQUEIO_GPS = `
  FROM ambiente AS a
  INNER JOIN usuario AS solicitante
    ON solicitante.id_ambiente = a.id_ambiente
  INNER JOIN campanha AS c
    ON c.id_ambiente = a.id_ambiente
  INNER JOIN local AS l
    ON l.id_campanha = c.id_campanha
  INNER JOIN evidencia AS e
    ON e.id_local = l.id_local
  WHERE c.id_ambiente = $1
    AND solicitante.id_usuario = $2
    AND solicitante.id_ambiente = c.id_ambiente
    AND e.id_evidencia = $3
    AND solicitante.ativo = TRUE
    AND a.ativo = TRUE
    AND (
      solicitante.perfil_acesso = 'ADMINISTRADOR'
      OR c.id_usuario = solicitante.id_usuario
    )
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

function validarOpcoes(opcoes) {
  if (opcoes == null) return {};
  if (typeof opcoes !== "object" || Array.isArray(opcoes)) {
    throw criarErro("Opções da operação inválidas.");
  }
  return opcoes;
}

function validarNumeroGpsEsperado(valor, campo, minimo, maximo, casas) {
  if (valor === null) return null;
  // A validação de faixa pode usar Number; o parâmetro mantém o texto original.
  const formato = new RegExp(`^-?\\d+(?:\\.\\d{1,${casas}})?$`);
  if (
    typeof valor !== "string" || !formato.test(valor) ||
    !Number.isFinite(Number(valor)) || Number(valor) < minimo || Number(valor) > maximo
  ) {
    throw criarErro(`Estado GPS esperado inválido: ${campo}.`);
  }
  return valor;
}

function validarTimestampGpsEsperado(valor) {
  if (valor === null) return null;
  // Somente o formato UTC emitido por ESTADO_GPS_SQL. Não passa por Date,
  // toISOString ou qualquer normalização que descarte microssegundos.
  const partes = typeof valor === "string"
    ? valor.match(/^(\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/)
    : null;
  if (!partes) throw criarErro("Estado GPS esperado inválido: data_captura_gps.");
  const [, anoTexto, mesTexto, diaTexto, horaTexto, minutoTexto, segundoTexto] = partes;
  const ano = Number(anoTexto);
  const mes = Number(mesTexto);
  const dia = Number(diaTexto);
  const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
  const dias = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    ano < 1 || ano > 294276 || mes < 1 || mes > 12 || dia < 1 || dia > dias[mes - 1] ||
    Number(horaTexto) > 23 || Number(minutoTexto) > 59 || Number(segundoTexto) > 59
  ) {
    throw criarErro("Estado GPS esperado inválido: data_captura_gps.");
  }
  return valor;
}

function validarGpsEsperado(estado) {
  const campos = ["latitude", "longitude", "precisao_gps", "origem_coordenadas", "data_captura_gps"];
  if (
    !estado || typeof estado !== "object" || Array.isArray(estado) ||
    campos.some((campo) => !Object.hasOwn(estado, campo) || estado[campo] === undefined)
  ) {
    throw criarErro("O estado GPS esperado deve conter explicitamente os cinco campos.");
  }
  const latitude = validarNumeroGpsEsperado(estado.latitude, "latitude", -90, 90, 7);
  const longitude = validarNumeroGpsEsperado(estado.longitude, "longitude", -180, 180, 7);
  const precisao = validarNumeroGpsEsperado(estado.precisao_gps, "precisao_gps", 0, 99999999.99, 2);
  if ((latitude === null) !== (longitude === null)) {
    throw criarErro("Estado GPS esperado inválido: coordenadas devem estar em par.");
  }
  if (estado.origem_coordenadas !== null && !["GPS", "MANUAL"].includes(estado.origem_coordenadas)) {
    throw criarErro("Estado GPS esperado inválido: origem_coordenadas.");
  }
  return [latitude, longitude, precisao, estado.origem_coordenadas,
    validarTimestampGpsEsperado(estado.data_captura_gps)];
}

function comparacaoGpsSql(inicio) {
  // inicio é uma constante interna, nunca um dado recebido do cliente.
  return `
    e.latitude IS NOT DISTINCT FROM $${inicio}::numeric
    AND e.longitude IS NOT DISTINCT FROM $${inicio + 1}::numeric
    AND e.precisao_gps IS NOT DISTINCT FROM $${inicio + 2}::numeric
    AND e.origem_coordenadas IS NOT DISTINCT FROM $${inicio + 3}::varchar
    AND e.data_captura_gps IS NOT DISTINCT FROM $${inicio + 4}::timestamptz
  `;
}

function falhaAtualizacaoGps() {
  const erro = criarErro("Não foi possível concluir a atualização da evidência.", 500);
  erro.code = "FALHA_ATUALIZACAO_GPS";
  return erro;
}

async function atualizarComGpsEsperado(query, valores, gpsEsperado) {
  const client = await pool.connect();
  let transacaoAberta = false;
  let descartarCliente;
  const identidade = valores.slice(0, 3);

  async function rollback() {
    await client.query("ROLLBACK");
    transacaoAberta = false;
  }

  try {
    // READ COMMITTED permite reavaliar linhas alteradas enquanto aguardamos locks.
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    transacaoAberta = true;

    // Ordem única deste modo: ambiente -> solicitante -> campanha -> local ->
    // evidência. Os pais usam FOR SHARE; a evidência usa FOR UPDATE. Cada SELECT
    // bloqueia apenas seu alias em um INNER JOIN sem agregação/DISTINCT/outer join.
    // Permissões permanecem estáveis até COMMIT/ROLLBACK. Fluxos externos ainda
    // podem causar deadlocks: não há repetição automática de transações.
    const raiz = await client.query(`
      SELECT l.id_local, c.id_campanha
      ${RELACOES_BLOQUEIO_GPS}
      FOR SHARE OF a
    `, identidade);
    if (!raiz.rows[0]) {
      await rollback();
      return null;
    }

    // Fixa a relação descoberta, sem aceitar mudança de local/campanha enquanto
    // os locks são adquiridos. Todas as fases revalidam a autorização.
    const vinculo = [...identidade, raiz.rows[0].id_local, raiz.rows[0].id_campanha];
    for (const alias of ["solicitante", "c", "l"]) {
      const bloqueio = await client.query(`
        SELECT l.id_local, c.id_campanha
        ${RELACOES_BLOQUEIO_GPS}
          AND l.id_local = $4
          AND c.id_campanha = $5
        FOR SHARE OF ${alias}
      `, vinculo);
      if (!bloqueio.rows[0]) {
        await rollback();
        return null;
      }
    }

    const bloqueada = await client.query(`
      SELECT e.id_evidencia, (${comparacaoGpsSql(6)}) AS gps_confere
      ${RELACOES_BLOQUEIO_GPS}
        AND l.id_local = $4
        AND c.id_campanha = $5
      FOR UPDATE OF e
    `, [...vinculo, ...gpsEsperado]);
    if (!bloqueada.rows[0]) {
      await rollback();
      return null;
    }
    if (bloqueada.rows[0].gps_confere === false) {
      const conflito = criarErro("O estado GPS foi alterado. Recarregue a evidência antes de tentar novamente.", 409);
      conflito.code = "CONFLITO_GPS";
      throw conflito;
    }
    if (bloqueada.rows[0].gps_confere !== true) throw falhaAtualizacaoGps();

    const resultado = await client.query(query, [...valores, ...gpsEsperado]);
    if (!resultado.rows[0]) {
      // Ausência inesperada após igualdade e locks não comprova conflito GPS.
      throw falhaAtualizacaoGps();
    }
    await client.query("COMMIT");
    transacaoAberta = false;
    return resultado.rows[0];
  } catch (erro) {
    if (transacaoAberta) {
      try {
        await rollback();
      } catch (erroRollback) {
        // Não devolve ao pool uma conexão cujo estado transacional é incerto.
        descartarCliente = erroRollback;
      }
    } else {
      // BEGIN falhou ou a tentativa de ROLLBACK anterior não foi confirmada.
      descartarCliente = erro;
    }
    throw erro;
  } finally {
    if (descartarCliente) client.release(descartarCliente);
    else client.release();
  }
}

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

async function buscarPorIdEAmbiente(idEvidencia, usuarioAutenticado, opcoes) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idEvidencia, "ID da evidência inválido.");
  const configuracao = validarOpcoes(opcoes);
  if (Object.hasOwn(configuracao, "incluirEstadoGps") && typeof configuracao.incluirEstadoGps !== "boolean") {
    throw criarErro("A opção incluirEstadoGps deve ser booleana.");
  }
  if (configuracao.incluirEstadoGps === true) {
    const resultado = await pool.query(`
      SELECT e.*, l.nome_local, criador.nome AS usuario_responsavel,
        ${ESTADO_GPS_SQL}
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
        AND e.id_evidencia = $3
      LIMIT 1
    `, [usuario.id_ambiente, usuario.id_usuario, id]);
    return resultado.rows[0] || null;
  }
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

async function atualizarNoAmbiente(idEvidencia, dados, usuarioAutenticado, opcoes) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idEvidencia, "ID da evidência inválido.");
  validarDados(dados);

  const configuracao = validarOpcoes(opcoes);
  const gpsEsperado = Object.hasOwn(configuracao, "gpsEsperado")
    ? validarGpsEsperado(configuracao.gpsEsperado)
    : null;

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
      ${gpsEsperado ? `AND (${comparacaoGpsSql(20)})` : ""}
    RETURNING e.*
  `;
  // A CHECK de par latitude/longitude também valida o estado final combinado
  // com os valores atuais, inclusive quando só uma coordenada é informada.
  if (gpsEsperado) return atualizarComGpsEsperado(query, valores, gpsEsperado);
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

async function buscarLocalAutorizadoNoAmbiente(idLocal, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idLocal, "ID do local inválido.");
  const query = `
    SELECT l.id_local
    FROM local AS l
    INNER JOIN campanha AS c
      ON c.id_campanha = l.id_campanha
    WHERE c.id_ambiente = $1
      AND l.id_local = $3
      ${AUTORIZACAO}
    LIMIT 1
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
  buscarLocalAutorizadoNoAmbiente,
};
