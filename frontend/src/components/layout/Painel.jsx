import Sidebar from './Sidebar'
import Header from './Header'
import '../../styles/Dashboard.css'
import '../../styles/Conta.css'
export default function Painel({ titulo, children }) {
  return <div className="dashboard-layout"><Sidebar /><div className="dashboard-content"><Header titulo={titulo} /><main className="conta-conteudo">{children}</main></div></div>
}
