import { gerarLoteCsvAuditoria } from './auditoriaCsv.js'

// A rede é consumida por lotes. O Blob só fica disponível depois da confirmação
// de conclusão E do término normal do transporte, nunca por um prefixo parcial.
export async function receberAuditoriaCompleta({ obterToken, fetchImpl, signal }) {
  const token = obterToken()
  const falhar = () => { throw Error('Exportação interrompida ou incompleta. Nenhum arquivo foi gerado.') }
  const verificar = () => { if (!token || signal?.aborted || obterToken() !== token) falhar() }
  verificar()
  let reader, completo = false
  try {
    const resposta = await fetchImpl('/api/usuarios/auditoria/perfis/exportar', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/x-ndjson' }, signal,
    })
    if (!resposta.ok) throw Object.assign(Error(resposta.status === 401 ? 'Sessão inválida ou expirada.' : resposta.status === 403 ? 'Você não possui permissão para esta operação.' : 'Não foi possível exportar o histórico.'), { status: resposta.status })
    if (!resposta.headers.get('content-type')?.startsWith('application/x-ndjson')) falhar()
    reader = resposta.body.getReader()
    const partes = [gerarLoteCsvAuditoria([])]
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let buffer = '', total = 0n, fim = false
    function frame(linha) {
      verificar()
      if (fim) falhar()
      const valor = JSON.parse(linha)
      if (valor.tipo === 'lote' && Array.isArray(valor.registros) && valor.registros.length > 0 && valor.registros.length <= 500) {
        partes.push(gerarLoteCsvAuditoria(valor.registros, [], false))
        total += BigInt(valor.registros.length)
      } else if (valor.tipo === 'fim' && typeof valor.total === 'string' && /^(0|[1-9]\d*)$/.test(valor.total) && BigInt(valor.total) === total) {
        fim = true
      } else falhar()
    }
    while (true) {
      verificar()
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let posicao
      while ((posicao = buffer.indexOf('\n')) !== -1) {
        frame(buffer.slice(0, posicao)); buffer = buffer.slice(posicao + 1)
      }
      // Limite de um frame do protocolo, não do histórico exportado.
      if (buffer.length > 8 * 1024 * 1024) falhar()
      if (done) break
    }
    verificar()
    if (buffer || !fim) falhar()
    completo = true
    return { blob: new Blob(partes, { type: 'text/csv;charset=utf-8' }), total: String(total) }
  } catch (e) {
    if (e.status === 401 || e.status === 403) throw e
    throw Error('Exportação interrompida ou incompleta. Nenhum arquivo foi gerado.', { cause: e })
  } finally {
    if (reader) {
      if (!completo) await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
}
