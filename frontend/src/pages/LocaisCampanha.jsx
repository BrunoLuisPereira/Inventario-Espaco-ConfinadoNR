import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'
import LocalForm from '../components/locais/LocalForm'
import {
  alterarStatusLocal,
  listarCampanhas,
  listarLocais,
} from '../services/api'
import '../styles/Locais.css'

function LocaisCampanha() {
  const { idCampanha } = useParams()

  const [campanha, setCampanha] = useState(null)
  const [locais, setLocais] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [mostrarFormulario, setMostrarFormulario] =
    useState(false)
  const [localEdicao, setLocalEdicao] = useState(null)
  const [statusAlterando, setStatusAlterando] =
    useState(null)

  useEffect(() => {
    async function carregarDados() {
      try {
        setCarregando(true)
        setErro('')

        const [respostaCampanhas, respostaLocais] =
          await Promise.all([
            listarCampanhas(),
            listarLocais(),
          ])

        const campanhaEncontrada =
          respostaCampanhas.data.find(
            (item) =>
              Number(item.id_campanha) ===
              Number(idCampanha)
          )

        if (!campanhaEncontrada) {
          throw new Error('Campanha não encontrada.')
        }

        const locaisDaCampanha =
          respostaLocais.data.filter(
            (local) =>
              Number(local.id_campanha) ===
              Number(idCampanha)
          )

        setCampanha(campanhaEncontrada)
        setLocais(locaisDaCampanha)
      } catch (error) {
        setErro(error.message)
      } finally {
        setCarregando(false)
      }
    }

    carregarDados()
  }, [idCampanha])

  function abrirFormularioNovo() {
    setLocalEdicao(null)
    setMostrarFormulario(true)
  }

  function abrirFormularioEdicao(local) {
    setLocalEdicao(local)
    setMostrarFormulario(true)
  }

  function cancelarFormulario() {
    setLocalEdicao(null)
    setMostrarFormulario(false)
  }

  function localSalvo(localSalvo) {
    if (localEdicao) {
      setLocais((locaisAtuais) =>
        locaisAtuais.map((local) =>
          local.id_local === localSalvo.id_local
            ? { ...local, ...localSalvo }
            : local
        )
      )
    } else {
      setLocais((locaisAtuais) => [
        localSalvo,
        ...locaisAtuais,
      ])
    }

    setLocalEdicao(null)
    setMostrarFormulario(false)
  }

  async function mudarStatus(local, novoStatus) {
    if (novoStatus === local.status) {
      return
    }

    try {
      setErro('')
      setStatusAlterando(local.id_local)

      const resposta = await alterarStatusLocal(
        local.id_local,
        novoStatus
      )

      setLocais((locaisAtuais) =>
        locaisAtuais.map((item) =>
          item.id_local === resposta.data.id_local
            ? { ...item, ...resposta.data }
            : item
        )
      )
    } catch (error) {
      setErro(error.message)
    } finally {
      setStatusAlterando(null)
    }
  }

  return (
    <div className="locais-layout">
      <Sidebar />

      <main className="locais-content">
        <Header
          titulo="Locais"
          subtitulo="Espaços confinados da campanha"
        />

        <section className="locais-main">
          <Link
            to="/campanhas"
            className="locais-back"
          >
            ← Voltar para campanhas
          </Link>

          {carregando && (
            <p className="locais-message">
              Carregando locais...
            </p>
          )}

          {erro && (
            <p
              className="locais-error"
              role="alert"
            >
              {erro}
            </p>
          )}

          {!carregando && campanha && (
            <>
              <div className="locais-title">
                <div>
                  <h2>{campanha.nome_campanha}</h2>

                  <p>
                    {campanha.empresa}
                    {' · '}
                    {campanha.responsavel}
                  </p>
                </div>

                <button
                  type="button"
                  className="local-button-primary"
                  onClick={abrirFormularioNovo}
                  disabled={mostrarFormulario}
                >
                  + Novo local
                </button>
              </div>

              {mostrarFormulario && (
                <div className="local-form-container">
                  <h3>
                    {localEdicao
                      ? 'Editar local'
                      : 'Novo local'}
                  </h3>

                  <LocalForm
                    key={
                      localEdicao
                        ? `editar-${localEdicao.id_local}`
                        : 'novo'
                    }
                    idCampanha={idCampanha}
                    localEdicao={localEdicao}
                    onCancelar={cancelarFormulario}
                    onLocalSalvo={localSalvo}
                  />
                </div>
              )}

              {locais.length === 0 ? (
                <div className="locais-empty">
                  <h3>Nenhum local cadastrado</h3>

                  <p>
                    Esta campanha ainda não possui espaços
                    confinados cadastrados.
                  </p>
                </div>
              ) : (
                <div className="locais-table-container">
                  <table className="locais-table">
                    <thead>
                      <tr>
                        <th>Local</th>
                        <th>Setor</th>
                        <th>Endereço</th>
                        <th>Status</th>
                        <th>Ações</th>
                      </tr>
                    </thead>

                    <tbody>
                      {locais.map((local) => (
                        <tr key={local.id_local}>
                          <td>
                            <strong>
                              {local.nome_local}
                            </strong>
                          </td>

                          <td>
                            {local.setor || '—'}
                          </td>

                          <td>
                            {local.endereco || '—'}
                          </td>

                          <td>
                            <select
                              className={`local-status-select local-status-select-${local.status.toLowerCase()}`}
                              value={local.status}
                              onChange={(event) =>
                                mudarStatus(
                                  local,
                                  event.target.value
                                )
                              }
                              disabled={
                                mostrarFormulario ||
                                statusAlterando ===
                                  local.id_local
                              }
                              aria-label={`Status de ${local.nome_local}`}
                            >
                              <option value="ATIVO">
                                ATIVO
                              </option>

                              <option value="INATIVO">
                                INATIVO
                              </option>

                              <option value="CONCLUIDO">
                                CONCLUÍDO
                              </option>
                            </select>
                          </td>

                          <td>
                            <div className="local-actions">
                              <button
                                type="button"
                                className="local-button-edit"
                                onClick={() =>
                                  abrirFormularioEdicao(
                                    local
                                  )
                                }
                                disabled={
                                  mostrarFormulario ||
                                  statusAlterando ===
                                    local.id_local
                                }
                              >
                                Editar
                              </button>

                              <button
                                type="button"
                                className="local-button-open"
                                disabled
                              >
                                Abrir inventário
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
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

export default LocaisCampanha