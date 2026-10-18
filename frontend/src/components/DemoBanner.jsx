import { demonstracaoAtual } from '../services/api.js'
import { useAuth } from '../hooks/useAuth'
import { modoDemo } from '../services/sessao.js'
import './DemoBanner.css'

export default function DemoBanner() {
  const { logout } = useAuth()
  if (!modoDemo) return null
  return <aside className="demo-banner" aria-label="Modo de demonstração">
    <strong>DEMONSTRAÇÃO — dados sintéticos, sem PostgreSQL</strong>
    <span>Alterações são temporárias e ficam nesta aba. Use Reiniciar para descartá-las. Edição, uploads, downloads e demais gravações do inventário não são simulados.</span>
    <button type="button" onClick={() => {
      if (!window.confirm('Descartar todos os dados de demonstração desta aba?')) return
      demonstracaoAtual().reiniciar()
      logout()
      window.location.assign('/login')
    }}>Reiniciar demonstração</button>
  </aside>
}
