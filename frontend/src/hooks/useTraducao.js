import { useTranslation } from 'react-i18next'
import { traduzir, traduzirMensagem, rotuloEnum } from '../i18n/apresentacao.js'
import { formatarData, formatarNumero } from '../i18n/formatacao.js'

export function useTraducao() {
  useTranslation()
  return { tr: traduzir, aviso: traduzirMensagem, rotulo: rotuloEnum,
    data: formatarData, numero: formatarNumero }
}
