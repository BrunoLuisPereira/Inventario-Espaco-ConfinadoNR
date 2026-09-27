import {
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Campanhas from './pages/Campanhas'
import LocaisCampanha from './pages/LocaisCampanha'
import InventarioLocal from './pages/InventarioLocal'
import ChecklistLocal from './pages/ChecklistLocal'
import DadosTecnicosLocal from './pages/DadosTecnicosLocal'
import EvidenciasLocal from './pages/EvidenciasLocal'
import RelatorioLocal from './pages/RelatorioLocal'
import ResponsaveisRelatorio from './pages/ResponsaveisRelatorio'

import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './hooks/useAuth'

function App() {
  const { autenticado } = useAuth()

  return (
    <Routes>
      {/* Login */}
      <Route
        path="/login"
        element={
          autenticado ? (
            <Navigate
              to="/dashboard"
              replace
            />
          ) : (
            <Login />
          )
        }
      />

      {/* Dashboard */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      {/* Campanhas */}
      <Route
        path="/campanhas"
        element={
          <ProtectedRoute>
            <Campanhas />
          </ProtectedRoute>
        }
      />

      {/* Locais da campanha */}
      <Route
        path="/campanhas/:idCampanha/locais"
        element={
          <ProtectedRoute>
            <LocaisCampanha />
          </ProtectedRoute>
        }
      />

      {/* Inventário do local */}
      <Route
        path="/locais/:idLocal/inventario"
        element={
          <ProtectedRoute>
            <InventarioLocal />
          </ProtectedRoute>
        }
      />

      {/* Checklist NR-33 */}
      <Route
        path="/locais/:idLocal/checklist"
        element={
          <ProtectedRoute>
            <ChecklistLocal />
          </ProtectedRoute>
        }
      />

      {/* Dados Técnicos */}
      <Route
        path="/locais/:idLocal/dados-tecnicos"
        element={
          <ProtectedRoute>
            <DadosTecnicosLocal />
          </ProtectedRoute>
        }
      />

      {/* Evidências / Fotos */}
      <Route
        path="/locais/:idLocal/evidencias"
        element={
          <ProtectedRoute>
            <EvidenciasLocal />
          </ProtectedRoute>
        }
      />

      {/* Relatório / PDF */}
      <Route
        path="/locais/:idLocal/relatorio"
        element={
          <ProtectedRoute>
            <RelatorioLocal />
          </ProtectedRoute>
        }
      />

      {/* Responsáveis pelo relatório */}
      <Route
        path="/locais/:idLocal/responsaveis"
        element={
          <ProtectedRoute>
            <ResponsaveisRelatorio />
          </ProtectedRoute>
        }
      />

      {/* Rota inexistente */}
      <Route
        path="*"
        element={
          <Navigate
            to={
              autenticado
                ? '/dashboard'
                : '/login'
            }
            replace
          />
        }
      />
    </Routes>
  )
}

export default App