import SeletorIdiomaPublico from '../components/SeletorIdiomaPublico.jsx'
import { useTraducao } from '../hooks/useTraducao.js'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { aceitarConvite, cadastrarAmbiente, preValidarConvite } from '../services/api'
import { validarCadastro, tokenConviteDoFragmento } from '../services/conta'
import '../styles/Login.css'

export default function Cadastro({ convite = false }) {
  const { aviso, tr } = useTraducao()

  const location = useLocation()
  const navigate = useNavigate()
  const [dados, setDados] = useState(() => ({ nome: '', nome_ambiente: '', email: '', senha: '', confirmacao: '',
    token: convite ? tokenConviteDoFragmento(location.hash) : '' }))
  const [validacao, setValidacao] = useState(convite ? (dados.token ? 'validando' : 'invalido') : 'valido')
  const [erroConvite, setErroConvite] = useState(convite && !dados.token
    ? 'Link de convite inválido ou incompleto. Solicite um novo convite.' : '')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    if (!convite) return
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    let ativo = true
    if (!dados.token) return
    preValidarConvite(dados.token).then(resultado => {
      if (resultado.data?.valido !== true) throw new Error('Não foi possível validar o convite. Tente novamente.')
      if (ativo) setValidacao('valido')
    }).catch(error => {
      if (ativo) { setErroConvite(error.message); setValidacao('invalido') }
    })
    return () => { ativo = false }
  }, [convite, dados.token])
  const mudar = e => setDados(d => ({ ...d, [e.target.name]: e.target.value }))
  async function enviar(e) {
    e.preventDefault()
    if (ocupado || validacao !== 'valido') return
    const falha = validarCadastro(dados, convite)
    setErro(falha)
    if (falha) return
    setOcupado(true)
    try {
      if (convite) await aceitarConvite(dados)
      else await cadastrarAmbiente(dados)
      navigate('/login', { replace: true, state: { mensagem: convite ? 'Convite aceito. Entre com o e-mail do convite.' : 'Conta criada. Entre com seu e-mail e senha.' } })
    } catch (error) { setErro(error.message) } finally { setOcupado(false) }
  }
  return <main className="login-page"><section className="login-card">
        <SeletorIdiomaPublico />
    <h1>{convite ? tr('Aceitar convite') : tr('Criar conta')}</h1>
    <p>{convite ? tr('Você ingressará exclusivamente no ambiente do convite.') : tr('Cadastre sua empresa e seu primeiro administrador.')}</p>
    {convite && validacao === 'validando' && <p role="status">{tr("Validando convite...")}</p>}
    {convite && validacao === 'invalido' && <><p role="alert">{aviso(erroConvite)}</p><Link to="/login">{tr("Voltar ao login")}</Link></>}
    {validacao === 'valido' && <form className="login-form" onSubmit={enviar}>
      <label htmlFor="nome">{tr("Nome completo")}</label><input id="nome" name="nome" autoComplete="name" maxLength={120} value={dados.nome} onChange={mudar} required />
      {!convite && <><label htmlFor="nome_ambiente">{tr("Empresa / ambiente")}</label><input id="nome_ambiente" name="nome_ambiente" maxLength={180} value={dados.nome_ambiente} onChange={mudar} required />
        <label htmlFor="email">{tr("E-mail")}</label><input id="email" name="email" type="email" autoComplete="email" maxLength={180} value={dados.email} onChange={mudar} required /></>}
      <label htmlFor="senha">{tr("Senha")}</label><input id="senha" name="senha" type="password" autoComplete="new-password" minLength={8} value={dados.senha} onChange={mudar} required />
      <label htmlFor="confirmacao">{tr("Confirmar senha")}</label><input id="confirmacao" name="confirmacao" type="password" autoComplete="new-password" minLength={8} value={dados.confirmacao} onChange={mudar} required />
      {erro && <p role="alert">{aviso(erro)}</p>}
      <button type="submit" className="login-button" disabled={ocupado}>{ocupado ? tr('Enviando...') : convite ? tr('Aceitar convite') : tr('Cadastrar empresa e administrador')}</button>
      <Link to="/login">{tr("Voltar ao login")}</Link>
    </form>}
  </section></main>
}
