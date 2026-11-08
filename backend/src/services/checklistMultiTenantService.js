const { selecionarCaracterizacao } = require("../utils/caracterizacaoChecklist");
const checklistRepository = require("../repositories/checklistMultiTenantRepository");
const { consolidarCaracterizacao, determinarAplicabilidade, validarConclusao,
  prepararTransicao, selecionarRespostasDependentes, DEPENDENTES } = require("../utils/regrasCaracterizacaoNr33");
const { CAMPOS_NR33, selecionarCamposNr33, validarEstruturaNr33,
  mesclarCamposNr33, prepararDadosRegrasNr33 } = require("../utils/adaptadorCamposNr33");

// O esquema multi-tenant, critérios e versionamento exigem homologação real.
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
  if (Object.hasOwn(dados, "avaliacao_nr33")) {
    const erro = criarErro("avaliacao_nr33 é somente leitura.", 400);
    erro.code = "NR33_CAMPO_SOMENTE_LEITURA";
    throw erro;
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

// Somente erros conhecidos do adaptador na fronteira de dados do pedido viram
// HTTP 400. Falhas do repository, das regras ou do snapshot persistido propagam.
function validarEntradaNr33(executar) {
  try { return executar(); }
  catch (erro) {
    const mensagemDeCampo = CAMPOS_NR33.includes(erro?.campo) && [
      "Acessores nao sao aceitos.", "O marcador deve ser true ou null.",
      "A condicao deve ser SIM, NAO ou null.",
      "Condicoes preenchidas exigem avaliacao_especifica_iniciada=true.",
    ].includes(erro.message);
    const mensagemBooleana = DEPENDENTES.some(campo => erro?.message === `${campo} deve ser booleano ou null.`);
    const objetoInvalido = erro?.campo === null && erro.message === "Esperado um objeto simples de dados.";
    if (!(erro instanceof TypeError) || !(mensagemDeCampo || mensagemBooleana || objetoInvalido)) throw erro;
    const conhecido = criarErro("Dados NR-33 inválidos.", 400);
    conhecido.code = "NR33_DADOS_INVALIDOS";
    throw conhecido;
  }
}

function selecionarNovosCampos(dados) {
  return validarEntradaNr33(() => {
    const campos = selecionarCamposNr33(dados);
    return { ...campos, ...selecionarRespostasDependentes(campos) };
  });
}

// Nucleo compartilhado pela validacao de escrita e pela leitura calculada.
// Nunca vai ao INSERT/UPDATE; avisos continuam produzidos pelas regras.
function avaliarEstadoNr33(dadosPreparados) {
  return { classificacao: consolidarCaracterizacao(dadosPreparados),
    aplicabilidade: determinarAplicabilidade(dadosPreparados),
    conclusao: validarConclusao(dadosPreparados) };
}

function representarAvaliacaoNr33(avaliacao) {
  // Materializa tambem a serializacao enquanto ainda e possivel dar rollback.
  // Nao deixa getters, ciclos ou valores nao JSON para o envio apos COMMIT.
  return JSON.parse(JSON.stringify({
    classificacao: avaliacao.classificacao,
    aplicabilidade: avaliacao.aplicabilidade,
    // Apenas completude/coerencia; nao autoriza entrada ou edicao.
    validacao_conclusao: { ...avaliacao.conclusao, pode_concluir: avaliacao.conclusao.valido },
  }));
}

// Apenas resultados ja autorizados. Ausencia estrutural nao e resposta NULL.
function comAvaliacaoNr33(checklist) {
  if (CAMPOS_NR33.some(campo => !Object.hasOwn(checklist, campo))) {
    const erro = criarErro("Avaliação NR-33 temporariamente indisponível.", 503);
    erro.code = "NR33_ESQUEMA_INCOMPATIVEL";
    throw erro;
  }
  const avaliacao = avaliarEstadoNr33(prepararDadosRegrasNr33(checklist));
  return { ...checklist, avaliacao_nr33: representarAvaliacaoNr33(avaliacao) };
}

function exigirConclusao(avaliacao) {
  if (avaliacao.conclusao.valido) return;
  const erro = criarErro("Checklist incompleto ou incoerente para conclusão.", 400);
  erro.code = "NR33_CONCLUSAO_INVALIDA";
  erro.validacaoNr33 = avaliacao.conclusao.erros;
  throw erro;
}

function exigirConfirmacao(campos) {
  if (!campos.length) return;
  const erro = criarErro("A operação exige confirmação de limpeza, ainda não disponível.", 409);
  erro.code = "NR33_CONFIRMACAO_LIMPEZA_NECESSARIA";
  erro.necessitaConfirmacaoLimpeza = true;
  erro.camposLimpeza = [...new Set(campos)];
  throw erro;
}

async function criarChecklist(dados, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  validarDados(dados);
  const idLocal = validarIdentificador(dados.id_local, "ID do local inválido.");
  const respostas = selecionarRespostas(dados);
  const observacoes = selecionarObservacoes(dados);
  const { status = "PENDENTE" } = dados;
  validarStatus(status);
  const novos = selecionarNovosCampos(dados);
  validarEntradaNr33(() => validarEstruturaNr33(novos));
  let avaliacaoResposta;

  // Sem leitura prévia: o SQL autoriza o local e a restrição UNIQUE garante
  // a unicidade. O erro 409 controlado pelo repositório é propagado intacto.
  const checklist = await checklistRepository.criarNoAmbiente(
    { id_local: idLocal, ...respostas, ...observacoes, ...selecionarCaracterizacao(dados), ...novos, status },
    usuario,
    { bloquearAutorizacao: true, exigirEsquemaNr33: true, validarEstado: ({ dadosPropostos }) => {
      // A prova SQL ja ocorreu. Omitidos no INSERT usam os NULLs sem DEFAULT
      // da migration 026; o adaptador preserva essas respostas desconhecidas.
      const avaliacao = avaliarEstadoNr33(prepararDadosRegrasNr33(dadosPropostos));
      if (dadosPropostos.status === "CONCLUIDO") exigirConclusao(avaliacao);
      avaliacaoResposta = representarAvaliacaoNr33(avaliacao);
      return dadosPropostos;
    } }
  );

  if (!checklist) {
    // Mesma resposta para local ausente, externo ou sem autorização.
    throw criarErro("Local não encontrado.", 404);
  }
  // Apos COMMIT apenas anexa a representacao ja calculada dentro da transacao.
  return { ...checklist, avaliacao_nr33: avaliacaoResposta };
}

async function listarChecklists(usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const checklists = await checklistRepository.listarPermitidosNoAmbiente(usuario);
  return checklists.map(comAvaliacaoNr33);
}

async function buscarChecklistPorId(idChecklist, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idChecklist, "ID do checklist inválido.");
  const checklist = await checklistRepository.buscarPermitidoPorIdNoAmbiente(
    id,
    usuario
  );
  return comAvaliacaoNr33(exigirChecklist(checklist));
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
    ...selecionarCaracterizacao(dados),
    ...selecionarNovosCampos(dados),
  };
  let avaliacaoResposta;
  const checklist = await checklistRepository.atualizarNoAmbiente(
    id,
    campos,
    usuario,
    { bloquearAutorizacao: true, exigirEsquemaNr33: true, validarEstado: ({ estadoAtual, dadosPropostos }) => {
      const relevantes = [...CAMPOS_RESPOSTAS, ...CAMPOS_NR33];
      const mudou = relevantes.some(campo => Object.hasOwn(dadosPropostos, campo) &&
        !Object.is(dadosPropostos[campo] ?? null, estadoAtual[campo] ?? null));
      // Campos iguais reenviados e edicoes cadastrais nao regularizam historicos.
      if (!mudou) {
        avaliacaoResposta = representarAvaliacaoNr33(avaliarEstadoNr33(prepararDadosRegrasNr33(estadoAtual)));
        return dadosPropostos;
      }

      const antes = prepararDadosRegrasNr33(estadoAtual);
      const patch = selecionarCamposNr33(dadosPropostos);
      // NULL nao comprova consentimento. Inclui false, NAO e o marcador iniciado.
      exigirConfirmacao(CAMPOS_NR33.filter(campo => Object.hasOwn(patch, campo) &&
        patch[campo] === null && estadoAtual[campo] != null));
      const novos = validarEntradaNr33(() => mesclarCamposNr33(estadoAtual, patch));
      const resultante = { ...estadoAtual, ...dadosPropostos, ...novos };
      const depois = prepararDadosRegrasNr33(resultante);
      const transicao = prepararTransicao(antes, depois);
      exigirConfirmacao(transicao.limpezas.map(limpeza => limpeza.campo));
      const avaliacao = avaliarEstadoNr33(depois);
      if (estadoAtual.status === "CONCLUIDO") exigirConclusao(avaliacao);
      avaliacaoResposta = representarAvaliacaoNr33(avaliacao);
      return dadosPropostos;
    } }
  );
  return { ...exigirChecklist(checklist), avaliacao_nr33: avaliacaoResposta };
}

async function alterarStatusChecklist(idChecklist, dados, usuarioAutenticado) {
  const usuario = validarIdentidade(usuarioAutenticado);
  const id = validarIdentificador(idChecklist, "ID do checklist inválido.");
  validarDados(dados);
  validarStatus(dados.status);
  let avaliacaoResposta;

  const checklist = await checklistRepository.atualizarStatusNoAmbiente(
    id,
    dados.status,
    usuario,
    { bloquearAutorizacao: true, exigirEsquemaNr33: true, validarEstado: ({ estadoAtual, dadosPropostos }) => {
      const avaliacao = avaliarEstadoNr33(prepararDadosRegrasNr33({ ...estadoAtual, ...dadosPropostos }));
      avaliacaoResposta = representarAvaliacaoNr33(avaliacao);
      if (dadosPropostos.status === "CONCLUIDO" && estadoAtual.status === "CONCLUIDO") {
        return checklistRepository.statusConcluidoSemAlteracao();
      }
      if (dadosPropostos.status === "CONCLUIDO") {
        exigirConclusao(avaliacao);
      }
      return dadosPropostos;
    } }
  );
  return { ...exigirChecklist(checklist), avaliacao_nr33: avaliacaoResposta };
}

module.exports = {
  criarChecklist,
  listarChecklists,
  buscarChecklistPorId,
  atualizarChecklist,
  alterarStatusChecklist,
};
