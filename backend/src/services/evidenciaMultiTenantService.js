const evidenciaRepository = require("../repositories/evidenciaMultiTenantRepository");

// Não utilizar nas rotas antes da homologação multi-tenant e do versionamento.
// Trata somente registros: não realiza operações físicas de arquivos.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS = ["FOTO", "TEXTO", "DOCUMENTO"];
const CAMPOS_GPS = [
  "latitude", "longitude", "precisao_gps", "origem_coordenadas", "data_captura_gps",
];

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

function presente(dados, campo) {
  return Object.hasOwn(dados, campo) && dados[campo] !== undefined;
}

function validarTipo(tipo) {
  if (!TIPOS.includes(tipo)) {
    throw criarErro("Tipo inválido. Use FOTO, TEXTO ou DOCUMENTO.");
  }
  return tipo;
}

function textoOpcional(valor, campo, limite) {
  if (valor == null || valor === "") return null;
  if (typeof valor !== "string" || (limite && valor.length > limite)) {
    throw criarErro(`O campo ${campo} é inválido.`);
  }
  // Não resolve caminhos nem os utiliza como prova de autorização.
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
  // Somente datas novas passam por Date; o estado esperado nunca é convertido.
  return data.toISOString();
}

const NORMALIZADORES_GPS = {
  latitude: (valor) => numeroOpcional(valor, "latitude", -90, 90),
  longitude: (valor) => numeroOpcional(valor, "longitude", -180, 180),
  precisao_gps: (valor) => numeroOpcional(valor, "precisao_gps", 0, 99999999.99),
  origem_coordenadas: origemOpcional,
  data_captura_gps: dataOpcional,
};

function selecionarCampos(dados, criacao = false) {
  const campos = {};
  if (criacao || presente(dados, "tipo")) campos.tipo = validarTipo(dados.tipo);
  if (criacao || presente(dados, "caminho_arquivo")) {
    campos.caminho_arquivo = textoOpcional(dados.caminho_arquivo, "caminho_arquivo", 500);
  }
  if (criacao || presente(dados, "descricao")) {
    campos.descricao = textoOpcional(dados.descricao, "descricao");
  }
  return campos;
}

function selecionarGps(dados, criacao = false) {
  const gps = {};
  for (const campo of CAMPOS_GPS) {
    if (criacao || presente(dados, campo)) {
      gps[campo] = NORMALIZADORES_GPS[campo](dados[campo]);
    }
  }
  return gps;
}

function validarCoerenciaGps(gps) {
  const temLatitude = gps.latitude != null;
  const temLongitude = gps.longitude != null;
  if (temLatitude !== temLongitude) {
    throw criarErro("Informe latitude e longitude juntas.");
  }
  // Valida também o estado final combinado, sem substituir seu texto preciso.
  numeroOpcional(gps.latitude, "latitude", -90, 90);
  numeroOpcional(gps.longitude, "longitude", -180, 180);
  numeroOpcional(gps.precisao_gps, "precisao_gps", 0, 99999999.99);
  origemOpcional(gps.origem_coordenadas);
  if (!temLatitude && (
    gps.precisao_gps != null || gps.origem_coordenadas != null || gps.data_captura_gps != null
  )) {
    throw criarErro("Informe as coordenadas para registrar os dados de localização.");
  }
  if (gps.precisao_gps != null && gps.origem_coordenadas !== "GPS") {
    throw criarErro("A precisão do GPS exige origem GPS.");
  }
  if (gps.data_captura_gps != null && gps.origem_coordenadas !== "GPS") {
    throw criarErro("A data de captura do GPS exige origem GPS.");
  }
}

function obterEstadoGps(evidencia) {
  const estado = evidencia.estado_gps;
  if (
    !estado || typeof estado !== "object" || Array.isArray(estado) ||
    CAMPOS_GPS.some((campo) => !Object.hasOwn(estado, campo) ||
      (estado[campo] !== null && typeof estado[campo] !== "string"))
  ) {
    // Não usa os campos comuns da linha como fallback: podem ter perdido precisão.
    throw criarErro("Não foi possível obter o estado GPS da evidência.", 500);
  }
  return estado;
}

function prepararPatchGps(dados, estado) {
  const patch = selecionarGps(dados);
  if (Object.keys(patch).length === 0) return patch;
  const alterouCoordenadas = Object.hasOwn(patch, "latitude") || Object.hasOwn(patch, "longitude");
  const final = { ...estado, ...patch };

  if (alterouCoordenadas && final.latitude == null && final.longitude == null) {
    // Remover o par de coordenadas remove seus metadados, conforme o legado.
    for (const campo of CAMPOS_GPS) patch[campo] = null;
  } else {
    if (alterouCoordenadas && !Object.hasOwn(patch, "origem_coordenadas")) {
      patch.origem_coordenadas = "MANUAL";
    }
    const origem = Object.hasOwn(patch, "origem_coordenadas")
      ? patch.origem_coordenadas : estado.origem_coordenadas;
    if (origem === "MANUAL") {
      // Não reenvia valores antigos; somente limpezas exigidas pela origem manual.
      if (estado.precisao_gps !== null || Object.hasOwn(patch, "precisao_gps")) patch.precisao_gps = null;
      if (estado.data_captura_gps !== null || Object.hasOwn(patch, "data_captura_gps")) patch.data_captura_gps = null;
    }
  }

  validarCoerenciaGps({ ...estado, ...patch });
  return patch;
}

function exigirEvidencia(evidencia) {
  if (!evidencia) throw criarErro("Evidência não encontrada.", 404);
  return evidencia;
}

async function exigirLocalAutorizado(idLocal, usuario) {
  const local = await evidenciaRepository.buscarLocalAutorizadoNoAmbiente(idLocal, usuario);
  if (!local) throw criarErro("Local não encontrado.", 404);
}

async function criarEvidencia(dados, usuarioAutenticado, opcoes) {
  const usuario = validarIdentidade(usuarioAutenticado);
  validarDados(dados);
  const idLocal = validarIdentificador(dados.id_local, "ID do local inválido.");
  const campos = selecionarCampos(dados, true);
  const gps = selecionarGps(dados, true);
  validarCoerenciaGps(gps);
  const operacao = dados.id_operacao_cliente == null || dados.id_operacao_cliente === ""
    ? null : validarUuid(dados.id_operacao_cliente, "ID da operação do cliente inválido.");

  if (opcoes !== undefined && (
    opcoes === null || typeof opcoes !== "object" || Array.isArray(opcoes)
  )) {
    throw criarErro("Opções da criação inválidas.");
  }
  const temOpcaoResultado = opcoes !== undefined && Object.hasOwn(opcoes, "incluirResultadoCriacao");
  if (temOpcaoResultado && typeof opcoes.incluirResultadoCriacao !== "boolean") {
    throw criarErro("A opção incluirResultadoCriacao deve ser booleana.");
  }
  // A opção controla apenas o formato; criada é determinada pelo fluxo abaixo.
  const incluirResultadoCriacao = temOpcaoResultado && opcoes.incluirResultadoCriacao === true;

  await exigirLocalAutorizado(idLocal, usuario);
  if (operacao) {
    const existente = await evidenciaRepository.buscarPorOperacaoClienteNoAmbiente(operacao, idLocal, usuario);
    if (existente) return incluirResultadoCriacao ? { evidencia: existente, criada: false } : existente;
  }

  let evidencia;
  try {
    evidencia = await evidenciaRepository.criarNoAmbiente({
      id_local: idLocal, ...campos, ...gps, id_operacao_cliente: operacao,
    }, usuario);
  } catch (erro) {
    if (
      operacao && erro?.statusCode === 409 && erro.code === "23505" &&
      erro.constraint === "uq_evidencia_id_operacao_cliente" &&
      (!erro.table || erro.table === "evidencia")
    ) {
      const existente = await evidenciaRepository.buscarPorOperacaoClienteNoAmbiente(operacao, idLocal, usuario);
      if (existente) return incluirResultadoCriacao ? { evidencia: existente, criada: false } : existente;
    }
    // Inclui o conflito genérico quando não há repetição atualmente autorizada.
    throw erro;
  }
  if (!evidencia) throw criarErro("Local não encontrado.", 404);
  return incluirResultadoCriacao ? { evidencia, criada: true } : evidencia;
}

async function listarEvidencias(usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  return evidenciaRepository.listarPermitidasNoAmbiente(usuario);
}

async function buscarEvidenciaPorId(idEvidencia, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idEvidencia, "ID da evidência inválido.");
  return exigirEvidencia(await evidenciaRepository.buscarPorIdEAmbiente(id, usuario));
}

async function listarEvidenciasPorLocal(idLocal, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idLocal, "ID do local inválido.");
  // Distingue local autorizado sem evidências de local ausente/não autorizado.
  await exigirLocalAutorizado(id, usuario);
  return evidenciaRepository.listarPorLocalEAmbiente(id, usuario);
}

async function atualizarEvidencia(idEvidencia, dados, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idEvidencia, "ID da evidência inválido.");
  validarDados(dados);
  const campos = selecionarCampos(dados);
  const atual = exigirEvidencia(await evidenciaRepository.buscarPorIdEAmbiente(
    id, usuario, { incluirEstadoGps: true }
  ));
  if (presente(dados, "caminho_arquivo") && dados.caminho_arquivo !== atual.caminho_arquivo) {
    throw criarErro("A associação do arquivo não pode ser alterada por este endpoint.");
  }
  // Mesmo um caminho igual não é reenviado: evita restaurar referência antiga.
  delete campos.caminho_arquivo;
  const estadoGps = obterEstadoGps(atual);
  const patch = { ...campos, ...prepararPatchGps(dados, estadoGps) };

  // Obrigatório mesmo sem alteração GPS. O repositório revalida autorização,
  // bloqueia o registro e compara o estado preciso antes do UPDATE parcial.
  // CONFLITO_GPS/409 e falhas internas são propagados sem nova tentativa.
  const atualizada = await evidenciaRepository.atualizarNoAmbiente(
    id, patch, usuario, { gpsEsperado: estadoGps }
  );
  return exigirEvidencia(atualizada);
}

async function excluirEvidencia(idEvidencia, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idEvidencia, "ID da evidência inválido.");
  return exigirEvidencia(await evidenciaRepository.excluirNoAmbiente(id, usuario, { bloquearAutorizacao: true }));
}

async function prepararUpload(dados, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  validarDados(dados);
  const idLocal = validarIdentificador(dados.id_local, "ID do local inválido.");
  const campos = selecionarCampos({ ...dados, caminho_arquivo: null }, true);
  const gps = selecionarGps(dados, true);
  validarCoerenciaGps(gps);
  const operacao = dados.id_operacao_cliente == null || dados.id_operacao_cliente === ""
    ? null : validarUuid(dados.id_operacao_cliente, "ID da operação do cliente inválido.");
  await exigirLocalAutorizado(idLocal, usuario);
  const existente = operacao
    ? await evidenciaRepository.buscarPorOperacaoClienteNoAmbiente(operacao, idLocal, usuario)
    : null;
  return { dados: { id_local: idLocal, ...campos, ...gps, id_operacao_cliente: operacao }, existente };
}

module.exports = {
  prepararUpload,
  criarEvidencia,
  listarEvidencias,
  buscarEvidenciaPorId,
  listarEvidenciasPorLocal,
  atualizarEvidencia,
  excluirEvidencia,
};
