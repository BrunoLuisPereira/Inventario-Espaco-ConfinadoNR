import { useEffect, useState } from 'react'
import { AuthContext } from './AuthContext.js'
import { buscarMeuPerfil } from '../services/api.js'
import { sessaoAtual, eventoSessaoExpirada } from '../services/sessao.js'

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(() => sessaoAtual().ler())
  const [validacao, setValidacao] = useState(null)
  const [erroSessao, setErroSessao] = useState('')
  const [tentativa, setTentativa] = useState(0)
  const { token } = sessao
  useEffect(() => {
    if (!token) return
    const revalidar = () => { if (document.visibilityState !== 'hidden') setTentativa(n => n + 1) }
    window.addEventListener('focus', revalidar)
    window.addEventListener('nr33-permissoes-revalidar', revalidar)
    document.addEventListener('visibilitychange', revalidar)
    return () => {
      window.removeEventListener('focus', revalidar)
      window.removeEventListener('nr33-permissoes-revalidar', revalidar)
      document.removeEventListener('visibilitychange', revalidar)
    }
  }, [token])
  useEffect(() => {
    function expirada() {
      setSessao({ token: null, usuario: null })
      setValidacao(null)
      setErroSessao('Sessão expirada. Entre novamente.')
    }
    window.addEventListener(eventoSessaoExpirada, expirada)
    return () => window.removeEventListener(eventoSessaoExpirada, expirada)
  }, [])
  useEffect(() => {
    if (!token) return
    let atual = true
    buscarMeuPerfil().then(resposta => {
      if (!atual) return
      if (!resposta.data?.id_usuario) throw new Error('Resposta de sessão inválida.')
      const dados = { token, usuario: resposta.data }
      sessaoAtual().salvar(dados)
      setSessao(dados)
      setValidacao(token)
      setErroSessao('')
    }).catch(error => {
      // O evento central já encerrou a sessão e definiu a mensagem pública.
      if (atual && error.status !== 401) setErroSessao(error.message)
    })
    return () => { atual = false }
  }, [token, tentativa])
  function autenticar(dadosLogin) {
    sessaoAtual().salvar(dadosLogin)
    setValidacao(null)
    setErroSessao('')
    setSessao({ token: dadosLogin.token, usuario: dadosLogin.usuario })
  }
  function logout() {
    sessaoAtual().limpar()
    setSessao({ token: null, usuario: null })
    setValidacao(null)
    setErroSessao('')
  }
  function atualizarUsuario(dadosAtualizados) {
    if (!sessao.usuario) return
    const dados = { token, usuario: { ...sessao.usuario, nome: dadosAtualizados.nome, email: dadosAtualizados.email } }
    sessaoAtual().salvar(dados)
    setSessao(dados)
  }
  function tentarNovamente() {
    setErroSessao('')
    setTentativa(n => n + 1)
  }
  return <AuthContext.Provider value={{ usuario: sessao.usuario, token,
    autenticado: Boolean(token && validacao === token),
    carregandoSessao: Boolean(token && validacao !== token && !erroSessao),
    erroSessao, tentarNovamente, autenticar, atualizarUsuario, logout }}>{children}</AuthContext.Provider>
}
