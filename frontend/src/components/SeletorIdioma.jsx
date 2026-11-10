import { useTranslation } from 'react-i18next'
import { useIdioma } from '../hooks/useIdioma.js'

export default function SeletorIdioma() {
  const { t } = useTranslation('settings')
  const { idioma, alterarIdioma } = useIdioma()
  return <div className="header-idioma">
    <label htmlFor="idioma-cabecalho">{t('languageLabel')}</label>
    <select id="idioma-cabecalho" value={idioma} onChange={event => alterarIdioma(event.target.value)}>
      <option value="pt-BR" lang="pt-BR">Português (Brasil)</option>
      <option value="en" lang="en">English</option>
    </select>
  </div>
}
