import { pode } from './permissoes.js'
export const podeAdministrar = usuario => pode(usuario, 'usuarios.consultar')
export function mensagemEnvioConvite(status) {
  if (status === 'enviado') return 'Convite criado e e-mail enviado: o transporte confirmou o aceite da mensagem.'
  const motivo = status === 'falhou' ? 'Não foi possível confirmar o envio do e-mail.' : 'O transporte de e-mail está indisponível.'
  return `Convite criado. ${motivo} O convite permanece pendente por 48 horas a partir da emissão. Não há reenvio automático; uma nova emissão para esse e-mail ficará bloqueada enquanto ele estiver válido e pendente.`
}
export function validarCadastro(dados, convite = false) {
  if (!dados.nome?.trim() || dados.nome.trim().length > 120) return 'Informe seu nome completo, com até 120 caracteres.'
  if (!convite && (!dados.nome_ambiente?.trim() || dados.nome_ambiente.trim().length > 180)) return 'Informe o nome da empresa/ambiente, com até 180 caracteres.'
  if (!convite && (!dados.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email.trim()))) return 'Informe um e-mail válido.'
  if (typeof dados.senha !== 'string' || dados.senha.length < 8) return 'A senha deve possuir pelo menos 8 caracteres.'
  if (dados.senha !== dados.confirmacao) return 'A confirmação da senha não confere.'
  if (convite && !/^[a-f0-9]{64}$/.test(dados.token || '')) return 'Informe um token de convite válido.'
  return ''
}
export function linkConvite(origem, token) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Token de convite inválido.')
  return `${origem}/convites/aceitar#token=${token}`
}

export function tokenConviteDoFragmento(fragmento) {
  if (!fragmento?.startsWith('#')) return ''
  const tokens = new URLSearchParams(fragmento.slice(1)).getAll('token')
  return tokens.length === 1 && /^[a-f0-9]{64}$/.test(tokens[0]) ? tokens[0] : ''
}
