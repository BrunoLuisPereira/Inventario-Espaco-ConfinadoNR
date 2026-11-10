import { useTraducao } from '../hooks/useTraducao.js'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'
import { listarUsuarios } from '../services/api'
import { filtrarUsuarios, indicadoresUsuarios, nomePerfil } from '../services/usuarios'
import '../styles/Dashboard.css'
import '../styles/Usuarios.css'
import EditarPermissoes from '../components/EditarPermissoes'
import AuditoriaPermissoes from '../components/AuditoriaPermissoes'
import { useAuth } from '../hooks/useAuth'
import { pode } from '../services/permissoes'

export default function Usuarios() {
  const { aviso, numero, tr } = useTraducao()

  const { usuario: autenticado } = useAuth()
  const [editando, setEditando] = useState(null)
  const [mensagem, setMensagem] = useState('')
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
      <Header titulo={tr("Usuários")} subtitulo={tr("Gerencie os integrantes do seu ambiente")} />
      <main className="usuarios-main">
        {mensagem && <p role="status">{aviso(mensagem)}</p>}
        {editando && <EditarPermissoes key={editando.id_usuario} usuario={editando} aoCancelar={() => setEditando(null)} aoSalvar={atualizado => {
          setEstado(s => ({ ...s, dados: s.dados.map(u => String(u.id_usuario) === String(atualizado.id_usuario) ? atualizado : u) }))
          setEditando(null); setMensagem('Permissões atualizadas com sucesso.')
        }} />}
        <div className="usuarios-actions">
          <Link className="usuarios-convidar" to="/convites"><span aria-hidden="true">＋</span>{' ' + tr("Convidar usuário")}</Link>
        </div>
        <dl className="usuarios-indicadores" aria-label={tr("Indicadores de usuários")}>
          {[[tr('Total de usuários'), indicadores.total], [tr('Administradores'), indicadores.administradores], [tr('Engenheiros'), indicadores.engenheiros]].map(([titulo, valor]) =>
            <div className="usuarios-indicador" key={titulo}><dt>{tr(titulo)}</dt><dd>{pronto ? valor : '—'}</dd></div>)}
        </dl>
        <section className="usuarios-card" aria-labelledby="usuarios-titulo" aria-busy={estado.carregando}>
          <div className="usuarios-card-header">
            <h2 id="usuarios-titulo">{tr("Usuários cadastrados")}</h2>
            <div className="usuarios-busca">
              <label htmlFor="usuarios-busca">{tr("Buscar por nome ou e-mail")}</label>
              <input id="usuarios-busca" type="search" placeholder={tr("Buscar por nome ou e-mail")} value={busca} onChange={e => setBusca(e.target.value)} disabled={!pronto} />
            </div>
          </div>
          {estado.carregando && <p className="usuarios-mensagem" role="status">{tr("Carregando usuários...")}</p>}
          {estado.erro && <div className="usuarios-mensagem usuarios-erro" role="alert"><p>{aviso(estado.erro)}</p><button type="button" onClick={recarregar}>{tr("Tentar novamente")}</button></div>}
          {pronto && (usuarios.length ? <>
            <p className="usuarios-resultados" role="status">{numero(usuarios.length)}{' ' + tr("de") + ' '}{numero(estado.dados.length)}{' ' + tr("usuários")}</p>
            <table className="usuarios-tabela">
              <caption className="usuarios-sr-only">{tr("Integrantes do seu ambiente")}</caption>
              <thead><tr><th scope="col">{tr("Usuário")}</th><th scope="col">{tr("E-mail")}</th><th scope="col">{tr("Perfil")}</th><th scope="col">{tr("Status")}</th><th scope="col">{tr("Ações")}</th></tr></thead>
              <tbody>{usuarios.map(usuario => <tr key={usuario.id_usuario}>
                <td><div className="usuarios-identidade"><span className="usuarios-avatar" aria-hidden="true">{usuario.nome?.trim().charAt(0).toLocaleUpperCase('pt-BR') || '?'}</span><strong>{usuario.nome}</strong></div></td>
                <td data-label={tr("E-mail")} className="usuarios-email">{usuario.email}</td>
                <td data-label={tr("Perfil")}><span className={`usuarios-perfil ${usuario.perfil_acesso === 'ADMINISTRADOR' ? 'usuarios-perfil-admin' : ''}`}>{tr(nomePerfil(usuario.perfil_acesso))}</span></td>
                <td data-label={tr("Status")}><span className={`usuarios-status ${usuario.ativo ? 'usuarios-ativo' : 'usuarios-inativo'}`}><span aria-hidden="true">●</span> {usuario.ativo ? tr('Ativo') : tr('Inativo')}</span></td>
                <td data-label={tr("Ações")}>{usuario.eh_fundador ? <span>{tr("Fundador")}</span> : pode(autenticado, 'usuarios.permissoes.alterar') && usuario.id_convite_origem ? <button className="usuarios-editar" type="button" onClick={() => { setMensagem(''); setEditando(usuario) }}>{tr("Editar permissões")}</button> : <span>{tr("Origem não comprovada")}</span>}</td>
              </tr>)}</tbody>
            </table>
          </> : <p className="usuarios-mensagem" role="status">{estado.dados.length ? tr('Nenhum usuário encontrado para esta busca.') : tr('Nenhum usuário cadastrado neste ambiente.')}</p>)}
        </section>
        {pronto && pode(autenticado, 'usuarios.auditoria.consultar') && <AuditoriaPermissoes usuarios={estado.dados} />}
      </main>
    </div>
  </div>
}
