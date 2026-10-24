// Consulta somente leitura, limitada a quatro locais simultaneos. Sem cache persistente.
const fila = []
let executando = 0
function executarFila() {
  while (executando < 4 && fila.length) {
    const { consultar, resolver } = fila.shift()
    executando++
    Promise.resolve().then(consultar).then(resolver, () => resolver({ estado: 'erro' })).finally(() => {
      executando--
      executarFila()
    })
  }
}
export function consultarPdfLocal(idLocal, api, atual = () => true) {
  return new Promise(resolver => {
    fila.push({ resolver, consultar: async () => {
      if (!atual()) return null
      try {
        const { data: relatorio } = await api.buscarRelatorioPorLocal(idLocal)
        if (!atual()) return null
        if (!relatorio?.id_relatorio || String(relatorio.id_local) !== String(idLocal) ||
          typeof relatorio.caminho_pdf !== 'string' || !relatorio.caminho_pdf.trim()) return { estado: 'ausente' }
        await api.verificarPdfRelatorio(relatorio.id_relatorio)
        return { estado: 'disponivel', idRelatorio: relatorio.id_relatorio }
      } catch (e) {
        return { estado: e.status === 404 ? 'ausente' : e.status === 403 ? 'nao-autorizado' : 'erro' }
      }
    } })
    executarFila()
  })
}
