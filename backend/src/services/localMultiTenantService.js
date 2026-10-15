const localRepository = require("../repositories/localMultiTenantRepository");

// Depende da homologação multi-tenant e do versionamento.
// Não utilizar nas rotas antes da homologação.
const STATUS_PERMITIDOS = ["ATIVO", "INATIVO"];

function criarErro(message, statusCode) {
  const erro = new Error(message);
  erro.statusCode = statusCode;
  return erro;
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
  if (
    !usuarioAutenticado ||
    typeof usuarioAutenticado !== "object" ||
    Array.isArray(usuarioAutenticado)
  ) {
    throw criarErro("Usuário não autenticado.", 401);
  }

  const { id_usuario: idUsuario, id_ambiente: idAmbiente } = usuarioAutenticado;
  const id = validarIdentificador(
    idUsuario,
    "Identidade autenticada inválida.",
    401
  );

  if (
    typeof idAmbiente !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idAmbiente)
  ) {
    throw criarErro("Identidade autenticada inválida.", 401);
  }

  return { id_usuario: id, id_ambiente: idAmbiente };
}

function validarDados(dados) {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    throw criarErro("Dados do local inválidos.", 400);
  }
}

function normalizarTextoOpcional(valor, campo) {
  if (valor === undefined || valor === null) {
    return null;
  }

  if (typeof valor !== "string") {
    throw criarErro(`O campo ${campo} deve ser um texto.`, 400);
  }

  return valor.trim() || null;
}

function normalizarCoordenada(valor, campo) {
  if (
    valor === undefined ||
    valor === null ||
    (typeof valor === "string" && !valor.trim())
  ) {
    return null;
  }

  if (
    (typeof valor !== "number" && typeof valor !== "string") ||
    !Number.isFinite(Number(valor))
  ) {
    throw criarErro(`O campo ${campo} deve ser um número válido.`, 400);
  }

  return Number(valor);
}

function validarCamposLocal(dados) {
  validarDados(dados);
  const { nome_local: nomeLocal } = dados;

  if (typeof nomeLocal !== "string" || !nomeLocal.trim()) {
    throw criarErro("O nome do local é obrigatório.", 400);
  }

  // Lista explícita: campanha, identidade, perfil e status não entram
  // nos dados de atualização do local.
  return {
    nomeLocal: nomeLocal.trim(),
    setor: normalizarTextoOpcional(dados.setor, "setor"),
    descricao: normalizarTextoOpcional(dados.descricao, "descricao"),
    endereco: normalizarTextoOpcional(dados.endereco, "endereco"),
    latitude: normalizarCoordenada(dados.latitude, "latitude"),
    longitude: normalizarCoordenada(dados.longitude, "longitude"),
  };
}

function validarStatus(status) {
  if (!STATUS_PERMITIDOS.includes(status)) {
    throw criarErro("O status deve ser ATIVO ou INATIVO.", 400);
  }
}

function exigirLocal(local) {
  if (!local) {
    throw criarErro("Local não encontrado.", 404);
  }

  return local;
}

async function criarLocal(dados, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const campos = validarCamposLocal(dados);
  const idCampanha = validarIdentificador(
    dados.id_campanha,
    "ID da campanha inválido."
  );
  const { status = "ATIVO" } = dados;
  validarStatus(status);

  // O INSERT SELECT verifica ambiente, atividade e autorização no SQL.
  const local = await localRepository.criarNoAmbiente(
    { ...campos, status, idCampanha },
    usuario
  );

  if (!local) {
    // Não diferencia campanha ausente, externa ou sem autorização.
    throw criarErro("Campanha não encontrada.", 404);
  }

  return local;
}

async function listarLocais(usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  return localRepository.listarPorAmbiente(usuario.id_ambiente);
}

async function buscarLocalPorId(idLocal, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idLocal, "ID do local inválido.");

  const local = await localRepository.buscarPorIdEAmbiente(
    id,
    usuario.id_ambiente
  );

  return exigirLocal(local);
}

async function atualizarLocal(idLocal, dados, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idLocal, "ID do local inválido.");
  const campos = validarCamposLocal(dados);

  // id_campanha e campos de identidade enviados no corpo são ignorados.
  // A autorização é verificada na própria instrução UPDATE.
  const local = await localRepository.atualizarNoAmbiente(id, campos, usuario);

  return exigirLocal(local);
}

async function alterarStatusLocal(idLocal, dados, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idLocal, "ID do local inválido.");
  validarDados(dados);
  validarStatus(dados.status);

  const local = await localRepository.atualizarStatusNoAmbiente(
    id,
    dados.status,
    usuario
  );

  return exigirLocal(local);
}

async function listarLocaisParaExportacao(usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  return localRepository.listarParaExportacaoPorAmbiente(usuario.id_ambiente);
}

module.exports = {
  criarLocal,
  listarLocais,
  buscarLocalPorId,
  atualizarLocal,
  alterarStatusLocal,
  listarLocaisParaExportacao,
};
