export function validarNovaSenha(senha, confirmacao) {
  if (typeof senha !== 'string' || senha.length < 8) return 'A nova senha deve possuir pelo menos 8 caracteres.'
  if (new TextEncoder().encode(senha).length > 72) return 'A nova senha deve possuir no máximo 72 bytes em UTF-8.'
  if (senha !== confirmacao) return 'A confirmação da nova senha não confere.'
  return ''
}
export function tokenDoFragmento(fragmento) {
  if (!fragmento.startsWith('#')) return ''
  const parametros = new URLSearchParams(fragmento.replace(/^#/, ''))
  const valores = parametros.getAll('token')
  return valores.length === 1 && /^[a-f0-9]{64}$/.test(valores[0]) ? valores[0] : ''
}
