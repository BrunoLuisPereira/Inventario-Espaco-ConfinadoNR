const catalogo = require('../i18n/pdf.en.json');
const normalizarIdioma = valor => valor === 'en' ? 'en' : 'pt-BR';
const VERSAO_TEMPLATE = 'nr33-i18n-1';

// Contexto imutável criado por geração. Nunca traduzir dados livres com t/rotulo.
function criarIdiomaPdf(valor) {
  const idioma = normalizarIdioma(valor), locale = idioma === 'en' ? 'en-GB' : 'pt-BR';
  const t = (chave, parametros = {}) => (idioma === 'en' ? catalogo[chave] ?? chave : chave)
    .replace(/\{\{(\w+)\}\}/g, (_, nome) => String(parametros[nome] ?? ''));
  const texto = v => v == null || v === '' ? t('Não informado') : String(v);
  const rotulo = v => v == null || v === '' ? texto(v) : t(String(v));
  function numero(v, minimo = 2) {
    if (v == null || v === '') return texto(v);
    const partes = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(v));
    if (!partes) return texto(v);
    const inteiro = (partes[1] && BigInt(partes[2]) === 0n ? '-' : '') + new Intl.NumberFormat(locale).format(BigInt(partes[1] + partes[2]));
    const fracao = (partes[3] || '').padEnd(minimo, '0');
    const separador = new Intl.NumberFormat(locale).formatToParts(1.1).find(p => p.type === 'decimal').value;
    return inteiro + (fracao ? separador + fracao : '');
  }
  function data(v, hora = false) {
    if (!v) return texto(v);
    const apenasData = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const d = new Date(apenasData ? v + 'T12:00:00Z' : v);
    if (Number.isNaN(d.getTime())) return String(v);
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric',
      ...(hora ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' } : {}),
      timeZone: apenasData ? 'UTC' : 'America/Sao_Paulo' }).format(d);
  }
  return Object.freeze({ idioma, locale, t, texto, rotulo, numero, data });
}
module.exports = { criarIdiomaPdf, normalizarIdioma, VERSAO_TEMPLATE };
