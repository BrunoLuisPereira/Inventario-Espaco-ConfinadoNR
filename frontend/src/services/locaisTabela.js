const comparar = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })
const texto = valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')

export function prepararLocais(locais, campanhas) {
  if (!Array.isArray(locais) || !Array.isArray(campanhas)) throw Error('Resposta inválida ao carregar locais.')
  const nomes = new Map(campanhas.map(c => [String(c.id_campanha), c.nome_campanha]))
  return locais.map(local => ({ ...local, nome_campanha: nomes.get(String(local.id_campanha)) || local.nome_campanha || 'Não informada' }))
}

// Paginação da coleção completa retornada pela API. Não estima andamento.
export function consultarLocais(locais, { busca = '', campanha = '', situacao = '', campo = 'nome_local', direcao = 'asc', pagina = 1, tamanho = 10 } = {}) {
  const termo = texto(busca.trim())
  const filtrados = locais.filter(local => (!campanha || String(local.id_campanha) === String(campanha)) &&
    (!situacao || local.status === situacao) && (!termo ||
      [local.nome_local, local.setor, local.nome_campanha].some(valor => texto(valor).includes(termo))))
  const chave = ['nome_local', 'nome_campanha', 'setor'].includes(campo) ? campo : 'nome_local'
  const ordenados = [...filtrados].sort((a, b) => (direcao === 'desc' ? -1 : 1) * comparar.compare(a[chave] ?? '', b[chave] ?? '') || comparar.compare(String(a.id_local), String(b.id_local)))
  const limite = [10, 25, 50].includes(tamanho) ? tamanho : 10
  const paginas = Math.max(1, Math.ceil(ordenados.length / limite))
  const atual = Math.min(paginas, Math.max(1, Number.isInteger(pagina) ? pagina : 1))
  return { registros: ordenados.slice((atual - 1) * limite, atual * limite), total: ordenados.length,
    paginas, pagina: atual, inicio: ordenados.length ? (atual - 1) * limite + 1 : 0, fim: Math.min(atual * limite, ordenados.length) }
}
