import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'

import {
  atualizarEvidencia,
  buscarArquivoEvidencia,
  buscarLocalPorId,
  enviarEvidencia,
  excluirEvidencia,
  listarEvidenciasPorLocal,
} from '../services/api'

import '../styles/EvidenciasLocal.css'

const TAMANHO_MAXIMO = 10 * 1024 * 1024

const TIPOS_PERMITIDOS = [
  'image/jpeg',
  'image/png',
  'application/pdf',
]

function EvidenciasLocal() {
  const { idLocal } = useParams()

  const inputArquivoRef = useRef(null)
  const inputCameraRef = useRef(null)

  const [local, setLocal] = useState(null)
  const [evidencias, setEvidencias] = useState([])

  const [arquivo, setArquivo] = useState(null)
  const [descricao, setDescricao] = useState('')
  const [previewArquivo, setPreviewArquivo] = useState('')

  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)

  const [acaoArquivo, setAcaoArquivo] = useState({
    id: null,
    tipo: null,
  })

  const [editandoId, setEditandoId] = useState(null)
  const [descricaoEdicao, setDescricaoEdicao] =
    useState('')
  const [salvandoEdicao, setSalvandoEdicao] =
    useState(false)

  const [excluindoId, setExcluindoId] =
    useState(null)

  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  useEffect(() => {
    async function carregarPagina() {
      try {
        setCarregando(true)
        setErro('')

        const [
          respostaLocal,
          respostaEvidencias,
        ] = await Promise.all([
          buscarLocalPorId(idLocal),
          listarEvidenciasPorLocal(idLocal),
        ])

        setLocal(respostaLocal.data)
        setEvidencias(
          respostaEvidencias.data || []
        )
      } catch (error) {
        setErro(error.message)
      } finally {
        setCarregando(false)
      }
    }

    carregarPagina()
  }, [idLocal])

  /*
   * Limpa o Object URL do preview quando
   * o componente for desmontado ou quando
   * o preview for substituído.
   */
  useEffect(() => {
    return () => {
      if (previewArquivo) {
        URL.revokeObjectURL(previewArquivo)
      }
    }
  }, [previewArquivo])

  function limparSeletoresArquivo() {
    if (inputArquivoRef.current) {
      inputArquivoRef.current.value = ''
    }

    if (inputCameraRef.current) {
      inputCameraRef.current.value = ''
    }
  }

  function limparArquivoSelecionado() {
    setArquivo(null)
    setPreviewArquivo('')
    limparSeletoresArquivo()
  }

  function processarArquivo(arquivoSelecionado) {
    setErro('')
    setSucesso('')

    if (!arquivoSelecionado) {
      return
    }

    if (
      !TIPOS_PERMITIDOS.includes(
        arquivoSelecionado.type
      )
    ) {
      limparArquivoSelecionado()

      setErro(
        'Tipo de arquivo não permitido. Use JPG, PNG ou PDF.'
      )

      return
    }

    if (
      arquivoSelecionado.size >
      TAMANHO_MAXIMO
    ) {
      limparArquivoSelecionado()

      setErro(
        'O arquivo deve possuir no máximo 10 MB.'
      )

      return
    }

    setArquivo(arquivoSelecionado)

    /*
     * JPG e PNG recebem preview.
     * PDF continua sendo aceito, mas exibimos
     * apenas a indicação de documento.
     */
    if (
      arquivoSelecionado.type ===
        'image/jpeg' ||
      arquivoSelecionado.type ===
        'image/png'
    ) {
      const urlPreview =
        URL.createObjectURL(
          arquivoSelecionado
        )

      setPreviewArquivo(urlPreview)
    } else {
      setPreviewArquivo('')
    }
  }

  function selecionarArquivo(event) {
    const arquivoSelecionado =
      event.target.files?.[0]

    processarArquivo(arquivoSelecionado)
  }

  function selecionarFotoCamera(event) {
    const fotoSelecionada =
      event.target.files?.[0]

    processarArquivo(fotoSelecionada)
  }

  function abrirCamera() {
    setErro('')
    setSucesso('')

    /*
     * Limpa o valor anterior para permitir
     * capturar novamente até a mesma foto.
     */
    if (inputCameraRef.current) {
      inputCameraRef.current.value = ''
      inputCameraRef.current.click()
    }
  }

  async function enviar(event) {
    event.preventDefault()

    setErro('')
    setSucesso('')

    if (!arquivo) {
      setErro(
        'Selecione um arquivo ou tire uma foto para enviar.'
      )
      return
    }

    try {
      setEnviando(true)

      await enviarEvidencia(
        idLocal,
        arquivo,
        descricao
      )

      const respostaEvidencias =
        await listarEvidenciasPorLocal(idLocal)

      setEvidencias(
        respostaEvidencias.data || []
      )

      setArquivo(null)
      setDescricao('')
      setPreviewArquivo('')

      limparSeletoresArquivo()

      setSucesso(
        'Evidência enviada com sucesso.'
      )
    } catch (error) {
      setErro(error.message)
    } finally {
      setEnviando(false)
    }
  }

  async function visualizarEvidencia(
    evidencia
  ) {
    setErro('')
    setSucesso('')

    try {
      setAcaoArquivo({
        id: evidencia.id_evidencia,
        tipo: 'visualizar',
      })

      const blob =
        await buscarArquivoEvidencia(
          evidencia.id_evidencia
        )

      const urlTemporaria =
        URL.createObjectURL(blob)

      window.open(
        urlTemporaria,
        '_blank',
        'noopener,noreferrer'
      )

      window.setTimeout(() => {
        URL.revokeObjectURL(urlTemporaria)
      }, 60000)
    } catch (error) {
      setErro(error.message)
    } finally {
      setAcaoArquivo({
        id: null,
        tipo: null,
      })
    }
  }

  async function baixarEvidencia(
    evidencia
  ) {
    setErro('')
    setSucesso('')

    try {
      setAcaoArquivo({
        id: evidencia.id_evidencia,
        tipo: 'baixar',
      })

      const blob =
        await buscarArquivoEvidencia(
          evidencia.id_evidencia
        )

      let extensao = 'arquivo'

      if (blob.type === 'image/jpeg') {
        extensao = 'jpg'
      } else if (blob.type === 'image/png') {
        extensao = 'png'
      } else if (
        blob.type === 'application/pdf'
      ) {
        extensao = 'pdf'
      }

      const urlTemporaria =
        URL.createObjectURL(blob)

      const link =
        document.createElement('a')

      link.href = urlTemporaria
      link.download =
        `evidencia-${evidencia.id_evidencia}.${extensao}`

      document.body.appendChild(link)

      link.click()
      link.remove()

      window.setTimeout(() => {
        URL.revokeObjectURL(urlTemporaria)
      }, 1000)

      setSucesso(
        'Download da evidência iniciado.'
      )
    } catch (error) {
      setErro(error.message)
    } finally {
      setAcaoArquivo({
        id: null,
        tipo: null,
      })
    }
  }

  function iniciarEdicao(evidencia) {
    setErro('')
    setSucesso('')

    setEditandoId(
      evidencia.id_evidencia
    )

    setDescricaoEdicao(
      evidencia.descricao || ''
    )
  }

  function cancelarEdicao() {
    setEditandoId(null)
    setDescricaoEdicao('')
    setErro('')
  }

  async function salvarEdicao(
    evidencia
  ) {
    setErro('')
    setSucesso('')

    const novaDescricao =
      descricaoEdicao.trim()

    if (!novaDescricao) {
      setErro(
        'Informe uma descrição para a evidência.'
      )
      return
    }

    try {
      setSalvandoEdicao(true)

      /*
       * O frontend altera somente a descrição.
       * Não permitimos alteração manual do
       * caminho físico do arquivo.
       */
      await atualizarEvidencia(
        evidencia.id_evidencia,
        {
          descricao: novaDescricao,
        }
      )

      const respostaEvidencias =
        await listarEvidenciasPorLocal(idLocal)

      setEvidencias(
        respostaEvidencias.data || []
      )

      setEditandoId(null)
      setDescricaoEdicao('')

      setSucesso(
        'Descrição atualizada com sucesso.'
      )
    } catch (error) {
      setErro(error.message)
    } finally {
      setSalvandoEdicao(false)
    }
  }

  async function removerEvidencia(
    evidencia
  ) {
    setErro('')
    setSucesso('')

    const confirmou = window.confirm(
      `Tem certeza que deseja excluir a evidência #${evidencia.id_evidencia}?\n\n` +
        'Esta ação removerá o registro e o arquivo associado.'
    )

    if (!confirmou) {
      return
    }

    try {
      setExcluindoId(
        evidencia.id_evidencia
      )

      await excluirEvidencia(
        evidencia.id_evidencia
      )

      const respostaEvidencias =
        await listarEvidenciasPorLocal(idLocal)

      setEvidencias(
        respostaEvidencias.data || []
      )

      if (
        editandoId ===
        evidencia.id_evidencia
      ) {
        setEditandoId(null)
        setDescricaoEdicao('')
      }

      setSucesso(
        'Evidência excluída com sucesso.'
      )
    } catch (error) {
      setErro(error.message)
    } finally {
      setExcluindoId(null)
    }
  }

  function formatarTipo(tipo) {
    if (tipo === 'FOTO') {
      return 'Foto'
    }

    if (tipo === 'DOCUMENTO') {
      return 'Documento'
    }

    return tipo
  }

  function formatarTamanho(bytes) {
    if (!bytes) {
      return ''
    }

    const tamanhoMB =
      bytes / (1024 * 1024)

    return `${tamanhoMB.toFixed(2)} MB`
  }

  return (
    <div className="evidencias-layout">
      <Sidebar />

      <main className="evidencias-content">
        <Header
          titulo="Evidências / Fotos"
          subtitulo="Registros e evidências do espaço confinado"
        />

        <section className="evidencias-main">
          <Link
            to={`/locais/${idLocal}/inventario`}
            className="evidencias-back"
          >
            ← Voltar para o inventário
          </Link>

          {carregando && (
            <p className="evidencias-message">
              Carregando evidências...
            </p>
          )}

          {!carregando && local && (
            <>
              <div className="evidencias-title">
                <span>Espaço confinado</span>

                <h2>{local.nome_local}</h2>

                <p>
                  Adicione fotos ou documentos
                  relacionados a este local.
                </p>
              </div>

              {erro && (
                <p
                  className="evidencias-error"
                  role="alert"
                >
                  {erro}
                </p>
              )}

              {sucesso && (
                <p
                  className="evidencias-success"
                  role="status"
                >
                  {sucesso}
                </p>
              )}

              <form
                className="evidencias-form"
                onSubmit={enviar}
              >
                <div className="evidencias-form-header">
                  <div>
                    <h3>Nova evidência</h3>

                    <p>
                      Envie uma foto ou documento
                      relacionado ao local.
                    </p>
                  </div>
                </div>

                <div className="evidencias-field">
                  <label htmlFor="arquivo">
                    Arquivo
                  </label>

                  <div className="evidencias-file-options">
                    <input
                      ref={inputArquivoRef}
                      id="arquivo"
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                      onChange={
                        selecionarArquivo
                      }
                      disabled={enviando}
                    />

                    <button
                      type="button"
                      className="evidencias-camera-button"
                      onClick={abrirCamera}
                      disabled={enviando}
                    >
                      📷 Tirar foto
                    </button>
                  </div>

                  {/*
                   * Input separado para a câmera.
                   * Em celulares/tablets compatíveis,
                   * capture="environment" solicita
                   * preferencialmente a câmera traseira.
                   */}
                  <input
                    ref={inputCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={
                      selecionarFotoCamera
                    }
                    className="evidencias-camera-input"
                    tabIndex={-1}
                    aria-hidden="true"
                  />

                  <small>
                    Formatos permitidos: JPG, PNG
                    e PDF. Tamanho máximo: 10 MB.
                    Você também pode tirar uma
                    foto diretamente pelo
                    dispositivo.
                  </small>
                </div>

                {arquivo && (
                  <div className="evidencias-file-preview">
                    <div className="evidencias-selected-file">
                      <strong>
                        {arquivo.name}
                      </strong>

                      <span>
                        {formatarTamanho(
                          arquivo.size
                        )}
                      </span>
                    </div>

                    {previewArquivo && (
                      <div className="evidencias-preview">
                        <span>
                          Pré-visualização
                        </span>

                        <img
                          src={previewArquivo}
                          alt="Pré-visualização da evidência selecionada"
                        />
                      </div>
                    )}

                    {!previewArquivo &&
                      arquivo.type ===
                        'application/pdf' && (
                        <div className="evidencias-pdf-selected">
                          <span>PDF</span>

                          <strong>
                            Documento selecionado
                          </strong>
                        </div>
                      )}
                  </div>
                )}

                <div className="evidencias-field">
                  <label htmlFor="descricao">
                    Descrição
                  </label>

                  <textarea
                    id="descricao"
                    rows="4"
                    value={descricao}
                    onChange={(event) =>
                      setDescricao(
                        event.target.value
                      )
                    }
                    placeholder="Descreva a evidência..."
                    disabled={enviando}
                  />
                </div>

                <div className="evidencias-form-actions">
                  <button
                    type="submit"
                    className="evidencias-submit"
                    disabled={
                      enviando || !arquivo
                    }
                  >
                    {enviando
                      ? 'Enviando...'
                      : 'Enviar evidência'}
                  </button>
                </div>
              </form>

              <div className="evidencias-list-section">
                <div className="evidencias-list-header">
                  <div>
                    <h3>
                      Evidências cadastradas
                    </h3>

                    <p>
                      {evidencias.length === 1
                        ? '1 evidência cadastrada'
                        : `${evidencias.length} evidências cadastradas`}
                    </p>
                  </div>
                </div>

                {evidencias.length === 0 ? (
                  <div className="evidencias-empty">
                    <strong>
                      Nenhuma evidência cadastrada
                    </strong>

                    <p>
                      Envie a primeira foto ou
                      documento deste local.
                    </p>
                  </div>
                ) : (
                  <div className="evidencias-list">
                    {evidencias.map(
                      (evidencia) => (
                        <article
                          key={
                            evidencia.id_evidencia
                          }
                          className="evidencia-card"
                        >
                          <div className="evidencia-card-top">
                            <span
                              className={`evidencia-type evidencia-type-${evidencia.tipo.toLowerCase()}`}
                            >
                              {formatarTipo(
                                evidencia.tipo
                              )}
                            </span>

                            <span className="evidencia-id">
                              #
                              {
                                evidencia.id_evidencia
                              }
                            </span>
                          </div>

                          {editandoId ===
                          evidencia.id_evidencia ? (
                            <div className="evidencia-edit">
                              <label
                                htmlFor={`descricao-evidencia-${evidencia.id_evidencia}`}
                              >
                                Descrição
                              </label>

                              <textarea
                                id={`descricao-evidencia-${evidencia.id_evidencia}`}
                                rows="3"
                                value={
                                  descricaoEdicao
                                }
                                onChange={(event) =>
                                  setDescricaoEdicao(
                                    event.target
                                      .value
                                  )
                                }
                                disabled={
                                  salvandoEdicao
                                }
                              />

                              <div className="evidencia-edit-actions">
                                <button
                                  type="button"
                                  className="evidencia-save-button"
                                  onClick={() =>
                                    salvarEdicao(
                                      evidencia
                                    )
                                  }
                                  disabled={
                                    salvandoEdicao
                                  }
                                >
                                  {salvandoEdicao
                                    ? 'Salvando...'
                                    : 'Salvar'}
                                </button>

                                <button
                                  type="button"
                                  className="evidencia-cancel-button"
                                  onClick={
                                    cancelarEdicao
                                  }
                                  disabled={
                                    salvandoEdicao
                                  }
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <h4>
                              {evidencia.descricao ||
                                'Sem descrição'}
                            </h4>
                          )}

                          <div className="evidencia-details">
                            <span>
                              Responsável
                            </span>

                            <strong>
                              {evidencia.usuario_responsavel ||
                                'Usuário autenticado'}
                            </strong>
                          </div>

                          <div className="evidencia-actions">
                            {evidencia.caminho_arquivo && (
                              <>
                                <button
                                  type="button"
                                  className="evidencia-view-button"
                                  onClick={() =>
                                    visualizarEvidencia(
                                      evidencia
                                    )
                                  }
                                  disabled={
                                    acaoArquivo.id ===
                                      evidencia.id_evidencia ||
                                    salvandoEdicao ||
                                    excluindoId ===
                                      evidencia.id_evidencia
                                  }
                                >
                                  {acaoArquivo.id ===
                                    evidencia.id_evidencia &&
                                  acaoArquivo.tipo ===
                                    'visualizar'
                                    ? 'Abrindo...'
                                    : 'Visualizar'}
                                </button>

                                <button
                                  type="button"
                                  className="evidencia-download-button"
                                  onClick={() =>
                                    baixarEvidencia(
                                      evidencia
                                    )
                                  }
                                  disabled={
                                    acaoArquivo.id ===
                                      evidencia.id_evidencia ||
                                    salvandoEdicao ||
                                    excluindoId ===
                                      evidencia.id_evidencia
                                  }
                                >
                                  {acaoArquivo.id ===
                                    evidencia.id_evidencia &&
                                  acaoArquivo.tipo ===
                                    'baixar'
                                    ? 'Baixando...'
                                    : 'Baixar'}
                                </button>
                              </>
                            )}

                            {editandoId !==
                              evidencia.id_evidencia && (
                              <button
                                type="button"
                                className="evidencia-edit-button"
                                onClick={() =>
                                  iniciarEdicao(
                                    evidencia
                                  )
                                }
                                disabled={
                                  salvandoEdicao ||
                                  editandoId !==
                                    null ||
                                  excluindoId !==
                                    null
                                }
                              >
                                Editar
                              </button>
                            )}

                            {editandoId !==
                              evidencia.id_evidencia && (
                              <button
                                type="button"
                                className="evidencia-delete-button"
                                onClick={() =>
                                  removerEvidencia(
                                    evidencia
                                  )
                                }
                                disabled={
                                  excluindoId ===
                                    evidencia.id_evidencia ||
                                  salvandoEdicao ||
                                  editandoId !==
                                    null ||
                                  acaoArquivo.id ===
                                    evidencia.id_evidencia
                                }
                              >
                                {excluindoId ===
                                evidencia.id_evidencia
                                  ? 'Excluindo...'
                                  : 'Excluir'}
                              </button>
                            )}
                          </div>
                        </article>
                      )
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {!carregando &&
            erro &&
            !local && (
              <p
                className="evidencias-error"
                role="alert"
              >
                {erro}
              </p>
            )}
        </section>
      </main>
    </div>
  )
}

export default EvidenciasLocal