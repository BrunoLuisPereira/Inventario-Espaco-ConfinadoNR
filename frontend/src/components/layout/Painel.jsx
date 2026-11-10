import { useTraducao } from '../../hooks/useTraducao.js'
import Sidebar from './Sidebar'
import Header from './Header'
import '../../styles/Dashboard.css'
import '../../styles/Conta.css'
export default function Painel({ titulo, children }) {
  const { tr } = useTraducao()

  return <div className="dashboard-layout"><Sidebar /><div className="dashboard-content"><Header titulo={tr(titulo)} /><main className="conta-conteudo">{children}</main></div></div>
}
