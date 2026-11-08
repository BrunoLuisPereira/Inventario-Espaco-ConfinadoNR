// Indicador de A/B/C compartilhado pela tabela de Locais e pelo relatório.
// Independente do status e da classificação normativa completa.
export function espacoConfinado(local) {
  const respostas = [local.criterio_a, local.criterio_b, local.criterio_c]
  if (respostas.includes('NAO')) return { texto: 'Não', classe: 'nao' }
  if (respostas.every(resposta => resposta === 'SIM')) return { texto: 'Sim', classe: 'sim' }
  return { texto: 'Não avaliado', classe: 'nao-avaliado' }
}
