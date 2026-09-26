import { useAuth } from '../../hooks/useAuth'
import '../../styles/Header.css'

function Header({ titulo, subtitulo }) {
  const { usuario } = useAuth()

  return (
    <header className="app-header">
      <div>
        <h1>{titulo}</h1>
        <p>{subtitulo}</p>
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