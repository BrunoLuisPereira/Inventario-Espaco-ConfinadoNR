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
        <div className="dados-tecnicos-grid">
          <div className="dados-tecnicos-field">
            <label htmlFor="pressao_atmosferica">
              Pressão atmosférica
            </label>

            <input
              id="pressao_atmosferica"
              name="pressao_atmosferica"
              type="number"
              step="any"
              value={formulario.pressao_atmosferica}
              onChange={atualizarCampo}
              placeholder="Informe o valor"
            />
          </div>

          <div className="dados-tecnicos-field">
            <label htmlFor="ventilacao">
              Ventilação
            </label>

            <select
              id="ventilacao"
              name="ventilacao"
              value={formulario.ventilacao}
              onChange={atualizarCampo}
            >
              <option value="NAO_INFORMADA">
                Não informada
              </option>

              <option value="NATURAL">
                Natural
              </option>

              <option value="MECANICA">
                Mecânica
              </option>

              <option value="FORCADA">
                Forçada
              </option>
            </select>
          </div>

          <div className="dados-tecnicos-field">
            <label htmlFor="oxigenio">
              Oxigênio
            </label>

            <input
              id="oxigenio"
              name="oxigenio"
              type="number"
              step="any"
              value={formulario.oxigenio}
              onChange={atualizarCampo}
              placeholder="Informe o valor"
            />
          </div>

          <div className="dados-tecnicos-field">
            <label htmlFor="gas_inflamavel">
              Gás inflamável
            </label>

            <input
              id="gas_inflamavel"
              name="gas_inflamavel"
              type="number"
              step="any"
              value={formulario.gas_inflamavel}
              onChange={atualizarCampo}
              placeholder="Informe o valor"
            />
          </div>

          <div className="dados-tecnicos-field">
            <label htmlFor="monoxido_carbono">
              Monóxido de carbono
            </label>

            <input
              id="monoxido_carbono"
              name="monoxido_carbono"
              type="number"
              step="any"
              value={formulario.monoxido_carbono}
              onChange={atualizarCampo}
              placeholder="Informe o valor"
            />
          </div>

          <div className="dados-tecnicos-field">
            <label htmlFor="sulfeto_hidrogenio">
              Sulfeto de hidrogênio
            </label>

            <input
              id="sulfeto_hidrogenio"
              name="sulfeto_hidrogenio"
              type="number"
              step="any"
              value={formulario.sulfeto_hidrogenio}
              onChange={atualizarCampo}
              placeholder="Informe o valor"
            />
          </div>

          <div className="dados-tecnicos-field">
            <label htmlFor="temperatura">
              Temperatura
            </label>

            <input
              id="temperatura"
              name="temperatura"
              type="number"
              step="any"
              value={formulario.temperatura}
              onChange={atualizarCampo}
              placeholder="Informe o valor"
            />
          </div>

          <div className="dados-tecnicos-field">
            <label htmlFor="umidade">
              Umidade
            </label>

            <input
              id="umidade"
              name="umidade"
              type="number"
              step="any"
              value={formulario.umidade}
              onChange={atualizarCampo}
              placeholder="Informe o valor"
            />
          </div>

          <div className="dados-tecnicos-field">
            <label htmlFor="status">
              Status
            </label>

            <select
              id="status"
              name="status"
              value={formulario.status}
              onChange={atualizarCampo}
            >
              <option value="PENDENTE">
                Pendente
              </option>

              <option value="CONCLUIDO">
                Concluído
              </option>
            </select>
          </div>
        </div>

        <div className="dados-tecnicos-field">
          <label htmlFor="observacoes">
            Observações
          </label>

          <textarea
            id="observacoes"
            name="observacoes"
            rows="4"
            value={formulario.observacoes}
            onChange={atualizarCampo}
            placeholder="Digite observações sobre as condições do local"
          />
        </div>

        <div className="dados-tecnicos-actions">
          {editando && (
            <button
              type="button"
              className="dados-tecnicos-cancel-button"
              onClick={cancelarEdicao}
              disabled={salvando}
            >
              Cancelar
            </button>
          )}

          <button
            type="submit"
            disabled={salvando}
          >
            {salvando
              ? 'Salvando...'
              : editando
                ? 'Salvar alterações'
                : 'Salvar dados técnicos'}
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
          titulo="Dados Técnicos"
          subtitulo="Características técnicas do espaço confinado"
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
              Carregando dados técnicos...
            </p>
          )}

          {erro && (
            <p
              className="inventario-error"
              role="alert"
            >
              {erro}
            </p>
          )}

          {sucesso && (
            <p className="dados-tecnicos-success">
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
              </div>

              <div className="inventario-section-title">
                <h3>Dados Técnicos</h3>

                <p>
                  Características técnicas e ambientais
                  registradas para este espaço confinado.
                </p>
              </div>

              {!dadosTecnicos &&
                renderizarFormulario(salvarNovo)}

              {dadosTecnicos && editando &&
                renderizarFormulario(salvarEdicao)}

              {dadosTecnicos && !editando && (
                <div className="dados-tecnicos-existing">
                  <h4>Dados técnicos cadastrados</h4>

                  <div className="dados-tecnicos-grid">
                    <p>
                      <strong>
                        Pressão atmosférica:
                      </strong>{' '}
                      {dadosTecnicos.pressao_atmosferica ??
                        'Não informada'}
                    </p>

                    <p>
                      <strong>Ventilação:</strong>{' '}
                      {dadosTecnicos.ventilacao ||
                        'Não informada'}
                    </p>

                    <p>
                      <strong>Oxigênio:</strong>{' '}
                      {dadosTecnicos.oxigenio ??
                        'Não informado'}
                    </p>

                    <p>
                      <strong>
                        Gás inflamável:
                      </strong>{' '}
                      {dadosTecnicos.gas_inflamavel ??
                        'Não informado'}
                    </p>

                    <p>
                      <strong>
                        Monóxido de carbono:
                      </strong>{' '}
                      {dadosTecnicos.monoxido_carbono ??
                        'Não informado'}
                    </p>

                    <p>
                      <strong>
                        Sulfeto de hidrogênio:
                      </strong>{' '}
                      {dadosTecnicos.sulfeto_hidrogenio ??
                        'Não informado'}
                    </p>

                    <p>
                      <strong>Temperatura:</strong>{' '}
                      {dadosTecnicos.temperatura ??
                        'Não informada'}
                    </p>

                    <p>
                      <strong>Umidade:</strong>{' '}
                      {dadosTecnicos.umidade ??
                        'Não informada'}
                    </p>

                    <p>
                      <strong>Status:</strong>{' '}
                      {dadosTecnicos.status ||
                        'Não informado'}
                    </p>
                  </div>

                  <div className="dados-tecnicos-observacoes">
                    <strong>Observações</strong>

                    <p>
                      {dadosTecnicos.observacoes ||
                        'Nenhuma observação registrada.'}
                    </p>
                  </div>

                  <div className="dados-tecnicos-actions">
                    <button
                      type="button"
                      onClick={iniciarEdicao}
                      disabled={alterandoStatus}
                    >
                      Editar dados técnicos
                    </button>

                    {dadosTecnicos.status ===
                      'PENDENTE' && (
                      <button
                        type="button"
                        className="dados-tecnicos-finish-button"
                        onClick={() =>
                          mudarStatus('CONCLUIDO')
                        }
                        disabled={alterandoStatus}
                      >
                        {alterandoStatus
                          ? 'Alterando...'
                          : 'Concluir'}
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
                        disabled={alterandoStatus}
                      >
                        {alterandoStatus
                          ? 'Alterando...'
                          : 'Reabrir'}
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