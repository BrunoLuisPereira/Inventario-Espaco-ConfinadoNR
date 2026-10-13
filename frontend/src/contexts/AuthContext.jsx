
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

  /**
   * Atualiza os dados do usuário autenticado
   * sem modificar o token JWT.
   *
   * Deve receber os dados retornados pela API,
   * nunca valores não confirmados pelo servidor.
   */
  function atualizarUsuario(dadosAtualizados) {
    setUsuario((usuarioAnterior) => {
      if (!usuarioAnterior) {
        return usuarioAnterior
      }

      const usuarioAtualizado = {
        ...usuarioAnterior,
        nome: dadosAtualizados.nome,
        email: dadosAtualizados.email,
      }

      localStorage.setItem(
        'usuario',
        JSON.stringify(usuarioAtualizado)
      )

      return usuarioAtualizado
    })
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
        atualizarUsuario,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
