import { useTraducao } from '../../hooks/useTraducao.js'
import { useEffect, useId, useRef, useState } from 'react'
import { buscarRelatorioPorLocal, verificarPdfRelatorio, buscarPdfRelatorio, listarGeracoesPdf } from '../../services/api'
import { consultarPdfLocal } from '../../services/pdfLocal'
import { useEscopoPdf } from '../../hooks/useEscopoPdf.js'

export default function BotaoPdfLocal(props) {
  const { escopo } = useEscopoPdf()
  return <BotaoPdfLocalConteudo key={JSON.stringify(escopo)} {...props} />
}
function BotaoPdfLocalConteudo({ local, podeConsultar }) {
  const { aviso, tr } = useTraducao()
  const { escopo, atual: escopoAtual, idioma } = useEscopoPdf()

  const [disponibilidade, setDisponibilidade] = useState({ estado: 'carregando' })
  const { estado, idRelatorio, documento } = disponibilidade
  const [baixando, setBaixando] = useState(false)
  const [erro, setErro] = useState('')
  const recursos = useRef({ montado: false, ocupado: false, urls: new Map() })
  const descricao = useId()
  useEffect(() => {
    let atual = true
    const atuais = recursos.current
    atuais.montado = true
    if (podeConsultar) {
      consultarPdfLocal(local.id_local, { buscarRelatorioPorLocal, verificarPdfRelatorio, listarGeracoesPdf }, () => atual && escopoAtual(), idioma)
        .then(resultado => { if (atual && resultado) setDisponibilidade(resultado) })
    }
    return () => {
      atual = false
      atuais.montado = false
      for (const [url, timer] of atuais.urls) { clearTimeout(timer); URL.revokeObjectURL(url) }
      atuais.urls.clear()
    }
  // A função escopoAtual pertence ao objeto de escopo capturado nesta consulta.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local.id_local, podeConsultar, escopo])
  function liberarUrl(url) {
    clearTimeout(recursos.current.urls.get(url))
    recursos.current.urls.delete(url)
    URL.revokeObjectURL(url)
  }
  async function baixar() {
    const atuais = recursos.current
    if (!podeConsultar || estado !== 'disponivel' || !idRelatorio || atuais.ocupado) return
    atuais.ocupado = true
    setBaixando(true)
    setErro('')
    let url
    try {
      // A API injeta Authorization. A aba/listagem nunca abre a URL protegida diretamente.
      const blob = await buscarPdfRelatorio(idRelatorio, documento)
      if (!atuais.montado || !escopoAtual()) return
      if (!blob.size || blob.type.split(';')[0] !== 'application/pdf') throw Error('O arquivo recebido não é um PDF válido.')
      url = URL.createObjectURL(blob)
      atuais.urls.set(url, setTimeout(() => liberarUrl(url), 60000))
      const link = document.createElement('a')
      link.href = url
      link.download = `relatorio-${idRelatorio}-${documento.idioma}-${documento.id_geracao}.pdf`
      document.body.appendChild(link)
      try { link.click() } finally { link.remove() }
    } catch (e) {
      if (url) liberarUrl(url)
      if (atuais.montado && escopoAtual()) {
        if (e.status === 404) setDisponibilidade({ estado: 'ausente' })
        if (e.status === 403) setDisponibilidade({ estado: 'nao-autorizado' })
        setErro(e.status === 404 ? 'O PDF não está mais disponível. Gere primeiro o relatório no inventário.'
          : e.status === 403 ? 'Sem permissão para consultar o relatório.'
            : e.message || 'Não foi possível baixar o PDF. Tente novamente.')
      }
    } finally {
      atuais.ocupado = false
      if (atuais.montado && escopoAtual()) setBaixando(false)
    }
  }
  const mensagem = !podeConsultar || estado === 'nao-autorizado' ? 'Sem permissão para consultar o relatório'
    : estado === 'carregando' ? 'Verificando disponibilidade do PDF'
      : estado === 'erro' ? 'Não foi possível verificar o PDF. Atualize a listagem para tentar novamente.'
        : 'Gere primeiro o relatório no inventário'
  return <div className="local-pdf-controle">
    {podeConsultar && estado === 'disponivel'
      ? <button type="button" className="local-button-secondary local-button-pdf" onClick={baixar} disabled={baixando} aria-busy={baixando} aria-label={tr("Baixar PDF de {{p0}}", { p0: local.nome_local })}>{baixando ? tr('Baixando…') : tr('PDF')}</button>
      : <span className="local-pdf-indisponivel" tabIndex={0} role="group" aria-label={tr("PDF de {{p0}}", { p0: local.nome_local })} aria-describedby={descricao} title={aviso(mensagem)}>
    <button type="button" className="local-button-secondary local-button-pdf" disabled aria-describedby={descricao}>{tr("PDF")}</button>
    <span id={descricao} className="locais-sr-only">{aviso(mensagem)}</span>
      </span>}
    {erro && <span className="local-pdf-erro" role="alert">{aviso(erro)}</span>}
  </div>
}
