import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'
import '../styles/Dashboard.css'

function Dashboard() {
  return (
    <div className="dashboard-layout">
      <Sidebar />

      <main className="dashboard-content">
        <Header />

        <section className="dashboard-main">
          <h2>Visão geral</h2>

          <p>
            Acompanhe as informações do inventário de espaços
            confinados.
          </p>
        </section>
      </main>
    </div>
  )
}

export default Dashboard