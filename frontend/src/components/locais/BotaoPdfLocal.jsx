import { useEffect, useId, useRef, useState } from 'react'
import { buscarRelatorioPorLocal, verificarPdfRelatorio, buscarPdfRelatorio } from '../../services/api'
import { consultarPdfLocal } from '../../services/pdfLocal'

export default function BotaoPdfLocal({ local, podeConsultar }) {
  const [disponibilidade, setDisponibilidade] = useState({ estado: 'carregando' })
  const { estado, idRelatorio } = disponibilidade
  const [baixando, setBaixando] = useState(false)
  const [erro, setErro] = useState('')
  const recursos = useRef({ montado: false, ocupado: false, urls: new Map() })
  const descricao = useId()
  useEffect(() => {
    let atual = true
    const atuais = recursos.current
    atuais.montado = true
    if (podeConsultar) {
      consultarPdfLocal(local.id_local, { buscarRelatorioPorLocal, verificarPdfRelatorio }, () => atual)
        .then(resultado => { if (atual && resultado) setDisponibilidade(resultado) })
    }
    return () => {
      atual = false
      atuais.montado = false
      for (const [url, timer] of atuais.urls) { clearTimeout(timer); URL.revokeObjectURL(url) }
      atuais.urls.clear()
    }
  }, [local.id_local, podeConsultar])
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
      const blob = await buscarPdfRelatorio(idRelatorio)
      if (!atuais.montado) return
      if (!blob.size || blob.type.split(';')[0] !== 'application/pdf') throw Error('O arquivo recebido não é um PDF válido.')
      url = URL.createObjectURL(blob)
      atuais.urls.set(url, setTimeout(() => liberarUrl(url), 60000))
      const link = document.createElement('a')
      link.href = url
      link.download = `relatorio-${idRelatorio}.pdf`
      document.body.appendChild(link)
      try { link.click() } finally { link.remove() }
    } catch (e) {
      if (url) liberarUrl(url)
      if (atuais.montado) {
        if (e.status === 404) setDisponibilidade({ estado: 'ausente' })
        if (e.status === 403) setDisponibilidade({ estado: 'nao-autorizado' })
        setErro(e.status === 404 ? 'O PDF não está mais disponível. Gere primeiro o relatório no inventário.'
          : e.status === 403 ? 'Sem permissão para consultar o relatório.'
            : e.message || 'Não foi possível baixar o PDF. Tente novamente.')
      }
    } finally {
      atuais.ocupado = false
      if (atuais.montado) setBaixando(false)
    }
  }
  const mensagem = !podeConsultar || estado === 'nao-autorizado' ? 'Sem permissão para consultar o relatório'
    : estado === 'carregando' ? 'Verificando disponibilidade do PDF'
      : estado === 'erro' ? 'Não foi possível verificar o PDF. Atualize a listagem para tentar novamente.'
        : 'Gere primeiro o relatório no inventário'
  return <div className="local-pdf-controle">
    {podeConsultar && estado === 'disponivel'
      ? <button type="button" className="local-button-secondary local-button-pdf" onClick={baixar} disabled={baixando} aria-busy={baixando} aria-label={`Baixar PDF de ${local.nome_local}`}>{baixando ? 'Baixando…' : 'PDF'}</button>
      : <span className="local-pdf-indisponivel" tabIndex={0} role="group" aria-label={`PDF de ${local.nome_local}`} aria-describedby={descricao} title={mensagem}>
    <button type="button" className="local-button-secondary local-button-pdf" disabled aria-describedby={descricao}>PDF</button>
    <span id={descricao} className="locais-sr-only">{mensagem}</span>
      </span>}
    {erro && <span className="local-pdf-erro" role="alert">{erro}</span>}
  </div>
}
