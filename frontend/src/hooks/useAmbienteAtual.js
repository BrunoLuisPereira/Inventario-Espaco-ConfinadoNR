import { useAuth } from './useAuth'

export function useAmbienteAtual() {
  const { usuario, autenticado, carregandoSessao, erroSessao } = useAuth()
  // O perfil revalidado pelo servidor é a fonte; nunca o snapshot persistido.
  const nome = autenticado && !erroSessao && typeof usuario?.nome_ambiente === 'string'
    ? usuario.nome_ambiente.trim() : ''
  return {
    nome,
    podeEditar: Boolean(autenticado && !erroSessao && usuario?.eh_fundador === true && usuario?.perfil_acesso === 'ADMINISTRADOR'),
    mensagem: carregandoSessao ? 'Carregando ambiente...' : nome || 'Ambiente indisponível',
  }
}
