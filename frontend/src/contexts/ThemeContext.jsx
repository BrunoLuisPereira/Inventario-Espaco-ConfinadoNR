import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { ThemeContext } from './themeContext'

const CHAVE_TEMA = 'inventario-tema'

function obterTemaInicial() {
  const temaSalvo = localStorage.getItem(CHAVE_TEMA)

  if (
    temaSalvo === 'light' ||
    temaSalvo === 'dark' ||
    temaSalvo === 'system'
  ) {
    return temaSalvo
  }

  return 'system'
}

function obterTemaDoSistema() {
  return window.matchMedia(
    '(prefers-color-scheme: dark)'
  ).matches
    ? 'dark'
    : 'light'
}

export function ThemeProvider({ children }) {
  const [tema, setTema] = useState(obterTemaInicial)

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      '(prefers-color-scheme: dark)'
    )

    const aplicarTema = () => {
      const temaAplicado =
        tema === 'system'
          ? obterTemaDoSistema()
          : tema

      document.documentElement.setAttribute(
        'data-theme',
        temaAplicado
      )
    }

    aplicarTema()

    if (tema === 'system') {
      mediaQuery.addEventListener(
        'change',
        aplicarTema
      )
    }

    localStorage.setItem(CHAVE_TEMA, tema)

    return () => {
      mediaQuery.removeEventListener(
        'change',
        aplicarTema
      )
    }
  }, [tema])

  const value = useMemo(
    () => ({
      tema,
      setTema,
    }),
    [tema]
  )

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}