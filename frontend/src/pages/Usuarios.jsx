import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'
import { listarUsuarios } from '../services/api'
import { filtrarUsuarios, indicadoresUsuarios, nomePerfil } from '../services/usuarios'
import '../styles/Dashboard.css'
import '../styles/Usuarios.css'

export default function Usuarios() {
  const [estado, setEstado] = useState({ carregando: true, dados: [], erro: '' })
  const [busca, setBusca] = useState('')
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    let atual = true
    listarUsuarios().then(resposta => {
      if (!Array.isArray(resposta.data)) throw Error('Não foi possível carregar os usuários. Tente novamente.')
      if (atual) setEstado({ carregando: false, dados: resposta.data, erro: '' })
    }).catch(erro => {
      if (atual) setEstado({ carregando: false, dados: [], erro: erro.message })
    })
    return () => { atual = false }
  }, [tentativa])
  const indicadores = indicadoresUsuarios(estado.dados)
  const usuarios = filtrarUsuarios(estado.dados, busca)
  const pronto = !estado.carregando && !estado.erro
  function recarregar() {
    setEstado({ carregando: true, dados: [], erro: '' })
    setTentativa(n => n + 1)
  }
  return <div className="dashboard-layout usuarios-page">
    <Sidebar />
    <div className="dashboard-content">
      <Header titulo="Usuários" subtitulo="Gerencie os integrantes do seu ambiente" />
      <main className="usuarios-main">
        <div className="usuarios-actions">
          <Link className="usuarios-convidar" to="/convites"><span aria-hidden="true">＋</span> Convidar usuário</Link>
        </div>
        <dl className="usuarios-indicadores" aria-label="Indicadores de usuários">
          {[['Total de usuários', indicadores.total], ['Administradores', indicadores.administradores], ['Engenheiros', indicadores.engenheiros]].map(([titulo, valor]) =>
            <div className="usuarios-indicador" key={titulo}><dt>{titulo}</dt><dd>{pronto ? valor : '—'}</dd></div>)}
        </dl>
        <section className="usuarios-card" aria-labelledby="usuarios-titulo" aria-busy={estado.carregando}>
          <div className="usuarios-card-header">
            <h2 id="usuarios-titulo">Usuários cadastrados</h2>
            <div className="usuarios-busca">
              <label htmlFor="usuarios-busca">Buscar por nome ou e-mail</label>
              <input id="usuarios-busca" type="search" placeholder="Buscar por nome ou e-mail" value={busca} onChange={e => setBusca(e.target.value)} disabled={!pronto} />
            </div>
          </div>
          {estado.carregando && <p className="usuarios-mensagem" role="status">Carregando usuários...</p>}
          {estado.erro && <div className="usuarios-mensagem usuarios-erro" role="alert"><p>{estado.erro}</p><button type="button" onClick={recarregar}>Tentar novamente</button></div>}
          {pronto && (usuarios.length ? <>
            <p className="usuarios-resultados" role="status">{usuarios.length} de {estado.dados.length} usuários</p>
            <table className="usuarios-tabela">
              <caption className="usuarios-sr-only">Integrantes do seu ambiente</caption>
              <thead><tr><th scope="col">Usuário</th><th scope="col">E-mail</th><th scope="col">Perfil</th><th scope="col">Status</th></tr></thead>
              <tbody>{usuarios.map(usuario => <tr key={usuario.id_usuario}>
                <td><div className="usuarios-identidade"><span className="usuarios-avatar" aria-hidden="true">{usuario.nome?.trim().charAt(0).toLocaleUpperCase('pt-BR') || '?'}</span><strong>{usuario.nome}</strong></div></td>
                <td data-label="E-mail" className="usuarios-email">{usuario.email}</td>
                <td data-label="Perfil"><span className={`usuarios-perfil ${usuario.perfil_acesso === 'ADMINISTRADOR' ? 'usuarios-perfil-admin' : ''}`}>{nomePerfil(usuario.perfil_acesso)}</span></td>
                <td data-label="Status"><span className={`usuarios-status ${usuario.ativo ? 'usuarios-ativo' : 'usuarios-inativo'}`}><span aria-hidden="true">●</span> {usuario.ativo ? 'Ativo' : 'Inativo'}</span></td>
              </tr>)}</tbody>
            </table>
          </> : <p className="usuarios-mensagem" role="status">{estado.dados.length ? 'Nenhum usuário encontrado para esta busca.' : 'Nenhum usuário cadastrado neste ambiente.'}</p>)}
        </section>
      </main>
    </div>
  </div>
}
