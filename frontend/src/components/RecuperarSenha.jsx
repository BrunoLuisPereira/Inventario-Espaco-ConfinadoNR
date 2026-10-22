import { useEffect, useRef, useState } from 'react'

// Sem endpoint ou provedor real: não faz requisições nem simula envio.
export default function RecuperarSenha({ onClose }) {
  const dialog = useRef(null)
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    const anterior = document.activeElement
    const janela = dialog.current
    janela.showModal()
    janela.querySelector('input').focus()
    return () => {
      janela.close()
      anterior?.focus()
    }
  }, [])

  function validar(campo) {
    const invalido = !campo.validity.valid || !campo.value.trim()
    setErro(invalido ? 'Informe um e-mail válido.' : '')
    return !invalido
  }

  function conterFoco(event) {
    if (event.key !== 'Tab') return
    const controles = [...dialog.current.querySelectorAll('button:not(:disabled), input')]
    const primeiro = controles[0]
    const ultimo = controles.at(-1)
    if (event.shiftKey && document.activeElement === primeiro) {
      event.preventDefault()
      ultimo.focus()
    } else if (!event.shiftKey && document.activeElement === ultimo) {
      event.preventDefault()
      primeiro.focus()
    }
  }

  return (
    <dialog ref={dialog} className="recuperacao-dialog" aria-labelledby="recuperacao-titulo" aria-describedby="recuperacao-descricao recuperacao-indisponivel" onKeyDown={conterFoco} onCancel={event => { event.preventDefault(); onClose() }}>
      <div className="recuperacao-header">
        <h2 id="recuperacao-titulo">Recuperar senha</h2>
        <button type="button" className="recuperacao-fechar" aria-label="Fechar recuperação de senha" onClick={onClose}>×</button>
      </div>
      <p id="recuperacao-descricao">Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.</p>
      <form noValidate onSubmit={event => { event.preventDefault(); validar(event.currentTarget.elements.emailRecuperacao) }}>
        <div className="form-group">
          <label htmlFor="email-recuperacao">E-mail</label>
          <input id="email-recuperacao" name="emailRecuperacao" type="email" autoComplete="email" placeholder="seu@email.com" required autoFocus value={email} aria-invalid={Boolean(erro)} aria-describedby={erro ? 'recuperacao-erro' : undefined} onBlur={event => validar(event.target)} onChange={event => { setEmail(event.target.value); setErro('') }} />
        </div>
        {erro && <p id="recuperacao-erro" className="login-error" role="alert">{erro}</p>}
        <p id="recuperacao-indisponivel" role="status">Envio de recuperação indisponível no momento. O serviço de e-mail ainda não foi integrado.</p>
        <div className="recuperacao-acoes">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled aria-describedby="recuperacao-indisponivel">Enviar link</button>
        </div>
      </form>
    </dialog>
  )
}
