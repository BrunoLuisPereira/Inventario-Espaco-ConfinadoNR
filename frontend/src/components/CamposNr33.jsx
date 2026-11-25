import { useTraducao } from '../hooks/useTraducao.js'
import { atmosferaNr33, lerRespostaNr33,
  valorRespostaNr33, textoRespostaNr33, descreverPendenciasNr33 } from '../services/camposNr33.js'

export function AvaliacaoNr33({ avaliacao, status = 'PENDENTE', desatualizada = false }) {
  const { aviso, tr } = useTraducao()

  const validacao = avaliacao?.validacao_conclusao
  const classificacao = avaliacao?.classificacao
  // Rotulos dos resultados retornados pelo servidor, sem recalcular as regras.
  const resultados = {
    CARACTERIZADO: tr('Caracterizado como espaço confinado'),
    NAO_CARACTERIZADO_PELA_REGRA_GERAL: tr('Não caracterizado pela regra geral'),
    NAO_CARACTERIZADO: tr('Não caracterizado após avaliação das hipóteses'),
    PENDENTE: tr('Avaliação pendente'),
    AVALIACAO_HISTORICA_INCOMPLETA: tr('Avaliação histórica incompleta'),
  }
  const resultado = valor => Object.hasOwn(resultados, valor) ? resultados[valor] : tr('Avaliação indisponível')
  return <section className="checklist-nr33 checklist-avaliacao" aria-label={tr("Avaliação NR-33")}>
    <h4>{tr("Avaliação NR-33")}</h4>
    {desatualizada && <p className="checklist-nr33-aviso" role="status">{tr("Há alterações não salvas.")}</p>}
    <dl className="checklist-nr33-resumo">
      <div><dt>{tr("Status do preenchimento do checklist")}</dt><dd>{status === 'CONCLUIDO' ? tr('Concluído') : tr('Pendente')}</dd></div>
      <div><dt>{tr("Caracterização pela regra geral A/B/C")}</dt><dd>{resultado(classificacao?.regraGeral)}</dd></div>
      <div><dt>{tr("Classificação normativa consolidada")}</dt><dd>{resultado(classificacao?.resultado)}</dd></div>
    </dl>
    {classificacao?.resultado === 'PENDENTE' && <p>{tr("A classificação normativa pode permanecer pendente após a conclusão do preenchimento.")}
      {classificacao.hipoteseEspecifica === 'NAO_AVALIADA' && <> {tr("Hipótese específica não avaliada.")}</>}
    </p>}
    {validacao?.erros?.length > 0 && <><h5>{tr("Pendências")}</h5><ul>{descreverPendenciasNr33(validacao.erros).map((texto, i) => <li key={i}>{aviso(texto)}</li>)}</ul></>}
    {validacao?.avisos?.includes('AUSENCIA_SINALIZACAO') && <p className="checklist-nr33-aviso">{tr("Ausência de sinalização: foi informado que não há placa de identificação.")}</p>}
    {avaliacao?.classificacao?.origem === 'HIPOTESE_ESPECIFICA' && <p>{tr("Esta avaliação depende exclusivamente de respostas históricas da hipótese específica.")}</p>}
    <p>{tr("Esta avaliação não autoriza a entrada no espaço confinado nem concede permissão de edição.")}</p>
  </section>
}

export default function CamposNr33({ dados, onChange, consulta = false, salvando = false }) {
  const { tr } = useTraducao()

  const sinalizacaoHabilitada = ['criterio_a', 'criterio_b', 'criterio_c'].every(campo => dados[campo] === 'SIM')
  function campo(nome, rotulo, desabilitado = false) {
    return <div className="checklist-field checklist-nr33-campo" key={nome}>
      {consulta ? <><span>{tr(rotulo)}</span><strong>{tr(textoRespostaNr33(nome, dados[nome]))}</strong></> : <>
        <label htmlFor={nome}>{tr(rotulo)}</label>
        <select id={nome} name={nome} value={valorRespostaNr33(nome, dados[nome])} disabled={salvando || desabilitado}
          aria-describedby={nome === 'possui_placa_identificacao' && !sinalizacaoHabilitada ? 'nr33-sinalizacao-disponibilidade'
            : atmosferaNr33.some(([campo]) => campo === nome) && dados.criterio_c !== 'SIM' ? 'nr33-atmosfera-disponibilidade' : undefined}
          onChange={event => onChange(nome, lerRespostaNr33(nome, event.target.value))}>
          <option value="">{tr("Não avaliado")}</option>
          <option value="SIM">{tr("Sim")}</option><option value="NAO">{tr("Não")}</option>
        </select>
      </>}
    </div>
  }
  return <section className="checklist-nr33" aria-label={tr("Respostas de caracterização NR-33")}>
    <h4>{tr("Caracterização NR-33")}</h4>
    {!consulta && <p>{tr("“Não avaliado” mantém a ausência de resposta. A habilitação dos campos é atualizada conforme as respostas. A avaliação do servidor é atualizada após salvar. Alterar um critério não apaga respostas.")}</p>}
    <div className="checklist-nr33-grupo">
      <h5>{tr("Detalhamento atmosférico")}</h5>
      {dados.criterio_c !== 'SIM' && <p id="nr33-atmosfera-disponibilidade">{tr("Disponível quando o Critério C for SIM.")}</p>}
      <div className="checklist-nr33-grid">{atmosferaNr33.map(([n, r]) => campo(n, r, dados.criterio_c !== 'SIM'))}</div>
    </div>
    <div className="checklist-nr33-grupo">
      <h5>{tr("Sinalização")}</h5>
      {!sinalizacaoHabilitada && <p id="nr33-sinalizacao-disponibilidade">{tr("Disponível quando os Critérios A, B e C forem SIM.")}</p>}
      <div className="checklist-nr33-grid">{campo('possui_placa_identificacao', tr('Possui placa de identificação?'), !sinalizacaoHabilitada)}</div>
    </div>
  </section>
}
