const campanhaRepository = require(
  "../repositories/campanhaMultiTenantRepository"
);

// Depende das migrações multi-tenant homologadas.
// Não utilizar nas rotas antes da homologação.
const STATUS_PERMITIDOS = [
  "EM ANDAMENTO",
  "CONCLUIDO",
  "CANCELADA",
];

function criarErro(message, statusCode) {
  const erro = new Error(message);
  erro.statusCode = statusCode;
  return erro;
}

function validarIdentidade(usuarioAutenticado) {
  if (!usuarioAutenticado || typeof usuarioAutenticado !== "object") {
    throw criarErro("Usuário não autenticado.", 401);
  }

  const { id_usuario: idUsuario, id_ambiente: idAmbiente } = usuarioAutenticado;

  if (
    (typeof idUsuario !== "number" && typeof idUsuario !== "string") ||
    !Number.isSafeInteger(Number(idUsuario)) ||
    Number(idUsuario) <= 0 ||
    typeof idAmbiente !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idAmbiente)
  ) {
    throw criarErro("Identidade autenticada inválida.", 401);
  }

  return {
    id_usuario: Number(idUsuario),
    id_ambiente: idAmbiente,
  };
}

function validarIdCampanha(idCampanha) {
  if (
    (typeof idCampanha !== "number" && typeof idCampanha !== "string") ||
    !Number.isSafeInteger(Number(idCampanha)) ||
    Number(idCampanha) <= 0
  ) {
    throw criarErro("ID da campanha inválido.", 400);
  }

  return Number(idCampanha);
}

function validarDados(dados) {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    throw criarErro("Dados da campanha inválidos.", 400);
  }
}

function validarCamposCampanha(dados) {
  validarDados(dados);

  const {
    nome_campanha: nomeCampanha,
    empresa,
    responsavel,
    data_inicio: dataInicio,
  } = dados;

  if (typeof nomeCampanha !== "string" || !nomeCampanha.trim()) {
    throw criarErro("O nome da campanha é obrigatório.", 400);
  }

  if (typeof empresa !== "string" || !empresa.trim()) {
    throw criarErro("A empresa é obrigatória.", 400);
  }

  if (typeof responsavel !== "string" || !responsavel.trim()) {
    throw criarErro("O responsável é obrigatório.", 400);
  }

  if (!dataInicio) {
    throw criarErro("A data de início é obrigatória.", 400);
  }

  return {
    nomeCampanha: nomeCampanha.trim(),
    empresa: empresa.trim(),
    responsavel: responsavel.trim(),
    dataInicio,
  };
}

function exigirCampanha(campanha) {
  if (!campanha) {
    throw criarErro("Campanha não encontrada.", 404);
  }

  return campanha;
}

async function criarCampanha(dados, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const campos = validarCamposCampanha(dados);
  const { status = "EM ANDAMENTO" } = dados;

  if (!STATUS_PERMITIDOS.includes(status)) {
    throw criarErro("Status da campanha inválido.", 400);
  }

  const campanha = await campanhaRepository.criarNoAmbiente(
    {
      ...campos,
      status,
      idUsuario: usuario.id_usuario,
    },
    usuario.id_ambiente
  );

  if (!campanha) {
    throw criarErro("Usuário ou ambiente sem permissão para criar campanha.", 403);
  }

  return campanha;
}

async function listarCampanhas(usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);

  return campanhaRepository.listarPorAmbiente(usuario.id_ambiente);
}

async function buscarCampanhaPorId(idCampanha, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdCampanha(idCampanha);

  const campanha = await campanhaRepository.buscarPorIdEAmbiente(
    id,
    usuario.id_ambiente
  );

  return exigirCampanha(campanha);
}

async function atualizarCampanha(idCampanha, dados, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdCampanha(idCampanha);
  const campos = validarCamposCampanha(dados);

  // A autorização é verificada pelo SQL na própria atualização.
  const campanha = await campanhaRepository.atualizarNoAmbiente(
    id,
    campos,
    usuario
  );

  return exigirCampanha(campanha);
}

async function alterarStatusCampanha(idCampanha, dados, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdCampanha(idCampanha);
  validarDados(dados);

  if (!STATUS_PERMITIDOS.includes(dados.status)) {
    throw criarErro(
      "O status deve ser EM ANDAMENTO, CONCLUIDO ou CANCELADA.",
      400
    );
  }

  // A autorização é verificada pelo SQL na própria atualização.
  const campanha = await campanhaRepository.atualizarStatusNoAmbiente(
    id,
    dados.status,
    usuario
  );

  return exigirCampanha(campanha);
}

module.exports = {
  criarCampanha,
  listarCampanhas,
  buscarCampanhaPorId,
  atualizarCampanha,
  alterarStatusCampanha,
};
