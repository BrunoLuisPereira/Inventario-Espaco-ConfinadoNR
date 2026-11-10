import { useTraducao } from '../hooks/useTraducao.js'
import CaracterizacaoChecklist from '../components/CaracterizacaoChecklist'
import CamposNr33, { AvaliacaoNr33 } from '../components/CamposNr33'
import { booleanosNr33, preencherCamposNr33, selecionarCamposNr33, prepararEdicaoChecklist, respostasNr33Alteradas,
  mensagemErroNr33 } from '../services/camposNr33.js'
import { preencherCaracterizacao, prepararCaracterizacao, validarCaracterizacao } from '../services/caracterizacaoChecklist'
import { useCapacidade } from '../hooks/useCapacidade'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'
import {
  alterarStatusChecklist,
  atualizarChecklist,
  buscarLocalPorId,
  criarChecklist,
  listarChecklists,
} from '../services/api'
import '../styles/ChecklistLocal.css'

const FORMULARIO_INICIAL = {
  ...preencherCaracterizacao(),
  ...preencherCamposNr33(),
  criterio_a: '',
  criterio_b: '',
  criterio_c: '',
  acesso_controlado: '',
  ventilacao_adequada: '',
  monitoramento_atmosferico: '',
  procedimento_emergencia: '',
  observacoes: '',
  status: 'PENDENTE',
}

function ChecklistLocal() {
  const { aviso, rotulo, tr } = useTraducao()

  const podeEditar = useCapacidade('checklists.editar')
  const podeCriar = useCapacidade('checklists.criar')
  const { idLocal } = useParams()

  const [local, setLocal] = useState(null)
  const [checklist, setChecklist] = useState(null)
  const [formulario, setFormulario] =
    useState(FORMULARIO_INICIAL)

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [alterandoStatus, setAlterandoStatus] =
    useState(false)
  const [editando, setEditando] = useState(false)

  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  function preencherFormulario(dadosChecklist) {
    setFormulario({
      ...preencherCaracterizacao(dadosChecklist),
      ...preencherCamposNr33(dadosChecklist),
      criterio_a: dadosChecklist.criterio_a || '',
      criterio_b: dadosChecklist.criterio_b || '',
      criterio_c: dadosChecklist.criterio_c || '',
      acesso_controlado:
        dadosChecklist.acesso_controlado || '',
      ventilacao_adequada:
        dadosChecklist.ventilacao_adequada || '',
      monitoramento_atmosferico:
        dadosChecklist.monitoramento_atmosferico || '',
      procedimento_emergencia:
        dadosChecklist.procedimento_emergencia || '',
      observacoes: dadosChecklist.observacoes || '',
      status: dadosChecklist.status || 'PENDENTE',
    })
  }

  useEffect(() => {
    async function carregarDados() {
      try {
        setCarregando(true)
        setErro('')

        const [respostaLocal, respostaChecklists] =
          await Promise.all([
            buscarLocalPorId(idLocal),
            listarChecklists(),
          ])

        const checklistDoLocal =
          respostaChecklists.data.find(
            (item) =>
              Number(item.id_local) === Number(idLocal)
          )

        setLocal(respostaLocal.data)

        if (checklistDoLocal) {
          setChecklist(checklistDoLocal)
          preencherFormulario(checklistDoLocal)
        } else {
          setChecklist(null)
          setFormulario(FORMULARIO_INICIAL)
        }
      } catch (error) {
        setErro(mensagemErroNr33(error))
      } finally {
        setCarregando(false)
      }
    }

    carregarDados()
  }, [idLocal])

  function alterarCampo(event) {
    const { name, value } = event.target

    setFormulario((estadoAtual) => ({
      ...estadoAtual,
      [name]: value,
    }))

    setErro('')
    setSucesso('')
  }

  function alterarRespostaNr33(nome, valor) {
    setFormulario(estadoAtual => ({ ...estadoAtual, [nome]: valor }))
    setErro('')
    setSucesso('')
  }

  function validarFormulario() {
    if (!formulario.criterio_a) {
      return 'Responda o Critério A.'
    }

    if (!formulario.criterio_b) {
      return 'Responda o Critério B.'
    }

    if (!formulario.criterio_c) {
      return 'Responda o Critério C.'
    }

    if (!formulario.acesso_controlado) {
      return 'Informe se o acesso é controlado.'
    }

    if (!formulario.ventilacao_adequada) {
      return 'Informe se a ventilação é adequada.'
    }

    if (!formulario.monitoramento_atmosferico) {
      return 'Informe se há monitoramento atmosférico.'
    }

    if (!formulario.procedimento_emergencia) {
      return 'Informe se há procedimento de emergência.'
    }

    return validarCaracterizacao(formulario)
  }

  async function salvarNovoChecklist(event) {
    event.preventDefault()
    if (!podeCriar || salvando) return

    const erroValidacao = validarFormulario()

    if (erroValidacao) {
      setErro(erroValidacao)
      setSucesso('')
      return
    }

    try {
      setSalvando(true)
      setErro('')
      setSucesso('')

      const dados = {
        ...prepararCaracterizacao(formulario),
        ...selecionarCamposNr33(Object.fromEntries(booleanosNr33.map(campo => [campo, formulario[campo]]))),
        id_local: Number(idLocal),
        criterio_a: formulario.criterio_a,
        criterio_b: formulario.criterio_b,
        criterio_c: formulario.criterio_c,
        acesso_controlado:
          formulario.acesso_controlado,
        ventilacao_adequada:
          formulario.ventilacao_adequada,
        monitoramento_atmosferico:
          formulario.monitoramento_atmosferico,
        procedimento_emergencia:
          formulario.procedimento_emergencia,
        observacoes: formulario.observacoes.trim(),
        status: formulario.status,
      }

      const resposta = await criarChecklist(dados)

      setChecklist(resposta.data)
      preencherFormulario(resposta.data)

      setSucesso('Checklist cadastrado com sucesso.')
    } catch (error) {
      setErro(mensagemErroNr33(error))
    } finally {
      setSalvando(false)
    }
  }

  async function salvarEdicao(event) {
    event.preventDefault()

    if (!checklist || !podeEditar || salvando) {
      return
    }

    const erroValidacao = validarCaracterizacao(formulario)

    if (erroValidacao) {
      setErro(erroValidacao)
      setSucesso('')
      return
    }

    try {
      setSalvando(true)
      setErro('')
      setSucesso('')

      const dados = prepararEdicaoChecklist(formulario, checklist)

      const resposta = await atualizarChecklist(
        checklist.id_checklist,
        dados
      )

      const checklistAtualizado = {
        ...checklist,
        ...resposta.data,
      }

      setChecklist(checklistAtualizado)
      preencherFormulario(checklistAtualizado)
      setEditando(false)

      setSucesso('Checklist atualizado com sucesso.')
    } catch (error) {
      setErro(mensagemErroNr33(error))
    } finally {
      setSalvando(false)
    }
  }

  async function mudarStatus(novoStatus) {
    if (!checklist || !podeEditar || alterandoStatus || salvando) {
      return
    }

    try {
      setAlterandoStatus(true)
      setErro('')
      setSucesso('')

      const resposta = await alterarStatusChecklist(
        checklist.id_checklist,
        novoStatus
      )

      const checklistAtualizado = {
        ...checklist,
        ...resposta.data,
      }

      setChecklist(checklistAtualizado)
      preencherFormulario(checklistAtualizado)

      setSucesso(
        novoStatus === 'CONCLUIDO'
          ? 'Checklist concluído com sucesso.'
          : 'Checklist reaberto com sucesso.'
      )
    } catch (error) {
      setErro(mensagemErroNr33(error))
    } finally {
      setAlterandoStatus(false)
    }
  }

  function iniciarEdicao() {
    if (!podeEditar) return
    preencherFormulario(checklist)
    setEditando(true)
    setErro('')
    setSucesso('')
  }

  function cancelarEdicao() {
    preencherFormulario(checklist)
    setEditando(false)
    setErro('')
    setSucesso('')
  }

  function renderizarFormulario(
    onSubmit,
    modoEdicao = false
  ) {
    return (
      <form
        className="checklist-form"
        onSubmit={onSubmit}
        noValidate={modoEdicao}
      >
        {!(modoEdicao ? podeEditar : podeCriar) && <p role="status">{tr("Seu perfil permite somente consulta nesta tela.")}</p>}
        <fieldset disabled={!(modoEdicao ? podeEditar : podeCriar) || salvando || alterandoStatus} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <div className="checklist-form-header">
          <div>
            <h3>
              {modoEdicao
                ? tr('Editar checklist')
                : tr('Cadastrar checklist')}
            </h3>

            <p>{tr("Preencha as informações do checklist deste espaço confinado.")}</p>
          </div>

          <span className="checklist-badge">
            {modoEdicao ? tr('Edição') : tr('Novo')}
          </span>
        </div>

        <div className="checklist-identificacao">
          <div className="checklist-identificacao-header">
            <h4>{tr("Identificação do espaço")}</h4>

            <p>{tr("Responda aos critérios de caracterização do espaço confinado.")}</p>
          </div>

          <div className="checklist-criterios">
            <div className="checklist-criterio-card">
              <div className="checklist-criterio-texto">
                <strong>{tr("Critério A")}</strong>

                <span>{tr("Não projetado para ocupação humana contínua.")}</span>
              </div>

              <div className="checklist-criterio-respostas">
                <label>
                  <input
                    type="radio"
                    name="criterio_a"
                    value="SIM"
                    checked={
                      formulario.criterio_a === 'SIM'
                    }
                    onChange={alterarCampo}
                    disabled={salvando}
                    required
                  />{tr("Sim")}</label>

                <label>
                  <input
                    type="radio"
                    name="criterio_a"
                    value="NAO"
                    checked={
                      formulario.criterio_a === 'NAO'
                    }
                    onChange={alterarCampo}
                    disabled={salvando}
                    required
                  />{tr("Não")}</label>
              </div>
            </div>

            <div className="checklist-criterio-card">
              <div className="checklist-criterio-texto">
                <strong>{tr("Critério B")}</strong>

                <span>{tr("Meios limitados de entrada/saída.")}</span>
              </div>

              <div className="checklist-criterio-respostas">
                <label>
                  <input
                    type="radio"
                    name="criterio_b"
                    value="SIM"
                    checked={
                      formulario.criterio_b === 'SIM'
                    }
                    onChange={alterarCampo}
                    disabled={salvando}
                    required
                  />{tr("Sim")}</label>

                <label>
                  <input
                    type="radio"
                    name="criterio_b"
                    value="NAO"
                    checked={
                      formulario.criterio_b === 'NAO'
                    }
                    onChange={alterarCampo}
                    disabled={salvando}
                    required
                  />{tr("Não")}</label>
              </div>
            </div>

            <div className="checklist-criterio-card">
              <div className="checklist-criterio-texto">
                <strong>{tr("Critério C")}</strong>

                <span>{tr("Atmosfera perigosa existente OU potencial.")}</span>
              </div>

              <div className="checklist-criterio-respostas">
                <label>
                  <input
                    type="radio"
                    name="criterio_c"
                    value="SIM"
                    checked={
                      formulario.criterio_c === 'SIM'
                    }
                    onChange={alterarCampo}
                    disabled={salvando}
                    required
                  />{tr("Sim")}</label>

                <label>
                  <input
                    type="radio"
                    name="criterio_c"
                    value="NAO"
                    checked={
                      formulario.criterio_c === 'NAO'
                    }
                    onChange={alterarCampo}
                    disabled={salvando}
                    required
                  />{tr("Não")}</label>
              </div>
            </div>
          </div>
        </div>

        <CamposNr33 dados={formulario} avaliacao={checklist?.avaliacao_nr33} onChange={alterarRespostaNr33} salvando={salvando} />
        <CaracterizacaoChecklist dados={formulario} onChange={alterarCampo} salvando={salvando} />

        <div className="checklist-questions">
          <div className="checklist-field">
            <label htmlFor="acesso_controlado">{tr("Acesso controlado")}</label>

            <select
              id="acesso_controlado"
              name="acesso_controlado"
              value={formulario.acesso_controlado}
              onChange={alterarCampo}
              disabled={salvando}
              required
            >
              <option value="">{tr("Selecione")}</option>
              <option value="SIM">{tr("Sim")}</option>
              <option value="NAO">{tr("Não")}</option>
            </select>
          </div>

          <div className="checklist-field">
            <label htmlFor="ventilacao_adequada">{tr("Ventilação adequada")}</label>

            <select
              id="ventilacao_adequada"
              name="ventilacao_adequada"
              value={formulario.ventilacao_adequada}
              onChange={alterarCampo}
              disabled={salvando}
              required
            >
              <option value="">{tr("Selecione")}</option>
              <option value="SIM">{tr("Sim")}</option>
              <option value="NAO">{tr("Não")}</option>
            </select>
          </div>

          <div className="checklist-field">
            <label htmlFor="monitoramento_atmosferico">{tr("Monitoramento atmosférico")}</label>

            <select
              id="monitoramento_atmosferico"
              name="monitoramento_atmosferico"
              value={
                formulario.monitoramento_atmosferico
              }
              onChange={alterarCampo}
              disabled={salvando}
              required
            >
              <option value="">{tr("Selecione")}</option>
              <option value="SIM">{tr("Sim")}</option>
              <option value="NAO">{tr("Não")}</option>
            </select>
          </div>

          <div className="checklist-field">
            <label htmlFor="procedimento_emergencia">{tr("Procedimento de emergência")}</label>

            <select
              id="procedimento_emergencia"
              name="procedimento_emergencia"
              value={
                formulario.procedimento_emergencia
              }
              onChange={alterarCampo}
              disabled={salvando}
              required
            >
              <option value="">{tr("Selecione")}</option>
              <option value="SIM">{tr("Sim")}</option>
              <option value="NAO">{tr("Não")}</option>
            </select>
          </div>
        </div>

        <div className="checklist-field">
          <label htmlFor="observacoes">{tr("Observações")}</label>

          <textarea
            id="observacoes"
            name="observacoes"
            rows="5"
            value={formulario.observacoes}
            onChange={alterarCampo}
            disabled={salvando}
            placeholder={tr("Digite observações sobre o local, meios de acesso e informações importantes sobre o local...")}
          />
        </div>

        {!modoEdicao && (
          <div className="checklist-field checklist-status-field">
            <label htmlFor="status">{tr("Status")}</label>

            <select
              id="status"
              name="status"
              value={formulario.status}
              onChange={alterarCampo}
              disabled={salvando}
            >
              <option value="PENDENTE">{tr("Pendente")}</option>

              <option value="CONCLUIDO" disabled={!checklist?.avaliacao_nr33}>{tr("Concluído")}</option>
            </select>
            <p>{tr("Salve primeiro como pendente para obter a avaliação do servidor. Depois complete as respostas aplicáveis e solicite a conclusão.")}</p>
          </div>
        )}

        <div className="checklist-actions">
          {modoEdicao && (
            <button
              type="button"
              className="checklist-cancel-button"
              onClick={cancelarEdicao}
              disabled={salvando}
            >{tr("Cancelar")}</button>
          )}

          <button
            type="submit"
            className="checklist-save-button"
            disabled={salvando}
          >
            {salvando
              ? tr('Salvando...')
              : modoEdicao
                ? tr('Salvar alterações')
                : tr('Salvar checklist')}
          </button>
        </div>
      </fieldset>
</form>
    )
  }

  return (
    <div className="inventario-layout">
      <Sidebar />

      <main className="inventario-content">
        <Header
          titulo={tr("Checklist NR-33")}
          subtitulo={tr("Checklist do espaço confinado")}
        />

        <section className="inventario-main">
          <Link
            to={`/locais/${idLocal}/inventario`}
            className="inventario-back"
          >{tr("← Voltar para o inventário")}</Link>

          {carregando && (
            <p className="inventario-message">{tr("Carregando checklist...")}</p>
          )}

          {erro && (
            <p
              className="checklist-message checklist-error"
              role="alert"
            >
              {aviso(erro)}
            </p>
          )}

          {sucesso && (
            <p
              className="checklist-message checklist-success"
              role="status"
            >
              {aviso(sucesso)}
            </p>
          )}

          {!carregando && local && (
            <>
              <div className="inventario-title">
                <div>
                  <span className="inventario-label">{tr("Espaço confinado")}</span>

                  <h2>{local.nome_local}</h2>

                  <p>
                    {local.nome_campanha ||
                      tr('Campanha não informada')}
                  </p>
                </div>

                {checklist && (
                  <span
                    className={`checklist-status checklist-status-${checklist.status.toLowerCase()}`}
                  >
                    {rotulo(checklist.status)}
                  </span>
                )}
              </div>

              {!checklist &&
                renderizarFormulario(
                  salvarNovoChecklist
                )}

              <AvaliacaoNr33 avaliacao={checklist?.avaliacao_nr33} status={checklist?.status || formulario.status}
                desatualizada={(editando || !checklist) && respostasNr33Alteradas(formulario, checklist)} />

              {checklist &&
                editando &&
                renderizarFormulario(
                  salvarEdicao,
                  true
                )}

              {checklist && !editando && (
                <div className="checklist-existing">
                  <div className="checklist-existing-main">
                    <span>{tr("Checklist cadastrado")}</span>

                    <h3>{tr("Checklist #")}{checklist.id_checklist}
                    </h3>

                    <p>{tr("Confira os dados cadastrados para este espaço confinado.")}</p>

                    <div className="checklist-details">
                      <div>
                        <span>{tr("Critério A")}</span>
                        <strong>
                          {rotulo(checklist.criterio_a)}
                        </strong>
                      </div>

                      <div>
                        <span>{tr("Critério B")}</span>
                        <strong>
                          {rotulo(checklist.criterio_b)}
                        </strong>
                      </div>

                      <div>
                        <span>{tr("Critério C")}</span>
                        <strong>
                          {rotulo(checklist.criterio_c)}
                        </strong>
                      </div>
                    </div>

                    <CamposNr33 dados={checklist} avaliacao={checklist.avaliacao_nr33} consulta />

                    <div className="checklist-details">
                      <div>
                        <span>{tr("Acesso controlado")}</span>
                        <strong>
                          {rotulo(checklist.acesso_controlado)}
                        </strong>
                      </div>

                      <div>
                        <span>{tr("Ventilação adequada")}</span>
                        <strong>
                          {rotulo(checklist.ventilacao_adequada)}
                        </strong>
                      </div>

                      <div>
                        <span>{tr("Monitoramento atmosférico")}</span>
                        <strong>
                          {
                            rotulo(checklist.monitoramento_atmosferico)
                          }
                        </strong>
                      </div>

                      <div>
                        <span>{tr("Procedimento de emergência")}</span>
                        <strong>
                          {
                            rotulo(checklist.procedimento_emergencia)
                          }
                        </strong>
                      </div>

                      <div>
                        <span>{tr("Status")}</span>
                        <strong>
                          {rotulo(checklist.status)}
                        </strong>
                      </div>
                    </div>

                    <CaracterizacaoChecklist dados={checklist} consulta />

                    <div className="checklist-observacoes">
                      <span>{tr("Observações")}</span>

                      <p>
                        {checklist.observacoes ||
                          tr('Nenhuma observação cadastrada.')}
                      </p>
                    </div>
                  </div>

                  <div className="checklist-existing-actions">
                    <button
                      type="button"
                      className="checklist-edit-button"
                      onClick={iniciarEdicao}
                      disabled={!podeEditar || (alterandoStatus)}
                    >{tr("Editar checklist")}</button>

                    {checklist.status ===
                    'PENDENTE' ? (
                      <button
                        type="button"
                        className="checklist-finish-button"
                        onClick={() =>
                          mudarStatus('CONCLUIDO')
                        }
                        disabled={!podeEditar || (alterandoStatus)}
                      >
                        {alterandoStatus
                          ? tr('Alterando...')
                          : tr('Concluir checklist')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="checklist-reopen-button"
                        onClick={() =>
                          mudarStatus('PENDENTE')
                        }
                        disabled={!podeEditar || (alterandoStatus)}
                      >
                        {alterandoStatus
                          ? tr('Alterando...')
                          : tr('Reabrir checklist')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  )
}

export default ChecklistLocal
