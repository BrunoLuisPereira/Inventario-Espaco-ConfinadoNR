const checklistRepository = require("../repositories/checklistMultiTenantRepository");

// Não utilizar nas rotas antes da homologação multi-tenant e do versionamento.
const CAMPOS_RESPOSTAS = [
  "criterio_a",
  "criterio_b",
  "criterio_c",
  "acesso_controlado",
  "ventilacao_adequada",
  "monitoramento_atmosferico",
  "procedimento_emergencia",
];
const RESPOSTAS_VALIDAS = ["SIM", "NAO"];
const STATUS_VALIDOS = ["PENDENTE", "CONCLUIDO"];

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
    throw criarErro("Dados do checklist inválidos.", 400);
  }
}

function selecionarRespostas(dados, parcial = false) {
  const respostas = {};
  for (const campo of CAMPOS_RESPOSTAS) {
    const valor = dados[campo];
    // O repositório mantém o valor atual quando o parâmetro é NULL.
    if (parcial && valor == null) continue;
    if (!RESPOSTAS_VALIDAS.includes(valor)) {
      throw criarErro(`${campo} deve ser SIM ou NAO.`, 400);
    }
    respostas[campo] = valor;
  }
  return respostas;
}

function selecionarObservacoes(dados) {
  const valor = dados.observacoes;
  if (valor == null) return {};
  if (typeof valor !== "string") {
    throw criarErro("O campo observacoes deve ser um texto.", 400);
  }
  // Preserva texto vazio e espaços: a normalização para NULL é do repositório.
  return { observacoes: valor };
}

function validarStatus(status) {
  if (!STATUS_VALIDOS.includes(status)) {
    throw criarErro("Status inválido. Use PENDENTE ou CONCLUIDO.", 400);
  }
}

function exigirChecklist(checklist) {
  if (!checklist) {
    throw criarErro("Checklist não encontrado.", 404);
  }
  return checklist;
}

async function criarChecklist(dados, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  validarDados(dados);
  const idLocal = validarIdentificador(dados.id_local, "ID do local inválido.");
  const respostas = selecionarRespostas(dados);
  const observacoes = selecionarObservacoes(dados);
  const { status = "PENDENTE" } = dados;
  validarStatus(status);

  // Sem leitura prévia: o SQL autoriza o local e a restrição UNIQUE garante
  // a unicidade. O erro 409 controlado pelo repositório é propagado intacto.
  const checklist = await checklistRepository.criarNoAmbiente(
    { id_local: idLocal, ...respostas, ...observacoes, status },
    usuario
  );

  if (!checklist) {
    // Mesma resposta para local ausente, externo ou sem autorização.
    throw criarErro("Local não encontrado.", 404);
  }
  return checklist;
}

async function listarChecklists(usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  return checklistRepository.listarPorAmbiente(usuario.id_ambiente);
}

async function buscarChecklistPorId(idChecklist, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idChecklist, "ID do checklist inválido.");
  const checklist = await checklistRepository.buscarPorIdEAmbiente(
    id,
    usuario.id_ambiente
  );
  return exigirChecklist(checklist);
}

async function atualizarChecklist(idChecklist, dados, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idChecklist, "ID do checklist inválido.");
  validarDados(dados);

  // Lista explícita: não encaminha id_local, id_usuario, ambiente, perfil
  // ou status do corpo. Não mescla dados obtidos por uma leitura anterior.
  const campos = {
    ...selecionarRespostas(dados, true),
    ...selecionarObservacoes(dados),
  };
  const checklist = await checklistRepository.atualizarNoAmbiente(
    id,
    campos,
    usuario
  );
  return exigirChecklist(checklist);
}

async function alterarStatusChecklist(idChecklist, dados, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idChecklist, "ID do checklist inválido.");
  validarDados(dados);
  validarStatus(dados.status);

  const checklist = await checklistRepository.atualizarStatusNoAmbiente(
    id,
    dados.status,
    usuario
  );
  return exigirChecklist(checklist);
}

module.exports = {
  criarChecklist,
  listarChecklists,
  buscarChecklistPorId,
  atualizarChecklist,
  alterarStatusChecklist,
};
