import { useTraducao } from '../../hooks/useTraducao.js'
import { useState } from 'react'
import {
  atualizarLocal,
  criarLocal,
} from '../../services/api'

function LocalForm({
  idCampanha,
  localEdicao = null,
  onCancelar,
  onLocalSalvo,
}) {
  const { aviso, tr } = useTraducao()

  const editando = Boolean(localEdicao)

  const [formulario, setFormulario] = useState({
    nome_local: localEdicao?.nome_local || '',
    setor: localEdicao?.setor || '',
    descricao: localEdicao?.descricao || '',
    endereco: localEdicao?.endereco || '',
    latitude: localEdicao?.latitude ?? '',
    longitude: localEdicao?.longitude ?? '',
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
        nome_local: formulario.nome_local.trim(),
        setor: formulario.setor.trim() || null,
        descricao: formulario.descricao.trim() || null,
        endereco: formulario.endereco.trim() || null,
        latitude:
          formulario.latitude === ''
            ? null
            : Number(formulario.latitude),
        longitude:
          formulario.longitude === ''
            ? null
            : Number(formulario.longitude),
      }

      let resposta

      if (editando) {
        resposta = await atualizarLocal(
          localEdicao.id_local,
          dados
        )
      } else {
        resposta = await criarLocal({
          ...dados,
          status: 'ATIVO',
          id_campanha: idCampanha,
        })
      }

      onLocalSalvo(resposta.data)
    } catch (error) {
      setErro(error.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form
      className="local-form"
      onSubmit={enviarFormulario}
    >
      <div className="local-form-grid">
        <div className="local-form-field">
          <label htmlFor="nome_local">{tr("Nome do local *")}</label>

          <input
            id="nome_local"
            name="nome_local"
            maxLength={150}
            type="text"
            value={formulario.nome_local}
            onChange={atualizarCampo}
            placeholder={tr("Ex.: Tanque de Gás TG-01")}
            required
          />
        </div>

        <div className="local-form-field">
          <label htmlFor="setor">{tr("Setor")}</label>

          <input
            id="setor"
            name="setor"
            maxLength={120}
            type="text"
            value={formulario.setor}
            onChange={atualizarCampo}
            placeholder={tr("Ex.: Produção")}
          />
        </div>

        <div className="local-form-field local-form-field-full">
          <label htmlFor="descricao">{tr("Descrição")}</label>

          <textarea
            id="descricao"
            name="descricao"
            value={formulario.descricao}
            onChange={atualizarCampo}
            placeholder={tr("Descreva o espaço confinado.")}
            rows="4"
          />
        </div>

        <div className="local-form-field local-form-field-full">
          <label htmlFor="endereco">{tr("Endereço")}</label>

          <input
            id="endereco"
            name="endereco"
            maxLength={255}
            type="text"
            value={formulario.endereco}
            onChange={atualizarCampo}
            placeholder={tr("Ex.: Rua das Indústrias, 1200")}
          />
        </div>

        <div className="local-form-field">
          <label htmlFor="latitude">{tr("Latitude")}</label>

          <input
            id="latitude"
            name="latitude"
            min={-90}
            max={90}
            type="number"
            step="any"
            value={formulario.latitude}
            onChange={atualizarCampo}
            placeholder={tr("Ex.: -26.3044")}
          />
        </div>

        <div className="local-form-field">
          <label htmlFor="longitude">{tr("Longitude")}</label>

          <input
            id="longitude"
            name="longitude"
            min={-180}
            max={180}
            type="number"
            step="any"
            value={formulario.longitude}
            onChange={atualizarCampo}
            placeholder={tr("Ex.: -48.8487")}
          />
        </div>
      </div>

      {erro && (
        <p className="local-form-error" role="alert">
          {aviso(erro)}
        </p>
      )}

      <div className="local-form-actions">
        <button
          type="button"
          className="local-button-secondary"
          onClick={onCancelar}
          disabled={salvando}
        >{tr("Cancelar")}</button>

        <button
          type="submit"
          className="local-button-primary"
          disabled={salvando}
        >
          {salvando
            ? tr('Salvando...')
            : editando
              ? tr('Salvar alterações')
              : tr('Cadastrar local')}
        </button>
      </div>
    </form>
  )
}

export default LocalForm
