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
    async function carregarInventario() {
      try {
        setCarregando(true)
        setErro('')

        const respostaLocal =
          await buscarLocalPorId(idLocal)

        setLocal(respostaLocal.data)

        // Checklist NR-33
        try {
          const respostaChecklists =
            await listarChecklists()

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
        setErro(error.message)
      } finally {
        setCarregando(false)
      }
    }

    carregarInventario()
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
          titulo="Inventário do Local"
          subtitulo="Gestão do inventário de espaço confinado"
        />

        <section className="inventario-main">
          {local && (
            <Link
              to={`/campanhas/${local.id_campanha}/locais`}
              className="inventario-back"
            >
              ← Voltar para locais
            </Link>
          )}

          {carregando && (
            <p className="inventario-message">
              Carregando dados do local...
            </p>
          )}

          {erro && (
            <p
              className="inventario-error"
              role="alert"
            >
              {erro}
            </p>
          )}

          {!carregando &&
            !erro &&
            local && (
              <>
                <div className="inventario-title">
                  <div>
                    <span className="inventario-label">
                      Espaço confinado
                    </span>

                    <h2>
                      {local.nome_local}
                    </h2>

                    <p>
                      {local.nome_campanha ||
                        'Campanha não informada'}
                    </p>
                  </div>

                  <span
                    className={`inventario-status inventario-status-${local.status.toLowerCase()}`}
                  >
                    {local.status}
                  </span>
                </div>

                <div className="inventario-info-grid">
                  <div className="inventario-info-card">
                    <span>Setor</span>

                    <strong>
                      {local.setor ||
                        'Não informado'}
                    </strong>
                  </div>

                  <div className="inventario-info-card">
                    <span>Endereço</span>

                    <strong>
                      {local.endereco ||
                        'Não informado'}
                    </strong>
                  </div>

                  <div className="inventario-info-card">
                    <span>Latitude</span>

                    <strong>
                      {local.latitude ??
                        'Não informada'}
                    </strong>
                  </div>

                  <div className="inventario-info-card">
                    <span>Longitude</span>

                    <strong>
                      {local.longitude ??
                        'Não informada'}
                    </strong>
                  </div>
                </div>

                {local.descricao && (
                  <div className="inventario-description">
                    <span>Descrição</span>

                    <p>
                      {local.descricao}
                    </p>
                  </div>
                )}

                <div className="inventario-section-title">
                  <h3>Inventário</h3>

                  <p>
                    Selecione uma etapa para
                    continuar o levantamento
                    deste espaço confinado.
                  </p>
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
                      <strong>
                        Checklist NR-33
                      </strong>

                      <span
                        className={`inventario-module-status inventario-module-status-${statusChecklist.toLowerCase()}`}
                      >
                        {formatarStatus(
                          statusChecklist
                        )}
                      </span>
                    </div>

                    <span>
                      Avaliação dos requisitos
                      do local
                    </span>
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
                      <strong>
                        Dados Técnicos
                      </strong>

                      <span
                        className={`inventario-module-status inventario-module-status-${statusDadosTecnicos.toLowerCase()}`}
                      >
                        {formatarStatus(
                          statusDadosTecnicos
                        )}
                      </span>
                    </div>

                    <span>
                      Informações técnicas do
                      espaço
                    </span>
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
                      <strong>
                        Evidências / Fotos
                      </strong>

                      <span
                        className={`inventario-module-status inventario-module-status-${statusEvidencias.toLowerCase()}`}
                      >
                        {formatarStatus(
                          statusEvidencias
                        )}
                      </span>
                    </div>

                    <span>
                      Registros e evidências do
                      local
                    </span>
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
                      <strong>
                        Responsáveis pelo Relatório
                      </strong>

                      <span
                        className={`inventario-module-status inventario-module-status-${statusResponsaveis.toLowerCase()}`}
                      >
                        {formatarStatus(
                          statusResponsaveis
                        )}
                      </span>
                    </div>

                    <span>
                      Usuário responsável e
                      informações do responsável
                      técnico
                    </span>
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
                    <strong>
                      Relatório
                    </strong>

                    <span>
                      Visualização e geração do
                      PDF
                    </span>
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