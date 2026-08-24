const localRepository = require("../repositories/localRepository");
const campanhaRepository = require("../repositories/campanhaRepository");

async function criarLocal(dados, usuarioAutenticado) {
  const {
    nome_local: nomeLocal,
    setor,
    descricao,
    endereco,
    latitude,
    longitude,
    status = "ATIVO",
    id_campanha: idCampanha,
  } = dados;

  if (!nomeLocal || !nomeLocal.trim()) {
    const error = new Error("O nome do local é obrigatório.");
    error.statusCode = 400;
    throw error;
  }

  if (!idCampanha) {
    const error = new Error("A campanha é obrigatória.");
    error.statusCode = 400;
    throw error;
  }

  const campanha = await campanhaRepository.buscarPorId(idCampanha);

  if (!campanha) {
    const error = new Error("Campanha não encontrada.");
    error.statusCode = 404;
    throw error;
  }

  const ehAdministrador =
    usuarioAutenticado.perfil_acesso === "ADMINISTRADOR";

  const ehResponsavel =
    Number(campanha.id_usuario) ===
    Number(usuarioAutenticado.id_usuario);

  if (!ehAdministrador && !ehResponsavel) {
    const error = new Error(
      "Você não possui permissão para cadastrar locais nesta campanha."
    );
    error.statusCode = 403;
    throw error;
  }

  const statusPermitidos = [
    "ATIVO",
    "INATIVO",
    "CONCLUIDO",
  ];

  if (!statusPermitidos.includes(status)) {
    const error = new Error("Status do local inválido.");
    error.statusCode = 400;
    throw error;
  }

  return localRepository.criar({
    nomeLocal: nomeLocal.trim(),
    setor: setor ? setor.trim() : null,
    descricao: descricao ? descricao.trim() : null,
    endereco: endereco ? endereco.trim() : null,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    status,
    idCampanha,
  });
}

async function listarLocais() {
  return localRepository.listarTodos();
}

async function buscarLocalPorId(idLocal) {
  const id = Number(idLocal);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("ID do local inválido.");
    error.statusCode = 400;
    throw error;
  }

  const local = await localRepository.buscarPorId(id);

  if (!local) {
    const error = new Error("Local não encontrado.");
    error.statusCode = 404;
    throw error;
  }

  return local;
}
async function atualizarLocal(idLocal, dados, usuarioAutenticado) {
  const id = Number(idLocal);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("ID do local inválido.");
    error.statusCode = 400;
    throw error;
  }

  const localAtual = await localRepository.buscarPorId(id);

  if (!localAtual) {
    const error = new Error("Local não encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const campanha = await campanhaRepository.buscarPorId(
    localAtual.id_campanha
  );

  const ehAdministrador =
    usuarioAutenticado.perfil_acesso === "ADMINISTRADOR";

  const ehResponsavel =
    Number(campanha.id_usuario) ===
    Number(usuarioAutenticado.id_usuario);

  if (!ehAdministrador && !ehResponsavel) {
    const error = new Error(
      "Você não possui permissão para editar este local."
    );
    error.statusCode = 403;
    throw error;
  }

  const {
    nome_local: nomeLocal,
    setor,
    descricao,
    endereco,
    latitude,
    longitude,
  } = dados;

  if (!nomeLocal || !nomeLocal.trim()) {
    const error = new Error("O nome do local é obrigatório.");
    error.statusCode = 400;
    throw error;
  }

  return localRepository.atualizar(id, {
    nomeLocal: nomeLocal.trim(),
    setor: setor ? setor.trim() : null,
    descricao: descricao ? descricao.trim() : null,
    endereco: endereco ? endereco.trim() : null,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
  });
}

async function alterarStatusLocal(
  idLocal,
  dados,
  usuarioAutenticado
) {
  const id = Number(idLocal);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("ID do local inválido.");
    error.statusCode = 400;
    throw error;
  }

  const localAtual = await localRepository.buscarPorId(id);

  if (!localAtual) {
    const error = new Error("Local não encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const campanha = await campanhaRepository.buscarPorId(
    localAtual.id_campanha
  );

  const ehAdministrador =
    usuarioAutenticado.perfil_acesso === "ADMINISTRADOR";

  const ehResponsavel =
    Number(campanha.id_usuario) ===
    Number(usuarioAutenticado.id_usuario);

  if (!ehAdministrador && !ehResponsavel) {
    const error = new Error(
      "Você não possui permissão para alterar este local."
    );
    error.statusCode = 403;
    throw error;
  }

  const statusPermitidos = [
    "ATIVO",
    "INATIVO",
    "CONCLUIDO",
  ];

  if (!statusPermitidos.includes(dados.status)) {
    const error = new Error(
      "O status deve ser ATIVO, INATIVO ou CONCLUIDO."
    );
    error.statusCode = 400;
    throw error;
  }

  return localRepository.atualizarStatus(
    id,
    dados.status
  );
}
module.exports = {
  criarLocal,
  listarLocais,
  buscarLocalPorId,
  atualizarLocal,
  alterarStatusLocal,
};