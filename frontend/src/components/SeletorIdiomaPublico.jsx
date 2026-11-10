import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth.js'
import { useIdioma } from '../hooks/useIdioma.js'

// Sem sessão, a escolha é transitória; com sessão, usa a preferência existente.
export default function SeletorIdiomaPublico() {
  const { t, i18n } = useTranslation('settings')
  const { autenticado } = useAuth()
  const { alterarIdioma } = useIdioma()
  return <div className="idioma-publico">
    <label htmlFor="idioma-publico">{t('languageLabel')}</label>
    <select id="idioma-publico" value={i18n.resolvedLanguage || 'pt-BR'}
      onChange={event => autenticado ? alterarIdioma(event.target.value) : i18n.changeLanguage(event.target.value)}>
      <option value="pt-BR" lang="pt-BR">Português (Brasil)</option>
      <option value="en" lang="en">English</option>
    </select>
  </div>
}
