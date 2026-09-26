import { Navigate, Route, Routes } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Campanhas from './pages/Campanhas'
import LocaisCampanha from './pages/LocaisCampanha'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './hooks/useAuth'

function App() {
  const { autenticado } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={
          autenticado
            ? <Navigate to="/dashboard" replace />
            : <Login />
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/campanhas"
        element={
          <ProtectedRoute>
            <Campanhas />
          </ProtectedRoute>
        }
      />

      <Route
        path="/campanhas/:idCampanha/locais"
        element={
          <ProtectedRoute>
            <LocaisCampanha />
          </ProtectedRoute>
        }
      />

      <Route
        path="*"
        element={
          <Navigate
            to={autenticado ? '/dashboard' : '/login'}
            replace
          />
        }
      />
    </Routes>
  )
}

export default App