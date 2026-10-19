import { useState } from 'react'
import Painel from '../components/layout/Painel'
import { emitirConvite } from '../services/api'
import { linkConvite } from '../services/conta'
export default function Convites() {
  const [email, setEmail] = useState('')
  const [perfilAcesso, setPerfil] = useState('ENGENHEIRO_SEGURANCA')
  const [link, setLink] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  async function enviar(e) {
    e.preventDefault()
    if (ocupado) return
    setOcupado(true); setErro(''); setLink('')
    try { const r = await emitirConvite({ email, perfilAcesso }); setLink(linkConvite(window.location.origin, r.data.token)); setEmail('') }
    catch (error) { setErro(error.message) } finally { setOcupado(false) }
  }
  return <Painel titulo="Convites"><p>Convide uma pessoa para seu ambiente. Nenhum e-mail será enviado automaticamente.</p>
    <form onSubmit={enviar} className="conta-form">
      <label htmlFor="convite-email">E-mail do convidado</label><input id="convite-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
      <label htmlFor="convite-perfil">Perfil</label><select id="convite-perfil" value={perfilAcesso} onChange={e => setPerfil(e.target.value)}><option value="ENGENHEIRO_SEGURANCA">Engenheiro de segurança</option><option value="ADMINISTRADOR">Administrador</option></select>
      <button disabled={ocupado}>{ocupado ? 'Criando...' : 'Criar convite'}</button>
    </form>
    {erro && <p role="alert">{erro}</p>}
    {link && <section role="status"><h2>Convite criado</h2><p>Copie e envie este link por um canal privado. Ele será mostrado somente nesta tela.</p><label htmlFor="convite-link">Link privado de aceite</label><textarea id="convite-link" readOnly value={link} rows={4} /><button onClick={() => setLink('')}>Ocultar link</button></section>}
  </Painel>
}
