import { useEffect, useState } from 'react'
import {
  Link,
  useNavigate,
  useParams,
} from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'
import { buscarLocalPorId } from '../services/api'
import '../styles/InventarioLocal.css'

function InventarioLocal() {
  const { idLocal } = useParams()
  const navigate = useNavigate()

  const [local, setLocal] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    async function carregarLocal() {
      try {
        setCarregando(true)
        setErro('')

        const resposta = await buscarLocalPorId(idLocal)

        setLocal(resposta.data)
      } catch (error) {
        setErro(error.message)
      } finally {
        setCarregando(false)
      }
    }

    carregarLocal()
  }, [idLocal])

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

          {!carregando && !erro && local && (
            <>
              <div className="inventario-title">
                <div>
                  <span className="inventario-label">
                    Espaço confinado
                  </span>

                  <h2>{local.nome_local}</h2>

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
                    {local.setor || 'Não informado'}
                  </strong>
                </div>

                <div className="inventario-info-card">
                  <span>Endereço</span>

                  <strong>
                    {local.endereco || 'Não informado'}
                  </strong>
                </div>

                <div className="inventario-info-card">
                  <span>Latitude</span>

                  <strong>
                    {local.latitude ?? 'Não informada'}
                  </strong>
                </div>

                <div className="inventario-info-card">
                  <span>Longitude</span>

                  <strong>
                    {local.longitude ?? 'Não informada'}
                  </strong>
                </div>
              </div>

              {local.descricao && (
                <div className="inventario-description">
                  <span>Descrição</span>

                  <p>{local.descricao}</p>
                </div>
              )}

              <div className="inventario-section-title">
                <h3>Inventário</h3>

                <p>
                  Selecione uma etapa para continuar o
                  levantamento deste espaço confinado.
                </p>
              </div>

              <div className="inventario-modules">
                <button
                  type="button"
                  className="inventario-module"
                  onClick={() =>
                    navigate(
                      `/locais/${idLocal}/checklist`
                    )
                  }
                >
                  <strong>Checklist NR-33</strong>

                  <span>
                    Avaliação dos requisitos do local
                  </span>
                </button>

                <button
                  type="button"
                  className="inventario-module"
                  onClick={() =>
                    navigate(
                      `/locais/${idLocal}/dados-tecnicos`
                    )
                  }
                >
                  <strong>Dados Técnicos</strong>

                  <span>
                    Informações técnicas do espaço
                  </span>
                </button>

                <button
                  type="button"
                  className="inventario-module"
                  disabled
                >
                  <strong>Evidências / Fotos</strong>

                  <span>
                    Registros e evidências do local
                  </span>
                </button>

                <button
                  type="button"
                  className="inventario-module"
                  disabled
                >
                  <strong>Relatório</strong>

                  <span>
                    Visualização e geração do PDF
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