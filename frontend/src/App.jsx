import Login from './pages/Login'
import Home from './pages/Home'
import { useAuth } from './hooks/useAuth'

function App() {
  const { autenticado } = useAuth()

  if (!autenticado) {
    return <Login />
  }

  return <Home />
}

export default App