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
  identificacao_espaco: '',
  acesso_controlado: '',
  ventilacao_adequada: '',
  monitoramento_atmosferico: '',
  procedimento_emergencia: '',
  observacoes: '',
  status: 'PENDENTE',
}

function ChecklistLocal() {
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
      identificacao_espaco:
        dadosChecklist.identificacao_espaco || '',
      acesso_controlado:
        dadosChecklist.acesso_controlado || '',
      ventilacao_adequada:
        dadosChecklist.ventilacao_adequada || '',
      monitoramento_atmosferico:
        dadosChecklist.monitoramento_atmosferico || '',
      procedimento_emergencia:
        dadosChecklist.procedimento_emergencia || '',
      observacoes:
        dadosChecklist.observacoes || '',
      status:
        dadosChecklist.status || 'PENDENTE',
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
        setErro(error.message)
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

  function validarFormulario() {
    if (!formulario.identificacao_espaco) {
      return 'Selecione a identificação do espaço.'
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

    return ''
  }

  async function salvarNovoChecklist(event) {
    event.preventDefault()

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
        id_local: Number(idLocal),
        identificacao_espaco:
          formulario.identificacao_espaco,
        acesso_controlado:
          formulario.acesso_controlado,
        ventilacao_adequada:
          formulario.ventilacao_adequada,
        monitoramento_atmosferico:
          formulario.monitoramento_atmosferico,
        procedimento_emergencia:
          formulario.procedimento_emergencia,
        observacoes:
          formulario.observacoes.trim(),
        status: formulario.status,
      }

      const resposta = await criarChecklist(dados)

      setChecklist(resposta.data)
      preencherFormulario(resposta.data)

      setSucesso('Checklist cadastrado com sucesso.')
    } catch (error) {
      setErro(error.message)
    } finally {
      setSalvando(false)
    }
  }

  async function salvarEdicao(event) {
    event.preventDefault()

    if (!checklist) {
      return
    }

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
        identificacao_espaco:
          formulario.identificacao_espaco,
        acesso_controlado:
          formulario.acesso_controlado,
        ventilacao_adequada:
          formulario.ventilacao_adequada,
        monitoramento_atmosferico:
          formulario.monitoramento_atmosferico,
        procedimento_emergencia:
          formulario.procedimento_emergencia,
        observacoes:
          formulario.observacoes.trim(),
      }

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
      setErro(error.message)
    } finally {
      setSalvando(false)
    }
  }

  async function mudarStatus(novoStatus) {
    if (!checklist) {
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
      setErro(error.message)
    } finally {
      setAlterandoStatus(false)
    }
  }

  function iniciarEdicao() {
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

  function renderizarFormulario(onSubmit, modoEdicao = false) {
    return (
      <form
        className="checklist-form"
        onSubmit={onSubmit}
      >
        <div className="checklist-form-header">
          <div>
            <h3>
              {modoEdicao
                ? 'Editar checklist'
                : 'Cadastrar checklist'}
            </h3>

            <p>
              Preencha as informações do checklist deste
              espaço confinado.
            </p>
          </div>

          <span className="checklist-badge">
            {modoEdicao ? 'Edição' : 'Novo'}
          </span>
        </div>

        <div className="checklist-field">
          <label htmlFor="identificacao_espaco">
            Identificação do espaço
          </label>

          <select
            id="identificacao_espaco"
            name="identificacao_espaco"
            value={formulario.identificacao_espaco}
            onChange={alterarCampo}
            disabled={salvando}
            required
          >
            <option value="">Selecione</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </div>

        <div className="checklist-questions">
          <div className="checklist-field">
            <label htmlFor="acesso_controlado">
              Acesso controlado
            </label>

            <select
              id="acesso_controlado"
              name="acesso_controlado"
              value={formulario.acesso_controlado}
              onChange={alterarCampo}
              disabled={salvando}
              required
            >
              <option value="">Selecione</option>
              <option value="SIM">Sim</option>
              <option value="NAO">Não</option>
            </select>
          </div>

          <div className="checklist-field">
            <label htmlFor="ventilacao_adequada">
              Ventilação adequada
            </label>

            <select
              id="ventilacao_adequada"
              name="ventilacao_adequada"
              value={formulario.ventilacao_adequada}
              onChange={alterarCampo}
              disabled={salvando}
              required
            >
              <option value="">Selecione</option>
              <option value="SIM">Sim</option>
              <option value="NAO">Não</option>
            </select>
          </div>

          <div className="checklist-field">
            <label htmlFor="monitoramento_atmosferico">
              Monitoramento atmosférico
            </label>

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
              <option value="">Selecione</option>
              <option value="SIM">Sim</option>
              <option value="NAO">Não</option>
            </select>
          </div>

          <div className="checklist-field">
            <label htmlFor="procedimento_emergencia">
              Procedimento de emergência
            </label>

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
              <option value="">Selecione</option>
              <option value="SIM">Sim</option>
              <option value="NAO">Não</option>
            </select>
          </div>
        </div>

        <div className="checklist-field">
          <label htmlFor="observacoes">
            Observações
          </label>

          <textarea
            id="observacoes"
            name="observacoes"
            rows="5"
            value={formulario.observacoes}
            onChange={alterarCampo}
            disabled={salvando}
            placeholder="Digite observações sobre o checklist..."
          />
        </div>

        {!modoEdicao && (
          <div className="checklist-field checklist-status-field">
            <label htmlFor="status">
              Status
            </label>

            <select
              id="status"
              name="status"
              value={formulario.status}
              onChange={alterarCampo}
              disabled={salvando}
            >
              <option value="PENDENTE">
                Pendente
              </option>

              <option value="CONCLUIDO">
                Concluído
              </option>
            </select>
          </div>
        )}

        <div className="checklist-actions">
          {modoEdicao && (
            <button
              type="button"
              className="checklist-cancel-button"
              onClick={cancelarEdicao}
              disabled={salvando}
            >
              Cancelar
            </button>
          )}

          <button
            type="submit"
            className="checklist-save-button"
            disabled={salvando}
          >
            {salvando
              ? 'Salvando...'
              : modoEdicao
                ? 'Salvar alterações'
                : 'Salvar checklist'}
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="inventario-layout">
      <Sidebar />

      <main className="inventario-content">
        <Header
          titulo="Checklist NR-33"
          subtitulo="Checklist do espaço confinado"
        />

        <section className="inventario-main">
          <Link
            to={`/locais/${idLocal}/inventario`}
            className="inventario-back"
          >
            ← Voltar para o inventário
          </Link>

          {carregando && (
            <p className="inventario-message">
              Carregando checklist...
            </p>
          )}

          {erro && (
            <p
              className="checklist-message checklist-error"
              role="alert"
            >
              {erro}
            </p>
          )}

          {sucesso && (
            <p
              className="checklist-message checklist-success"
              role="status"
            >
              {sucesso}
            </p>
          )}

          {!carregando && local && (
            <>
              <div className="inventario-title">
                <div>
                  <span className="inventario-label">
                    Espaço confinado
                  </span>

                  <h2>{local.nome_local}</h2>

                  <p>
                    {local.nome_campanha ||
                      'Campanha não informada'}
                  </p>
                </div>

                {checklist && (
                  <span
                    className={`checklist-status checklist-status-${checklist.status.toLowerCase()}`}
                  >
                    {checklist.status}
                  </span>
                )}
              </div>

              {!checklist &&
                renderizarFormulario(
                  salvarNovoChecklist
                )}

              {checklist &&
                editando &&
                renderizarFormulario(
                  salvarEdicao,
                  true
                )}

              {checklist && !editando && (
                <div className="checklist-existing">
                  <div className="checklist-existing-main">
                    <span>Checklist cadastrado</span>

                    <h3>
                      Checklist #{checklist.id_checklist}
                    </h3>

                    <p>
                      Confira os dados cadastrados para
                      este espaço confinado.
                    </p>

                    <div className="checklist-details">
                      <div>
                        <span>Identificação</span>
                        <strong>
                          {
                            checklist.identificacao_espaco
                          }
                        </strong>
                      </div>

                      <div>
                        <span>Acesso controlado</span>
                        <strong>
                          {checklist.acesso_controlado}
                        </strong>
                      </div>

                      <div>
                        <span>Ventilação adequada</span>
                        <strong>
                          {
                            checklist.ventilacao_adequada
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Monitoramento atmosférico
                        </span>
                        <strong>
                          {
                            checklist.monitoramento_atmosferico
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Procedimento de emergência
                        </span>
                        <strong>
                          {
                            checklist.procedimento_emergencia
                          }
                        </strong>
                      </div>

                      <div>
                        <span>Status</span>
                        <strong>
                          {checklist.status}
                        </strong>
                      </div>
                    </div>

                    <div className="checklist-observacoes">
                      <span>Observações</span>

                      <p>
                        {checklist.observacoes ||
                          'Nenhuma observação cadastrada.'}
                      </p>
                    </div>
                  </div>

                  <div className="checklist-existing-actions">
                    <button
                      type="button"
                      className="checklist-edit-button"
                      onClick={iniciarEdicao}
                      disabled={alterandoStatus}
                    >
                      Editar checklist
                    </button>

                    {checklist.status ===
                    'PENDENTE' ? (
                      <button
                        type="button"
                        className="checklist-finish-button"
                        onClick={() =>
                          mudarStatus('CONCLUIDO')
                        }
                        disabled={alterandoStatus}
                      >
                        {alterandoStatus
                          ? 'Alterando...'
                          : 'Concluir checklist'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="checklist-reopen-button"
                        onClick={() =>
                          mudarStatus('PENDENTE')
                        }
                        disabled={alterandoStatus}
                      >
                        {alterandoStatus
                          ? 'Alterando...'
                          : 'Reabrir checklist'}
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