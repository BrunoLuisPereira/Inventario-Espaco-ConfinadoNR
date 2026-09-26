import { useAuth } from '../../hooks/useAuth'
import '../../styles/Header.css'

function Header() {
  const { usuario } = useAuth()

  return (
    <header className="app-header">
      <div>
        <h1>Dashboard</h1>
        <p>Visão geral do inventário de espaços confinados</p>
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