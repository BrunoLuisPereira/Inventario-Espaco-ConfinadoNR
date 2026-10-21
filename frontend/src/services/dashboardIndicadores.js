export function indicadoresCampanhas(campanhas) {
  if (!Array.isArray(campanhas)) throw Error('Resposta inválida ao carregar campanhas.')
  return {
    totalCampanhas: campanhas.length,
    campanhasEmAndamento: campanhas.filter(c => c.status === 'EM ANDAMENTO').length,
    campanhasConcluidas: campanhas.filter(c => c.status === 'CONCLUIDO').length,
    campanhasCanceladas: campanhas.filter(c => c.status === 'CANCELADA').length,
  }
}
