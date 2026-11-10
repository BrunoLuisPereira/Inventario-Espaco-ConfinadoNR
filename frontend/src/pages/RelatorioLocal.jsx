import { useEscopoPdf } from '../hooks/useEscopoPdf.js'
import { selecionarGeracaoPdf } from '../services/documentoPdf.js'
import { useTraducao } from '../hooks/useTraducao.js'
import { useCapacidade } from '../hooks/useCapacidade'
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
  listarGeracoesPdf,
  verificarPdfRelatorio,
} from '../services/api'

import '../styles/RelatorioLocal.css'

function RelatorioLocal() {
  const { escopo } = useEscopoPdf()
  const { idLocal } = useParams()
  return <RelatorioLocalConteudo key={JSON.stringify([escopo, idLocal])} />
}
function RelatorioLocalConteudo() {
  const { aviso, rotulo, tr } = useTraducao()
  const { escopo, atual, idioma } = useEscopoPdf()
  const [documento, setDocumento] = useState(null)
  const [legado, setLegado] = useState(false)

  const podeEditar = useCapacidade('relatorios.gerar')
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
    let montado = true
    const vigente = () => montado && atual()
    async function carregarDados() {
      try {
        setCarregando(true)
        const respostaLocal = await buscarLocalPorId(idLocal)
        if (!vigente()) return
        setLocal(respostaLocal.data)
        try {
          const resposta = await buscarRelatorioPorLocal(idLocal)
          if (!vigente()) return
          const r = resposta.data
          setRelatorio(r || null)
          if (r) {
            setLegado(Boolean(r.caminho_pdf))
            const disponibilidade = await listarGeracoesPdf(r.id_relatorio, idioma)
            if (!vigente()) return
            setDocumento(selecionarGeracaoPdf(disponibilidade, r.id_relatorio, idioma))
            setLegado(Boolean(disponibilidade.data?.legado))
          }
        } catch (error) {
          if (error.status !== 404) throw error
        }
      } catch (error) {
        if (vigente()) setErro(error.message)
      } finally {
        if (vigente()) setCarregando(false)
      }
    }
    carregarDados()
    return () => { montado = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idLocal, escopo])

  async function handleGerarPdf() {
    try {
      setGerando(true)
      setErro('')
      setMensagem('')
      let r = relatorio
      if (!r) {
        const resposta = await criarRelatorio({ id_local: Number(idLocal) })
        if (!atual()) return
        r = resposta.data
        setRelatorio(r)
      }
      const resposta = await gerarPdfRelatorio(r.id_relatorio, idioma)
      if (!atual()) return
      const geracao = resposta.data?.geracao
      const selecionado = selecionarGeracaoPdf({ data: { geracoes: [geracao].filter(Boolean) } }, r.id_relatorio, idioma)
      if (!selecionado) throw new Error('Resposta inválida do servidor.')
      setDocumento(selecionado)
      setRelatorio(resposta.data.relatorio || r)
      setMensagem('PDF gerado com sucesso.')
    } catch (error) {
      if (atual()) setErro(error.message)
    } finally {
      if (atual()) setGerando(false)
    }
  }

  async function handleVisualizarPdf(historico = false) {
    try {
      setAbrindo(true)
      setErro('')
      const escolhido = historico ? null : documento
      if (!relatorio?.id_relatorio || (!historico && !escolhido)) {
        throw new Error('Gere o relatório antes de visualizar o PDF.')
      }
      await verificarPdfRelatorio(relatorio.id_relatorio, escolhido)
      if (!atual()) return
      const blob = await buscarPdfRelatorio(relatorio.id_relatorio, escolhido)
      if (!atual()) return
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (error) {
      if (atual()) setErro(error.message)
    } finally {
      if (atual()) setAbrindo(false)
    }
  }

  return (
    <div className="relatorio-layout">
      <Sidebar />

      <main className="relatorio-content">
        <Header
          titulo={tr("Relatório do Local")}
          subtitulo={tr("Geração e visualização do relatório técnico")}
        />

        <section className="relatorio-main">
          <Link
            to={`/locais/${idLocal}/inventario`}
            className="relatorio-back"
          >{tr("← Voltar para inventário")}</Link>

          {carregando && (
            <p className="relatorio-message">{tr("Carregando relatório...")}</p>
          )}

          {erro && (
            <p
              className="relatorio-error"
              role="alert"
            >
              {aviso(erro)}
            </p>
          )}

          {mensagem && (
            <p
              className="relatorio-success"
              role="status"
            >
              {aviso(mensagem)}
            </p>
          )}

          {!carregando && local && (
            <>
              <div className="relatorio-title">
                <div>
                  <span className="relatorio-label">{tr("Relatório técnico")}</span>

                  <h2>
                    {local.nome_local}
                  </h2>

                  <p>
                    {local.nome_campanha ||
                      tr('Campanha não informada')}
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
                    ? tr('DISPONÍVEL')
                    : tr('PENDENTE')}
                </span>
              </div>

              <div className="relatorio-card">
                <div className="relatorio-card-header">
                  <div>
                    <h3>{tr("Relatório de Inventário")}</h3>

                    <p>{tr("O documento reúne os dados cadastrados no inventário deste espaço confinado.")}</p>
                  </div>

                  <div className="relatorio-document-icon">{tr("PDF")}</div>
                </div>

                <div className="relatorio-info">
                  <div>
                    <span>{tr("Local")}</span>

                    <strong>
                      {local.nome_local}
                    </strong>
                  </div>

                  <div>
                    <span>{tr("Setor")}</span>

                    <strong>
                      {local.setor ||
                        tr('Não informado')}
                    </strong>
                  </div>

                  <div>
                    <span>{tr("Status do local")}</span>

                    <strong>
                      {rotulo(local.status)}
                    </strong>
                  </div>

                  <div>
                    <span>{tr("Número do relatório")}</span>

                    <strong>
                      {relatorio?.id_relatorio ||
                        tr('Será criado na geração')}
                    </strong>
                  </div>
                </div>

                <div className="relatorio-observacao">
                  <strong>{tr("Conteúdo do documento")}</strong>

                  <p>{tr("O PDF inclui identificação do relatório, campanha, local, checklist NR-33, dados técnicos e evidências fotográficas.")}</p>
                </div>

                <p role="status">{documento
                  ? tr('Idioma do PDF: {{idioma}}', { idioma: documento.idioma === 'en' ? 'English' : 'Português (Brasil)' })
                  : tr('Nenhum PDF disponível no idioma ativo.')}</p>
                {legado && <button type="button" className="relatorio-btn relatorio-btn-secondary"
                  disabled={abrindo || gerando} onClick={() => handleVisualizarPdf(true)}>
                  {tr('Abrir PDF legado — idioma desconhecido')}
                </button>}
                <div className="relatorio-actions">
                  <button
                    type="button"
                    className="relatorio-btn relatorio-btn-primary"
                    onClick={handleGerarPdf}
                    disabled={!podeEditar || (gerando)}
                  >
                    {gerando
                      ? tr('Gerando PDF...')
                      : relatorio
                        ? tr('Gerar PDF novamente')
                        : tr('Gerar PDF')}
                  </button>

                  <button
                    type="button"
                    className="relatorio-btn relatorio-btn-secondary"
                    onClick={() => handleVisualizarPdf()}
                    disabled={
                      !documento ||
                      abrindo ||
                      gerando
                    }
                  >
                    {abrindo
                      ? tr('Abrindo PDF...')
                      : tr('Visualizar PDF')}
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
