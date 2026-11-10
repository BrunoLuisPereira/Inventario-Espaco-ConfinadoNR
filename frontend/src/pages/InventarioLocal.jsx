import { useTraducao } from '../hooks/useTraducao.js'
import { useEffect, useState } from 'react'

import {
  Link,
  useNavigate,
  useParams,
} from 'react-router-dom'

import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'

import {
  buscarDadosTecnicosPorLocal,
  buscarLocalPorId,
  buscarRelatorioPorLocal,
  listarChecklists,
  listarEvidenciasPorLocal,
} from '../services/api'

import '../styles/InventarioLocal.css'

function InventarioLocal() {
  const { aviso, rotulo, tr } = useTraducao()

  const { idLocal } = useParams()
  const navigate = useNavigate()

  const [local, setLocal] = useState(null)

  const [statusChecklist, setStatusChecklist] =
    useState('PENDENTE')

  const [
    statusDadosTecnicos,
    setStatusDadosTecnicos,
  ] = useState('PENDENTE')

  const [
    statusEvidencias,
    setStatusEvidencias,
  ] = useState('PENDENTE')

  const [
    statusResponsaveis,
    setStatusResponsaveis,
  ] = useState('PENDENTE')

  const [carregando, setCarregando] =
    useState(true)

  const [erro, setErro] = useState('')

  useEffect(() => {
    let atual = true
    async function carregarInventario() {
      try {
        setCarregando(true)
        setErro('')
        setLocal(null)

        const respostaLocal =
          await buscarLocalPorId(idLocal)
        if (!atual) return

        setLocal(respostaLocal.data)

        // Checklist NR-33
        try {
          const respostaChecklists =
            await listarChecklists()
          if (!atual) return

          const checklists =
            respostaChecklists.data || []

          const checklistDoLocal =
            checklists.find(
              (checklist) =>
                Number(checklist.id_local) ===
                Number(idLocal)
            )

          setStatusChecklist(
            checklistDoLocal?.status ||
              'PENDENTE'
          )
        } catch {
          setStatusChecklist('PENDENTE')
        }

        // Dados Técnicos
        try {
          const respostaDadosTecnicos =
            await buscarDadosTecnicosPorLocal(
              idLocal
            )
          if (!atual) return

          setStatusDadosTecnicos(
            respostaDadosTecnicos.data
              ?.status || 'PENDENTE'
          )
        } catch {
          setStatusDadosTecnicos(
            'PENDENTE'
          )
        }

        // Evidências / Fotos
        try {
          const respostaEvidencias =
            await listarEvidenciasPorLocal(
              idLocal
            )
          if (!atual) return

          const evidencias =
            respostaEvidencias.data || []

          setStatusEvidencias(
            evidencias.length > 0
              ? 'CONCLUIDO'
              : 'PENDENTE'
          )
        } catch {
          setStatusEvidencias('PENDENTE')
        }

        // Responsáveis pelo Relatório
        try {
          const respostaRelatorio =
            await buscarRelatorioPorLocal(
              idLocal
            )
          if (!atual) return

          const relatorio =
            respostaRelatorio.data

          const responsaveisPreenchidos =
            Boolean(
              relatorio
                ?.nome_responsavel_tecnico
                ?.trim()
            ) &&
            Boolean(relatorio?.crea?.trim()) &&
            Boolean(
              relatorio?.numero_art?.trim()
            ) &&
            Boolean(relatorio?.data_art)

          setStatusResponsaveis(
            responsaveisPreenchidos
              ? 'CONCLUIDO'
              : 'PENDENTE'
          )
        } catch {
          setStatusResponsaveis('PENDENTE')
        }
      } catch (error) {
        if (atual) setErro(error.message)
      } finally {
        if (atual) setCarregando(false)
      }
    }

    carregarInventario()
    return () => { atual = false }
  }, [idLocal])

  function formatarStatus(status) {
    if (status === 'CONCLUIDO') {
      return 'CONCLUÍDO'
    }

    return 'PENDENTE'
  }

  return (
    <div className="inventario-layout">
      <Sidebar />

      <main className="inventario-content">
        <Header
          titulo={tr("Inventário do Local")}
          subtitulo={tr("Gestão do inventário de espaço confinado")}
        />

        <section className="inventario-main">
          {local && (
            <Link
              to={`/campanhas/${local.id_campanha}/locais`}
              className="inventario-back"
            >{tr("← Voltar para locais")}</Link>
          )}

          {carregando && (
            <p className="inventario-message">{tr("Carregando dados do local...")}</p>
          )}

          {erro && (
            <p
              className="inventario-error"
              role="alert"
            >
              {aviso(erro)}
            </p>
          )}

          {!carregando &&
            !erro &&
            local && (
              <>
                <div className="inventario-title">
                  <div>
                    <h2>
                      {local.nome_local}
                    </h2>

                    <p>
                      {local.nome_campanha ||
                        tr('Campanha não informada')}
                    </p>
                  </div>

                  <span
                    className={`inventario-status inventario-status-${local.status.toLowerCase()}`}
                  >
                    {rotulo(local.status)}
                  </span>
                </div>

                <div className="inventario-section-title">
                  <h3>{tr("Inventário")}</h3>

                  <p>{tr("Selecione uma etapa para continuar o levantamento deste espaço confinado.")}</p>
                </div>

                <div className="inventario-modules">
                  {/* Checklist NR-33 */}
                  <button
                    type="button"
                    className="inventario-module"
                    onClick={() =>
                      navigate(
                        `/locais/${idLocal}/checklist`
                      )
                    }
                  >
                    <div className="inventario-module-header">
                      <strong>{tr("Checklist NR-33")}</strong>

                      <span
                        className={`inventario-module-status inventario-module-status-${statusChecklist.toLowerCase()}`}
                      >
                        {tr(formatarStatus(
                          statusChecklist
                        ))}
                      </span>
                    </div>

                    <span>{tr("Avaliação dos requisitos do local")}</span>
                  </button>

                  {/* Dados Técnicos */}
                  <button
                    type="button"
                    className="inventario-module"
                    onClick={() =>
                      navigate(
                        `/locais/${idLocal}/dados-tecnicos`
                      )
                    }
                  >
                    <div className="inventario-module-header">
                      <strong>{tr("Dados Técnicos")}</strong>

                      <span
                        className={`inventario-module-status inventario-module-status-${statusDadosTecnicos.toLowerCase()}`}
                      >
                        {tr(formatarStatus(
                          statusDadosTecnicos
                        ))}
                      </span>
                    </div>

                    <span>{tr("Informações técnicas do espaço")}</span>
                  </button>

                  {/* Evidências / Fotos */}
                  <button
                    type="button"
                    className="inventario-module"
                    onClick={() =>
                      navigate(
                        `/locais/${idLocal}/evidencias`
                      )
                    }
                  >
                    <div className="inventario-module-header">
                      <strong>{tr("Evidências / Fotos")}</strong>

                      <span
                        className={`inventario-module-status inventario-module-status-${statusEvidencias.toLowerCase()}`}
                      >
                        {tr(formatarStatus(
                          statusEvidencias
                        ))}
                      </span>
                    </div>

                    <span>{tr("Registros e evidências do local")}</span>
                  </button>

                  {/* Responsáveis pelo Relatório */}
                  <button
                    type="button"
                    className="inventario-module"
                    onClick={() =>
                      navigate(
                        `/locais/${idLocal}/responsaveis`
                      )
                    }
                  >
                    <div className="inventario-module-header">
                      <strong>{tr("Responsáveis pelo Relatório")}</strong>

                      <span
                        className={`inventario-module-status inventario-module-status-${statusResponsaveis.toLowerCase()}`}
                      >
                        {tr(formatarStatus(
                          statusResponsaveis
                        ))}
                      </span>
                    </div>

                    <span>{tr("Usuário responsável e informações do responsável técnico")}</span>
                  </button>

                  {/* Relatório */}
                  <button
                    type="button"
                    className="inventario-module"
                    onClick={() =>
                      navigate(
                        `/locais/${idLocal}/relatorio`
                      )
                    }
                  >
                    <strong>{tr("Relatório")}</strong>

                    <span>{tr("Visualização e geração do PDF")}</span>
                  </button>
                </div>
              </>
            )}
        </section>
      </main>
    </div>
  )
}

export default InventarioLocal
