const normalizarBusca = valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')

export function indicadoresUsuarios(usuarios) {
  return {
    total: usuarios.length,
    administradores: usuarios.filter(u => u.perfil_acesso === 'ADMINISTRADOR').length,
    engenheiros: usuarios.filter(u => u.perfil_acesso === 'ENGENHEIRO_SEGURANCA').length,
  }
}

export function filtrarUsuarios(usuarios, busca) {
  const termo = normalizarBusca(busca.trim())
  return usuarios.filter(u => normalizarBusca(u.nome).includes(termo) || normalizarBusca(u.email).includes(termo))
}

export function nomePerfil(perfil) {
  return { ADMINISTRADOR: 'Administrador', ENGENHEIRO_SEGURANCA: 'Engenheiro de segurança' }[perfil] || perfil || 'Não informado'
}
