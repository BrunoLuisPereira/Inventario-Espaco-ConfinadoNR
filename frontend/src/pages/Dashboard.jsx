import { useEffect, useState } from 'react'
import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'
import { listarCampanhas, listarLocais } from '../services/api'
import '../styles/Dashboard.css'

function Dashboard() {
  const [indicadores, setIndicadores] = useState({
    totalCampanhas: 0,
    campanhasEmAndamento: 0,
    campanhasConcluidas: 0,
    totalLocais: 0,
    locaisAtivos: 0,
    locaisConcluidos: 0,
  })

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    async function carregarDashboard() {
      try {
        setCarregando(true)
        setErro('')

        const [campanhas, locais] = await Promise.all([
          listarCampanhas(),
          listarLocais(),
        ])

        const campanhasEmAndamento = campanhas.data.filter(
          (campanha) => campanha.status === 'EM ANDAMENTO'
        ).length

        const campanhasConcluidas = campanhas.data.filter(
          (campanha) => campanha.status === 'CONCLUIDO'
        ).length

        const locaisAtivos = locais.data.filter(
          (local) => local.status === 'EM ANDAMENTO'
        ).length

        const locaisConcluidos = locais.data.filter(
          (local) => local.status === 'CONCLUIDO'
        ).length

        setIndicadores({
          totalCampanhas: campanhas.total,
          campanhasEmAndamento,
          campanhasConcluidas,
          totalLocais: locais.total,
          locaisAtivos,
          locaisConcluidos,
        })
      } catch (error) {
        setErro(error.message)
      } finally {
        setCarregando(false)
      }
    }

    carregarDashboard()
  }, [])

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <main className="dashboard-content">
        <Header
          titulo="Dashboard"
          subtitulo="Visão geral do inventário de espaços confinados"
        />

        <section className="dashboard-main">
          <h2>Visão geral</h2>

          <p>
            Acompanhe as informações do inventário de espaços
            confinados.
          </p>

          {carregando && (
            <p className="dashboard-message">
              Carregando informações...
            </p>
          )}

          {erro && (
            <p className="dashboard-error" role="alert">
              Não foi possível carregar o Dashboard: {erro}
            </p>
          )}

          {!carregando && !erro && (
            <div className="dashboard-cards">
              <article className="dashboard-card">
                <span className="dashboard-card-label">
                  Campanhas
                </span>

                <strong className="dashboard-card-value">
                  {indicadores.totalCampanhas}
                </strong>

                <span className="dashboard-card-description">
                  Campanhas cadastradas
                </span>

                <div className="dashboard-card-status">
                  <span>
                    Em andamento
                    <strong>
                      {indicadores.campanhasEmAndamento}
                    </strong>
                  </span>

                  <span>
                    Concluídas
                    <strong>
                      {indicadores.campanhasConcluidas}
                    </strong>
                  </span>
                </div>
              </article>

              <article className="dashboard-card">
                <span className="dashboard-card-label">
                  Espaços confinados
                </span>

                <strong className="dashboard-card-value">
                  {indicadores.totalLocais}
                </strong>

                <span className="dashboard-card-description">
                  Locais cadastrados
                </span>

                <div className="dashboard-card-status">
                  <span>
                    Ativos
                    <strong>
                      {indicadores.locaisAtivos}
                    </strong>
                  </span>

                  <span>
                    Concluídos
                    <strong>
                      {indicadores.locaisConcluidos}
                    </strong>
                  </span>
                </div>
              </article>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default Dashboard