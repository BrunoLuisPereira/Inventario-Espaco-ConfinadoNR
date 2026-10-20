import { useAuth } from './useAuth'
import { pode } from '../services/permissoes'

export function useCapacidade(capacidade) {
  const { usuario } = useAuth()
  return pode(usuario, capacidade)
}
