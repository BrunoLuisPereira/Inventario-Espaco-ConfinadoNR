import { useTraducao } from '../hooks/useTraducao.js'
import { useCapacidade } from '../hooks/useCapacidade'
import { useEffect, useState } from 'react'
import {
  Link,
  useNavigate,
  useParams,
} from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'
import LocalForm from '../components/locais/LocalForm'
import {
  alterarStatusLocal,
  buscarCampanhaPorId,
  listarLocais,
} from '../services/api'
import '../styles/Locais.css'

function LocaisCampanha() {
  const { aviso, tr } = useTraducao()

  const podeEditar = useCapacidade('locais.editar')
  const { idCampanha } = useParams()
  const navigate = useNavigate()

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
    let atual = true
    async function carregarDados() {
      try {
        setCarregando(true)
        setErro('')
        setCampanha(null)
        setLocais([])

        const [respostaCampanhas, respostaLocais] =
          await Promise.all([
            buscarCampanhaPorId(idCampanha),
            listarLocais(),
          ])
        if (!atual) return

        const campanhaEncontrada =
          respostaCampanhas.data

        if (!campanhaEncontrada) {
          throw new Error('Campanha não encontrada.')
        }

        const locaisDaCampanha =
          respostaLocais.data.filter(
            (local) =>
              String(local.id_campanha) ===
              String(idCampanha)
          )

        setCampanha(campanhaEncontrada)
        setLocais(locaisDaCampanha)
      } catch (error) {
        if (atual) setErro(error.message)
      } finally {
        if (atual) setCarregando(false)
      }
    }

    carregarDados()
    return () => { atual = false }
  }, [idCampanha])

  function abrirFormularioNovo() {
    setLocalEdicao(null)
    setMostrarFormulario(true)
  }

  function abrirFormularioEdicao(local) {
    setLocalEdicao(local)
    setMostrarFormulario(true)
  }

  function abrirInventario(local) {
    navigate(`/locais/${local.id_local}/inventario`)
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
          titulo={tr("Locais")}
          subtitulo={tr("Espaços confinados da campanha")}
        />

        <section className="locais-main">
          <Link
            to="/campanhas"
            className="locais-back"
          >{tr("← Voltar para campanhas")}</Link>

          {carregando && (
            <p className="locais-message">{tr("Carregando locais...")}</p>
          )}

          {erro && (
            <p
              className="locais-error"
              role="alert"
            >
              {aviso(erro)}
            </p>
          )}

          {!carregando && !erro && campanha && (
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
                  disabled={!podeEditar || (mostrarFormulario)}
                >{tr("+ Novo local")}</button>
              </div>

              {mostrarFormulario && (
                <div className="local-form-container">
                  <h3>
                    {localEdicao
                      ? tr('Editar local')
                      : tr('Novo local')}
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
                  <h3>{tr("Nenhum local cadastrado")}</h3>

                  <p>{tr("Esta campanha ainda não possui espaços confinados cadastrados.")}</p>
                </div>
              ) : (
                <div className="locais-table-container">
                  <table className="locais-table">
                    <thead>
                      <tr>
                        <th>{tr("Local")}</th>
                        <th>{tr("Setor")}</th>
                        <th>{tr("Endereço")}</th>
                        <th>{tr("Status")}</th>
                        <th>{tr("Ações")}</th>
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
                                !podeEditar || (mostrarFormulario ||
                                statusAlterando ===
                                  local.id_local)
                              }
                              aria-label={tr("Status de {{p0}}", { p0: local.nome_local })}
                            >
                              <option value="ATIVO">{tr("ATIVO")}</option>
                              <option value="INATIVO">{tr("INATIVO")}</option>
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
                                  !podeEditar || (mostrarFormulario ||
                                  statusAlterando ===
                                    local.id_local)
                                }
                              >{tr("Editar")}</button>

                              <button
                                type="button"
                                className="local-button-open"
                                onClick={() =>
                                  abrirInventario(local)
                                }
                                disabled={
                                  mostrarFormulario ||
                                  statusAlterando ===
                                    local.id_local
                                }
                              >{tr("Abrir inventário")}</button>
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
