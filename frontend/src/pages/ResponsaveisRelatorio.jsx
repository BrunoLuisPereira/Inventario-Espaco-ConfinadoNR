import {
  useEffect,
  useState,
} from 'react'

import {
  Link,
  useParams,
} from 'react-router-dom'

import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'

import {
  atualizarRelatorio,
  buscarLocalPorId,
  buscarRelatorioPorLocal,
  criarRelatorio,
} from '../services/api'

import '../styles/ResponsaveisRelatorio.css'

function converterDataParaInput(data) {
  if (!data) {
    return ''
  }

  return String(data).slice(0, 10)
}

function formatarPerfil(perfil) {
  if (!perfil) {
    return 'Não informado'
  }

  return perfil
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letra) =>
      letra.toUpperCase()
    )
}

function ResponsaveisRelatorio() {
  const { idLocal } = useParams()

  const [local, setLocal] = useState(null)

  const [relatorio, setRelatorio] =
    useState(null)

  const [
    nomeResponsavelTecnico,
    setNomeResponsavelTecnico,
  ] = useState('')

  const [crea, setCrea] = useState('')

  const [numeroArt, setNumeroArt] =
    useState('')

  const [dataArt, setDataArt] =
    useState('')

  const [carregando, setCarregando] =
    useState(true)

  const [salvando, setSalvando] =
    useState(false)

  const [erro, setErro] = useState('')

  const [sucesso, setSucesso] =
    useState('')

  useEffect(() => {
    async function carregarDados() {
      try {
        setCarregando(true)
        setErro('')
        setSucesso('')

        // Carrega primeiro os dados do local.
        const respostaLocal =
          await buscarLocalPorId(idLocal)

        const dadosLocal =
          respostaLocal.data

        setLocal(dadosLocal)

        let dadosRelatorio

        try {
          // Tenta localizar um relatório já
          // existente para este local.
          const respostaRelatorio =
            await buscarRelatorioPorLocal(
              idLocal
            )

          dadosRelatorio =
            respostaRelatorio.data
        } catch (error) {
          // Se o erro não for 404, existe algum
          // outro problema e ele deve ser exibido.
          if (error.status !== 404) {
            throw error
          }

          // Se não existir relatório, cria um
          // RASCUNHO. Isso NÃO gera o PDF.
          try {
            const respostaNovoRelatorio =
              await criarRelatorio({
                id_local: Number(idLocal),
                status: 'RASCUNHO',
              })

            dadosRelatorio =
              respostaNovoRelatorio.data
          } catch (erroCriacao) {
            /*
             * Em desenvolvimento, o React pode
             * executar o efeito mais de uma vez.
             *
             * Se duas requisições tentarem criar
             * o relatório praticamente ao mesmo
             * tempo, uma delas pode receber 409
             * porque o relatório já foi criado.
             *
             * Nesse caso, apenas buscamos o
             * relatório existente.
             */
            if (erroCriacao.status !== 409) {
              throw erroCriacao
            }

            const respostaRelatorioExistente =
              await buscarRelatorioPorLocal(
                idLocal
              )

            dadosRelatorio =
              respostaRelatorioExistente.data
          }
        }

        setRelatorio(dadosRelatorio)

        setNomeResponsavelTecnico(
          dadosRelatorio
            ?.nome_responsavel_tecnico || ''
        )

        setCrea(
          dadosRelatorio?.crea || ''
        )

        setNumeroArt(
          dadosRelatorio?.numero_art || ''
        )

        setDataArt(
          converterDataParaInput(
            dadosRelatorio?.data_art
          )
        )
      } catch (error) {
        setErro(error.message)
      } finally {
        setCarregando(false)
      }
    }

    carregarDados()
  }, [idLocal])

  async function salvarResponsavelTecnico(
    event
  ) {
    event.preventDefault()

    if (!relatorio) {
      return
    }

    try {
      setSalvando(true)
      setErro('')
      setSucesso('')

      const resposta =
        await atualizarRelatorio(
          relatorio.id_relatorio,
          {
            nome_responsavel_tecnico:
              nomeResponsavelTecnico,
            crea,
            numero_art: numeroArt,
            data_art: dataArt,
          }
        )

      setRelatorio((anterior) => ({
        ...anterior,
        ...resposta.data,
      }))

      setSucesso(
        'Dados do responsável técnico salvos com sucesso.'
      )
    } catch (error) {
      setErro(error.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="responsaveis-layout">
      <Sidebar />

      <main className="responsaveis-content">
        <Header
          titulo="Responsáveis pelo Relatório"
          subtitulo="Responsabilidade e identificação técnica do relatório"
        />

        <section className="responsaveis-main">
          <Link
            to={`/locais/${idLocal}/inventario`}
            className="responsaveis-back"
          >
            ← Voltar para o inventário
          </Link>

          {carregando && (
            <p className="responsaveis-message">
              Carregando responsáveis...
            </p>
          )}

          {erro && (
            <p
              className="responsaveis-error"
              role="alert"
            >
              {erro}
            </p>
          )}

          {sucesso && (
            <p
              className="responsaveis-success"
              role="status"
            >
              {sucesso}
            </p>
          )}

          {!carregando &&
            relatorio &&
            local && (
              <>
                <div className="responsaveis-title">
                  <div>
                    <span className="responsaveis-label">
                      Espaço confinado
                    </span>

                    <h2>
                      {local.nome_local}
                    </h2>

                    <p>
                      Relatório nº{' '}
                      {relatorio.id_relatorio}
                    </p>
                  </div>
                </div>

                <section className="responsaveis-card">
                  <div className="responsaveis-card-header">
                    <div>
                      <span className="responsaveis-section-label">
                        Responsabilidade
                      </span>

                      <h3>
                        Responsável pelo
                        relatório
                      </h3>

                      <p>
                        Usuário registrado como
                        responsável pelo
                        relatório no sistema.
                      </p>
                    </div>

                    <span className="responsaveis-readonly">
                      Somente leitura
                    </span>
                  </div>

                  <div className="responsaveis-user-grid">
                    <div className="responsaveis-field-info">
                      <span>Nome</span>

                      <strong>
                        {relatorio
                          .usuario_responsavel ||
                          'Não informado'}
                      </strong>
                    </div>

                    <div className="responsaveis-field-info">
                      <span>E-mail</span>

                      <strong>
                        {relatorio
                          .email_usuario_responsavel ||
                          'Não informado'}
                      </strong>
                    </div>

                    <div className="responsaveis-field-info">
                      <span>Perfil</span>

                      <strong>
                        {formatarPerfil(
                          relatorio
                            .perfil_usuario_responsavel
                        )}
                      </strong>
                    </div>
                  </div>
                </section>

                <section className="responsaveis-card">
                  <div className="responsaveis-card-header">
                    <div>
                      <span className="responsaveis-section-label">
                        Informações técnicas
                      </span>

                      <h3>
                        Responsável técnico
                      </h3>

                      <p>
                        Informe o engenheiro
                        responsável e os dados
                        da ART vinculada ao
                        relatório.
                      </p>
                    </div>
                  </div>

                  <form
                    className="responsaveis-form"
                    onSubmit={
                      salvarResponsavelTecnico
                    }
                  >
                    <div className="responsaveis-form-group responsaveis-form-full">
                      <label htmlFor="nomeResponsavelTecnico">
                        Nome do engenheiro
                      </label>

                      <input
                        id="nomeResponsavelTecnico"
                        type="text"
                        value={
                          nomeResponsavelTecnico
                        }
                        onChange={(event) =>
                          setNomeResponsavelTecnico(
                            event.target.value
                          )
                        }
                        placeholder="Ex.: João da Silva"
                        maxLength={150}
                      />
                    </div>

                    <div className="responsaveis-form-group">
                      <label htmlFor="crea">
                        CREA
                      </label>

                      <input
                        id="crea"
                        type="text"
                        value={crea}
                        onChange={(event) =>
                          setCrea(
                            event.target.value
                          )
                        }
                        placeholder="Ex.: CREA-SC 123456-7"
                        maxLength={50}
                      />
                    </div>

                    <div className="responsaveis-form-group">
                      <label htmlFor="numeroArt">
                        Número da ART
                      </label>

                      <input
                        id="numeroArt"
                        type="text"
                        value={numeroArt}
                        onChange={(event) =>
                          setNumeroArt(
                            event.target.value
                          )
                        }
                        placeholder="Ex.: ART-2026-00123"
                        maxLength={100}
                      />
                    </div>

                    <div className="responsaveis-form-group">
                      <label htmlFor="dataArt">
                        Data da ART
                      </label>

                      <input
                        id="dataArt"
                        type="date"
                        value={dataArt}
                        onChange={(event) =>
                          setDataArt(
                            event.target.value
                          )
                        }
                      />
                    </div>

                    <div className="responsaveis-actions">
                      <button
                        type="submit"
                        className="responsaveis-save"
                        disabled={salvando}
                      >
                        {salvando
                          ? 'Salvando...'
                          : 'Salvar responsável técnico'}
                      </button>
                    </div>
                  </form>
                </section>
              </>
            )}
        </section>
      </main>
    </div>
  )
}

export default ResponsaveisRelatorio