import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { redefinirSenha } from '../services/api'
import { tokenDoFragmento, validarNovaSenha } from '../services/recuperacaoSenha'
import { useAuth } from '../hooks/useAuth'
import '../styles/Login.css'

export default function RedefinirSenha() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [token] = useState(() => tokenDoFragmento(window.location.hash))
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const enviando = useRef(false)
  useEffect(() => {
    // Token fica apenas em memória; não persiste em storage ou histórico.
    window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [])
  async function enviar(event) {
    event.preventDefault()
    if (enviando.current) return
    const falha = validarNovaSenha(senha, confirmacao)
    setErro(falha)
    if (falha) return
    enviando.current = true
    setOcupado(true)
    try {
      await redefinirSenha({ token, novaSenha: senha, confirmarSenha: confirmacao })
      logout()
      navigate('/login', { replace: true, state: { mensagem: 'Senha redefinida com sucesso. Entre com sua nova senha.' } })
    } catch (error) { setErro(error.message) }
    finally { enviando.current = false; setOcupado(false) }
  }
  return <main className="login-page"><section className="login-card">
    <h1>Redefinir senha</h1>
    {!token ? <p role="alert">Link inválido ou incompleto. Solicite uma nova recuperação na tela de login.</p> : <>
      <p>Informe sua nova senha. O link vale por 30 minutos e pode ser usado uma única vez.</p>
      <form className="login-form" onSubmit={enviar}>
        <label htmlFor="nova-senha">Nova senha</label>
        <input id="nova-senha" type="password" autoComplete="new-password" minLength={8} required value={senha} onChange={e => setSenha(e.target.value)} disabled={ocupado} />
        <label htmlFor="confirmar-senha">Confirmar nova senha</label>
        <input id="confirmar-senha" type="password" autoComplete="new-password" minLength={8} required value={confirmacao} onChange={e => setConfirmacao(e.target.value)} disabled={ocupado} />
        {erro && <p className="login-error" role="alert">{erro}</p>}
        <button type="submit" className="login-button" disabled={ocupado}>{ocupado ? 'Redefinindo...' : 'Redefinir senha'}</button>
      </form>
    </>}
    <Link to="/login">Voltar ao login</Link>
  </section></main>
}
