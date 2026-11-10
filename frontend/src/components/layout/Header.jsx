import { useTraducao } from '../../hooks/useTraducao.js'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'
import { useLayout } from '../../contexts/useLayout'
import SeletorIdioma from '../SeletorIdioma.jsx'
import '../../styles/Header.css'

function Header({ titulo, subtitulo }) {
  const { rotulo } = useTraducao()

  const { t } = useTranslation('navigation')
  const { usuario } = useAuth()
  const { abrirMenu, menuAberto } = useLayout()

  return (
    <header className="app-header">
      <div className="header-main">
        <button
          type="button"
          className="header-menu-button"
          onClick={abrirMenu}
          aria-label={t('openMenu')}
          aria-expanded={menuAberto}
          aria-controls="sidebar-principal"
        >
          <span aria-hidden="true">☰</span>
        </button>

        <div className="header-title">
          <h1>{titulo}</h1>
          <p>{subtitulo}</p>
        </div>
      </div>

      <div className="header-user">
        <SeletorIdioma />
        <div className="header-avatar" aria-hidden="true">
          {usuario?.nome?.charAt(0).toUpperCase()}
        </div>

        <div className="header-user-info">
          <strong>{usuario?.nome}</strong>
          <span>{rotulo(usuario?.perfil_acesso)}</span>
        </div>
      </div>
    </header>
  )
}

export default Header
