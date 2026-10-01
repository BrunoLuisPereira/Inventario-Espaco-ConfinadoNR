import { useAuth } from '../../hooks/useAuth'
import { useLayout } from '../../contexts/useLayout'
import '../../styles/Header.css'

function Header({ titulo, subtitulo }) {
  const { usuario } = useAuth()
  const { abrirMenu } = useLayout()

  return (
    <header className="app-header">
      <div className="header-main">
        <button
          type="button"
          className="header-menu-button"
          onClick={abrirMenu}
          aria-label="Abrir menu principal"
        >
          <span aria-hidden="true">☰</span>
        </button>

        <div className="header-title">
          <h1>{titulo}</h1>
          <p>{subtitulo}</p>
        </div>
      </div>

      <div className="header-user">
        <div className="header-avatar" aria-hidden="true">
          {usuario?.nome?.charAt(0).toUpperCase()}
        </div>

        <div className="header-user-info">
          <strong>{usuario?.nome}</strong>
          <span>{usuario?.perfil_acesso}</span>
        </div>
      </div>
    </header>
  )
}

export default Header