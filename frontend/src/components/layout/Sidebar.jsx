import { useTraducao } from '../../hooks/useTraducao.js'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import logoInventario from '../../assets/logo-inventario.png'
import { useAuth } from '../../hooks/useAuth'
import { useAmbienteAtual } from '../../hooks/useAmbienteAtual'
import { useLayout } from '../../contexts/useLayout'
import { exportarLocaisExcel } from '../../services/api'
import { podeAdministrar } from '../../services/conta'
import { pode } from '../../services/permissoes'
import '../../styles/Sidebar.css'

function Sidebar() {
  const { aviso, rotulo } = useTraducao()

  const { t } = useTranslation('navigation')
  const { usuario, logout } = useAuth()
  const ambiente = useAmbienteAtual()
  const { menuAberto, fecharMenu } = useLayout()
  const location = useLocation()

  const [exportando, setExportando] = useState(false)

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
      document.removeEventListener(
        'keydown',
        fecharComEscape
      )
    }
  }, [menuAberto, fecharMenu])

  useEffect(() => {
    if (!menuAberto) {
      return undefined
    }

    const larguraMobile = window.matchMedia(
      '(max-width: 1024px)'
    )

    if (larguraMobile.matches) {
      document.body.classList.add(
        'menu-mobile-aberto'
      )
    }

    return () => {
      document.body.classList.remove(
        'menu-mobile-aberto'
      )
    }
  }, [menuAberto])

  const handleLogout = () => {
    fecharMenu()
    logout()
  }

  const handleExportarLocais = async () => {
    if (exportando) {
      return
    }

    try {
      setExportando(true)

      const arquivo = await exportarLocaisExcel()

      const url = window.URL.createObjectURL(arquivo)

      const link = document.createElement('a')

      link.href = url
      link.download = 'inventario-locais.xlsx'

      document.body.appendChild(link)

      link.click()
      link.remove()

      window.URL.revokeObjectURL(url)

      fecharMenu()
    } catch (error) {
      console.error(
        'Erro ao exportar locais:',
        error
      )

      window.alert(
        aviso(error.message ||
          'Não foi possível exportar os locais.')
      )
    } finally {
      setExportando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={`sidebar-overlay ${
          menuAberto
            ? 'sidebar-overlay-visible'
            : ''
        }`}
        onClick={fecharMenu}
        aria-label={t('closeMenu')}
        tabIndex={menuAberto ? 0 : -1}
      />

      <aside
        id="sidebar-principal"
        className={`sidebar ${
          menuAberto ? 'sidebar-open' : ''
        }`}
        aria-label={t('mainMenu')}
      >
        <div className="sidebar-header">
          <img
            src={logoInventario}
            alt={t('brandAlt')}
            className="sidebar-logo"
          />

          <div className="sidebar-brand">
            <strong>{t('brandTitle')}</strong>
            <span>{t('brandSubtitle')}</span>
          </div>

          <button
            type="button"
            className="sidebar-close"
            onClick={fecharMenu}
            aria-label={t('closeMenu')}
          >
            ×
          </button>
        </div>

        <div className="sidebar-ambiente">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 21V3h12v18M16 9h4v12M2 21h20M8 7h4M8 11h4M8 15h4M8 21v-3h4v3" />
          </svg>
          <div className="sidebar-ambiente-texto">
            <span>{t('currentEnvironment')}</span>
            <strong title={ambiente.nome || undefined}>{ambiente.mensagem}</strong>
          </div>
        </div>

        <nav
          className="sidebar-nav"
          aria-label={t('mainNavigation')}
        >
          <NavLink to="/dashboard">
            {t('dashboard')}
          </NavLink>

          <NavLink to="/campanhas">
            {t('campaigns')}
          </NavLink>

          <NavLink to="/locais">
            {t('locations')}
          </NavLink>
          {pode(usuario, 'locais.exportar') && <button
            type="button"
            className="sidebar-nav-action"
            onClick={handleExportarLocais}
            disabled={exportando}
          >
            {exportando
              ? t('exporting')
              : t('exportLocations')}
          </button>}

          <hr className="sidebar-divider" />

          {podeAdministrar(usuario) && <>
            <NavLink to="/usuarios">{t('users')}</NavLink>
            <NavLink to="/convites">{t('invite')}</NavLink>
          </>}
          <NavLink to="/configuracoes" className="sidebar-settings-link">
            ⚙ {t('settings')}
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <strong>{usuario?.nome}</strong>
            <span>{rotulo(usuario?.perfil_acesso)}</span>
          </div>

          <button
            type="button"
            className="sidebar-logout"
            onClick={handleLogout}
          >
            {t('logout')}
          </button>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
