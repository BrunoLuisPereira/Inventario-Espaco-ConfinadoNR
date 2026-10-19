import matriz from '../../../shared/permissoes.json' with { type: 'json' }
export const perfisConvite = matriz.perfis.filter(p => p !== 'ADMINISTRADOR')
export const nomesPerfis = matriz.nomes
export const descricoesPerfis = matriz.descricoes
export function pode(usuario, capacidade) {
  const perfis = matriz.capacidades[capacidade] || []
  return !!usuario && perfis.includes(usuario.perfil_acesso) && (perfis.length !== 1 || usuario.eh_fundador === true)
}
