import { useCapacidade } from '../hooks/useCapacidade'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'
import CampanhaForm from '../components/campanhas/CampanhaForm'
import {
  listarCampanhas,
} from '../services/api'
import '../styles/Campanhas.css'

function Campanhas() {
  const podeEditar = useCapacidade('campanhas.editar')
  const navigate = useNavigate()

  const [campanhas, setCampanhas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [mostrarFormulario, setMostrarFormulario] =
    useState(false)
  const [campanhaEmEdicao, setCampanhaEmEdicao] =
    useState(null)
  const [mensagem, setMensagem] = useState('')

  // Filtros
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [dataInicial, setDataInicial] = useState('')
  const [dataFinal, setDataFinal] = useState('')

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
    if (!podeEditar) return
    setMensagem('')
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
    setMensagem('Campanha salva com sucesso.')
    if (campanhaEmEdicao) {
      setCampanhas((campanhasAtuais) =>
        campanhasAtuais.map((campanha) =>
          String(campanha.id_campanha) === String(campanhaSalva.id_campanha)
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

  function obterClasseStatus(status) {
    return String(status || '')
      .toLowerCase()
      .replace(/\s+/g, '-')
  }

  function normalizarTexto(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  }

  function limparFiltros() {
    setBusca('')
    setFiltroStatus('')
    setDataInicial('')
    setDataFinal('')
  }

  const campanhasFiltradas = campanhas.filter(
    (campanha) => {
      const textoBusca = normalizarTexto(busca)

      const correspondeBusca =
        !textoBusca ||
        normalizarTexto(
          campanha.nome_campanha
        ).includes(textoBusca) ||
        normalizarTexto(
          campanha.empresa
        ).includes(textoBusca) ||
        normalizarTexto(
          campanha.responsavel
        ).includes(textoBusca)

      const correspondeStatus =
        !filtroStatus ||
        campanha.status === filtroStatus

      const dataCampanha = String(
        campanha.data_inicio || ''
      ).slice(0, 10)

      const correspondeDataInicial =
        !dataInicial ||
        dataCampanha >= dataInicial

      const correspondeDataFinal =
        !dataFinal ||
        dataCampanha <= dataFinal

      return (
        correspondeBusca &&
        correspondeStatus &&
        correspondeDataInicial &&
        correspondeDataFinal
      )
    }
  )

  const possuiFiltros =
    busca ||
    filtroStatus ||
    dataInicial ||
    dataFinal

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
              disabled={!podeEditar || (mostrarFormulario)}
            >
              + Nova campanha
            </button>
          </div>

          {mensagem && <p className="campanhas-feedback" role="status">{mensagem}</p>}

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
            <>
              <div className="campanhas-filtros">
                <div className="campanhas-filtro-busca">
                  <label htmlFor="busca-campanha">
                    Buscar
                  </label>

                  <input
                    id="busca-campanha"
                    type="text"
                    value={busca}
                    onChange={(event) =>
                      setBusca(event.target.value)
                    }
                    placeholder="Campanha, empresa ou responsável..."
                  />
                </div>

                <div className="campanhas-filtro">
                  <label htmlFor="filtro-status">
                    Status
                  </label>

                  <select
                    id="filtro-status"
                    value={filtroStatus}
                    onChange={(event) =>
                      setFiltroStatus(
                        event.target.value
                      )
                    }
                  >
                    <option value="">
                      Todos os status
                    </option>

                    <option value="EM ANDAMENTO">
                      Em andamento
                    </option>

                    <option value="CONCLUIDO">
                      Concluído
                    </option>

                    <option value="CANCELADA">
                      Cancelada
                    </option>
                  </select>
                </div>

                <div className="campanhas-filtro">
                  <label htmlFor="data-inicial">
                    Data inicial
                  </label>

                  <input
                    id="data-inicial"
                    type="date"
                    value={dataInicial}
                    onChange={(event) =>
                      setDataInicial(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div className="campanhas-filtro">
                  <label htmlFor="data-final">
                    Data final
                  </label>

                  <input
                    id="data-final"
                    type="date"
                    value={dataFinal}
                    onChange={(event) =>
                      setDataFinal(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div className="campanhas-filtro-limpar">
                  <button
                    type="button"
                    className="campanha-button-clear"
                    onClick={limparFiltros}
                    disabled={!possuiFiltros}
                  >
                    Limpar filtros
                  </button>
                </div>
              </div>

              <div className="campanhas-resultado-filtro">
                <span>
                  {campanhasFiltradas.length}{' '}
                  {campanhasFiltradas.length === 1
                    ? 'campanha encontrada'
                    : 'campanhas encontradas'}
                </span>
              </div>

              {campanhasFiltradas.length === 0 ? (
                <div className="campanhas-sem-resultados">
                  <p>
                    Nenhuma campanha encontrada com os
                    filtros selecionados.
                  </p>

                  <button
                    type="button"
                    className="campanha-button-clear"
                    onClick={limparFiltros}
                  >
                    Limpar filtros
                  </button>
                </div>
              ) : (
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
                      {campanhasFiltradas.map(
                        (campanha) => {
                          return (
                            <tr
                              key={
                                campanha.id_campanha
                              }
                            >
                              <td>
                                <div className="campanha-nome">
                                  <strong>{campanha.nome_campanha}</strong>
                                  {podeEditar && <button type="button" className="campanha-editar-icone"
                                    onClick={() => abrirEdicao(campanha)} disabled={mostrarFormulario}
                                    title="Editar campanha" aria-label={`Editar campanha ${campanha.nome_campanha}`}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                                      <path d="m16 3 5 5-12 12-6 1 1-6L16 3Z" /><path d="m13 6 5 5" />
                                    </svg>
                                  </button>}
                                </div>
                              </td>

                              <td>
                                {campanha.empresa}
                              </td>

                              <td>
                                {
                                  campanha.responsavel
                                }
                              </td>

                              <td>
                                {new Date(
                                  campanha.data_inicio
                                ).toLocaleDateString(
                                  'pt-BR'
                                )}
                              </td>

                              <td>
                                <span
                                  className={`campanhas-status campanhas-status-${obterClasseStatus(
                                    campanha.status
                                  )}`}
                                >
                                  {campanha.status === 'CONCLUIDO' ? 'CONCLU\u00cdDO' : campanha.status}
                                </span>
                              </td>

                              <td>
                                <div className="campanha-actions">
                                  <button
                                    type="button"
                                    className="campanha-button-locais"
                                    onClick={() =>
                                      abrirLocais(
                                        campanha
                                      )
                                    }
                                    disabled={
                                      mostrarFormulario
                                    }
                                  >
                                    Ver locais
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        }
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  )
}

export default Campanhas
