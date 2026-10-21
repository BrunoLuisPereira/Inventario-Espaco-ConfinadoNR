import {
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'

import Login from './pages/Login'
import DemoBanner from './components/DemoBanner'
import Dashboard from './pages/Dashboard'
import Campanhas from './pages/Campanhas'
import Locais from './pages/Locais'
import InventarioLocal from './pages/InventarioLocal'
import ChecklistLocal from './pages/ChecklistLocal'
import DadosTecnicosLocal from './pages/DadosTecnicosLocal'
import EvidenciasLocal from './pages/EvidenciasLocal'
import RelatorioLocal from './pages/RelatorioLocal'
import ResponsaveisRelatorio from './pages/ResponsaveisRelatorio'
import Configuracoes from './pages/Configuracoes'
import Cadastro from './pages/Cadastro'
import Convites from './pages/Convites'
import Listagem from './pages/Listagem'
import Usuarios from './pages/Usuarios'

import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './hooks/useAuth'

function App() {
  const { autenticado, token, carregandoSessao, erroSessao, tentarNovamente, logout } = useAuth()
  if (carregandoSessao || (token && erroSessao && !autenticado)) {
    return <><DemoBanner /><main className="sessao-pendente" aria-live="polite">
      <h1>{carregandoSessao ? 'Validando sessão...' : 'Não foi possível validar a sessão'}</h1>
      {erroSessao && <p role="alert">{erroSessao}</p>}
      {!carregandoSessao && <><button onClick={tentarNovamente}>Tentar novamente</button> <button onClick={logout}>Voltar ao login</button></>}
    </main></>
  }

  return (
    <><DemoBanner /><Routes>
      <Route path="/cadastro" element={<Cadastro />} />
      <Route path="/convites/aceitar" element={<Cadastro convite />} />
      <Route path="/usuarios" element={<ProtectedRoute administrador><Usuarios /></ProtectedRoute>} />
      <Route path="/convites" element={<ProtectedRoute administrador><Convites /></ProtectedRoute>} />
      <Route path="/locais" element={<ProtectedRoute><Locais key="geral" /></ProtectedRoute>} />
      <Route path="/relatorios" element={<ProtectedRoute><Listagem key="relatorios" tipo="relatorios" /></ProtectedRoute>} />
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
            <Locais key="campanha" />
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
    {/* Configurações */}
    <Route
      path="/configuracoes"
        element={
        <ProtectedRoute>
          <Configuracoes />
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
    </Routes></>
  )
}

export default App
