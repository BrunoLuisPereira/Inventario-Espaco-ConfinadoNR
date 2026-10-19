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
  const config = configuracoes[tipo]
  const [estado, setEstado] = useState({ carregando: true, dados: [], erro: '' })
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    let atual = true
    config.carregar().then(r => { if (atual) setEstado({ carregando: false, dados: r.data, erro: '' }) })
      .catch(e => { if (atual) setEstado({ carregando: false, dados: [], erro: e.message }) })
    return () => { atual = false }
  }, [config, tentativa])
  return <Painel titulo={config.titulo}>
    {tipo === 'usuarios' && <p>Novos usuários ingressam por <Link to="/convites">convite</Link>.</p>}
    {estado.carregando && <p role="status">Carregando...</p>}
    {estado.erro && <p role="alert">{estado.erro} <button onClick={() => { setEstado({ carregando: true, dados: [], erro: '' }); setTentativa(n => n + 1) }}>Tentar novamente</button></p>}
    {!estado.carregando && !estado.erro && (estado.dados.length ? <ul className="conta-lista">{estado.dados.map(r => <li key={r.id_local || r.id_usuario || r.id_relatorio}>
      {tipo === 'locais' ? <Link to={`/locais/${r.id_local}/inventario`}>{r.nome_local}</Link> : tipo === 'usuarios' ? <><strong>{r.nome}</strong><span>{r.email} · {r.perfil_acesso} · {r.ativo ? 'Ativo' : 'Inativo'}</span></> : <Link to={`/locais/${r.id_local}/relatorio`}>Relatório #{r.id_relatorio} · {r.status}</Link>}
    </li>)}</ul> : <p>Nenhum registro encontrado.</p>)}
  </Painel>
}
