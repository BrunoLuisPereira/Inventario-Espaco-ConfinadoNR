import { useEffect, useRef, useState } from 'react'
import { listarAuditoriaPerfis } from '../services/api'
import { nomesPerfis } from '../services/permissoes'
import { useCapacidade } from '../hooks/useCapacidade'
import { sessaoAtual } from '../services/sessao'
import { gerarCsvAuditoria, nomeArquivoAuditoria } from '../services/auditoriaCsv'
import '../styles/AuditoriaPermissoes.css'

function IconeAuditoria({ relogio = false }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {relogio ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> : <><circle cx="12" cy="8" r="3" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>}
  </svg>
}

export default function AuditoriaPermissoes({ usuarios }) {
  const [estado, setEstado] = useState({ dados: null, ocupado: false, erro: '' })
  const [exportacao, setExportacao] = useState({ ocupado: false, mensagem: '', erro: '' })
  const podeExportar = useCapacidade('usuarios.auditoria.consultar')
  const operacao = useRef(false)
  const montado = useRef(false)
  useEffect(() => { montado.current = true; return () => { montado.current = false } }, [])
  async function consultar() {
    if (operacao.current) return
    operacao.current = true
    setEstado(s => ({ ...s, ocupado: true, erro: '' }))
    try {
      const r = await listarAuditoriaPerfis()
      if (!Array.isArray(r.data)) throw Error('Resposta de auditoria inválida.')
      setEstado({ dados: r.data.slice(0, 10), ocupado: false, erro: '' })
    } catch (e) { setEstado({ dados: null, ocupado: false, erro: e.message }) }
    finally { operacao.current = false }
  }
  async function exportar() {
    if (operacao.current || !podeExportar) return
    operacao.current = true
    const token = sessaoAtual().ler().token
    setExportacao({ ocupado: true, mensagem: '', erro: '' })
    let url
    try {
      // Nova requisição: o backend revalida a autorização atual e o ambiente.
      // Não reutiliza o histórico em memória como prova de acesso.
      const r = await listarAuditoriaPerfis()
      if (!montado.current || !token || sessaoAtual().ler().token !== token) return
      if (!Array.isArray(r.data) || r.data.length > 200) throw Error('Resposta de auditoria inválida para exportação.')
      if (!r.data.length) {
        setExportacao({ ocupado: false, erro: '', mensagem: 'Nenhum registro disponível para exportação.' })
        return
      }
      const csv = gerarCsvAuditoria(r.data, usuarios)
      url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url; link.download = nomeArquivoAuditoria()
      document.body.appendChild(link); link.click(); link.remove()
      setExportacao({ ocupado: false, erro: '', mensagem: `${r.data.length} registro(s) exportado(s). O CSV contém somente as últimas 200 alterações disponíveis na consulta.` })
    } catch (e) {
      if (montado.current) setExportacao({ ocupado: false, mensagem: '', erro: e.message })
    } finally {
      if (url) URL.revokeObjectURL(url)
      operacao.current = false
      if (montado.current) setExportacao(s => ({ ...s, ocupado: false }))
    }
  }
  const nome = id => usuarios.find(u => String(u.id_usuario) === String(id))?.nome || `Usuário #${id}`
  return <section className="usuarios-card usuarios-auditoria" aria-labelledby="auditoria-titulo" aria-busy={estado.ocupado || exportacao.ocupado}>
    <h2 id="auditoria-titulo">Auditoria de permissões</h2>
    <p>Consulte as 10 alterações de perfil mais recentes do seu ambiente.</p>
    <div className="auditoria-acoes">
      <button type="button" disabled={estado.ocupado || exportacao.ocupado} onClick={consultar}>{estado.ocupado ? 'Consultando...' : 'Consultar auditoria'}</button>
      {podeExportar && <button className="auditoria-exportar" type="button" disabled={estado.ocupado || exportacao.ocupado} onClick={exportar}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" /></svg>
        {exportacao.ocupado ? 'Exportando...' : 'Exportar histórico'}
      </button>}
    </div>
    <p className="auditoria-exportacao-nota">CSV das últimas 200 alterações, com nova consulta ao exportar. Pode não conter o histórico completo.</p>
    {exportacao.mensagem && <p role="status">{exportacao.mensagem}</p>}
    {exportacao.erro && <p role="alert">{exportacao.erro}</p>}
    {estado.erro && <p role="alert">{estado.erro}</p>}
    {estado.dados && (estado.dados.length ? <ul className="auditoria-historico" aria-label="Histórico de alterações de perfil">{estado.dados.map(h => <li className="auditoria-registro" key={h.id_auditoria}>
      <article>
        <div className="auditoria-registro-cabecalho">
          <span className="auditoria-icone"><IconeAuditoria /></span>
          <div><strong className="auditoria-usuario">{nome(h.id_usuario_afetado)}</strong><p className="auditoria-descricao">Alteração de perfil de acesso</p></div>
        </div>
        <div className="auditoria-transicao" aria-label="Perfil anterior e novo perfil">
          <span className="auditoria-perfil">{nomesPerfis[h.perfil_anterior] || h.perfil_anterior}</span>
          <span className="auditoria-seta" aria-label="para">→</span>
          <span className="auditoria-perfil auditoria-perfil-novo">{nomesPerfis[h.perfil_novo] || h.perfil_novo}</span>
        </div>
        <div className="auditoria-metadados">
          <span className="auditoria-responsavel"><IconeAuditoria /><span>Responsável: <strong>{nome(h.id_usuario_responsavel)}</strong></span></span>
          <span className="auditoria-data"><IconeAuditoria relogio /><time dateTime={h.data_hora}>{new Date(h.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></span>
        </div>
      </article>
    </li>)}</ul> : <p role="status">Nenhuma alteração de perfil registrada.</p>)}
  </section>
}
