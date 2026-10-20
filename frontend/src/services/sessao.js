export const modoDemo = import.meta.env?.MODE === 'demo'
export const eventoSessaoExpirada = 'nr33:sessao-expirada'

export function criarSessao(storage, prefixo = '') {
  const chave = nome => `${prefixo}${nome}`
  return {
    ler() {
      try {
        const token = storage.getItem(chave('token'))
        const usuario = JSON.parse(storage.getItem(chave('usuario')) || 'null')
        return typeof token === 'string' && token && usuario && typeof usuario === 'object' && !Array.isArray(usuario)
          ? { token, usuario } : { token: null, usuario: null }
      } catch { return { token: null, usuario: null } }
    },
    salvar({ token, usuario }) {
      if (typeof token !== 'string' || !token || !usuario || typeof usuario !== 'object' || Array.isArray(usuario)) throw new Error('Resposta de login inválida.')
      storage.setItem(chave('usuario'), JSON.stringify(usuario))
      storage.setItem(chave('token'), token)
    },
    limpar() {
      storage.removeItem(chave('token'))
      storage.removeItem(chave('usuario'))
    },
  }
}
export function sessaoAtual() {
  return criarSessao(modoDemo ? sessionStorage : localStorage, modoDemo ? 'nr33-demo:' : '')
}
