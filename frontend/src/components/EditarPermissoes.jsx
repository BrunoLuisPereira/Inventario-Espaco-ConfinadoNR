import { useTraducao } from '../hooks/useTraducao.js'
import { useEffect, useRef, useState } from 'react'
import { alterarPermissoesUsuario } from '../services/api'
import { perfisConvite, nomesPerfis, descricoesPerfis } from '../services/permissoes'
export default function EditarPermissoes({ usuario, aoCancelar, aoSalvar }) {
  const { aviso, rotulo, tr } = useTraducao()

  const dialog = useRef(null)
  const [perfil, setPerfil] = useState(usuario.perfil_acesso)
  const [confirmado, setConfirmado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  useEffect(() => {
    const anterior = document.activeElement
    dialog.current.showModal()
    return () => { anterior?.focus() }
  }, [])
  async function salvar(e) {
    e.preventDefault()
    if (ocupado || !confirmado || !perfisConvite.includes(perfil)) return
    setOcupado(true); setErro('')
    try { const r = await alterarPermissoesUsuario(usuario.id_usuario, perfil); aoSalvar(r.data) }
    catch (error) { setErro(error.message); setOcupado(false) }
  }
  return <dialog ref={dialog} className="permissoes-modal" aria-labelledby="permissoes-titulo" onCancel={e => { e.preventDefault(); if (!ocupado) aoCancelar() }}>
    <h2 id="permissoes-titulo">{tr("Editar permissões")}</h2>
    <p><strong>{usuario.nome}</strong><br />{usuario.email}</p>
    <p>{tr("Perfil atual:") + ' '}{rotulo(nomesPerfis[usuario.perfil_acesso])}</p>
    <form onSubmit={salvar}>
      <label htmlFor="novo-perfil">{tr("Novo perfil")}</label>
      <select id="novo-perfil" value={perfil} disabled={ocupado} onChange={e => { setPerfil(e.target.value); setConfirmado(false) }}>{perfisConvite.map(p => <option key={p} value={p}>{tr(nomesPerfis[p])}</option>)}</select>
      <p>{tr(descricoesPerfis[perfil])}</p>
      <label className="permissoes-confirmacao"><input type="checkbox" checked={confirmado} disabled={ocupado} onChange={e => setConfirmado(e.target.checked)} />{' ' + tr("Confirmo a alteração das permissões deste usuário.")}</label>
      {erro && <p role="alert">{aviso(erro)}</p>}
      <div className="permissoes-botoes"><button type="button" onClick={aoCancelar} disabled={ocupado}>{tr("Cancelar")}</button><button type="submit" disabled={ocupado || !confirmado || perfil === usuario.perfil_acesso}>{ocupado ? tr('Salvando...') : tr('Salvar alterações')}</button></div>
    </form>
  </dialog>
}
