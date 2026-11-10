import { useTraducao } from '../hooks/useTraducao.js'
import { useCapacidade } from '../hooks/useCapacidade'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'
import {
  atualizarDadosTecnicos,
  buscarDadosTecnicosPorLocal,
  buscarLocalPorId,
  criarDadosTecnicos,
} from '../services/api'
import '../styles/InventarioLocal.css'
import '../styles/DadosTecnicosLocal.css'

const FORMULARIO_INICIAL = {
  pressao_atmosferica: '',
  ventilacao: 'NAO_INFORMADA',
  oxigenio: '',
  gas_inflamavel: '',
  monoxido_carbono: '',
  sulfeto_hidrogenio: '',
  temperatura: '',
  umidade: '',
  observacoes: '',
  status: 'PENDENTE',
}

function DadosTecnicosLocal() {
  const { aviso, numero, rotulo, tr } = useTraducao()

  const podeEditar = useCapacidade('dados_tecnicos.editar')
  const { idLocal } = useParams()

  const [local, setLocal] = useState(null)
  const [dadosTecnicos, setDadosTecnicos] =
    useState(null)
  const [formulario, setFormulario] = useState(
    FORMULARIO_INICIAL
  )

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [alterandoStatus, setAlterandoStatus] =
    useState(false)

  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  function preencherFormulario(dados) {
    setFormulario({
      pressao_atmosferica:
        dados.pressao_atmosferica ?? '',
      ventilacao:
        dados.ventilacao ?? 'NAO_INFORMADA',
      oxigenio: dados.oxigenio ?? '',
      gas_inflamavel:
        dados.gas_inflamavel ?? '',
      monoxido_carbono:
        dados.monoxido_carbono ?? '',
      sulfeto_hidrogenio:
        dados.sulfeto_hidrogenio ?? '',
      temperatura: dados.temperatura ?? '',
      umidade: dados.umidade ?? '',
      observacoes: dados.observacoes ?? '',
      status: dados.status ?? 'PENDENTE',
    })
  }

  useEffect(() => {
    async function carregarDados() {
      try {
        setCarregando(true)
        setErro('')

        const respostaLocal =
          await buscarLocalPorId(idLocal)

        setLocal(respostaLocal.data)

        try {
          const respostaDados =
            await buscarDadosTecnicosPorLocal(idLocal)

          setDadosTecnicos(respostaDados.data)
          preencherFormulario(respostaDados.data)
        } catch (error) {
          if (error.status === 404) {
            setDadosTecnicos(null)
            setFormulario(FORMULARIO_INICIAL)
          } else {
            throw error
          }
        }
      } catch (error) {
        setErro(error.message)
      } finally {
        setCarregando(false)
      }
    }

    carregarDados()
  }, [idLocal])

  function atualizarCampo(event) {
    const { name, value } = event.target

    setFormulario((formularioAtual) => ({
      ...formularioAtual,
      [name]: value,
    }))
  }

  function valorNumericoOuNull(valor) {
    if (valor === '') {
      return null
    }

    return Number(valor)
  }

  function montarDadosFormulario() {
    return {
      pressao_atmosferica: valorNumericoOuNull(
        formulario.pressao_atmosferica
      ),
      ventilacao: formulario.ventilacao,
      oxigenio: valorNumericoOuNull(
        formulario.oxigenio
      ),
      gas_inflamavel: valorNumericoOuNull(
        formulario.gas_inflamavel
      ),
      monoxido_carbono: valorNumericoOuNull(
        formulario.monoxido_carbono
      ),
      sulfeto_hidrogenio: valorNumericoOuNull(
        formulario.sulfeto_hidrogenio
      ),
      temperatura: valorNumericoOuNull(
        formulario.temperatura
      ),
      umidade: valorNumericoOuNull(
        formulario.umidade
      ),
      observacoes:
        formulario.observacoes.trim() || null,
      status: formulario.status,
    }
  }

  async function salvarNovo(event) {
    event.preventDefault()

    try {
      setSalvando(true)
      setErro('')
      setSucesso('')

      const dados = {
        id_local: Number(idLocal),
        ...montarDadosFormulario(),
      }

      const resposta =
        await criarDadosTecnicos(dados)

      setDadosTecnicos(resposta.data)
      preencherFormulario(resposta.data)

      setSucesso(
        'Dados técnicos cadastrados com sucesso.'
      )
    } catch (error) {
      setErro(error.message)
    } finally {
      setSalvando(false)
    }
  }

  async function salvarEdicao(event) {
    event.preventDefault()

    try {
      setSalvando(true)
      setErro('')
      setSucesso('')

      const resposta =
        await atualizarDadosTecnicos(
          dadosTecnicos.id_dados,
          montarDadosFormulario()
        )

      const dadosAtualizados = {
        ...dadosTecnicos,
        ...resposta.data,
      }

      setDadosTecnicos(dadosAtualizados)
      preencherFormulario(dadosAtualizados)
      setEditando(false)

      setSucesso(
        'Dados técnicos atualizados com sucesso.'
      )
    } catch (error) {
      setErro(error.message)
    } finally {
      setSalvando(false)
    }
  }

  function iniciarEdicao() {
    preencherFormulario(dadosTecnicos)
    setErro('')
    setSucesso('')
    setEditando(true)
  }

  function cancelarEdicao() {
    preencherFormulario(dadosTecnicos)
    setErro('')
    setSucesso('')
    setEditando(false)
  }

  async function mudarStatus(novoStatus) {
    try {
      setAlterandoStatus(true)
      setErro('')
      setSucesso('')

      const resposta =
        await atualizarDadosTecnicos(
          dadosTecnicos.id_dados,
          {
            status: novoStatus,
          }
        )

      const dadosAtualizados = {
        ...dadosTecnicos,
        ...resposta.data,
      }

      setDadosTecnicos(dadosAtualizados)
      preencherFormulario(dadosAtualizados)

      setSucesso(
        novoStatus === 'CONCLUIDO'
          ? 'Dados técnicos concluídos com sucesso.'
          : 'Dados técnicos reabertos com sucesso.'
      )
    } catch (error) {
      setErro(error.message)
    } finally {
      setAlterandoStatus(false)
    }
  }

  function renderizarFormulario(onSubmit) {
    return (
      <form
        className="dados-tecnicos-form"
        onSubmit={onSubmit}
      >
        {!podeEditar && <p role="status">{tr("Seu perfil permite somente consulta nesta tela.")}</p>}
        <fieldset disabled={!podeEditar} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <div className="dados-tecnicos-grid">
          <div className="dados-tecnicos-field">
            <label htmlFor="pressao_atmosferica">{tr("Pressão atmosférica")}</label>

            <input
              id="pressao_atmosferica"
              name="pressao_atmosferica"
              type="number"
              step="any"
              value={formulario.pressao_atmosferica}
              onChange={atualizarCampo}
              placeholder={tr("Informe o valor")}
            />
          </div>

          <div className="dados-tecnicos-field">
            <label htmlFor="ventilacao">{tr("Ventilação")}</label>

            <select
              id="ventilacao"
              name="ventilacao"
              value={formulario.ventilacao}
              onChange={atualizarCampo}
            >
              <option value="NAO_INFORMADA">{tr("Não informada")}</option>

              <option value="NATURAL">{tr("Natural")}</option>

              <option value="MECANICA">{tr("Mecânica")}</option>

              <option value="FORCADA">{tr("Forçada")}</option>
            </select>
          </div>

          <div className="dados-tecnicos-field">
            <label htmlFor="oxigenio">{tr("Oxigênio")}</label>

            <input
              id="oxigenio"
              name="oxigenio"
              type="number"
              step="any"
              value={formulario.oxigenio}
              onChange={atualizarCampo}
              placeholder={tr("Informe o valor")}
            />
          </div>

          <div className="dados-tecnicos-field">
            <label htmlFor="gas_inflamavel">{tr("Gás inflamável")}</label>

            <input
              id="gas_inflamavel"
              name="gas_inflamavel"
              type="number"
              step="any"
              value={formulario.gas_inflamavel}
              onChange={atualizarCampo}
              placeholder={tr("Informe o valor")}
            />
          </div>

          <div className="dados-tecnicos-field">
            <label htmlFor="monoxido_carbono">{tr("Monóxido de carbono")}</label>

            <input
              id="monoxido_carbono"
              name="monoxido_carbono"
              type="number"
              step="any"
              value={formulario.monoxido_carbono}
              onChange={atualizarCampo}
              placeholder={tr("Informe o valor")}
            />
          </div>

          <div className="dados-tecnicos-field">
            <label htmlFor="sulfeto_hidrogenio">{tr("Sulfeto de hidrogênio")}</label>

            <input
              id="sulfeto_hidrogenio"
              name="sulfeto_hidrogenio"
              type="number"
              step="any"
              value={formulario.sulfeto_hidrogenio}
              onChange={atualizarCampo}
              placeholder={tr("Informe o valor")}
            />
          </div>

          <div className="dados-tecnicos-field">
            <label htmlFor="temperatura">{tr("Temperatura")}</label>

            <input
              id="temperatura"
              name="temperatura"
              type="number"
              step="any"
              value={formulario.temperatura}
              onChange={atualizarCampo}
              placeholder={tr("Informe o valor")}
            />
          </div>

          <div className="dados-tecnicos-field">
            <label htmlFor="umidade">{tr("Umidade")}</label>

            <input
              id="umidade"
              name="umidade"
              type="number"
              step="any"
              value={formulario.umidade}
              onChange={atualizarCampo}
              placeholder={tr("Informe o valor")}
            />
          </div>

          <div className="dados-tecnicos-field">
            <label htmlFor="status">{tr("Status")}</label>

            <select
              id="status"
              name="status"
              value={formulario.status}
              onChange={atualizarCampo}
            >
              <option value="PENDENTE">{tr("Pendente")}</option>

              <option value="CONCLUIDO">{tr("Concluído")}</option>
            </select>
          </div>
        </div>

        <div className="dados-tecnicos-field">
          <label htmlFor="observacoes">{tr("Observações")}</label>

          <textarea
            id="observacoes"
            name="observacoes"
            rows="4"
            value={formulario.observacoes}
            onChange={atualizarCampo}
            placeholder={tr("Digite observações sobre as condições do local")}
          />
        </div>

        <div className="dados-tecnicos-actions">
          {editando && (
            <button
              type="button"
              className="dados-tecnicos-cancel-button"
              onClick={cancelarEdicao}
              disabled={salvando}
            >{tr("Cancelar")}</button>
          )}

          <button
            type="submit"
            disabled={salvando}
          >
            {salvando
              ? tr('Salvando...')
              : editando
                ? tr('Salvar alterações')
                : tr('Salvar dados técnicos')}
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
          titulo={tr("Dados Técnicos")}
          subtitulo={tr("Características técnicas do espaço confinado")}
        />

        <section className="inventario-main">
          <Link
            to={`/locais/${idLocal}/inventario`}
            className="inventario-back"
          >{tr("← Voltar para o inventário")}</Link>

          {carregando && (
            <p className="inventario-message">{tr("Carregando dados técnicos...")}</p>
          )}

          {erro && (
            <p
              className="inventario-error"
              role="alert"
            >
              {aviso(erro)}
            </p>
          )}

          {sucesso && (
            <p className="dados-tecnicos-success">
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
              </div>

              <div className="inventario-section-title">
                <h3>{tr("Dados Técnicos")}</h3>

                <p>{tr("Características técnicas e ambientais registradas para este espaço confinado.")}</p>
              </div>

              {!dadosTecnicos &&
                renderizarFormulario(salvarNovo)}

              {dadosTecnicos && editando &&
                renderizarFormulario(salvarEdicao)}

              {dadosTecnicos && !editando && (
                <div className="dados-tecnicos-existing">
                  <h4>{tr("Dados técnicos cadastrados")}</h4>

                  <div className="dados-tecnicos-grid">
                    <p>
                      <strong>{tr("Pressão atmosférica:")}</strong>{' '}
                      {numero(dadosTecnicos.pressao_atmosferica ??
                        tr('Não informada'))}
                    </p>

                    <p>
                      <strong>{tr("Ventilação:")}</strong>{' '}
                      {rotulo(dadosTecnicos.ventilacao ||
                        tr('Não informada'))}
                    </p>

                    <p>
                      <strong>{tr("Oxigênio:")}</strong>{' '}
                      {numero(dadosTecnicos.oxigenio ??
                        tr('Não informado'))}
                    </p>

                    <p>
                      <strong>{tr("Gás inflamável:")}</strong>{' '}
                      {numero(dadosTecnicos.gas_inflamavel ??
                        tr('Não informado'))}
                    </p>

                    <p>
                      <strong>{tr("Monóxido de carbono:")}</strong>{' '}
                      {numero(dadosTecnicos.monoxido_carbono ??
                        tr('Não informado'))}
                    </p>

                    <p>
                      <strong>{tr("Sulfeto de hidrogênio:")}</strong>{' '}
                      {numero(dadosTecnicos.sulfeto_hidrogenio ??
                        tr('Não informado'))}
                    </p>

                    <p>
                      <strong>{tr("Temperatura:")}</strong>{' '}
                      {numero(dadosTecnicos.temperatura ??
                        tr('Não informada'))}
                    </p>

                    <p>
                      <strong>{tr("Umidade:")}</strong>{' '}
                      {numero(dadosTecnicos.umidade ??
                        tr('Não informada'))}
                    </p>

                    <p>
                      <strong>{tr("Status:")}</strong>{' '}
                      {rotulo(dadosTecnicos.status ||
                        tr('Não informado'))}
                    </p>
                  </div>

                  <div className="dados-tecnicos-observacoes">
                    <strong>{tr("Observações")}</strong>

                    <p>
                      {dadosTecnicos.observacoes ||
                        tr('Nenhuma observação registrada.')}
                    </p>
                  </div>

                  <div className="dados-tecnicos-actions">
                    <button
                      type="button"
                      onClick={iniciarEdicao}
                      disabled={!podeEditar || (alterandoStatus)}
                    >{tr("Editar dados técnicos")}</button>

                    {dadosTecnicos.status ===
                      'PENDENTE' && (
                      <button
                        type="button"
                        className="dados-tecnicos-finish-button"
                        onClick={() =>
                          mudarStatus('CONCLUIDO')
                        }
                        disabled={!podeEditar || (alterandoStatus)}
                      >
                        {alterandoStatus
                          ? tr('Alterando...')
                          : tr('Concluir')}
                      </button>
                    )}

                    {dadosTecnicos.status ===
                      'CONCLUIDO' && (
                      <button
                        type="button"
                        className="dados-tecnicos-reopen-button"
                        onClick={() =>
                          mudarStatus('PENDENTE')
                        }
                        disabled={!podeEditar || (alterandoStatus)}
                      >
                        {alterandoStatus
                          ? tr('Alterando...')
                          : tr('Reabrir')}
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

export default DadosTecnicosLocal