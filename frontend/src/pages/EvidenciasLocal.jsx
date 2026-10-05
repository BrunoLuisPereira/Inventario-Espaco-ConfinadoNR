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

const COORDENADAS_VAZIAS = {

  latitude: '', longitude: '', precisao_gps: null,

  origem_coordenadas: null, data_captura_gps: null,

}



function validarLocalizacao(latitude, longitude) {

  const temLat = String(latitude).trim() !== ''

  const temLon = String(longitude).trim() !== ''

  if (!temLat && !temLon) return null

  if (!temLat || !temLon) throw new Error('Informe latitude e longitude juntas.')

  const lat = Number(String(latitude).replace(',', '.'))

  const lon = Number(String(longitude).replace(',', '.'))

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {

    throw new Error('Latitude deve estar entre -90 e 90.')

  }

  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {

    throw new Error('Longitude deve estar entre -180 e 180.')

  }

  return { latitude: lat, longitude: lon }

}



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

  const [coordenadas, setCoordenadas] = useState(COORDENADAS_VAZIAS)

  const [statusGps, setStatusGps] = useState('')

  const [obtendoGps, setObtendoGps] = useState(false)

  const gpsRequisicao = useRef(0)

  const [latitudeEdicao, setLatitudeEdicao] = useState('')

  const [longitudeEdicao, setLongitudeEdicao] = useState('')

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

    gpsRequisicao.current += 1

    setCoordenadas(COORDENADAS_VAZIAS)

    setStatusGps('')

    setObtendoGps(false)

    limparSeletoresArquivo()

  }

  function obterGps() {
    const requisicao = ++gpsRequisicao.current

    setStatusGps('')

    if (!window.isSecureContext) {
      setObtendoGps(false)
      setStatusGps(
        'O navegador não considera esta conexão segura. Verifique o certificado HTTPS.'
      )
      return
    }

    if (!navigator.geolocation) {
      setObtendoGps(false)
      setStatusGps('O navegador não disponibilizou o serviço de localização.')
      return
    }

    setObtendoGps(true)
    setStatusGps('Aguardando resposta do serviço de localização...')

    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        if (requisicao !== gpsRequisicao.current) return

        setCoordenadas({
          latitude: String(posicao.coords.latitude),
          longitude: String(posicao.coords.longitude),
          precisao_gps: posicao.coords.accuracy,
          origem_coordenadas: 'GPS',
          data_captura_gps: new Date(posicao.timestamp).toISOString(),
        })
        setStatusGps(
          'Localização obtida. Confira se corresponde ao local da fotografia.'
        )
        setObtendoGps(false)
      },
      (erroGps) => {
        if (requisicao !== gpsRequisicao.current) return

        const mensagens = {
          1: 'Permissão negada. Confira a permissão de localização e a confiança do certificado HTTPS.',
          2: 'Localização indisponível. Verifique os serviços de localização e o sinal.',
          3: 'Tempo limite excedido ao solicitar a localização.',
        }
        setStatusGps(
          mensagens[erroGps.code] ||
          `Erro ao obter localização: ${erroGps.message || 'erro desconhecido'}`
        )
        setObtendoGps(false)
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 30000,
      }
    )
  }

  function cancelarGps() {
    gpsRequisicao.current += 1
    setObtendoGps(false)
    setStatusGps(
      'Tentativa de localização ignorada. Você pode tentar novamente, informar as coordenadas ou enviar sem GPS.'
    )
  }

  function editarCoordenada(campo, valor) {

    gpsRequisicao.current += 1

    setObtendoGps(false)

    setCoordenadas(atual => ({

      ...atual,

      [campo]: valor,

      origem_coordenadas: 'MANUAL',

      precisao_gps: null,

      data_captura_gps: null,

    }))

    setStatusGps('Coordenadas editadas manualmente.')

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

    gpsRequisicao.current += 1

    setCoordenadas(COORDENADAS_VAZIAS)

    setStatusGps('')

    setObtendoGps(false)

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

    if (fotoSelecionada && TIPOS_PERMITIDOS.includes(fotoSelecionada.type) &&

        fotoSelecionada.size <= TAMANHO_MAXIMO && fotoSelecionada.type.startsWith('image/')) {

      obterGps()

    }

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

    let localizacao

    try {

      localizacao = validarLocalizacao(coordenadas.latitude, coordenadas.longitude)

    } catch (error) {

      setErro(error.message)

      return

    }



    try {

      setEnviando(true)

      await enviarEvidencia(

        idLocal,

        arquivo,

        descricao,

        localizacao ? { ...coordenadas, ...localizacao } : {}

      )

      const respostaEvidencias =

        await listarEvidenciasPorLocal(idLocal)

      setEvidencias(

        respostaEvidencias.data || []

      )

      setArquivo(null)

      setDescricao('')

      setPreviewArquivo('')

      gpsRequisicao.current += 1

      setCoordenadas(COORDENADAS_VAZIAS)

      setStatusGps('')

      setObtendoGps(false)

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

    setDescricaoEdicao(evidencia.descricao || '')

    setLatitudeEdicao(evidencia.latitude == null ? '' : String(evidencia.latitude))

    setLongitudeEdicao(evidencia.longitude == null ? '' : String(evidencia.longitude))

  }

  function cancelarEdicao() {

    setEditandoId(null)

    setDescricaoEdicao('')

    setLatitudeEdicao('')

    setLongitudeEdicao('')

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

    let localizacaoEdicao

    try {

      localizacaoEdicao = validarLocalizacao(latitudeEdicao, longitudeEdicao)

    } catch (error) {

      setErro(error.message)

      return

    }



    const anteriores = validarLocalizacao(

      evidencia.latitude ?? '', evidencia.longitude ?? ''

    )

    const mudou = (localizacaoEdicao?.latitude ?? null) !== (anteriores?.latitude ?? null) ||

      (localizacaoEdicao?.longitude ?? null) !== (anteriores?.longitude ?? null)



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

          ...(mudou ? {

            latitude: localizacaoEdicao?.latitude ?? null,

            longitude: localizacaoEdicao?.longitude ?? null,

            origem_coordenadas: localizacaoEdicao ? 'MANUAL' : null,

          } : {}),

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

        'Evidência atualizada com sucesso.'

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

                                {arquivo && arquivo.type.startsWith('image/') && (

                  <div className="evidencias-field">

                    <h4>Localização da fotografia (opcional)</h4>

                    <p>O GPS informa a localização atual do celular, não necessariamente o ponto fotografado.</p>

                    <button type="button" onClick={obterGps} disabled={enviando || obtendoGps}>

                      {obtendoGps ? 'Obtendo localização...' : 'Obter localização do celular'}

                    </button>

                    {statusGps && <p role="status">{statusGps}</p>}
                      {obtendoGps && (
                        <button type="button" onClick={cancelarGps}>
                          Cancelar espera do GPS
                        </button>
                      )}

                    <label htmlFor="foto-latitude">Latitude</label>

                    <input id="foto-latitude" type="text" inputMode="decimal"

                      value={coordenadas.latitude} disabled={enviando}

                      onChange={event => editarCoordenada('latitude', event.target.value)}

                      placeholder="Ex.: -26.3044" />

                    <label htmlFor="foto-longitude">Longitude</label>

                    <input id="foto-longitude" type="text" inputMode="decimal"

                      value={coordenadas.longitude} disabled={enviando}

                      onChange={event => editarCoordenada('longitude', event.target.value)}

                      placeholder="Ex.: -48.8487" />

                    {coordenadas.origem_coordenadas === 'GPS' && (

                      <small>Origem: GPS | Precisão estimada: {Math.round(coordenadas.precisao_gps)} m</small>

                    )}

                  </div>

                )}



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

                                                            <label htmlFor={`lat-edicao-${evidencia.id_evidencia}`}>Latitude (opcional)</label>

                              <input id={`lat-edicao-${evidencia.id_evidencia}`}

                                type="text" inputMode="decimal" value={latitudeEdicao}

                                onChange={event => setLatitudeEdicao(event.target.value)}

                                disabled={salvandoEdicao} />

                              <label htmlFor={`lon-edicao-${evidencia.id_evidencia}`}>Longitude (opcional)</label>

                              <input id={`lon-edicao-${evidencia.id_evidencia}`}

                                type="text" inputMode="decimal" value={longitudeEdicao}

                                onChange={event => setLongitudeEdicao(event.target.value)}

                                disabled={salvandoEdicao} />

                              <small>Alterações nas coordenadas serão registradas como MANUAL.</small>



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

                                                      {evidencia.latitude != null && evidencia.longitude != null && (

                              <div className="evidencia-details">

                                <span>Localização da evidência</span>

                                <strong>{evidencia.latitude}, {evidencia.longitude}</strong>

                                <small>Origem: {evidencia.origem_coordenadas || 'Não informada'}

                                  {evidencia.precisao_gps != null &&

                                    ` | Precisão: ${evidencia.precisao_gps} m`}</small>

                              </div>

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
