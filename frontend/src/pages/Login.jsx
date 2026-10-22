import { useState } from 'react'
import logoInventario from '../assets/logo-inventario.png'
import { login } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import '../styles/Login.css'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { modoDemo } from '../services/sessao.js'
import { contasDemo, senhaDemo } from '../services/demoApi.js'
import RecuperarSenha from '../components/RecuperarSenha.jsx'

function Login() {
  const { autenticar, erroSessao } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [senhaVisivel, setSenhaVisivel] = useState(false)
  const [recuperacaoAberta, setRecuperacaoAberta] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()

    setErro('')

    if (!email || !senha) {
      setErro('Informe o e-mail e a senha.')
      return
    }

    try {
      setCarregando(true)

      const resposta = await login(email, senha)

      autenticar(resposta.data)

      navigate('/dashboard', { replace: true })

      
    } catch (error) {
      setErro(error.message)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-header">
          <img
            src={logoInventario}
            alt="Inventário de Espaços Confinados"
            className="login-logo"
          />

          <p>
            Acesse o sistema para gerenciar campanhas,
            locais, inspeções e evidências.
          </p>
        </div>

        {modoDemo && <section className="demo-contas" aria-label="Contas fictícias">
          <strong>Contas fictícias para teste</strong>
          <p>Senha: {senhaDemo}</p>
          {contasDemo.map(conta => <button type="button" key={conta} onClick={() => { setEmail(conta); setSenha(senhaDemo); setErro('') }}>{conta}</button>)}
        </section>}
        {erroSessao && <p role="alert">{erroSessao}</p>}
        {location.state?.mensagem && <p role="status">{location.state.mensagem}</p>}
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">E-mail</label>

            <input
              id="email"
              name="email"
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="senha">Senha</label>

            <div className="login-senha">
            <input
              id="senha"
              name="senha"
              type={senhaVisivel ? 'text' : 'password'}
              placeholder="Digite sua senha"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
            />
            <button type="button" className="login-olho" aria-label={senhaVisivel ? 'Ocultar senha' : 'Mostrar senha'} aria-controls="senha" aria-pressed={senhaVisivel} onClick={() => setSenhaVisivel(v => !v)}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {senhaVisivel && <path d="m3 3 18 18" />}
              </svg>
            </button>
            </div>
          </div>

          {erro && (
            <p className="login-error" role="alert">
              {erro}
            </p>
          )}

          <div className="login-options">
            <Link to="/cadastro">Criar conta</Link>
            <Link to="/convites/aceitar">Tenho um convite</Link>

            <button type="button" aria-haspopup="dialog" onClick={() => setRecuperacaoAberta(true)}>
              Esqueci minha senha
            </button>
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={carregando}
          >
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="login-footer">
          Sistema de Gestão de Espaços Confinados
        </p>
      </section>
      {recuperacaoAberta && <RecuperarSenha onClose={() => setRecuperacaoAberta(false)} />}
    </main>
  )
}

export default Login
