import { useEffect, useRef, useState } from 'react'
import { alterarPermissoesUsuario } from '../services/api'
import { perfisConvite, nomesPerfis, descricoesPerfis } from '../services/permissoes'
export default function EditarPermissoes({ usuario, aoCancelar, aoSalvar }) {
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
    <h2 id="permissoes-titulo">Editar permissões</h2>
    <p><strong>{usuario.nome}</strong><br />{usuario.email}</p>
    <p>Perfil atual: {nomesPerfis[usuario.perfil_acesso]}</p>
    <form onSubmit={salvar}>
      <label htmlFor="novo-perfil">Novo perfil</label>
      <select id="novo-perfil" value={perfil} disabled={ocupado} onChange={e => { setPerfil(e.target.value); setConfirmado(false) }}>{perfisConvite.map(p => <option key={p} value={p}>{nomesPerfis[p]}</option>)}</select>
      <p>{descricoesPerfis[perfil]}</p>
      <label className="permissoes-confirmacao"><input type="checkbox" checked={confirmado} disabled={ocupado} onChange={e => setConfirmado(e.target.checked)} /> Confirmo a alteração das permissões deste usuário.</label>
      {erro && <p role="alert">{erro}</p>}
      <div className="permissoes-botoes"><button type="button" onClick={aoCancelar} disabled={ocupado}>Cancelar</button><button type="submit" disabled={ocupado || !confirmado || perfil === usuario.perfil_acesso}>{ocupado ? 'Salvando...' : 'Salvar alterações'}</button></div>
    </form>
  </dialog>
}
