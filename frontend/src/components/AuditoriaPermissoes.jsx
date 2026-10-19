import { useState } from 'react'
import { listarAuditoriaPerfis } from '../services/api'
import { nomesPerfis } from '../services/permissoes'

export default function AuditoriaPermissoes({ usuarios }) {
  const [estado, setEstado] = useState({ dados: null, ocupado: false, erro: '' })
  async function consultar() {
    setEstado(s => ({ ...s, ocupado: true, erro: '' }))
    try {
      const r = await listarAuditoriaPerfis()
      if (!Array.isArray(r.data)) throw Error('Resposta de auditoria inválida.')
      setEstado({ dados: r.data, ocupado: false, erro: '' })
    } catch (e) { setEstado({ dados: null, ocupado: false, erro: e.message }) }
  }
  const nome = id => usuarios.find(u => String(u.id_usuario) === String(id))?.nome || `Usuário #${id}`
  return <section className="usuarios-card usuarios-auditoria" aria-labelledby="auditoria-titulo">
    <h2 id="auditoria-titulo">Auditoria de permissões</h2>
    <p>Consulte as últimas 200 mudanças de perfil do seu ambiente.</p>
    <button type="button" disabled={estado.ocupado} onClick={consultar}>{estado.ocupado ? 'Consultando...' : 'Consultar auditoria'}</button>
    {estado.erro && <p role="alert">{estado.erro}</p>}
    {estado.dados && (estado.dados.length ? <ul>{estado.dados.map(h => <li key={h.id_auditoria}>
      <strong>{nome(h.id_usuario_afetado)}</strong>: {nomesPerfis[h.perfil_anterior]} → {nomesPerfis[h.perfil_novo]}.
      {' '}Responsável: {nome(h.id_usuario_responsavel)}. <time dateTime={h.data_hora}>{new Date(h.data_hora).toLocaleString('pt-BR')}</time>
    </li>)}</ul> : <p role="status">Nenhuma alteração de perfil registrada.</p>)}
  </section>
}
