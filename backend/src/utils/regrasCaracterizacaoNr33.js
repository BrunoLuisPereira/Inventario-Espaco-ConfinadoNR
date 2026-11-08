// NR-33, Portaria MTP 1.690/2022, texto oficial retificado: 33.2.2,
// 33.2.2.1, 33.2.2.2, 33.5.13 e Anexo I. Contrato em docs/regras-caracterizacao-nr33.md.
// Sem I/O ou integração com os fluxos atuais.
const RESULTADO = Object.freeze({
  CARACTERIZADO: 'CARACTERIZADO', PENDENTE: 'PENDENTE',
  NAO_CARACTERIZADO: 'NAO_CARACTERIZADO',
  NAO_CARACTERIZADO_PELA_REGRA_GERAL: 'NAO_CARACTERIZADO_PELA_REGRA_GERAL',
  AVALIACAO_HISTORICA_INCOMPLETA: 'AVALIACAO_HISTORICA_INCOMPLETA',
});
const HIPOTESE = Object.freeze({
  ATENDIDA: 'ATENDIDA', NAO_ATENDIDA: 'NAO_ATENDIDA',
  INFORMACOES_INSUFICIENTES: 'INFORMACOES_INSUFICIENTES', NAO_AVALIADA: 'NAO_AVALIADA',
});
const ORIGEM = Object.freeze({
  REGRA_GERAL: 'REGRA_GERAL', HIPOTESE_ESPECIFICA: 'HIPOTESE_ESPECIFICA',
  AMBAS: 'AMBAS', AVALIACAO_PENDENTE: 'AVALIACAO_PENDENTE',
  HIPOTESES_DESCARTADAS: 'HIPOTESES_DESCARTADAS',
});
const CRITERIOS = Object.freeze(['criterio_a', 'criterio_b', 'criterio_c']);
const ATMOSFERA = Object.freeze(['atmosfera_oxigenio', 'atmosfera_contaminantes', 'atmosfera_explosiva']);
const DEPENDENTES = Object.freeze([...ATMOSFERA, 'possui_placa_identificacao']);
const CONDICOES_ESPECIFICAS = Object.freeze(['nao_destinado_ocupacao_humana',
  'meios_limitados_entrada_saida', 'utilizado_armazenagem', 'potencial_engolfamento', 'potencial_afogamento']);
const DEMAIS_CRITERIOS = Object.freeze(['acesso_controlado', 'ventilacao_adequada',
  'monitoramento_atmosferico', 'procedimento_emergencia']);

function objeto(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(valor))) {
    throw new TypeError('Esperado um objeto de dados.');
  }
}
function resposta(valor, campo) {
  if (valor != null && !['SIM', 'NAO'].includes(valor)) throw new TypeError(`${campo} deve ser SIM, NAO ou null.`);
}
function validarHistorico(contexto) {
  objeto(contexto);
  if (contexto.evidenciaHistoricaIncompleta !== undefined &&
      (typeof contexto.evidenciaHistoricaIncompleta !== 'string' || !contexto.evidenciaHistoricaIncompleta.trim())) {
    throw new TypeError('A evidência histórica deve ser um texto não vazio.');
  }
}

function avaliarRegraGeral(dados = {}, contexto = {}) {
  objeto(dados); validarHistorico(contexto);
  for (const campo of CRITERIOS) resposta(dados[campo], campo);
  if (contexto.evidenciaHistoricaIncompleta !== undefined) return RESULTADO.AVALIACAO_HISTORICA_INCOMPLETA;
  if (CRITERIOS.some(c => dados[c] == null)) return RESULTADO.PENDENTE;
  return CRITERIOS.every(c => dados[c] === 'SIM') ? RESULTADO.CARACTERIZADO
    : RESULTADO.NAO_CARACTERIZADO_PELA_REGRA_GERAL;
}

function avaliarHipoteseEspecifica(avaliacao) {
  if (avaliacao == null) return HIPOTESE.NAO_AVALIADA;
  objeto(avaliacao);
  for (const campo of CONDICOES_ESPECIFICAS) resposta(avaliacao[campo], campo);
  // Uma condição cumulativa negativa descarta a hipótese, sem completar ausências.
  if (CONDICOES_ESPECIFICAS.slice(0, 3).some(c => avaliacao[c] === 'NAO') ||
      avaliacao.potencial_engolfamento === 'NAO' && avaliacao.potencial_afogamento === 'NAO') {
    return HIPOTESE.NAO_ATENDIDA;
  }
  if (CONDICOES_ESPECIFICAS.slice(0, 3).every(c => avaliacao[c] === 'SIM') &&
      [avaliacao.potencial_engolfamento, avaliacao.potencial_afogamento].includes('SIM')) {
    return HIPOTESE.ATENDIDA;
  }
  return HIPOTESE.INFORMACOES_INSUFICIENTES;
}

// Recebe respostas brutas, não classificações fornecidas por um cliente.
function consolidarCaracterizacao(dados = {}, contexto = {}) {
  const regraGeral = avaliarRegraGeral(dados, contexto);
  const hipoteseEspecifica = avaliarHipoteseEspecifica(dados.avaliacao_especifica);
  const geral = regraGeral === RESULTADO.CARACTERIZADO, especifica = hipoteseEspecifica === HIPOTESE.ATENDIDA;
  let resultado, origem;
  if (geral || especifica) {
    resultado = RESULTADO.CARACTERIZADO;
    origem = geral && especifica ? ORIGEM.AMBAS : geral ? ORIGEM.REGRA_GERAL : ORIGEM.HIPOTESE_ESPECIFICA;
  } else if (regraGeral === RESULTADO.NAO_CARACTERIZADO_PELA_REGRA_GERAL && hipoteseEspecifica === HIPOTESE.NAO_ATENDIDA) {
    resultado = RESULTADO.NAO_CARACTERIZADO; origem = ORIGEM.HIPOTESES_DESCARTADAS;
  } else {
    resultado = RESULTADO.PENDENTE; origem = ORIGEM.AVALIACAO_PENDENTE;
  }
  return { resultado, origem, regraGeral, hipoteseEspecifica,
    alertas: regraGeral === RESULTADO.AVALIACAO_HISTORICA_INCOMPLETA ? [RESULTADO.AVALIACAO_HISTORICA_INCOMPLETA] : [] };
}

function determinarAplicabilidade(dados = {}, contexto = {}) {
  const classificacao = consolidarCaracterizacao(dados, contexto);
  return { atmosfera: dados.criterio_c === 'SIM',
    placa: classificacao.resultado === RESULTADO.CARACTERIZADO, classificacao };
}

function selecionarRespostasDependentes(dados = {}) {
  objeto(dados);
  const selecionados = {};
  for (const campo of DEPENDENTES) {
    if (!Object.hasOwn(dados, campo) || dados[campo] === undefined) continue;
    if (dados[campo] !== null && typeof dados[campo] !== 'boolean') {
      throw new TypeError(`${campo} deve ser booleano ou null.`);
    }
    selecionados[campo] = dados[campo];
  }
  return selecionados;
}

function validarConclusao(dados = {}, contexto = {}) {
  const aplicabilidade = determinarAplicabilidade(dados, contexto);
  const respostas = selecionarRespostasDependentes(dados), erros = [], avisos = [];
  const adicionar = (codigo, campos) => erros.push({ codigo, campos });
  for (const campo of [...CRITERIOS, ...DEMAIS_CRITERIOS]) {
    resposta(dados[campo], campo);
    if (dados[campo] == null) adicionar('RESPOSTA_OBRIGATORIA', [campo]);
  }
  if (aplicabilidade.classificacao.resultado === RESULTADO.PENDENTE) adicionar('CARACTERIZACAO_PENDENTE', []);
  if (aplicabilidade.atmosfera && !ATMOSFERA.some(c => respostas[c] === true)) adicionar('CONDICAO_ATMOSFERICA_OBRIGATORIA', [...ATMOSFERA]);
  if (aplicabilidade.placa && typeof respostas.possui_placa_identificacao !== 'boolean') adicionar('RESPOSTA_PLACA_OBRIGATORIA', ['possui_placa_identificacao']);
  if (aplicabilidade.placa && respostas.possui_placa_identificacao === false) avisos.push('AUSENCIA_SINALIZACAO');
  // Respostas fora da aplicabilidade são históricas: preservadas, sem impedir
  // conclusão nem satisfazer requisitos de campos aplicáveis.
  const incompativeis = DEPENDENTES.filter(c => respostas[c] != null &&
    !(ATMOSFERA.includes(c) ? aplicabilidade.atmosfera : aplicabilidade.placa));
  if (incompativeis.length) avisos.push('RESPOSTAS_INAPLICAVEIS_PRESERVADAS');
  return { valido: erros.length === 0, erros, avisos, classificacao: aplicabilidade.classificacao };
}

// anterior e posterior são snapshots completos. Atualizações parciais devem ser
// mescladas antes, preservando omissão; esta função nunca executa uma limpeza.
function prepararTransicao(anterior = {}, posterior = {}, contextoAnterior = {}, contextoPosterior = contextoAnterior) {
  const antes = determinarAplicabilidade(anterior, contextoAnterior);
  const depois = determinarAplicabilidade(posterior, contextoPosterior);
  const respostasAntes = selecionarRespostasDependentes(anterior);
  const respostasDepois = selecionarRespostasDependentes(posterior);
  const transicao = campo => ({ passaASerAplicavel: !antes[campo] && depois[campo],
    deixaDeSerAplicavel: antes[campo] && !depois[campo] });
  const preservadas = DEPENDENTES.filter(c => !(ATMOSFERA.includes(c) ? depois.atmosfera : depois.placa) &&
    respostasDepois[c] != null);
  // Só apagar um valor persistido é destrutivo. Inaplicabilidade por si só
  // não exige NULL e não autoriza descartar uma resposta true ou false.
  const limpezas = DEPENDENTES.filter(c => respostasAntes[c] != null &&
    Object.hasOwn(respostasDepois, c) && respostasDepois[c] === null).map(campo => ({
    campo, valorAnterior: respostasAntes[campo], valorPosterior: respostasDepois[campo],
    valorRecomendado: null, requerConfirmacao: true,
    limpezaExplicita: Object.hasOwn(respostasDepois, campo) && respostasDepois[campo] === null,
  }));
  return { atmosfera: transicao('atmosfera'), placa: transicao('placa'), limpezas, preservadas };
}

module.exports = { RESULTADO, HIPOTESE, ORIGEM, CRITERIOS, ATMOSFERA, DEPENDENTES,
  CONDICOES_ESPECIFICAS, avaliarRegraGeral, avaliarHipoteseEspecifica,
  consolidarCaracterizacao, determinarAplicabilidade, selecionarRespostasDependentes,
  validarConclusao, prepararTransicao };
