import { useState } from 'react'
import { AuthContext } from './AuthContext.js'

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(() => {
    const usuarioSalvo = localStorage.getItem('usuario')

    return usuarioSalvo
      ? JSON.parse(usuarioSalvo)
      : null
  })

  const [token, setToken] = useState(() => {
    return localStorage.getItem('token')
  })

  function autenticar(dadosLogin) {
    const { token: novoToken, usuario: novoUsuario } =
      dadosLogin

    localStorage.setItem('token', novoToken)
    localStorage.setItem(
      'usuario',
      JSON.stringify(novoUsuario)
    )

    setToken(novoToken)
    setUsuario(novoUsuario)
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')

    setToken(null)
    setUsuario(null)
  }

  return (
    <AuthContext.Provider
      value={{
        usuario,
        token,
        autenticado: Boolean(token),
        autenticar,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}