import matriz from '../../../shared/permissoes.json' with { type: 'json' }

export const modoDemo = import.meta.env?.MODE === 'demo'
export const eventoSessaoExpirada = 'nr33:sessao-expirada'
const LIMITE_STORAGE = 8192
const invalida = () => { throw new Error('Resposta de sessão inválida.') }

function objetoPlano(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(valor))) invalida()
}
function campo(objeto, nome) {
  const descritor = Object.getOwnPropertyDescriptor(objeto, nome)
  if (descritor && !Object.hasOwn(descritor, 'value')) invalida()
  return descritor?.value
}
function texto(valor, limite) {
  if (typeof valor !== 'string' || !valor.trim() || valor.length > limite) invalida()
  return valor
}
function id(valor) {
  if (typeof valor === 'string' && (!/^[1-9]\d{0,15}$/.test(valor) || !Number.isSafeInteger(Number(valor)))) invalida()
  else if (typeof valor !== 'string' && (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor <= 0)) invalida()
  return valor
}

export function validarSessao(entrada) {
  objetoPlano(entrada)
  const token = texto(campo(entrada, 'token'), LIMITE_STORAGE)
  if (/\s/.test(token) || [...token].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) invalida()
  const origem = campo(entrada, 'usuario')
  objetoPlano(origem)
  const ambiente = campo(origem, 'id_ambiente')
  if (typeof ambiente !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ambiente)) invalida()
  const perfil = campo(origem, 'perfil_acesso'), fundador = campo(origem, 'eh_fundador')
  if (!matriz.perfis.includes(perfil) || typeof fundador !== 'boolean') invalida()
  const usuario = {
    id_usuario: id(campo(origem, 'id_usuario')), id_ambiente: ambiente,
    nome: texto(campo(origem, 'nome'), 120), email: texto(campo(origem, 'email'), 180),
    perfil_acesso: perfil, eh_fundador: fundador,
  }
  const idioma = campo(origem, 'idioma'), nomeAmbiente = campo(origem, 'nome_ambiente')
  if (idioma !== undefined) {
    if (!['pt-BR', 'en'].includes(idioma)) invalida()
    usuario.idioma = idioma
  }
  if (nomeAmbiente !== undefined) usuario.nome_ambiente = texto(nomeAmbiente, 180)
  return Object.freeze({ token, usuario: Object.freeze(usuario) })
}

export function criarSessao(storage, prefixo = '') {
  const chave = nome => `${prefixo}${nome}`
  return {
    ler() {
      try {
        const token = storage.getItem(chave('token'))
        const textoUsuario = storage.getItem(chave('usuario'))
        if (typeof textoUsuario !== 'string' || textoUsuario.length > LIMITE_STORAGE) invalida()
        return validarSessao({ token, usuario: JSON.parse(textoUsuario) })
      } catch { return { token: null, usuario: null } }
    },
    salvar(entrada) {
      const dados = validarSessao(entrada)
      const serializado = JSON.stringify(dados.usuario)
      let anterior, retirouToken = false
      try {
        anterior = { token: storage.getItem(chave('token')), usuario: storage.getItem(chave('usuario')) }
        // Token é o marcador de conclusão: nunca publicar token com usuário parcial.
        storage.removeItem(chave('token'))
        retirouToken = true
        storage.setItem(chave('usuario'), serializado)
        storage.setItem(chave('token'), dados.token)
        return dados
      } catch {
        if (retirouToken) {
          try {
            if (anterior.usuario === null) storage.removeItem(chave('usuario'))
            else storage.setItem(chave('usuario'), anterior.usuario)
            if (anterior.token !== null) storage.setItem(chave('token'), anterior.token)
          } catch {
            try { storage.removeItem(chave('token')) } catch { /* O token já foi retirado antes das gravações. */ }
          }
        }
        throw new Error('Não foi possível salvar a sessão.')
      }
    },
    limpar() {
      storage.removeItem(chave('token'))
      storage.removeItem(chave('usuario'))
    },
  }
}
export function sessaoAtual() {
  return criarSessao(modoDemo ? sessionStorage : localStorage, modoDemo ? 'nr33-demo:' : '')
}
