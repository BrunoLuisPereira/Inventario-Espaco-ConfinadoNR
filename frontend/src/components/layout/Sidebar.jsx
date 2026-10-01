import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import logoInventario from '../../assets/logo-inventario.png'
import { useAuth } from '../../hooks/useAuth'
import { useLayout } from '../../contexts/useLayout'
import '../../styles/Sidebar.css'

function Sidebar() {
  const { usuario, logout } = useAuth()
  const { menuAberto, fecharMenu } = useLayout()
  const location = useLocation()

  useEffect(() => {
    fecharMenu()
  }, [location.pathname, fecharMenu])

  useEffect(() => {
    if (!menuAberto) {
      return undefined
    }

    const fecharComEscape = (event) => {
      if (event.key === 'Escape') {
        fecharMenu()
      }
    }

    document.addEventListener('keydown', fecharComEscape)

    return () => {
      document.removeEventListener('keydown', fecharComEscape)
    }
  }, [menuAberto, fecharMenu])

  useEffect(() => {
    if (!menuAberto) {
      return undefined
    }

    const larguraMobile = window.matchMedia('(max-width: 1024px)')

    if (larguraMobile.matches) {
      document.body.classList.add('menu-mobile-aberto')
    }

    return () => {
      document.body.classList.remove('menu-mobile-aberto')
    }
  }, [menuAberto])

  const handleLogout = () => {
    fecharMenu()
    logout()
  }

  return (
    <>
      <button
        type="button"
        className={`sidebar-overlay ${
          menuAberto ? 'sidebar-overlay-visible' : ''
        }`}
        onClick={fecharMenu}
        aria-label="Fechar menu"
        tabIndex={menuAberto ? 0 : -1}
      />

      <aside
        className={`sidebar ${
          menuAberto ? 'sidebar-open' : ''
        }`}
        aria-label="Menu principal"
      >
        <div className="sidebar-header">
          <img
            src={logoInventario}
            alt="Inventário de Espaços Confinados"
            className="sidebar-logo"
          />

          <div className="sidebar-brand">
            <strong>Inventário</strong>
            <span>Espaços Confinados</span>
          </div>

          <button
            type="button"
            className="sidebar-close"
            onClick={fecharMenu}
            aria-label="Fechar menu"
          >
            ×
          </button>
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
            onClick={handleLogout}
          >
            Sair
          </button>
        </div>
      </aside>
    </>
  )
}

export default Sidebar