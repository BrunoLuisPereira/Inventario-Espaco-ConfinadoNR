import { useTraducao } from '../hooks/useTraducao.js'
import { demonstracaoAtual } from '../services/api.js'
import { useAuth } from '../hooks/useAuth'
import { modoDemo } from '../services/sessao.js'
import './DemoBanner.css'

export default function DemoBanner() {
  const { aviso, tr } = useTraducao()

  const { logout } = useAuth()
  if (!modoDemo) return null
  return <aside className="demo-banner" aria-label={tr("Modo de demonstração")}>
    <strong>{tr("DEMONSTRAÇÃO — dados sintéticos, sem PostgreSQL")}</strong>
    <span>{tr("Alterações são temporárias e ficam nesta aba. Use Reiniciar para descartá-las. Edição, uploads, downloads e demais gravações do inventário não são simulados.")}</span>
    <button type="button" onClick={() => {
      if (!window.confirm(aviso('Descartar todos os dados de demonstração desta aba?'))) return
      demonstracaoAtual().reiniciar()
      logout()
      window.location.assign('/login')
    }}>{tr("Reiniciar demonstração")}</button>
  </aside>
}
