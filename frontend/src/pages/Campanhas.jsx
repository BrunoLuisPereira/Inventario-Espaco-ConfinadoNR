import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'
import CampanhaForm from '../components/campanhas/CampanhaForm'
import {
  alterarStatusCampanha,
  listarCampanhas,
} from '../services/api'
import '../styles/Campanhas.css'

function Campanhas() {
  const navigate = useNavigate()

  const [campanhas, setCampanhas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [mostrarFormulario, setMostrarFormulario] =
    useState(false)
  const [campanhaEmEdicao, setCampanhaEmEdicao] =
    useState(null)
  const [statusAtualizando, setStatusAtualizando] =
    useState(null)

  useEffect(() => {
    async function carregarCampanhas() {
      try {
        setCarregando(true)
        setErro('')

        const resposta = await listarCampanhas()

        setCampanhas(resposta.data)
      } catch (error) {
        setErro(error.message)
      } finally {
        setCarregando(false)
      }
    }

    carregarCampanhas()
  }, [])

  function abrirNovaCampanha() {
    setCampanhaEmEdicao(null)
    setMostrarFormulario(true)
  }

  function abrirEdicao(campanha) {
    setCampanhaEmEdicao(campanha)
    setMostrarFormulario(true)
  }

  function cancelarFormulario() {
    setCampanhaEmEdicao(null)
    setMostrarFormulario(false)
  }

  function abrirLocais(campanha) {
    navigate(
      `/campanhas/${campanha.id_campanha}/locais`
    )
  }

  function campanhaSalva(campanhaSalva) {
    if (campanhaEmEdicao) {
      setCampanhas((campanhasAtuais) =>
        campanhasAtuais.map((campanha) =>
          campanha.id_campanha === campanhaSalva.id_campanha
            ? campanhaSalva
            : campanha
        )
      )
    } else {
      setCampanhas((campanhasAtuais) => [
        campanhaSalva,
        ...campanhasAtuais,
      ])
    }

    setCampanhaEmEdicao(null)
    setMostrarFormulario(false)
  }

  async function alterarStatus(campanha, novoStatus) {
    if (novoStatus === campanha.status) {
      return
    }

    try {
      setErro('')
      setStatusAtualizando(campanha.id_campanha)

      const resposta = await alterarStatusCampanha(
        campanha.id_campanha,
        novoStatus
      )

      setCampanhas((campanhasAtuais) =>
        campanhasAtuais.map((item) =>
          item.id_campanha === resposta.data.id_campanha
            ? { ...item, ...resposta.data }
            : item
        )
      )
    } catch (error) {
      setErro(
        `Não foi possível alterar o status: ${error.message}`
      )
    } finally {
      setStatusAtualizando(null)
    }
  }

  return (
    <div className="campanhas-layout">
      <Sidebar />

      <main className="campanhas-content">
        <Header
          titulo="Campanhas"
          subtitulo="Gestão das campanhas de inventário"
        />

        <section className="campanhas-main">
          <div className="campanhas-title">
            <div>
              <h2>Campanhas</h2>

              <p>
                Gerencie as campanhas de inventário de espaços
                confinados.
              </p>
            </div>

            <button
              type="button"
              className="campanha-button-primary"
              onClick={abrirNovaCampanha}
              disabled={mostrarFormulario}
            >
              + Nova campanha
            </button>
          </div>

          {mostrarFormulario && (
            <div className="campanha-form-container">
              <h3>
                {campanhaEmEdicao
                  ? 'Editar campanha'
                  : 'Nova campanha'}
              </h3>

              <CampanhaForm
                key={
                  campanhaEmEdicao?.id_campanha ||
                  'nova-campanha'
                }
                campanha={campanhaEmEdicao}
                onCancelar={cancelarFormulario}
                onCampanhaSalva={campanhaSalva}
              />
            </div>
          )}

          {carregando && (
            <p className="campanhas-message">
              Carregando campanhas...
            </p>
          )}

          {erro && (
            <p className="campanhas-error" role="alert">
              {erro}
            </p>
          )}

          {!carregando && !erro && campanhas.length === 0 && (
            <p className="campanhas-message">
              Nenhuma campanha cadastrada.
            </p>
          )}

          {!carregando && campanhas.length > 0 && (
            <div className="campanhas-table-container">
              <table className="campanhas-table">
                <thead>
                  <tr>
                    <th>Campanha</th>
                    <th>Empresa</th>
                    <th>Responsável</th>
                    <th>Data de início</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {campanhas.map((campanha) => {
                    const atualizando =
                      statusAtualizando ===
                      campanha.id_campanha

                    return (
                      <tr key={campanha.id_campanha}>
                        <td>{campanha.nome_campanha}</td>

                        <td>{campanha.empresa}</td>

                        <td>{campanha.responsavel}</td>

                        <td>
                          {new Date(
                            campanha.data_inicio
                          ).toLocaleDateString('pt-BR')}
                        </td>

                        <td>
                          <span
                            className={`campanhas-status campanhas-status-${campanha.status.toLowerCase()}`}
                          >
                            {campanha.status}
                          </span>
                        </td>

                        <td>
                          <div className="campanha-actions">
                            <button
                              type="button"
                              className="campanha-button-edit"
                              onClick={() =>
                                abrirEdicao(campanha)
                              }
                              disabled={
                                mostrarFormulario ||
                                atualizando
                              }
                            >
                              Editar
                            </button>

                            <select
                              className="campanha-status-select"
                              value={campanha.status}
                              onChange={(event) =>
                                alterarStatus(
                                  campanha,
                                  event.target.value
                                )
                              }
                              disabled={
                                mostrarFormulario ||
                                atualizando
                              }
                              aria-label={`Alterar status da campanha ${campanha.nome_campanha}`}
                            >
                              <option value="ATIVA">
                                ATIVA
                              </option>

                              <option value="CONCLUIDA">
                                CONCLUÍDA
                              </option>

                              <option value="CANCELADA">
                                CANCELADA
                              </option>
                            </select>

                            <button
                              type="button"
                              className="campanha-button-locais"
                              onClick={() =>
                                abrirLocais(campanha)
                              }
                              disabled={
                                mostrarFormulario ||
                                atualizando
                              }
                            >
                              Ver locais →
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default Campanhas