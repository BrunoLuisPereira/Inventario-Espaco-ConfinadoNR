import logoInventario from '../assets/logo-inventario.png'
import '../styles/Login.css'

function Login() {
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

        <form className="login-form">
          <div className="form-group">
            <label htmlFor="email">E-mail</label>

            <input
              id="email"
              name="email"
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
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
            />
          </div>

          <div className="login-options">
  <button type="button">
    Criar conta
  </button>

  <button type="button">
    Esqueci minha senha
  </button>
</div>

          <button type="submit" className="login-button">
            Entrar
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