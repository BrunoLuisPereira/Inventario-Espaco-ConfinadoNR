export const podeAdministrar = usuario => usuario?.perfil_acesso === 'ADMINISTRADOR'
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
