import { useState } from 'react'
import Painel from '../components/layout/Painel'
import { emitirConvite } from '../services/api'
import { mensagemEnvioConvite } from '../services/conta'
import { perfisConvite, nomesPerfis, descricoesPerfis } from '../services/permissoes'
export default function Convites() {
  const [email, setEmail] = useState('')
  const [perfilAcesso, setPerfil] = useState('ENGENHEIRO_SEGURANCA')
  const [link, setLink] = useState('')
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [ocupado, setOcupado] = useState(false)
  async function enviar(e) {
    e.preventDefault()
    if (ocupado) return
    setOcupado(true); setErro(''); setLink(''); setMensagem('')
    try {
      const r = await emitirConvite({ email, perfilAcesso })
      setMensagem(mensagemEnvioConvite(r.data.envio?.status))
      if (r.data.envio?.status !== 'enviado') setLink(r.data.link || '')
      setEmail('')
    }
    catch (error) { setErro(error.message) } finally { setOcupado(false) }
  }
  return <Painel titulo="Convites"><p>O convidado receberá por e-mail um link exclusivo para criar sua conta no seu ambiente.</p>
    <form onSubmit={enviar} className="conta-form">
      <label htmlFor="convite-email">E-mail do convidado</label><input id="convite-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
      <label htmlFor="convite-perfil">Perfil</label><select id="convite-perfil" value={perfilAcesso} onChange={e => setPerfil(e.target.value)} aria-describedby="convite-permissoes">{perfisConvite.map(perfil => <option key={perfil} value={perfil}>{nomesPerfis[perfil]}</option>)}</select>
      <p id="convite-permissoes">{descricoesPerfis[perfilAcesso]}</p>
      <button disabled={ocupado}>{ocupado ? 'Criando e enviando...' : 'Enviar convite'}</button>
    </form>
    {erro && <p role="alert">{erro}</p>}
    {mensagem && <p role="status">{mensagem}</p>}
    {link && <section><h2>Compartilhamento manual</h2><p>Você pode enviar este link por um canal privado. Ele será mostrado somente nesta tela.</p><label htmlFor="convite-link">Link privado de aceite</label><textarea id="convite-link" readOnly value={link} rows={4} /><button onClick={() => setLink('')}>Ocultar link</button></section>}
  </Painel>
}
