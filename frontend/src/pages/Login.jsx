import { useState } from 'react'
import logoInventario from '../assets/logo-inventario.png'
import { login } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import '../styles/Login.css'
import { useNavigate } from 'react-router-dom'

function Login() {
  const { autenticar } = useAuth()
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

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">E-mail</label>

            <input
              id="email"
              name="email"
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
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
            <button type="button">
              Criar conta
            </button>

            <button type="button">
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