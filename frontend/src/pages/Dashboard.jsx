import { useTraducao } from '../hooks/useTraducao.js'
import { useEffect, useMemo, useState } from 'react'
import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'
import { listarCampanhas, listarLocais } from '../services/api'
import { indicadoresCampanhas } from '../services/dashboardIndicadores'
import '../styles/Dashboard.css'

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

const DIAS_SEMANA = [
  'Seg',
  'Ter',
  'Qua',
  'Qui',
  'Sex',
  'Sáb',
  'Dom',
]

function criarDataInicioMes(data) {
  return new Date(
    data.getFullYear(),
    data.getMonth(),
    1
  )
}

function mesmaData(dataA, dataB) {
  return (
    dataA.getFullYear() === dataB.getFullYear() &&
    dataA.getMonth() === dataB.getMonth() &&
    dataA.getDate() === dataB.getDate()
  )
}

function gerarDiasCalendario(dataReferencia) {
  const ano = dataReferencia.getFullYear()
  const mes = dataReferencia.getMonth()

  const primeiroDiaMes = new Date(ano, mes, 1)

  const ultimoDiaMes = new Date(
    ano,
    mes + 1,
    0
  )

  // JavaScript:
  // domingo = 0
  // segunda = 1
  //
  // Nosso calendário:
  // segunda = 0
  // ...
  // domingo = 6
  const deslocamentoInicio =
    (primeiroDiaMes.getDay() + 6) % 7

  const totalDiasMes = ultimoDiaMes.getDate()

  const dias = []

  for (let i = deslocamentoInicio - 1; i >= 0; i -= 1) {
    const data = new Date(
      ano,
      mes,
      -i
    )

    dias.push({
      data,
      mesAtual: false,
    })
  }

  for (let dia = 1; dia <= totalDiasMes; dia += 1) {
    dias.push({
      data: new Date(
        ano,
        mes,
        dia
      ),
      mesAtual: true,
    })
  }

  let proximoDia = 1

  while (dias.length % 7 !== 0) {
    dias.push({
      data: new Date(
        ano,
        mes + 1,
        proximoDia
      ),
      mesAtual: false,
    })

    proximoDia += 1
  }

  return dias
}

function Dashboard() {
  const { aviso, numero, tr } = useTraducao()

  const hoje = useMemo(() => new Date(), [])

  const [indicadores, setIndicadores] = useState({
    totalCampanhas: 0,
    campanhasEmAndamento: 0,
    campanhasConcluidas: 0,
    campanhasCanceladas: 0,
    totalLocais: 0,
    locaisAtivos: 0,
    locaisInativos: 0,
  })

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [mesCalendario, setMesCalendario] = useState(
    criarDataInicioMes(hoje)
  )

  useEffect(() => {
    async function carregarDashboard() {
      try {
        setCarregando(true)
        setErro('')

        const [campanhas, locais] = await Promise.all([
          listarCampanhas(),
          listarLocais(),
        ])

        const contagemCampanhas = indicadoresCampanhas(campanhas.data)

        const locaisAtivos = locais.data.filter(
          (local) => local.status === 'ATIVO'
        ).length

        const locaisInativos = locais.data.filter(
          (local) => local.status === 'INATIVO'
        ).length

        setIndicadores({
          ...contagemCampanhas,
          totalCampanhas: campanhas.total ?? contagemCampanhas.totalCampanhas,
          totalLocais: locais.total,
          locaisAtivos,
          locaisInativos,
        })
      } catch (error) {
        setErro(error.message)
      } finally {
        setCarregando(false)
      }
    }

    carregarDashboard()
  }, [])

  const diasCalendario = useMemo(
    () => gerarDiasCalendario(mesCalendario),
    [mesCalendario]
  )

  function irParaMesAnterior() {
    setMesCalendario(
      (dataAtual) =>
        new Date(
          dataAtual.getFullYear(),
          dataAtual.getMonth() - 1,
          1
        )
    )
  }

  function irParaProximoMes() {
    setMesCalendario(
      (dataAtual) =>
        new Date(
          dataAtual.getFullYear(),
          dataAtual.getMonth() + 1,
          1
        )
    )
  }

  function irParaHoje() {
    setMesCalendario(
      criarDataInicioMes(new Date())
    )
  }

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <main className="dashboard-content">
        <Header
          titulo={tr("Dashboard")}
          subtitulo={tr("Visão geral do inventário de espaços confinados")}
        />

        <section className="dashboard-main">
          <h2>{tr("Visão geral")}</h2>

          <p>{tr("Acompanhe as informações do inventário de espaços confinados.")}</p>

          {carregando && (
            <p className="dashboard-message">{tr("Carregando informações...")}</p>
          )}

          {erro && (
            <p
              className="dashboard-error"
              role="alert"
            >{tr("Não foi possível carregar o Dashboard:") + ' '}{aviso(erro)}
            </p>
          )}

          {!carregando && !erro && (
            <>
              <div className="dashboard-cards">
                <article className="dashboard-card">
                  <span className="dashboard-card-label">{tr("Campanhas")}</span>

                  <strong className="dashboard-card-value">
                    {numero(indicadores.totalCampanhas)}
                  </strong>

                  <span className="dashboard-card-description">{tr("Campanhas cadastradas")}</span>

                  <div className="dashboard-card-status dashboard-card-status-campanhas">
                    <span>{tr("Em andamento")}<strong>
                        {numero(indicadores.campanhasEmAndamento)}
                      </strong>
                    </span>

                    <span>{tr("Concluídas")}<strong>
                        {numero(indicadores.campanhasConcluidas)}
                      </strong>
                    </span>
                    <span>{tr("Canceladas")}<strong>
                        {numero(indicadores.campanhasCanceladas)}
                      </strong>
                    </span>
                  </div>
                </article>

                <article className="dashboard-card">
                  <span className="dashboard-card-label">{tr("Espaços confinados")}</span>

                  <strong className="dashboard-card-value">
                    {numero(indicadores.totalLocais)}
                  </strong>

                  <span className="dashboard-card-description">{tr("Locais cadastrados")}</span>

                  <div className="dashboard-card-status">
                    <span>{tr("Ativos")}<strong>
                        {numero(indicadores.locaisAtivos)}
                      </strong>
                    </span>

                    <span>{tr("Inativos")}<strong>
                        {numero(indicadores.locaisInativos)}
                      </strong>
                    </span>
                  </div>
                </article>
              </div>

              <section className="dashboard-calendar">
                <div className="dashboard-calendar-header">
                  <div>
                    <span className="dashboard-calendar-label">{tr("Calendário")}</span>

                    <h3>
                      {tr(MESES[mesCalendario.getMonth()])}{' '}
                      {mesCalendario.getFullYear()}
                    </h3>
                  </div>

                  <div className="dashboard-calendar-actions">
                    <button
                      type="button"
                      className="dashboard-calendar-today"
                      onClick={irParaHoje}
                    >{tr("Hoje")}</button>

                    <button
                      type="button"
                      className="dashboard-calendar-navigation"
                      onClick={irParaMesAnterior}
                      aria-label={tr("Mês anterior")}
                    >
                      ‹
                    </button>

                    <button
                      type="button"
                      className="dashboard-calendar-navigation"
                      onClick={irParaProximoMes}
                      aria-label={tr("Próximo mês")}
                    >
                      ›
                    </button>
                  </div>
                </div>

                <div className="dashboard-calendar-weekdays">
                  {DIAS_SEMANA.map((dia) => (
                    <span key={tr(dia)}>
                      {dia}
                    </span>
                  ))}
                </div>

                <div className="dashboard-calendar-grid">
                  {diasCalendario.map(
                    ({ data, mesAtual }) => {
                      const diaAtual = mesmaData(
                        data,
                        hoje
                      )

                      const chave = [
                        data.getFullYear(),
                        data.getMonth(),
                        data.getDate(),
                      ].join('-')

                      return (
                        <div
                          key={chave}
                          className={[
                            'dashboard-calendar-day',
                            !mesAtual
                              ? 'dashboard-calendar-day-outside'
                              : '',
                            diaAtual
                              ? 'dashboard-calendar-day-today'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <span>
                            {data.getDate()}
                          </span>

                          {diaAtual && (
                            <small>{tr("Hoje")}</small>
                          )}
                        </div>
                      )
                    }
                  )}
                </div>
              </section>
            </>
          )}
        </section>
      </main>
    </div>
  )
}

export default Dashboard
