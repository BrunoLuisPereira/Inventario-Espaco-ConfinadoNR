import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { aceitarConvite, cadastrarAmbiente } from '../services/api'
import { validarCadastro } from '../services/conta'
import '../styles/Login.css'

export default function Cadastro({ convite = false }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [dados, setDados] = useState(() => ({ nome: '', nome_ambiente: '', email: '', senha: '', confirmacao: '',
    token: convite ? new URLSearchParams(location.hash.slice(1)).get('token') || '' : '' }))
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const mudar = e => setDados(d => ({ ...d, [e.target.name]: e.target.value }))
  async function enviar(e) {
    e.preventDefault()
    if (ocupado) return
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
    <h1>{convite ? 'Aceitar convite' : 'Criar conta'}</h1>
    <p>{convite ? 'Você ingressará exclusivamente no ambiente do convite.' : 'Cadastre sua empresa e seu primeiro administrador.'}</p>
    <form className="login-form" onSubmit={enviar}>
      <label htmlFor="nome">Nome completo</label><input id="nome" name="nome" autoComplete="name" maxLength={120} value={dados.nome} onChange={mudar} required />
      {!convite && <><label htmlFor="nome_ambiente">Empresa / ambiente</label><input id="nome_ambiente" name="nome_ambiente" maxLength={180} value={dados.nome_ambiente} onChange={mudar} required />
        <label htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="email" maxLength={180} value={dados.email} onChange={mudar} required /></>}
      {convite && <><label htmlFor="token">Token do convite</label><input id="token" name="token" type="password" autoComplete="off" value={dados.token} onChange={mudar} required /></>}
      <label htmlFor="senha">Senha</label><input id="senha" name="senha" type="password" autoComplete="new-password" minLength={8} value={dados.senha} onChange={mudar} required />
      <label htmlFor="confirmacao">Confirmar senha</label><input id="confirmacao" name="confirmacao" type="password" autoComplete="new-password" minLength={8} value={dados.confirmacao} onChange={mudar} required />
      {erro && <p role="alert">{erro}</p>}
      <button type="submit" className="login-button" disabled={ocupado}>{ocupado ? 'Enviando...' : convite ? 'Aceitar convite' : 'Cadastrar empresa e administrador'}</button>
      <Link to="/login">Voltar ao login</Link>
    </form>
  </section></main>
}
