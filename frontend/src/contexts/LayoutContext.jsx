import {
  useCallback,
  useState,
} from 'react'

import LayoutContext from './layoutContext'

export function LayoutProvider({ children }) {
  const [menuAberto, setMenuAberto] = useState(false)

  const abrirMenu = useCallback(() => {
    setMenuAberto(true)
  }, [])

  const fecharMenu = useCallback(() => {
    setMenuAberto(false)
  }, [])

  const alternarMenu = useCallback(() => {
    setMenuAberto((estadoAtual) => !estadoAtual)
  }, [])

  return (
    <LayoutContext.Provider
      value={{
        menuAberto,
        abrirMenu,
        fecharMenu,
        alternarMenu,
      }}
    >
      {children}
    </LayoutContext.Provider>
  )
}