import { useState } from 'react'
import logoInventario from '../assets/logo-inventario.png'
import { login } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import '../styles/Login.css'
import { useNavigate } from 'react-router-dom'
import { modoDemo } from '../services/sessao.js'
import { contasDemo, senhaDemo } from '../services/demoApi.js'

function Login() {
  const { autenticar, erroSessao } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

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

            <input
              id="senha"
              name="senha"
              type="password"
              placeholder="Digite sua senha"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
            />
          </div>

          {erro && (
            <p className="login-error">
              {erro}
            </p>
          )}

          <div className="login-options">
            <button type="button" disabled title="Cadastro inicial depende do laboratório PostgreSQL autorizado.">
              Criar conta
            </button>

            <button type="button" disabled title="Recuperação de senha ainda não disponível.">
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
    </main>
  )
}

export default Login
