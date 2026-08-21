const campanhaRepository = require("../repositories/campanhaRepository");

async function criarCampanha(dados, usuarioAutenticado) {
  const {
    nome_campanha: nomeCampanha,
    empresa,
    responsavel,
    data_inicio: dataInicio,
    status = "ATIVA",
  } = dados;

  if (!nomeCampanha || !nomeCampanha.trim()) {
    const error = new Error("O nome da campanha é obrigatório.");
    error.statusCode = 400;
    throw error;
  }

  if (!empresa || !empresa.trim()) {
    const error = new Error("A empresa é obrigatória.");
    error.statusCode = 400;
    throw error;
  }

  if (!responsavel || !responsavel.trim()) {
    const error = new Error("O responsável é obrigatório.");
    error.statusCode = 400;
    throw error;
  }

  if (!dataInicio) {
    const error = new Error("A data de início é obrigatória.");
    error.statusCode = 400;
    throw error;
  }

  const statusPermitidos = [
    "ATIVA",
    "CONCLUIDA",
    "CANCELADA",
  ];

  if (!statusPermitidos.includes(status)) {
    const error = new Error("Status da campanha inválido.");
    error.statusCode = 400;
    throw error;
  }

  return campanhaRepository.criar({
    nomeCampanha: nomeCampanha.trim(),
    empresa: empresa.trim(),
    responsavel: responsavel.trim(),
    dataInicio,
    status,
    idUsuario: usuarioAutenticado.id_usuario,
  });
}

async function listarCampanhas() {
  return campanhaRepository.listarTodas();
}

async function buscarCampanhaPorId(idCampanha) {
  const id = Number(idCampanha);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("ID da campanha inválido.");
    error.statusCode = 400;
    throw error;
  }

  const campanha = await campanhaRepository.buscarPorId(id);

  if (!campanha) {
    const error = new Error("Campanha não encontrada.");
    error.statusCode = 404;
    throw error;
  }

  return campanha;
}
async function atualizarCampanha(idCampanha, dados, usuarioAutenticado) {
  const id = Number(idCampanha);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("ID da campanha inválido.");
    error.statusCode = 400;
    throw error;
  }

  const campanhaAtual = await campanhaRepository.buscarPorId(id);

  if (!campanhaAtual) {
    const error = new Error("Campanha não encontrada.");
    error.statusCode = 404;
    throw error;
  }

  const ehAdministrador =
    usuarioAutenticado.perfil_acesso === "ADMINISTRADOR";

  const ehResponsavel =
    Number(campanhaAtual.id_usuario) ===
    Number(usuarioAutenticado.id_usuario);

  if (!ehAdministrador && !ehResponsavel) {
    const error = new Error(
      "Você não possui permissão para editar esta campanha."
    );
    error.statusCode = 403;
    throw error;
  }

  const {
    nome_campanha: nomeCampanha,
    empresa,
    responsavel,
    data_inicio: dataInicio,
  } = dados;

  if (!nomeCampanha || !nomeCampanha.trim()) {
    const error = new Error("O nome da campanha é obrigatório.");
    error.statusCode = 400;
    throw error;
  }

  if (!empresa || !empresa.trim()) {
    const error = new Error("A empresa é obrigatória.");
    error.statusCode = 400;
    throw error;
  }

  if (!responsavel || !responsavel.trim()) {
    const error = new Error("O responsável é obrigatório.");
    error.statusCode = 400;
    throw error;
  }

  if (!dataInicio) {
    const error = new Error("A data de início é obrigatória.");
    error.statusCode = 400;
    throw error;
  }

  return campanhaRepository.atualizar(id, {
    nomeCampanha: nomeCampanha.trim(),
    empresa: empresa.trim(),
    responsavel: responsavel.trim(),
    dataInicio,
  });
}

async function alterarStatusCampanha(
  idCampanha,
  dados,
  usuarioAutenticado
) {
  const id = Number(idCampanha);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("ID da campanha inválido.");
    error.statusCode = 400;
    throw error;
  }

  const campanhaAtual = await campanhaRepository.buscarPorId(id);

  if (!campanhaAtual) {
    const error = new Error("Campanha não encontrada.");
    error.statusCode = 404;
    throw error;
  }

  const ehAdministrador =
    usuarioAutenticado.perfil_acesso === "ADMINISTRADOR";

  const ehResponsavel =
    Number(campanhaAtual.id_usuario) ===
    Number(usuarioAutenticado.id_usuario);

  if (!ehAdministrador && !ehResponsavel) {
    const error = new Error(
      "Você não possui permissão para alterar esta campanha."
    );
    error.statusCode = 403;
    throw error;
  }

  const statusPermitidos = [
    "ATIVA",
    "CONCLUIDA",
    "CANCELADA",
  ];

  if (!statusPermitidos.includes(dados.status)) {
    const error = new Error(
      "O status deve ser ATIVA, CONCLUIDA ou CANCELADA."
    );
    error.statusCode = 400;
    throw error;
  }

  return campanhaRepository.atualizarStatus(
    id,
    dados.status
  );
}
module.exports = {
  criarCampanha,
  listarCampanhas,
  buscarCampanhaPorId,
  atualizarCampanha,
  alterarStatusCampanha,
};