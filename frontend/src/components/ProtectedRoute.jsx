import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { podeAdministrar } from '../services/conta'

function ProtectedRoute({ children, administrador = false }) {
  const { autenticado, usuario } = useAuth()

  if (!autenticado) {
    return <Navigate to="/login" replace />
  }

  if (administrador && !podeAdministrar(usuario)) return <Navigate to="/dashboard" replace />

  return children
}

export default ProtectedRoute
