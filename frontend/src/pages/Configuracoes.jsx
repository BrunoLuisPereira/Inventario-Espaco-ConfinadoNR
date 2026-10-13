
import { useEffect, useState } from 'react'
import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'
import { useTheme } from '../hooks/useTheme'
import { useAuth } from '../hooks/useAuth'
import {
  buscarMeuPerfil,
  atualizarMeuPerfil,
  alterarMinhaSenha,
} from '../services/api'
import '../styles/Configuracoes.css'

function Configuracoes() {
  const { tema, setTema } = useTheme()
  const { atualizarUsuario } = useAuth()

  const [perfil, setPerfil] = useState({
    nome: '',
    email: '',
    perfil_acesso: '',
  })

  const [senha, setSenha] = useState({
    senhaAtual: '',
    novaSenha: '',
    confirmarSenha: '',
  })

  const [carregando, setCarregando] = useState(true)
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)

  const [mensagemPerfil, setMensagemPerfil] = useState(null)
  const [mensagemSenha, setMensagemSenha] = useState(null)

  useEffect(() => {
    let ativo = true

    async function carregarPerfil() {
      try {
        const resposta = await buscarMeuPerfil()

        if (!ativo) return

        setPerfil({
          nome: resposta.data.nome || '',
          email: resposta.data.email || '',
          perfil_acesso: resposta.data.perfil_acesso || '',
        })
      } catch (error) {
        if (!ativo) return

        setMensagemPerfil({
          tipo: 'erro',
          texto: error.message,
        })
      } finally {
        if (ativo) {
          setCarregando(false)
        }
      }
    }

    carregarPerfil()

    return () => {
      ativo = false
    }
  }, [])

  function alterarCampoPerfil(evento) {
    const { name, value } = evento.target

    setPerfil((anterior) => ({
      ...anterior,
      [name]: value,
    }))

    setMensagemPerfil(null)
  }

  function alterarCampoSenha(evento) {
    const { name, value } = evento.target

    setSenha((anterior) => ({
      ...anterior,
      [name]: value,
    }))

    setMensagemSenha(null)
  }

  async function salvarPerfil(evento) {
    evento.preventDefault()
    setMensagemPerfil(null)

    if (!perfil.nome.trim() || !perfil.email.trim()) {
      setMensagemPerfil({
        tipo: 'erro',
        texto: 'Informe o nome e o e-mail.',
      })
      return
    }

    setSalvandoPerfil(true)

    try {
      const resposta = await atualizarMeuPerfil({
        nome: perfil.nome.trim(),
        email: perfil.email.trim(),
      })

      const dadosAtualizados = resposta.data

      setPerfil({
        nome: dadosAtualizados.nome,
        email: dadosAtualizados.email,
        perfil_acesso: dadosAtualizados.perfil_acesso,
      })

      atualizarUsuario(dadosAtualizados)

      setMensagemPerfil({
        tipo: 'sucesso',
        texto: 'Perfil atualizado com sucesso.',
      })
    } catch (error) {
      setMensagemPerfil({
        tipo: 'erro',
        texto: error.message,
      })
    } finally {
      setSalvandoPerfil(false)
    }
  }

  async function salvarSenha(evento) {
    evento.preventDefault()
    setMensagemSenha(null)

    if (senha.novaSenha.length < 8) {
      setMensagemSenha({
        tipo: 'erro',
        texto: 'A nova senha deve ter pelo menos 8 caracteres.',
      })
      return
    }

    if (senha.novaSenha !== senha.confirmarSenha) {
      setMensagemSenha({
        tipo: 'erro',
        texto: 'A confirmação da nova senha não confere.',
      })
      return
    }

    setSalvandoSenha(true)

    try {
      await alterarMinhaSenha(senha)

      setSenha({
        senhaAtual: '',
        novaSenha: '',
        confirmarSenha: '',
      })

      setMensagemSenha({
        tipo: 'sucesso',
        texto: 'Senha alterada com sucesso.',
      })
    } catch (error) {
      setMensagemSenha({
        tipo: 'erro',
        texto: error.message,
      })
    } finally {
      setSalvandoSenha(false)
    }
  }

  return (
    <div className="configuracoes-layout">
      <Sidebar />

      <div className="configuracoes-content">
        <Header />

        <main className="configuracoes-main">
          <div className="configuracoes-heading">
            <h1>Configurações</h1>
            <p>
              Gerencie seus dados e personalize sua experiência.
            </p>
          </div>

          {/* MEU PERFIL */}
          <section className="configuracoes-card">
            <div className="configuracoes-card-header">
              <span className="configuracoes-section-label">
                CONTA
              </span>
              <h2>Meu Perfil</h2>
              <p>
                Consulte e atualize suas informações pessoais.
              </p>
            </div>

            {carregando ? (
              <p>Carregando perfil...</p>
            ) : (
              <form
                className="configuracoes-form"
                onSubmit={salvarPerfil}
              >
                <div className="configuracoes-form-grid">
                  <div className="configuracoes-campo">
                    <label htmlFor="perfil-nome">
                      Nome completo
                    </label>
                    <input
                      id="perfil-nome"
                      name="nome"
                      type="text"
                      value={perfil.nome}
                      onChange={alterarCampoPerfil}
                      autoComplete="name"
                      required
                    />
                  </div>

                  <div className="configuracoes-campo">
                    <label htmlFor="perfil-email">
                      E-mail
                    </label>
                    <input
                      id="perfil-email"
                      name="email"
                      type="email"
                      value={perfil.email}
                      onChange={alterarCampoPerfil}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="configuracoes-campo">
                  <label htmlFor="perfil-acesso">
                    Perfil de acesso
                  </label>
                  <input
                    id="perfil-acesso"
                    type="text"
                    value={perfil.perfil_acesso}
                    readOnly
                  />
                  <small>
                    Seu nível de acesso é definido pelo administrador.
                  </small>
                </div>

                {mensagemPerfil && (
                  <div
                    className="configuracoes-mensagem"
                    role={
                      mensagemPerfil.tipo === 'erro'
                        ? 'alert'
                        : 'status'
                    }
                  >
                    {mensagemPerfil.texto}
                  </div>
                )}

                <div className="configuracoes-acoes">
                  <button
                    type="submit"
                    className="configuracoes-botao"
                    disabled={salvandoPerfil}
                  >
                    {salvandoPerfil
                      ? 'Salvando...'
                      : 'Salvar alterações'}
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* ALTERAR SENHA */}
          <section className="configuracoes-card">
            <div className="configuracoes-card-header">
              <span className="configuracoes-section-label">
                SEGURANÇA
              </span>
              <h2>Alterar Senha</h2>
              <p>
                Informe sua senha atual para cadastrar uma nova.
              </p>
            </div>

            <form
              className="configuracoes-form"
              onSubmit={salvarSenha}
            >
              <div className="configuracoes-campo">
                <label htmlFor="senha-atual">
                  Senha atual
                </label>
                <input
                  id="senha-atual"
                  name="senhaAtual"
                  type="password"
                  value={senha.senhaAtual}
                  onChange={alterarCampoSenha}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="configuracoes-form-grid">
                <div className="configuracoes-campo">
                  <label htmlFor="nova-senha">
                    Nova senha
                  </label>
                  <input
                    id="nova-senha"
                    name="novaSenha"
                    type="password"
                    value={senha.novaSenha}
                    onChange={alterarCampoSenha}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>

                <div className="configuracoes-campo">
                  <label htmlFor="confirmar-senha">
                    Confirmar nova senha
                  </label>
                  <input
                    id="confirmar-senha"
                    name="confirmarSenha"
                    type="password"
                    value={senha.confirmarSenha}
                    onChange={alterarCampoSenha}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
              </div>

              {mensagemSenha && (
                <div
                  className="configuracoes-mensagem"
                  role={
                    mensagemSenha.tipo === 'erro'
                      ? 'alert'
                      : 'status'
                  }
                >
                  {mensagemSenha.texto}
                </div>
              )}

              <div className="configuracoes-acoes">
                <button
                  type="submit"
                  className="configuracoes-botao"
                  disabled={salvandoSenha}
                >
                  {salvandoSenha
                    ? 'Atualizando...'
                    : 'Alterar senha'}
                </button>
              </div>
            </form>
          </section>

          {/* APARÊNCIA */}
          <section className="configuracoes-card">
            <div className="configuracoes-card-header">
              <span className="configuracoes-section-label">
                APARÊNCIA
              </span>
              <h2>Tema</h2>
              <p>
                Escolha como o sistema será exibido.
              </p>
            </div>

            <div
              className="tema-opcoes"
              role="radiogroup"
              aria-label="Tema do sistema"
            >
              <button
                type="button"
                className={`tema-opcao ${
                  tema === 'light' ? 'selecionado' : ''
                }`}
                onClick={() => setTema('light')}
                role="radio"
                aria-checked={tema === 'light'}
              >
                <span className="tema-icone">☀️</span>
                <span className="tema-texto">
                  <strong>Claro</strong>
                  <small>Sempre utilizar o tema claro</small>
                </span>
              </button>

              <button
                type="button"
                className={`tema-opcao ${
                  tema === 'dark' ? 'selecionado' : ''
                }`}
                onClick={() => setTema('dark')}
                role="radio"
                aria-checked={tema === 'dark'}
              >
                <span className="tema-icone">🌙</span>
                <span className="tema-texto">
                  <strong>Escuro</strong>
                  <small>Sempre utilizar o tema escuro</small>
                </span>
              </button>

              <button
                type="button"
                className={`tema-opcao ${
                  tema === 'system' ? 'selecionado' : ''
                }`}
                onClick={() => setTema('system')}
                role="radio"
                aria-checked={tema === 'system'}
              >
                <span className="tema-icone">💻</span>
                <span className="tema-texto">
                  <strong>Sistema</strong>
                  <small>Acompanhar o tema do dispositivo</small>
                </span>
              </button>
            </div>

            <p className="tema-observacao">
              A preferência é salva automaticamente neste dispositivo.
            </p>
          </section>
        </main>
      </div>
    </div>
  )
}

export default Configuracoes
