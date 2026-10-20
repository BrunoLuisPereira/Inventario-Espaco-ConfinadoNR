export function criarHttp({ obterToken, expirar, fetchImpl, demonstracao }) {
  return async function request(endpoint, options = {}, arquivo = false) {
    const token = obterToken()
    try {
      // Em demo nenhuma operação, inclusive arquivos, pode cair na API real.
      if (demonstracao) {
        if (arquivo) throw Object.assign(new Error('Download não disponível na demonstração. Nenhum arquivo real será acessado.'), { status: 501 })
        return await demonstracao(endpoint, options, token)
      }
      const headers = { ...options.headers }
      if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetchImpl(`/api${endpoint}`, { ...options, headers })
      if (response.ok && arquivo) return response.blob()
      let data
      try { data = await response.json() } catch { data = null }
      if (!response.ok) {
        const fallback = { 401: 'Sessão expirada. Entre novamente.', 403: 'Você não tem permissão para esta operação.', 404: 'Recurso não encontrado.' }
        throw Object.assign(new Error(response.status >= 500 ? 'Não foi possível concluir a operação. Tente novamente.'
          : data?.message || data?.mensagem || fallback[response.status] || 'Não foi possível concluir a operação.'), { status: response.status })
      }
      if (!data || typeof data !== 'object') throw Object.assign(new Error('Resposta inválida do servidor.'), { status: 502 })
      return data
    } catch (error) {
      if (error.status === 401 && token && endpoint !== '/auth/login' && obterToken() === token) expirar()
      if (error.status) throw error
      throw new Error('Não foi possível conectar ao servidor. Verifique a conexão e tente novamente.', { cause: error })
    }
  }
}
