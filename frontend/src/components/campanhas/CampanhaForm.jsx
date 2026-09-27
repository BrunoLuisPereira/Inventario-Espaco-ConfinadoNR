import { useState } from 'react'
import {
  atualizarCampanha,
  criarCampanha,
} from '../../services/api'

function formatarDataParaInput(data) {
  if (!data) {
    return ''
  }

  return data.slice(0, 10)
}

function CampanhaForm({
  campanha = null,
  onCancelar,
  onCampanhaSalva,
}) {
  const editando = Boolean(campanha)

  const [formulario, setFormulario] = useState({
    nome_campanha: campanha?.nome_campanha || '',
    empresa: campanha?.empresa || '',
    responsavel: campanha?.responsavel || '',
    data_inicio: formatarDataParaInput(campanha?.data_inicio),
  })

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  function atualizarCampo(event) {
    const { name, value } = event.target

    setFormulario((dadosAtuais) => ({
      ...dadosAtuais,
      [name]: value,
    }))
  }

  async function enviarFormulario(event) {
    event.preventDefault()

    try {
      setSalvando(true)
      setErro('')

      const dados = {
        nome_campanha: formulario.nome_campanha.trim(),
        empresa: formulario.empresa.trim(),
        responsavel: formulario.responsavel.trim(),
        data_inicio: formulario.data_inicio,
      }

      let resposta

      if (editando) {
        resposta = await atualizarCampanha(
          campanha.id_campanha,
          dados
        )
      } else {
        resposta = await criarCampanha({
          ...dados,
          status: 'EM ANDAMENTO',
        })
      }

      onCampanhaSalva(resposta.data)
    } catch (error) {
      setErro(error.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form
      className="campanha-form"
      onSubmit={enviarFormulario}
    >
      <div className="campanha-form-grid">
        <div className="campanha-form-field">
          <label htmlFor="nome_campanha">
            Nome da campanha
          </label>

          <input
            id="nome_campanha"
            name="nome_campanha"
            type="text"
            value={formulario.nome_campanha}
            onChange={atualizarCampo}
            required
          />
        </div>

        <div className="campanha-form-field">
          <label htmlFor="empresa">
            Empresa
          </label>

          <input
            id="empresa"
            name="empresa"
            type="text"
            value={formulario.empresa}
            onChange={atualizarCampo}
            required
          />
        </div>

        <div className="campanha-form-field">
          <label htmlFor="responsavel">
            Responsável
          </label>

          <input
            id="responsavel"
            name="responsavel"
            type="text"
            value={formulario.responsavel}
            onChange={atualizarCampo}
            required
          />
        </div>

        <div className="campanha-form-field">
          <label htmlFor="data_inicio">
            Data de início
          </label>

          <input
            id="data_inicio"
            name="data_inicio"
            type="date"
            value={formulario.data_inicio}
            onChange={atualizarCampo}
            required
          />
        </div>
      </div>

      {erro && (
        <p className="campanhas-error" role="alert">
          {erro}
        </p>
      )}

      <div className="campanha-form-actions">
        <button
          type="button"
          className="campanha-button-secondary"
          onClick={onCancelar}
          disabled={salvando}
        >
          Cancelar
        </button>

        <button
          type="submit"
          className="campanha-button-primary"
          disabled={salvando}
        >
          {salvando
            ? 'Salvando...'
            : editando
              ? 'Salvar alterações'
              : 'Cadastrar campanha'}
        </button>
      </div>
    </form>
  )
}

export default CampanhaForm