const checklistRepository = require("../repositories/checklistRepository");
const localRepository = require("../repositories/localRepository");
const campanhaRepository = require("../repositories/campanhaRepository");

const IDENTIFICACOES_VALIDAS = ["A", "B", "C"];
const RESPOSTAS_VALIDAS = ["SIM", "NAO"];
const STATUS_VALIDOS = ["PENDENTE", "CONCLUIDO"];

async function criarChecklist(dados, usuarioAutenticado) {
  const {
    id_local,
    identificacao_espaco,
    acesso_controlado,
    ventilacao_adequada,
    monitoramento_atmosferico,
    procedimento_emergencia,
    observacoes,
    status,
  } = dados;

  if (!id_local) {
    const erro = new Error("O campo id_local é obrigatório.");
    erro.statusCode = 400;
    throw erro;
  }

  const local = await localRepository.buscarPorId(id_local);

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
      "Você não possui permissão para criar checklist neste local."
    );
    erro.statusCode = 403;
    throw erro;
  }

  const checklistExistente =
    await checklistRepository.buscarPorLocal(id_local);

  if (checklistExistente) {
    const erro = new Error(
      "Este local já possui um checklist NR-33."
    );
    erro.statusCode = 409;
    throw erro;
  }

  if (!IDENTIFICACOES_VALIDAS.includes(identificacao_espaco)) {
    const erro = new Error(
      "identificacao_espaco deve ser A, B ou C."
    );
    erro.statusCode = 400;
    throw erro;
  }

  const respostas = {
    acesso_controlado,
    ventilacao_adequada,
    monitoramento_atmosferico,
    procedimento_emergencia,
  };

  for (const [campo, valor] of Object.entries(respostas)) {
    if (!RESPOSTAS_VALIDAS.includes(valor)) {
      const erro = new Error(`${campo} deve ser SIM ou NAO.`);
      erro.statusCode = 400;
      throw erro;
    }
  }

  if (status && !STATUS_VALIDOS.includes(status)) {
    const erro = new Error(
      "Status inválido. Use PENDENTE ou CONCLUIDO."
    );
    erro.statusCode = 400;
    throw erro;
  }

  return checklistRepository.criar({
    id_local,
    identificacao_espaco,
    acesso_controlado,
    ventilacao_adequada,
    monitoramento_atmosferico,
    procedimento_emergencia,
    observacoes,
    status: status || "PENDENTE",
    id_usuario: usuarioAutenticado.id_usuario,
  });
}

async function listarChecklists() {
  return checklistRepository.listarTodos();
}

async function buscarChecklistPorId(idChecklist) {
  const id = Number(idChecklist);

  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error("ID do checklist inválido.");
    erro.statusCode = 400;
    throw erro;
  }

  const checklist = await checklistRepository.buscarPorId(id);

  if (!checklist) {
    const erro = new Error("Checklist não encontrado.");
    erro.statusCode = 404;
    throw erro;
  }

  return checklist;
}

async function atualizarChecklist(
  idChecklist,
  dados,
  usuarioAutenticado
) {
  const id = Number(idChecklist);

  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error("ID do checklist inválido.");
    erro.statusCode = 400;
    throw erro;
  }

  const checklist = await checklistRepository.buscarPorId(id);

  if (!checklist) {
    const erro = new Error("Checklist não encontrado.");
    erro.statusCode = 404;
    throw erro;
  }

  const local = await localRepository.buscarPorId(
    checklist.id_local
  );

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
      "Você não possui permissão para alterar este checklist."
    );
    erro.statusCode = 403;
    throw erro;
  }

  const identificacao_espaco =
    dados.identificacao_espaco ??
    checklist.identificacao_espaco;

  const acesso_controlado =
    dados.acesso_controlado ??
    checklist.acesso_controlado;

  const ventilacao_adequada =
    dados.ventilacao_adequada ??
    checklist.ventilacao_adequada;

  const monitoramento_atmosferico =
    dados.monitoramento_atmosferico ??
    checklist.monitoramento_atmosferico;

  const procedimento_emergencia =
    dados.procedimento_emergencia ??
    checklist.procedimento_emergencia;

  const observacoes =
    dados.observacoes ?? checklist.observacoes;

  if (!IDENTIFICACOES_VALIDAS.includes(identificacao_espaco)) {
    const erro = new Error(
      "identificacao_espaco deve ser A, B ou C."
    );
    erro.statusCode = 400;
    throw erro;
  }

  const respostas = {
    acesso_controlado,
    ventilacao_adequada,
    monitoramento_atmosferico,
    procedimento_emergencia,
  };

  for (const [campo, valor] of Object.entries(respostas)) {
    if (!RESPOSTAS_VALIDAS.includes(valor)) {
      const erro = new Error(`${campo} deve ser SIM ou NAO.`);
      erro.statusCode = 400;
      throw erro;
    }
  }

  return checklistRepository.atualizar(id, {
    identificacao_espaco,
    acesso_controlado,
    ventilacao_adequada,
    monitoramento_atmosferico,
    procedimento_emergencia,
    observacoes,
  });
}

async function alterarStatusChecklist(
  idChecklist,
  dados,
  usuarioAutenticado
) {
  const id = Number(idChecklist);

  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error("ID do checklist inválido.");
    erro.statusCode = 400;
    throw erro;
  }

  const checklist = await checklistRepository.buscarPorId(id);

  if (!checklist) {
    const erro = new Error("Checklist não encontrado.");
    erro.statusCode = 404;
    throw erro;
  }

  const local = await localRepository.buscarPorId(
    checklist.id_local
  );

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
      "Você não possui permissão para alterar o status deste checklist."
    );
    erro.statusCode = 403;
    throw erro;
  }

  const { status } = dados;

  if (!STATUS_VALIDOS.includes(status)) {
    const erro = new Error(
      "Status inválido. Use PENDENTE ou CONCLUIDO."
    );
    erro.statusCode = 400;
    throw erro;
  }

  return checklistRepository.atualizarStatus(
    id,
    status
  );
}

module.exports = {
  criarChecklist,
  listarChecklists,
  buscarChecklistPorId,
  atualizarChecklist,
  alterarStatusChecklist,
};