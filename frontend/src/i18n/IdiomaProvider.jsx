import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { I18nextProvider } from 'react-i18next'
import { acompanharIdiomaHtml, i18n } from './index.js'
import { IdiomaContext } from './idiomaContext.js'
import { useAuth } from '../hooks/useAuth.js'
import { modoDemo, sessaoAtual } from '../services/sessao.js'
import { atualizarIdioma } from '../services/api.js'
import { criarPreferenciaIdioma } from '../services/preferenciaIdioma.js'

export function IdiomaProvider({ children, instancia = i18n }) {
  const { usuario, token, autenticado, consultaIdioma } = useAuth()
  const preferencia = useMemo(() => criarPreferenciaIdioma({
    storage: modoDemo ? sessionStorage : localStorage,
    prefixo: modoDemo ? 'nr33-demo:idioma:v1:' : 'nr33:idioma:v1:',
    obterSessao: () => sessaoAtual().ler(),
    enviar: atualizarIdioma,
    aplicar: idioma => instancia.changeLanguage(idioma),
    online: () => navigator.onLine !== false,
  }), [instancia])
  const estado = useSyncExternalStore(preferencia.assinar, preferencia.estado)
  useEffect(() => {
    preferencia.ativar({ token, usuario }, autenticado, consultaIdioma)
  }, [preferencia, autenticado, token, usuario, consultaIdioma])
  useEffect(() => {
    const sincronizar = () => { void preferencia.sincronizar() }
    window.addEventListener('online', sincronizar)
    window.addEventListener('focus', sincronizar)
    window.addEventListener('storage', preferencia.atualizarLocal)
    return () => {
      window.removeEventListener('online', sincronizar)
      window.removeEventListener('focus', sincronizar)
      window.removeEventListener('storage', preferencia.atualizarLocal)
    }
  }, [preferencia])
  useEffect(() => acompanharIdiomaHtml(instancia, document), [instancia])
  return <I18nextProvider i18n={instancia}>
    <IdiomaContext.Provider value={{ alterarIdioma: preferencia.alterar, ...estado }}>
      {children}
    </IdiomaContext.Provider>
  </I18nextProvider>
}
