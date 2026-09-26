import { NavLink } from 'react-router-dom'
import logoInventario from '../../assets/logo-inventario.png'
import { useAuth } from '../../hooks/useAuth'
import '../../styles/Sidebar.css'

function Sidebar() {
  const { usuario, logout } = useAuth()

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img
          src={logoInventario}
          alt="Inventário de Espaços Confinados"
          className="sidebar-logo"
        />

        <div>
          <strong>Inventário</strong>
          <span>Espaços Confinados</span>
        </div>
      </div>

      <nav
        className="sidebar-nav"
        aria-label="Navegação principal"
      >
        <NavLink to="/dashboard">
          Dashboard
        </NavLink>

        <NavLink to="/campanhas">
          Campanhas
        </NavLink>

        <NavLink to="/locais">
          Locais
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <strong>{usuario?.nome}</strong>
          <span>{usuario?.perfil_acesso}</span>
        </div>

        <button
          type="button"
          className="sidebar-logout"
          onClick={logout}
        >
          Sair
        </button>
      </div>
    </aside>
  )
}

export default Sidebar