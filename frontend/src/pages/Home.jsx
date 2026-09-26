import { useAuth } from '../hooks/useAuth'

function Home() {
  const { usuario, logout } = useAuth()

  return (
    <main>
      <h1>Inventário de Espaços Confinados</h1>

      <p>
        Bem-vindo, {usuario?.nome}.
      </p>

      <p>
        Perfil: {usuario?.perfil_acesso}
      </p>

      <button type="button" onClick={logout}>
        Sair
      </button>
    </main>
  )
}

export default Home