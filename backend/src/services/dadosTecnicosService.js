const dadosTecnicosRepository = require("../repositories/dadosTecnicosRepository");
const localRepository = require("../repositories/localRepository");
const campanhaRepository = require("../repositories/campanhaRepository");

const VENTILACOES_VALIDAS = [
  "NATURAL",
  "MECANICA",
  "FORCADA",
  "NAO_INFORMADA",
];

const STATUS_VALIDOS = [
  "PENDENTE",
  "CONCLUIDO",
];


/**
 * Valida se o usuário pode alterar os dados técnicos
 * de determinado local.
 */
async function validarPermissaoLocal(
  idLocal,
  usuarioAutenticado
) {
  const local = await localRepository.buscarPorId(idLocal);

  if (!local) {
    const erro = new Error("Local não encontrado.");
    erro.statusCode = 404;
    throw erro;
  }

  const campanha = await campanhaRepository.buscarPorId(
    local.id_campanha
  );

  if (!campanha) {
    const erro = new Error("Campanha não encontrada.");
    erro.statusCode = 404;
    throw erro;
  }

  const ehAdministrador =
    usuarioAutenticado.perfil_acesso === "ADMINISTRADOR";

  const ehResponsavel =
    Number(campanha.id_usuario) ===
    Number(usuarioAutenticado.id_usuario);

  if (!ehAdministrador && !ehResponsavel) {
    const erro = new Error(
      "Você não possui permissão para alterar os dados técnicos deste local."
    );

    erro.statusCode = 403;
    throw erro;
  }

  return local;
}


/**
 * Valida números opcionais.
 */
function validarNumero(valor, nomeCampo) {
  if (
    valor !== undefined &&
    valor !== null &&
    valor !== ""
  ) {
    const numero = Number(valor);

    if (!Number.isFinite(numero)) {
      const erro = new Error(
        `O campo ${nomeCampo} deve possuir um valor numérico válido.`
      );

      erro.statusCode = 400;
      throw erro;
    }
  }
}


/**
 * Cria os dados técnicos de um local.
 *
 * Como a relação LOCAL -> DADOS_TECNICOS é 1:1,
 * não permitimos dois registros para o mesmo local.
 */
async function criarDadosTecnicos(
  dados,
  usuarioAutenticado
) {
  const {
    id_local,
    pressao_atmosferica,
    ventilacao,
    oxigenio,
    gas_inflamavel,
    monoxido_carbono,
    sulfeto_hidrogenio,
    temperatura,
    umidade,
    observacoes,
    status,
  } = dados;

  if (!id_local) {
    const erro = new Error(
      "O campo id_local é obrigatório."
    );

    erro.statusCode = 400;
    throw erro;
  }

  const idLocal = Number(id_local);

  if (!Number.isInteger(idLocal) || idLocal <= 0) {
    const erro = new Error(
      "ID do local inválido."
    );

    erro.statusCode = 400;
    throw erro;
  }

  await validarPermissaoLocal(
    idLocal,
    usuarioAutenticado
  );

  const registroExistente =
    await dadosTecnicosRepository.buscarPorLocal(
      idLocal
    );

  if (registroExistente) {
    const erro = new Error(
      "Este local já possui dados técnicos cadastrados."
    );

    erro.statusCode = 409;
    throw erro;
  }

  if (
    ventilacao !== undefined &&
    ventilacao !== null &&
    !VENTILACOES_VALIDAS.includes(ventilacao)
  ) {
    const erro = new Error(
      "Ventilação inválida. Use NATURAL, MECANICA, FORCADA ou NAO_INFORMADA."
    );

    erro.statusCode = 400;
    throw erro;
  }

  if (
    status !== undefined &&
    !STATUS_VALIDOS.includes(status)
  ) {
    const erro = new Error(
      "Status inválido. Use PENDENTE ou CONCLUIDO."
    );

    erro.statusCode = 400;
    throw erro;
  }

  validarNumero(
    pressao_atmosferica,
    "pressao_atmosferica"
  );

  validarNumero(
    oxigenio,
    "oxigenio"
  );

  validarNumero(
    gas_inflamavel,
    "gas_inflamavel"
  );

  validarNumero(
    monoxido_carbono,
    "monoxido_carbono"
  );

  validarNumero(
    sulfeto_hidrogenio,
    "sulfeto_hidrogenio"
  );

  validarNumero(
    temperatura,
    "temperatura"
  );

  validarNumero(
    umidade,
    "umidade"
  );

  return dadosTecnicosRepository.criar({
    id_local: idLocal,
    pressao_atmosferica,
    ventilacao:
      ventilacao ?? "NAO_INFORMADA",
    oxigenio,
    gas_inflamavel,
    monoxido_carbono,
    sulfeto_hidrogenio,
    temperatura,
    umidade,
    observacoes,
    status:
      status ?? "PENDENTE",
    id_usuario:
      usuarioAutenticado.id_usuario,
  });
}


/**
 * Lista todos os registros.
 */
async function listarDadosTecnicos() {
  return dadosTecnicosRepository.listarTodos();
}


/**
 * Busca dados técnicos pelo ID.
 */
async function buscarDadosTecnicosPorId(
  idDados
) {
  const id = Number(idDados);

  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error(
      "ID dos dados técnicos inválido."
    );

    erro.statusCode = 400;
    throw erro;
  }

  const dados =
    await dadosTecnicosRepository.buscarPorId(id);

  if (!dados) {
    const erro = new Error(
      "Dados técnicos não encontrados."
    );

    erro.statusCode = 404;
    throw erro;
  }

  return dados;
}


/**
 * Busca os dados técnicos de um local.
 */
async function buscarDadosTecnicosPorLocal(
  idLocal
) {
  const id = Number(idLocal);

  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error(
      "ID do local inválido."
    );

    erro.statusCode = 400;
    throw erro;
  }

  const local =
    await localRepository.buscarPorId(id);

  if (!local) {
    const erro = new Error(
      "Local não encontrado."
    );

    erro.statusCode = 404;
    throw erro;
  }

  const dados =
    await dadosTecnicosRepository.buscarPorLocal(
      id
    );

  if (!dados) {
    const erro = new Error(
      "Dados técnicos não encontrados para este local."
    );

    erro.statusCode = 404;
    throw erro;
  }

  return dados;
}


/**
 * Atualiza os dados técnicos.
 */
async function atualizarDadosTecnicos(
  idDados,
  novosDados,
  usuarioAutenticado
) {
  const id = Number(idDados);

  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error(
      "ID dos dados técnicos inválido."
    );

    erro.statusCode = 400;
    throw erro;
  }

  const dadosAtuais =
    await dadosTecnicosRepository.buscarPorId(id);

  if (!dadosAtuais) {
    const erro = new Error(
      "Dados técnicos não encontrados."
    );

    erro.statusCode = 404;
    throw erro;
  }

  await validarPermissaoLocal(
    dadosAtuais.id_local,
    usuarioAutenticado
  );

  const pressao_atmosferica =
    novosDados.pressao_atmosferica ??
    dadosAtuais.pressao_atmosferica;

  const ventilacao =
    novosDados.ventilacao ??
    dadosAtuais.ventilacao;

  const oxigenio =
    novosDados.oxigenio ??
    dadosAtuais.oxigenio;

  const gas_inflamavel =
    novosDados.gas_inflamavel ??
    dadosAtuais.gas_inflamavel;

  const monoxido_carbono =
    novosDados.monoxido_carbono ??
    dadosAtuais.monoxido_carbono;

  const sulfeto_hidrogenio =
    novosDados.sulfeto_hidrogenio ??
    dadosAtuais.sulfeto_hidrogenio;

  const temperatura =
    novosDados.temperatura ??
    dadosAtuais.temperatura;

  const umidade =
    novosDados.umidade ??
    dadosAtuais.umidade;

  const observacoes =
    novosDados.observacoes ??
    dadosAtuais.observacoes;

  const status =
    novosDados.status ??
    dadosAtuais.status;

  if (
    !VENTILACOES_VALIDAS.includes(ventilacao)
  ) {
    const erro = new Error(
      "Ventilação inválida. Use NATURAL, MECANICA, FORCADA ou NAO_INFORMADA."
    );

    erro.statusCode = 400;
    throw erro;
  }

  if (!STATUS_VALIDOS.includes(status)) {
    const erro = new Error(
      "Status inválido. Use PENDENTE ou CONCLUIDO."
    );

    erro.statusCode = 400;
    throw erro;
  }

  validarNumero(
    pressao_atmosferica,
    "pressao_atmosferica"
  );

  validarNumero(
    oxigenio,
    "oxigenio"
  );

  validarNumero(
    gas_inflamavel,
    "gas_inflamavel"
  );

  validarNumero(
    monoxido_carbono,
    "monoxido_carbono"
  );

  validarNumero(
    sulfeto_hidrogenio,
    "sulfeto_hidrogenio"
  );

  validarNumero(
    temperatura,
    "temperatura"
  );

  validarNumero(
    umidade,
    "umidade"
  );

  return dadosTecnicosRepository.atualizar(
    id,
    {
      pressao_atmosferica,
      ventilacao,
      oxigenio,
      gas_inflamavel,
      monoxido_carbono,
      sulfeto_hidrogenio,
      temperatura,
      umidade,
      observacoes,
      status,
    }
  );
}


/**
 * Exclui os dados técnicos.
 */
async function excluirDadosTecnicos(
  idDados,
  usuarioAutenticado
) {
  const id = Number(idDados);

  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error(
      "ID dos dados técnicos inválido."
    );

    erro.statusCode = 400;
    throw erro;
  }

  const dados =
    await dadosTecnicosRepository.buscarPorId(id);

  if (!dados) {
    const erro = new Error(
      "Dados técnicos não encontrados."
    );

    erro.statusCode = 404;
    throw erro;
  }

  await validarPermissaoLocal(
    dados.id_local,
    usuarioAutenticado
  );

  return dadosTecnicosRepository.excluir(id);
}


module.exports = {
  criarDadosTecnicos,
  listarDadosTecnicos,
  buscarDadosTecnicosPorId,
  buscarDadosTecnicosPorLocal,
  atualizarDadosTecnicos,
  excluirDadosTecnicos,
};