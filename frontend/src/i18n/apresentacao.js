import { i18n, recursos } from './index.js'

const normalizar = texto => texto.replace(/\s+/g, ' ').trim()
const referencias = new Map()
for (const [ns, catalogo] of Object.entries(recursos['pt-BR'])) {
  for (const [key, texto] of Object.entries(catalogo)) {
    if (!referencias.has(normalizar(texto))) referencias.set(normalizar(texto), { ns, key })
  }
}
const escapar = texto => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const modelos = [...referencias].filter(([texto]) => /{{\w+}}/.test(texto)).map(([texto, ref]) => {
  const parametros = [...texto.matchAll(/{{(\w+)}}/g)].map(m => m[1])
  const partes = texto.split(/{{\w+}}/g).map(escapar)
  return { texto, ref, parametros, regex: new RegExp('^' + partes.join('(.*?)') + '$') }
})
function resolver(ref, parametros = {}) {
  return i18n.t(ref.key, { ns: ref.ns, keySeparator: false, nsSeparator: false, ...parametros })
}
// Apenas rótulos controlados. Nunca aplicar a descrições, nomes ou observações cadastrados.
export function traduzir(texto, parametros) {
  if (typeof texto !== 'string') return texto
  const ref = referencias.get(normalizar(texto))
  return ref ? resolver(ref, parametros) : texto
}
export function rotuloEnum(valor) {
  return traduzir(valor)
}

// Mensagens são mantidas no estado em português e traduzidas ao renderizar.
// Não altera Error, status, code/details, regras, validações ou contratos da API.
export function traduzirMensagem(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return texto
  if (/\r?\n/.test(texto)) return texto.split(/(\r?\n+)/).map(parte => /\r?\n/.test(parte) ? parte : traduzirMensagem(parte)).join('')
  const normal = normalizar(texto)
  if (referencias.has(normal)) return traduzir(normal)
  for (const modelo of modelos) {
    const match = modelo.regex.exec(normal)
    if (!match) continue
    const rotulosControlados = /^(Resposta inválida:|Responda |{{p0}}: máximo|Convite criado\.)/.test(modelo.texto)
    return resolver(modelo.ref, Object.fromEntries(modelo.parametros.map((nome, i) =>
      [nome, rotulosControlados ? traduzir(match[i + 1]) : match[i + 1]])))
  }
  const partes = normal.split(/(?<=\.)\s+|\n/)
  if (partes.length > 1 && partes.every(parte => referencias.has(parte))) return partes.map(traduzir).join(' ')
  const separador = normal.indexOf(': ')
  if (separador > 0) {
    const prefixo = normal.slice(0, separador), rotulos = normal.slice(separador + 2).replace(/\.$/, '').split(', ')
    if (referencias.has(prefixo) && rotulos.every(rotulo => referencias.has(rotulo))) {
      return `${traduzir(prefixo)}: ${rotulos.map(traduzir).join(', ')}.`
    }
  }
  // Mensagens novas do servidor não exigem alterar o backend e não expõem detalhes.
  return i18n.resolvedLanguage === 'en' ? traduzir('Não foi possível concluir a operação. Tente novamente.') : texto
}
