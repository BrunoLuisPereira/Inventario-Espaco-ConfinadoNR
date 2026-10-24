import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCapacidade } from '../hooks/useCapacidade'
import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'
import LocalForm from '../components/locais/LocalForm'
import BotaoPdfLocal from '../components/locais/BotaoPdfLocal'
import { listarLocais, listarCampanhas, alterarStatusLocal, exportarLocaisExcel } from '../services/api'
import { prepararLocais, consultarLocais } from '../services/locaisTabela'
import '../styles/Locais.css'

export default function Locais() {
  const { idCampanha } = useParams()
  const podeCriar = useCapacidade('locais.criar')
  const podeEditar = useCapacidade('locais.editar')
  const podeStatus = useCapacidade('locais.status')
  const podeExportar = useCapacidade('locais.exportar')
  const podeConsultarRelatorio = useCapacidade('relatorios.consultar')
  const [estado, setEstado] = useState({ carregando: true, locais: [], campanhas: [], erro: '' })
  const [tentativa, setTentativa] = useState(0)
  const [busca, setBusca] = useState('')
  const [campanhaFiltro, setCampanhaFiltro] = useState('')
  const [situacao, setSituacao] = useState('')
  const [ordem, setOrdem] = useState({ campo: 'nome_local', direcao: 'asc' })
  const [pagina, setPagina] = useState(1)
  const [tamanho, setTamanho] = useState(10)
  const [formulario, setFormulario] = useState(null)
  const [campanhaCadastro, setCampanhaCadastro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [erroAcao, setErroAcao] = useState('')
  const [ocupado, setOcupado] = useState(null)
  useEffect(() => {
    let atual = true
    async function carregar() {
      try {
        const [locais, campanhas] = await Promise.all([listarLocais(), listarCampanhas()])
        const dados = prepararLocais(locais.data, campanhas.data)
        if (idCampanha && !campanhas.data.some(c => String(c.id_campanha) === String(idCampanha))) {
          throw Error('Campanha não encontrada.')
        }
        if (atual) setEstado({ carregando: false, locais: dados, campanhas: campanhas.data, erro: '' })
      } catch (e) {
        if (atual) setEstado({ carregando: false, locais: [], campanhas: [], erro: e.status === 403 ? 'Acesso não autorizado à consulta de locais.' : e.message })
      }
    }
    carregar()
    return () => { atual = false }
  }, [idCampanha, tentativa])
  const pronto = !estado.carregando && !estado.erro
  const campanha = idCampanha || campanhaFiltro
  const resultado = consultarLocais(estado.locais, { busca, campanha, situacao, ...ordem, pagina, tamanho })
  const totalContexto = estado.locais.filter(l => !idCampanha || String(l.id_campanha) === String(idCampanha)).length
  const nomeCampanha = estado.campanhas.find(c => String(c.id_campanha) === String(idCampanha))?.nome_campanha
  function recarregar() {
    setEstado({ carregando: true, locais: [], campanhas: [], erro: '' })
    setTentativa(n => n + 1)
  }
  function ordenar(campo) {
    setOrdem(o => ({ campo, direcao: o.campo === campo && o.direcao === 'asc' ? 'desc' : 'asc' }))
    setPagina(1)
  }
  function abrirNovo() {
    setCampanhaCadastro(campanha || '')
    setFormulario({ local: null }); setErroAcao(''); setMensagem('')
  }
  function salvo(local) {
    setEstado(s => ({ ...s, locais: prepararLocais(formulario.local
      ? s.locais.map(l => String(l.id_local) === String(local.id_local) ? { ...l, ...local } : l)
      : [{ ...local, id_campanha: local.id_campanha ?? campanhaCadastro }, ...s.locais], s.campanhas) }))
    setFormulario(null); setMensagem('Local salvo com sucesso.'); setPagina(1)
  }
  async function mudarStatus(local, status) {
    if (status === local.status) return
    setOcupado(String(local.id_local)); setErroAcao(''); setMensagem('')
    try {
      const resposta = await alterarStatusLocal(local.id_local, status)
      setEstado(s => ({ ...s, locais: s.locais.map(l => String(l.id_local) === String(local.id_local) ? { ...l, ...resposta.data } : l) }))
      setMensagem('Situação atualizada com sucesso.')
    } catch (e) { setErroAcao(e.message) }
    finally { setOcupado(null) }
  }
  async function exportar() {
    setOcupado('exportar'); setErroAcao('')
    let url
    try {
      const arquivo = await exportarLocaisExcel()
      url = URL.createObjectURL(arquivo)
      const link = document.createElement('a')
      link.href = url; link.download = 'inventario-locais.xlsx'
      document.body.appendChild(link); link.click(); link.remove()
      setMensagem('Exportação dos locais autorizados concluída.')
    } catch (e) { setErroAcao(e.message) }
    finally { if (url) URL.revokeObjectURL(url); setOcupado(null) }
  }
  return <div className="locais-layout locais-admin">
    <Sidebar />
    <main className="locais-content">
      <Header titulo="Locais" subtitulo="Gerenciamento de espaços confinados" />
      <section className="locais-main">
        <div className="locais-heading">
          <div>{idCampanha ? <><Link className="locais-back" to="/campanhas">← Voltar para campanhas</Link><p className="locais-contexto">{nomeCampanha || 'Locais da campanha'}</p></> : <p className="locais-contexto">Consulte e organize os locais do seu ambiente.</p>}</div>
          {podeCriar && <button className="local-button-primary" onClick={abrirNovo} disabled={!pronto || !!formulario || !estado.campanhas.length}>+ Novo local</button>}
        </div>
        {mensagem && <p className="locais-feedback" role="status">{mensagem}</p>}
        {erroAcao && <p className="locais-error" role="alert">{erroAcao}</p>}
        {formulario && <section className="local-form-container" aria-label={formulario.local ? 'Editar local' : 'Novo local'}>
          <h2>{formulario.local ? 'Editar local' : 'Novo local'}</h2>
          {!formulario.local && <div className="local-form-field locais-campanha-cadastro"><label htmlFor="campanha-cadastro">Campanha vinculada</label>
            <select id="campanha-cadastro" value={campanhaCadastro} disabled={!!idCampanha} onChange={e => setCampanhaCadastro(e.target.value)}>
              <option value="">Selecione uma campanha</option>{estado.campanhas.map(c => <option key={c.id_campanha} value={c.id_campanha}>{c.nome_campanha}</option>)}</select></div>}
          {(formulario.local || campanhaCadastro) ? <LocalForm key={formulario.local ? `editar-${formulario.local.id_local}` : `novo-${campanhaCadastro}`}
            idCampanha={formulario.local?.id_campanha || campanhaCadastro} localEdicao={formulario.local} onCancelar={() => setFormulario(null)} onLocalSalvo={salvo} />
            : <><p>Selecione uma campanha para cadastrar o local.</p><button className="local-button-secondary" onClick={() => setFormulario(null)}>Cancelar</button></>}
        </section>}
        <section className="locais-card" aria-label="Locais cadastrados" aria-busy={estado.carregando}>
          <div className="locais-card-heading"><h2>Locais cadastrados</h2><span>{pronto ? `${totalContexto} locais` : '—'}</span></div>
          <div className="locais-toolbar">
            <div className="locais-filtro locais-pesquisa"><label htmlFor="locais-busca">Pesquisar</label><input id="locais-busca" type="search" placeholder="Nome, setor ou campanha" value={busca} disabled={!pronto} onChange={e => { setBusca(e.target.value); setPagina(1) }} /></div>
            <div className="locais-filtro"><label htmlFor="locais-campanha">Campanha</label><select id="locais-campanha" value={campanha} disabled={!pronto || !!idCampanha} onChange={e => { setCampanhaFiltro(e.target.value); setPagina(1) }}><option value="">Todas as campanhas</option>{estado.campanhas.map(c => <option key={c.id_campanha} value={c.id_campanha}>{c.nome_campanha}</option>)}</select></div>
            <div className="locais-filtro"><label htmlFor="locais-situacao">Situação</label><select id="locais-situacao" value={situacao} disabled={!pronto} onChange={e => { setSituacao(e.target.value); setPagina(1) }}><option value="">Todas as situações</option><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select></div>
            <div className="locais-filtro locais-ordem-mobile"><label htmlFor="locais-ordem">Ordenar por</label><select id="locais-ordem" value={`${ordem.campo}:${ordem.direcao}`} onChange={e => { const [campo, direcao] = e.target.value.split(':'); setOrdem({ campo, direcao }); setPagina(1) }} disabled={!pronto}>{[['nome_local', 'Local'], ['nome_campanha', 'Campanha'], ['setor', 'Setor']].flatMap(([campo, titulo]) => ['asc', 'desc'].map(direcao => <option key={`${campo}:${direcao}`} value={`${campo}:${direcao}`}>{titulo} ({direcao === 'asc' ? 'A–Z' : 'Z–A'})</option>))}</select></div>
            {podeExportar && <button className="local-button-secondary locais-exportar" onClick={exportar} disabled={!pronto || ocupado === 'exportar'} title="Exporta todos os locais autorizados, independentemente dos filtros da tabela">{ocupado === 'exportar' ? 'Exportando...' : '↓ Exportar Excel'}</button>}
          </div>
          {podeExportar && pronto && <p className="locais-nota">A exportação inclui todos os locais autorizados, independentemente dos filtros desta tabela.</p>}
          {estado.carregando && <p className="locais-message" role="status">Carregando locais...</p>}
          {estado.erro && <div className="locais-error" role="alert"><p>{estado.erro}</p><button className="local-button-secondary" onClick={recarregar}>Tentar novamente</button></div>}
          {pronto && !estado.campanhas.length && podeCriar && <p className="locais-message">Cadastre uma <Link to="/campanhas">campanha</Link> antes de adicionar locais.</p>}
          {pronto && (resultado.total ? <div className="locais-table-container"><table className="locais-table">
            <caption className="locais-sr-only">Espaços confinados autorizados para consulta</caption>
            <thead><tr>{[['nome_local', 'Local'], ['nome_campanha', 'Campanha'], ['setor', 'Setor']].map(([campo, label]) => <th key={campo} scope="col" aria-sort={ordem.campo === campo ? ordem.direcao === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="locais-sort" onClick={() => ordenar(campo)}>{label} <span aria-hidden="true">{ordem.campo === campo ? ordem.direcao === 'asc' ? '↑' : '↓' : '↕'}</span></button></th>)}<th scope="col">Inventário</th><th scope="col">Situação</th>{idCampanha && <th scope="col">Relatório</th>}<th scope="col" className="locais-col-acoes">Ações</th></tr></thead>
            <tbody>{resultado.registros.map(local => <tr key={local.id_local}>
              <td data-label="Local"><strong>{local.nome_local}</strong>{local.endereco && <small className="locais-endereco">{local.endereco}</small>}</td>
              <td data-label="Campanha">{local.nome_campanha}</td><td data-label="Setor">{local.setor || '—'}</td>
              <td data-label="Inventário"><span className="locais-inventario">Não informado</span></td>
              <td data-label="Situação">{podeStatus ? <select className={`local-status-select locais-status locais-status-${local.status === 'ATIVO' ? 'ativo' : 'inativo'}`} value={local.status || ''} aria-label={`Situação de ${local.nome_local}`} disabled={!!formulario || ocupado === String(local.id_local)} onChange={e => mudarStatus(local, e.target.value)}><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select> : <span className={`locais-status locais-status-${local.status === 'ATIVO' ? 'ativo' : 'inativo'}`}>{local.status === 'ATIVO' ? 'Ativo' : local.status === 'INATIVO' ? 'Inativo' : 'Não informado'}</span>}</td>
              {idCampanha && <td data-label="Relatório"><BotaoPdfLocal key={`${local.id_local}:${tentativa}:${podeConsultarRelatorio}`} local={local} podeConsultar={podeConsultarRelatorio} /></td>}
              <td data-label="Ações"><div className="local-actions"><Link className="local-button-open" to={`/locais/${local.id_local}/inventario`}>Abrir inventário</Link>{podeEditar && <button className="local-button-edit" aria-label={`Editar ${local.nome_local}`} disabled={!!formulario || ocupado === String(local.id_local)} onClick={() => { setFormulario({ local }); setErroAcao(''); setMensagem('') }}>Editar</button>}</div></td>
            </tr>)}</tbody>
          </table></div> : <div className="locais-empty"><h3>{totalContexto ? 'Nenhum resultado encontrado' : 'Nenhum local cadastrado'}</h3><p>{totalContexto ? 'Ajuste a pesquisa ou os filtros para encontrar um local.' : 'Os locais cadastrados aparecerão aqui.'}</p></div>)}
          {pronto && <footer className="locais-paginacao">
            <p role="status">Exibindo {resultado.inicio}–{resultado.fim} de {resultado.total} locais{resultado.total !== totalContexto ? ` · ${totalContexto} no total` : ''}</p>
            <label>Por página <select aria-label="Registros por página" value={tamanho} onChange={e => { setTamanho(Number(e.target.value)); setPagina(1) }}>{[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
            <nav aria-label="Paginação de locais"><button className="local-button-secondary" disabled={resultado.pagina === 1} onClick={() => setPagina(resultado.pagina - 1)}>Anterior</button><span>Página {resultado.pagina} de {resultado.paginas}</span><button className="local-button-secondary" disabled={resultado.pagina === resultado.paginas} onClick={() => setPagina(resultado.pagina + 1)}>Próxima</button></nav>
          </footer>}
        </section>
      </section>
    </main>
  </div>
}
