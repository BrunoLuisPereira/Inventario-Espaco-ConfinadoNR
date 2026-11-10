import { useCallback, useEffect, useState } from 'react'
import { AuthContext } from './AuthContext.js'
import { buscarMeuPerfil, atualizarNomeAmbiente } from '../services/api.js'
import { sessaoAtual, eventoSessaoExpirada, modoDemo } from '../services/sessao.js'
import { capturarConsultaIdioma } from '../services/preferenciaIdioma.js'

const mesmaSessao = (a, b) => a.token === b.token &&
  String(a.usuario?.id_usuario) === String(b.usuario?.id_usuario) && a.usuario?.id_ambiente === b.usuario?.id_ambiente

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(() => sessaoAtual().ler())
  const [validacao, setValidacao] = useState(null)
  const [erroSessao, setErroSessao] = useState('')
  const [tentativa, setTentativa] = useState(0)
  const { token } = sessao
  const salvarSessao = useCallback(entrada => {
    try { return sessaoAtual().salvar(entrada) }
    catch (error) {
      const preservada = sessaoAtual().ler()
      setSessao(preservada)
      if (preservada.token !== token) setValidacao(null)
      throw error
    }
  }, [token])
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
    const consultaIdioma = capturarConsultaIdioma(modoDemo ? sessionStorage : localStorage,
      sessaoAtual().ler(), modoDemo ? 'nr33-demo:idioma:v1:' : 'nr33:idioma:v1:')
    buscarMeuPerfil().then(resposta => {
      if (!atual || sessaoAtual().ler().token !== token) return
      const dados = salvarSessao({ token, usuario: resposta.data })
      setSessao({ ...dados, consultaIdioma })
      setValidacao(token)
      setErroSessao('')
    }).catch(error => {
      // O evento central já encerrou a sessão e definiu a mensagem pública.
      if (atual && sessaoAtual().ler().token === token && error.status !== 401) setErroSessao(error.message)
    })
    return () => { atual = false }
  }, [token, tentativa, salvarSessao])
  function autenticar(dadosLogin) {
    const dados = salvarSessao(dadosLogin)
    setValidacao(null)
    setErroSessao('')
    setSessao(dados)
  }
  function logout() {
    try { sessaoAtual().limpar() }
    finally {
      setSessao({ token: null, usuario: null })
      setValidacao(null)
      setErroSessao('')
    }
  }
  function atualizarUsuario(dadosAtualizados) {
    const atual = sessaoAtual().ler()
    if (!sessao.usuario || !mesmaSessao(atual, sessao)) return
    const dados = salvarSessao({ token, usuario: { ...atual.usuario, nome: dadosAtualizados.nome, email: dadosAtualizados.email } })
    setSessao(dados)
  }
  function tentarNovamente() {
    setErroSessao('')
    setTentativa(n => n + 1)
  }
  async function salvarNomeAmbiente(nome) {
    const resposta = await atualizarNomeAmbiente(nome)
    const atual = sessaoAtual().ler()
    if (!mesmaSessao(atual, sessao)) return
    if (typeof resposta.data?.nome_ambiente !== 'string' || !resposta.data.nome_ambiente.trim()) {
      throw new Error('Resposta de ambiente inválida.')
    }
    // Só aplica uma resposta confirmada à mesma sessão que iniciou a escrita.
    const dados = salvarSessao({ token, usuario: { ...atual.usuario, nome_ambiente: resposta.data.nome_ambiente } })
    setSessao(anterior => mesmaSessao(anterior, dados) ? { ...dados, consultaIdioma: anterior.consultaIdioma } : anterior)
    setTentativa(n => n + 1)
  }
  return <AuthContext.Provider value={{ usuario: sessao.usuario, token, consultaIdioma: sessao.consultaIdioma,
    autenticado: Boolean(token && validacao === token),
    carregandoSessao: Boolean(token && validacao !== token && !erroSessao),
    erroSessao, tentarNovamente, autenticar, atualizarUsuario, salvarNomeAmbiente, logout }}>{children}</AuthContext.Provider>
}
