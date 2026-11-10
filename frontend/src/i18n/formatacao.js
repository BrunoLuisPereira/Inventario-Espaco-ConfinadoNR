import { i18n } from './index.js'

// Inglês britânico: dd/mm/yyyy, ponto decimal e vírgula para agrupamento.
export const localeAtivo = () => i18n.resolvedLanguage === 'en' ? 'en-GB' : 'pt-BR'

export function formatarNumero(valor, opcoes = {}) {
  if (valor == null || valor === '') return valor
  if (typeof valor === 'number') return Number.isFinite(valor) ? new Intl.NumberFormat(localeAtivo(), { maximumFractionDigits: 20, ...opcoes }).format(valor) : String(valor)
  const partes = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(valor))
  if (!partes) return String(valor)
  // NUMERIC vem como texto: não converter para Number, arredondar ou perder casas.
  const inteiro = (partes[1] && BigInt(partes[2]) === 0n ? '-' : '') + new Intl.NumberFormat(localeAtivo()).format(BigInt(partes[1] + partes[2]))
  const decimal = new Intl.NumberFormat(localeAtivo()).formatToParts(1.1).find(p => p.type === 'decimal').value
  return partes[3] ? inteiro + decimal + partes[3] : inteiro
}

export function formatarData(valor, opcoes = {}) {
  if (!valor) return ''
  const apenasData = typeof valor === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  const data = apenasData ? new Date(Date.UTC(+apenasData[1], +apenasData[2] - 1, +apenasData[3])) : new Date(valor)
  if (Number.isNaN(data.getTime())) return String(valor)
  return new Intl.DateTimeFormat(localeAtivo(), {
    day: '2-digit', month: '2-digit', year: 'numeric', ...opcoes,
    ...(apenasData ? { timeZone: 'UTC' } : {}),
  }).format(data)
}
