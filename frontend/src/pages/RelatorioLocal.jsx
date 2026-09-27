import { useEffect, useState } from 'react'
import {
  Link,
  useParams,
} from 'react-router-dom'

import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'

import {
  buscarLocalPorId,
  buscarRelatorioPorLocal,
  criarRelatorio,
  gerarPdfRelatorio,
  buscarPdfRelatorio,
} from '../services/api'

import '../styles/RelatorioLocal.css'

function RelatorioLocal() {
  const { idLocal } = useParams()

  const [local, setLocal] = useState(null)
  const [relatorio, setRelatorio] =
    useState(null)

  const [carregando, setCarregando] =
    useState(true)

  const [gerando, setGerando] =
    useState(false)

  const [abrindo, setAbrindo] =
    useState(false)

  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] =
    useState('')

  useEffect(() => {
    async function carregarDados() {
      try {
        setCarregando(true)
        setErro('')

        const respostaLocal =
          await buscarLocalPorId(idLocal)

        setLocal(respostaLocal.data)

        try {
          const respostaRelatorio =
            await buscarRelatorioPorLocal(idLocal)

          setRelatorio(
            respostaRelatorio.data || null
          )
        } catch (error) {
          if (error.status === 404) {
            setRelatorio(null)
          } else {
            throw error
          }
        }
      } catch (error) {
        setErro(error.message)
      } finally {
        setCarregando(false)
      }
    }

    carregarDados()
  }, [idLocal])

  async function obterOuCriarRelatorio() {
    if (relatorio) {
      return relatorio
    }

    const resposta =
      await criarRelatorio({
        id_local: Number(idLocal),
      })

    const novoRelatorio =
      resposta.data

    setRelatorio(novoRelatorio)

    return novoRelatorio
  }

  async function handleGerarPdf() {
    try {
      setGerando(true)
      setErro('')
      setMensagem('')

      const relatorioAtual =
        await obterOuCriarRelatorio()

      await gerarPdfRelatorio(
        relatorioAtual.id_relatorio
      )

      setMensagem(
        'PDF gerado com sucesso.'
      )

      const respostaAtualizada =
        await buscarRelatorioPorLocal(idLocal)

      setRelatorio(
        respostaAtualizada.data ||
          relatorioAtual
      )
    } catch (error) {
      setErro(error.message)
    } finally {
      setGerando(false)
    }
  }

  async function handleVisualizarPdf() {
    try {
      setAbrindo(true)
      setErro('')

      if (!relatorio?.id_relatorio) {
        throw new Error(
          'Gere o relatório antes de visualizar o PDF.'
        )
      }

      const blob =
        await buscarPdfRelatorio(
          relatorio.id_relatorio
        )

      const url =
        URL.createObjectURL(blob)

      window.open(
        url,
        '_blank',
        'noopener,noreferrer'
      )

      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 60000)
    } catch (error) {
      setErro(error.message)
    } finally {
      setAbrindo(false)
    }
  }

  return (
    <div className="relatorio-layout">
      <Sidebar />

      <main className="relatorio-content">
        <Header
          titulo="Relatório do Local"
          subtitulo="Geração e visualização do relatório técnico"
        />

        <section className="relatorio-main">
          <Link
            to={`/locais/${idLocal}/inventario`}
            className="relatorio-back"
          >
            ← Voltar para inventário
          </Link>

          {carregando && (
            <p className="relatorio-message">
              Carregando relatório...
            </p>
          )}

          {erro && (
            <p
              className="relatorio-error"
              role="alert"
            >
              {erro}
            </p>
          )}

          {mensagem && (
            <p
              className="relatorio-success"
              role="status"
            >
              {mensagem}
            </p>
          )}

          {!carregando && local && (
            <>
              <div className="relatorio-title">
                <div>
                  <span className="relatorio-label">
                    Relatório técnico
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
                  className={
                    relatorio
                      ? 'relatorio-status relatorio-status-disponivel'
                      : 'relatorio-status relatorio-status-pendente'
                  }
                >
                  {relatorio
                    ? 'DISPONÍVEL'
                    : 'PENDENTE'}
                </span>
              </div>

              <div className="relatorio-card">
                <div className="relatorio-card-header">
                  <div>
                    <h3>
                      Relatório de Inventário
                    </h3>

                    <p>
                      O documento reúne os dados
                      cadastrados no inventário deste
                      espaço confinado.
                    </p>
                  </div>

                  <div className="relatorio-document-icon">
                    PDF
                  </div>
                </div>

                <div className="relatorio-info">
                  <div>
                    <span>Local</span>

                    <strong>
                      {local.nome_local}
                    </strong>
                  </div>

                  <div>
                    <span>Setor</span>

                    <strong>
                      {local.setor ||
                        'Não informado'}
                    </strong>
                  </div>

                  <div>
                    <span>Status do local</span>

                    <strong>
                      {local.status}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Número do relatório
                    </span>

                    <strong>
                      {relatorio?.id_relatorio ||
                        'Será criado na geração'}
                    </strong>
                  </div>
                </div>

                <div className="relatorio-observacao">
                  <strong>
                    Conteúdo do documento
                  </strong>

                  <p>
                    O PDF inclui identificação do
                    relatório, campanha, local,
                    checklist NR-33, dados técnicos
                    e evidências fotográficas.
                  </p>
                </div>

                <div className="relatorio-actions">
                  <button
                    type="button"
                    className="relatorio-btn relatorio-btn-primary"
                    onClick={handleGerarPdf}
                    disabled={gerando}
                  >
                    {gerando
                      ? 'Gerando PDF...'
                      : relatorio
                        ? 'Gerar PDF novamente'
                        : 'Gerar PDF'}
                  </button>

                  <button
                    type="button"
                    className="relatorio-btn relatorio-btn-secondary"
                    onClick={
                      handleVisualizarPdf
                    }
                    disabled={
                      !relatorio ||
                      abrindo ||
                      gerando
                    }
                  >
                    {abrindo
                      ? 'Abrindo PDF...'
                      : 'Visualizar PDF'}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}

export default RelatorioLocal