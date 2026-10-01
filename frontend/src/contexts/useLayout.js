import { useContext } from 'react'
import LayoutContext from './layoutContext'

export function useLayout() {
  const context = useContext(LayoutContext)

  if (!context) {
    throw new Error(
      'useLayout deve ser utilizado dentro de LayoutProvider',
    )
  }

  return context
}