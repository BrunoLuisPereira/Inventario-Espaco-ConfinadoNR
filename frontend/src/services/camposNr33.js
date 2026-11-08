import { prepararCaracterizacao } from './caracterizacaoChecklist.js'

export const respostasGerais = ['criterio_a', 'criterio_b', 'criterio_c', 'acesso_controlado',
  'ventilacao_adequada', 'monitoramento_atmosferico', 'procedimento_emergencia']
export const atmosferaNr33 = [
  ['atmosfera_oxigenio', 'Deficiência ou enriquecimento de oxigênio'],
  ['atmosfera_contaminantes', 'Presença de contaminantes'],
  ['atmosfera_explosiva', 'Atmosfera explosiva'],
]
export const condicoesEspecificasNr33 = [
  ['nao_destinado_ocupacao_humana', 'Não destinado à ocupação humana'],
  ['meios_limitados_entrada_saida', 'Meios limitados de entrada e saída'],
  ['utilizado_armazenagem', 'Utilizado para armazenagem'],
  ['potencial_engolfamento', 'Potencial de engolfamento'],
  ['potencial_afogamento', 'Potencial de afogamento'],
]
export const marcadorNr33 = 'avaliacao_especifica_iniciada'
export const booleanosNr33 = [...atmosferaNr33.map(([campo]) => campo), 'possui_placa_identificacao']
export const camposNr33 = [...booleanosNr33, ...condicoesEspecificasNr33.map(([campo]) => campo), marcadorNr33]
export const rotulosNr33 = Object.fromEntries([...atmosferaNr33, ...condicoesEspecificasNr33,
  ['possui_placa_identificacao', 'Placa de identificação'], [marcadorNr33, 'Avaliação específica'],
  ['criterio_a', 'Critério A'], ['criterio_b', 'Critério B'], ['criterio_c', 'Critério C'],
  ['acesso_controlado', 'Acesso controlado'], ['ventilacao_adequada', 'Ventilação adequada'],
  ['monitoramento_atmosferico', 'Monitoramento atmosférico'], ['procedimento_emergencia', 'Procedimento de emergência']])

// Adaptacao de tipos e de PATCH; nenhuma classificacao ou regra de aplicabilidade.
export function preencherCamposNr33(dados = {}) {
  return Object.fromEntries(camposNr33.map(campo => [campo, dados[campo] ?? null]))
}
export function selecionarCamposNr33(dados) {
  return Object.fromEntries(camposNr33.filter(campo => Object.hasOwn(dados, campo) && dados[campo] !== undefined).map(campo => {
    const valor = dados[campo]
    const valido = valor === null || (campo === marcadorNr33 ? valor === true
      : booleanosNr33.includes(campo) ? typeof valor === 'boolean' : ['SIM', 'NAO'].includes(valor))
    if (!valido) throw new Error(`Resposta inválida: ${rotulosNr33[campo]}.`)
    return [campo, valor]
  }))
}
export function lerRespostaNr33(campo, valor) {
  if (!camposNr33.includes(campo)) throw new Error('Campo NR-33 não permitido.')
  const resposta = valor === '' ? null : campo === marcadorNr33 ? (valor === 'INICIADA' ? true : valor)
    : booleanosNr33.includes(campo) ? (valor === 'SIM' ? true : valor === 'NAO' ? false : valor) : valor
  return selecionarCamposNr33({ [campo]: resposta })[campo]
}
export function valorRespostaNr33(campo, valor) {
  return valor == null ? '' : campo === marcadorNr33 ? 'INICIADA' : valor === true ? 'SIM' : valor === false ? 'NAO' : valor
}
export function textoRespostaNr33(campo, valor) {
  if (campo === marcadorNr33) return valor === true ? 'Iniciada' : 'Não iniciada'
  return valor == null ? 'Não avaliado' : valor === true || valor === 'SIM' ? 'Sim' : 'Não'
}
export function prepararEdicaoChecklist(formulario, anterior) {
  const atuais = { ...prepararCaracterizacao(formulario), ...selecionarCamposNr33(formulario),
    ...Object.fromEntries(respostasGerais.map(campo => [campo, formulario[campo] ?? ''])),
    observacoes: (formulario.observacoes ?? '').trim() }
  const salvos = { ...prepararCaracterizacao(anterior), ...preencherCamposNr33(anterior),
    ...Object.fromEntries(respostasGerais.map(campo => [campo, anterior[campo] ?? ''])),
    observacoes: (anterior.observacoes ?? '').trim() }
  const patch = Object.fromEntries(Object.entries(atuais).filter(([campo, valor]) => !Object.is(valor, salvos[campo])))
  for (const campo of respostasGerais) {
    if (Object.hasOwn(patch, campo) && !['SIM', 'NAO'].includes(patch[campo])) throw new Error(`Responda ${rotulosNr33[campo]} com Sim ou Não.`)
  }
  return patch
}
export function respostasNr33Alteradas(formulario, anterior) {
  return [...respostasGerais, ...camposNr33].some(campo =>
    !Object.is(formulario[campo] ?? (respostasGerais.includes(campo) ? '' : null),
      anterior?.[campo] ?? (respostasGerais.includes(campo) ? '' : null)))
}
export function exigirConexaoChecklist(online = globalThis.navigator?.onLine) {
  if (online === false) throw Object.assign(new Error('Conecte-se à internet para salvar o checklist. As respostas continuam no formulário; nenhuma operação foi colocada em fila offline.'), { code: 'NR33_OFFLINE' })
}
const pendencias = {
  RESPOSTA_OBRIGATORIA: 'Resposta obrigatória', CARACTERIZACAO_PENDENTE: 'Caracterização ainda pendente',
  CONDICAO_ATMOSFERICA_OBRIGATORIA: 'Informe ao menos uma condição atmosférica presente',
  RESPOSTA_PLACA_OBRIGATORIA: 'Informe se existe placa de identificação',
  RESPOSTAS_FORA_DE_APLICABILIDADE: 'Existem respostas fora da aplicabilidade atual',
}
export function descreverPendenciasNr33(erros = []) {
  return (Array.isArray(erros) ? erros : []).filter(item => item && Object.hasOwn(pendencias, item.codigo)).map(item => {
    const campos = (Array.isArray(item.campos) ? item.campos : []).filter(c => Object.hasOwn(rotulosNr33, c)).map(c => rotulosNr33[c])
    return `${pendencias[item.codigo]}${campos.length ? ': ' + campos.join(', ') : ''}.`
  })
}
export function mensagemErroNr33(erro) {
  if (erro.status === 409 && erro.code === 'NR33_CONFIRMACAO_LIMPEZA_NECESSARIA') return 'Esta alteração exige confirmação de limpeza de respostas. Esse procedimento ainda não está disponível. Nenhuma resposta foi apagada; seus dados continuam no formulário.'
  if (erro.status === 503) return 'Caracterização NR-33 temporariamente indisponível. Solicite a verificação do esquema do servidor. As respostas não foram descartadas.'
  if (erro.status === 401) return 'Autenticação necessária. Entre novamente para continuar.'
  if (erro.status === 403) return 'Você não tem permissão para alterar este checklist.'
  if (erro.status === 404) return 'Checklist ou local inexistente ou inacessível para sua conta.'
  return [erro.message || 'Não foi possível salvar o checklist.', ...descreverPendenciasNr33(erro.details?.erros)].join(' ')
}
