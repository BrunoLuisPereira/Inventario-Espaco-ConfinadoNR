import { createInstance } from 'i18next'
import navigationPt from './locales/pt-BR/navigation.json' with { type: 'json' }
import settingsPt from './locales/pt-BR/settings.json' with { type: 'json' }
import navigationEn from './locales/en/navigation.json' with { type: 'json' }
import settingsEn from './locales/en/settings.json' with { type: 'json' }
import { dominios } from './domains.js'

export const idiomaPadrao = 'pt-BR'
export const idiomasSuportados = Object.freeze(['pt-BR', 'en'])
export const recursos = {
  'pt-BR': { navigation: navigationPt, settings: settingsPt, ...Object.fromEntries(Object.entries(dominios).map(([nome, dados]) => [nome, dados['pt-BR']])) },
  en: { navigation: navigationEn, settings: settingsEn, ...Object.fromEntries(Object.entries(dominios).map(([nome, dados]) => [nome, dados.en])) },
}

export function normalizarIdioma(idioma) {
  return idiomasSuportados.includes(idioma) ? idioma : idiomaPadrao
}

// Catálogos locais: nenhuma detecção do navegador, persistência ou busca de rede.
export function criarI18n(idioma = idiomaPadrao) {
  const instancia = createInstance()
  instancia.init({
    resources: structuredClone(recursos),
    lng: normalizarIdioma(idioma),
    fallbackLng: idiomaPadrao,
    supportedLngs: [...idiomasSuportados],
    load: 'currentOnly',
    ns: Object.keys(recursos['pt-BR']),
    defaultNS: 'navigation',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    initAsync: false,
  })
  return instancia
}

export function acompanharIdiomaHtml(instancia, documento) {
  const aplicar = () => {
    documento.documentElement.lang = normalizarIdioma(instancia.resolvedLanguage || instancia.language)
    documento.title = instancia.t('brandAlt', { ns: 'navigation' })
  }
  aplicar()
  instancia.on('languageChanged', aplicar)
  return () => instancia.off('languageChanged', aplicar)
}

export const i18n = criarI18n()
