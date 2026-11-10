import { useTraducao } from '../hooks/useTraducao.js'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Painel from '../components/layout/Painel'
import { listarLocais, listarUsuarios, listarRelatorios } from '../services/api'
const configuracoes = {
  locais: { titulo: 'Locais', carregar: listarLocais },
  usuarios: { titulo: 'Usuários', carregar: listarUsuarios },
  relatorios: { titulo: 'Relatórios', carregar: listarRelatorios },
}
export default function Listagem({ tipo }) {
  const { aviso, rotulo, tr } = useTraducao()

  const config = configuracoes[tipo]
  const [estado, setEstado] = useState({ carregando: true, dados: [], erro: '' })
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    let atual = true
    config.carregar().then(r => { if (atual) setEstado({ carregando: false, dados: r.data, erro: '' }) })
      .catch(e => { if (atual) setEstado({ carregando: false, dados: [], erro: e.message }) })
    return () => { atual = false }
  }, [config, tentativa])
  return <Painel titulo={tr(config.titulo)}>
    {tipo === 'usuarios' && <p>{tr("Novos usuários ingressam por") + ' '}<Link to="/convites">{tr("convite")}</Link>.</p>}
    {estado.carregando && <p role="status">{tr("Carregando...")}</p>}
    {estado.erro && <p role="alert">{aviso(estado.erro)} <button onClick={() => { setEstado({ carregando: true, dados: [], erro: '' }); setTentativa(n => n + 1) }}>{tr("Tentar novamente")}</button></p>}
    {!estado.carregando && !estado.erro && (estado.dados.length ? <ul className="conta-lista">{estado.dados.map(r => <li key={r.id_local || r.id_usuario || r.id_relatorio}>
      {tipo === 'locais' ? <Link to={`/locais/${r.id_local}/inventario`}>{r.nome_local}</Link> : tipo === 'usuarios' ? <><strong>{r.nome}</strong><span>{r.email} · {rotulo(r.perfil_acesso)} · {r.ativo ? tr('Ativo') : tr('Inativo')}</span></> : <Link to={`/locais/${r.id_local}/relatorio`}>{tr("Relatório #")}{r.id_relatorio} · {rotulo(r.status)}</Link>}
    </li>)}</ul> : <p>{tr("Nenhum registro encontrado.")}</p>)}
  </Painel>
}
