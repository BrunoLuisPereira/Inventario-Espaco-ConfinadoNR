import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

function ProtectedRoute({ children, administrador = false }) {
  const { autenticado, usuario } = useAuth()

  if (!autenticado) {
    return <Navigate to="/login" replace />
  }

  if (administrador && usuario?.perfil_acesso !== 'ADMINISTRADOR') return <Navigate to="/dashboard" replace />

  return children
}

export default ProtectedRoute
