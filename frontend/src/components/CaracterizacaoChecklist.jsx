import { camposCaracterizacao } from '../services/caracterizacaoChecklist'

// Títulos de apresentação independentes dos metadados usados na validação.
const titulos = {
  codigo_identificacao: 'Código de identificação / rastreio',
  volume_m3: 'Volume do espaço (m³)',
  quantidade_aberturas: 'Quantidade de aberturas e bocas de visita',
  dimensoes_aberturas: 'Dimensões das aberturas e bocas de visita',
  formas_acesso: 'Formas de acesso e respectivas dimensões',
  geometria: 'Geometria do espaço confinado',
  utilizacao_produto: 'Utilização do espaço / produto armazenado',
  perigos_antes_liberacao: 'Possíveis perigos antes da liberação de entrada',
}

const grupos = [
  { titulo: 'Identificação e medidas', inicio: 0, fim: 3 },
  { titulo: 'Dimensões e acesso', inicio: 3, fim: 7 },
  { titulo: 'Perigos identificados', inicio: 7, fim: 8 },
]

export default function CaracterizacaoChecklist({ dados, onChange, salvando = false, consulta = false }) {
  return (
    <section className={`checklist-caracterizacao${consulta ? ' checklist-caracterizacao-consulta' : ''}`} aria-labelledby="titulo-caracterizacao">
      <h4 id="titulo-caracterizacao">Caracterização do Espaço Confinado</h4>
      {!consulta && <p>Campos opcionais. Informe as unidades nas descrições das dimensões.</p>}
      {grupos.map(({ titulo, inicio, fim }) => <section className="checklist-caracterizacao-grupo" key={inicio} aria-labelledby={`caracterizacao-grupo-${inicio}`}>
        <h5 id={`caracterizacao-grupo-${inicio}`}>{titulo}</h5>
        <div className="checklist-caracterizacao-grid">
        {camposCaracterizacao.slice(inicio, fim).map(({ nome, limite, linhas, tipo, passo, minimo, maximo, exemplo }) => (
          <div className={`checklist-field${linhas ? ' checklist-caracterizacao-descricao' : ''}${consulta ? ' checklist-caracterizacao-card' : ''}`} key={nome}>
            {consulta ? (
              <>
                <span className="checklist-caracterizacao-rotulo">{titulos[nome]}</span>
                <p className={`checklist-caracterizacao-valor${dados[nome] == null || dados[nome] === '' ? ' checklist-caracterizacao-valor-vazio' : ''}`}>
                  {dados[nome] == null || dados[nome] === '' ? 'Não informado' : `${dados[nome]}${nome === 'volume_m3' ? ' m³' : ''}`}
                </p>
              </>
            ) : (
              <>
                <label htmlFor={nome}>{titulos[nome]}</label>
                {linhas ? (
                  <textarea id={nome} name={nome} rows={2} maxLength={limite} value={dados[nome] ?? ''}
                    onChange={onChange} disabled={salvando} placeholder={exemplo} />
                ) : (
                  <input id={nome} name={nome} type={tipo || 'text'} step={passo} min={minimo} max={maximo}
                    maxLength={limite} value={dados[nome] ?? ''} onChange={onChange} disabled={salvando} />
                )}
              </>
            )}
          </div>
        ))}
        </div>
      </section>)}
    </section>
  )
}
