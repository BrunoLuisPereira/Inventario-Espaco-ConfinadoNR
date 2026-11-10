import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { idiomaPadrao } from '../i18n/index.js'
import { IdiomaContext } from '../i18n/idiomaContext.js'

export function useIdioma() {
  const { i18n } = useTranslation()
  const contexto = useContext(IdiomaContext)
  if (!contexto) throw new Error('useIdioma requer IdiomaProvider')
  return {
    idioma: i18n.resolvedLanguage || idiomaPadrao,
    ...contexto,
  }
}
