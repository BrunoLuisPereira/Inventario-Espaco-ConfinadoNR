// Adaptacao pura da migration 026. Nao valida conclusao nem classifica espacos.
const { DEPENDENTES, CONDICOES_ESPECIFICAS, CRITERIOS,
  selecionarRespostasDependentes } = require('./regrasCaracterizacaoNr33');

const MARCADOR = 'avaliacao_especifica_iniciada';
const CAMPOS_NR33 = Object.freeze([...DEPENDENTES, ...CONDICOES_ESPECIFICAS, MARCADOR]);
const RESPOSTAS_ATUAIS = Object.freeze([...CRITERIOS, 'acesso_controlado',
  'ventilacao_adequada', 'monitoramento_atmosferico', 'procedimento_emergencia']);
const CAMPOS_ESTADO_RELEVANTE = Object.freeze([...RESPOSTAS_ATUAIS, 'status', ...CAMPOS_NR33]);

function invalido(mensagem, campo) {
  return Object.assign(new TypeError(mensagem), { campo });
}

function exigirObjeto(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(dados))) {
    throw invalido('Esperado um objeto simples de dados.', null);
  }
}

// Ignora heranca e trata undefined como omissao, conforme os utilitarios atuais.
// Acessores nao sao executados: entradas devem conter propriedades de dados.
function valorProprio(dados, campo) {
  const propriedade = Object.getOwnPropertyDescriptor(dados, campo);
  if (!propriedade) return undefined;
  if (!Object.hasOwn(propriedade, 'value')) throw invalido('Acessores nao sao aceitos.', campo);
  return propriedade.value;
}

// Selecao de PATCH: valida dominios individuais, sem exigir um estado completo.
// No modo estrito, qualquer chave fora dos dez campos e rejeitada, mesmo undefined.
function selecionarCamposNr33(dados = {}, opcoes = {}) {
  exigirObjeto(dados); exigirObjeto(opcoes);
  const estrito = valorProprio(opcoes, 'estrito');
  if (estrito !== undefined && typeof estrito !== 'boolean') {
    throw invalido('A opcao estrito deve ser booleana.', 'estrito');
  }
  if (estrito) {
    for (const campo of Reflect.ownKeys(dados)) {
      if (!CAMPOS_NR33.includes(campo)) throw invalido('Campo fora dos dez campos NR-33 permitidos.', String(campo));
    }
  }
  const selecionados = {};
  for (const campo of CAMPOS_NR33) {
    const valor = valorProprio(dados, campo);
    if (valor === undefined) continue;
    if (DEPENDENTES.includes(campo)) {
      Object.assign(selecionados, selecionarRespostasDependentes({ [campo]: valor }));
    } else if (campo === MARCADOR) {
      if (valor !== null && valor !== true) throw invalido('O marcador deve ser true ou null.', campo);
      selecionados[campo] = valor;
    } else {
      if (valor !== null && valor !== 'SIM' && valor !== 'NAO') throw invalido('A condicao deve ser SIM, NAO ou null.', campo);
      selecionados[campo] = valor;
    }
  }
  return selecionados;
}

// Recebe snapshot, nao PATCH. Ausencia historica e aceita sem fabricar respostas.
// Devolve somente os campos presentes; nao materializa NULL em propriedades omitidas.
function validarEstruturaNr33(dados = {}) {
  const campos = selecionarCamposNr33(dados);
  if (campos[MARCADOR] !== true && CONDICOES_ESPECIFICAS.some(c => campos[c] != null)) {
    throw invalido('Condicoes preenchidas exigem avaliacao_especifica_iniciada=true.', MARCADOR);
  }
  return campos;
}

// Devolve uma nova projecao dos dez campos. O chamador continua responsavel pelos
// demais campos do checklist e pela confirmacao de limpeza sob bloqueio transacional.
function mesclarCamposNr33(anterior = {}, atualizacao = {}) {
  const antes = validarEstruturaNr33(anterior);
  const patch = selecionarCamposNr33(atualizacao, { estrito: true });
  return validarEstruturaNr33({ ...antes, ...patch });
}

function reconstruirAvaliacaoEspecifica(dados = {}) {
  const campos = validarEstruturaNr33(dados);
  if (campos[MARCADOR] !== true) return null;
  return Object.fromEntries(CONDICOES_ESPECIFICAS.map(c => [c, campos[c] ?? null]));
}

// Projecao plana dos dados relevantes, preservando ausencias. Nao infere A/B,
// nao reconhece contexto historico do cliente e nao aceita classificacao como fonte.
function projetarEstadoRelevante(dados) {
  const campos = validarEstruturaNr33(dados);
  const resultado = {};
  for (const campo of [...RESPOSTAS_ATUAIS, 'status']) {
    const valor = valorProprio(dados, campo);
    if (valor === undefined) continue;
    const permitidos = campo === 'status' ? ['PENDENTE', 'CONCLUIDO'] : ['SIM', 'NAO'];
    if (valor !== null && !permitidos.includes(valor)) throw invalido('Resposta atual ou status invalido.', campo);
    resultado[campo] = valor;
  }
  return { ...resultado, ...campos };
}

function prepararDadosRegrasNr33(dados = {}) {
  const estado = projetarEstadoRelevante(dados);
  return { ...estado, avaliacao_especifica: reconstruirAvaliacaoEspecifica(estado) };
}

// Serializacao deterministica preliminar, NAO um token ou controle de concorrencia.
// Ordem fixa; ausencia e null continuam distintos. undefined equivale a omissao.
// Nao inclui IDs, ambiente, versao ou evidencia historica: esses elementos exigem
// fontes confiaveis e contrato na futura camada transacional.
function representarEstadoCanonicoNr33(dados = {}) {
  const estado = projetarEstadoRelevante(dados);
  return JSON.stringify({
    formato: 'nr33-estado-relevante-v1',
    campos: CAMPOS_ESTADO_RELEVANTE.map(campo => Object.hasOwn(estado, campo)
      ? [campo, { presente: true, valor: estado[campo] }]
      : [campo, { presente: false }]),
  });
}

module.exports = { MARCADOR, CAMPOS_NR33, CAMPOS_ESTADO_RELEVANTE,
  selecionarCamposNr33, validarEstruturaNr33, mesclarCamposNr33,
  reconstruirAvaliacaoEspecifica, prepararDadosRegrasNr33, representarEstadoCanonicoNr33 };
