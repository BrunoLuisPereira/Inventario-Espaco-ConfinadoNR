import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import * as campos from '../src/services/camposNr33.js'

// Sem servidor, DOM, rede ou dependencias novas. Compila o JSX real em memoria
// com Rolldown ja usado pelo Vite. React e seu renderer reais; apenas traducao e
// simulada. Re-renderizar props testa a aplicabilidade antes de qualquer salvamento.
const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { rolldown } = require('rolldown')
const fonte = readFileSync(new URL('../src/components/CamposNr33.jsx', import.meta.url), 'utf8')
const bundle = await rolldown({ input: 'nr33-componente.jsx',
  external: ['react/jsx-runtime'],
  transform: { jsx: { runtime: 'automatic' } },
  plugins: [{ name: 'componente-real-em-memoria',
    resolveId(id) {
      if (id === '../hooks/useTraducao.js') return { id: 'nr33-traducao', external: true }
      if (id === '../services/camposNr33.js') return { id: 'nr33-campos', external: true }
      return id === 'nr33-componente.jsx' ? id : null
    },
    load: id => id === 'nr33-componente.jsx' ? fonte : null }] })
let codigo
try { codigo = (await bundle.generate({ format: 'cjs', exports: 'named' })).output[0].code }
finally { await bundle.close() }
const modulo = { exports: {} }
vm.runInNewContext(codigo, { module: modulo, exports: modulo.exports, require(nome) {
  if (nome === 'nr33-traducao') return { useTraducao: () => ({ tr: t => t, aviso: t => t }) }
  if (nome === 'nr33-campos') return campos
  if (nome === 'react/jsx-runtime') return require(nome)
  throw Error(`Import nao autorizado no teste: ${nome}`)
} }, { filename: 'CamposNr33.jsx', timeout: 5000 })
const { default: CamposNr33, AvaliacaoNr33 } = modulo.exports
const historico = { criterio_a: 'SIM', criterio_b: 'SIM', criterio_c: 'SIM',
  ...campos.preencherCamposNr33(), atmosfera_oxigenio: true,
  atmosfera_contaminantes: false, atmosfera_explosiva: null, possui_placa_identificacao: false }

function elementos(arvore) {
  if (Array.isArray(arvore)) return arvore.flatMap(elementos)
  if (!React.isValidElement(arvore)) return []
  return [arvore, ...elementos(arvore.props.children)]
}
function montar(dados, envios = []) {
  const arvore = CamposNr33({ dados, onChange: (campo, valor) => envios.push([campo, valor]) })
  const selects = Object.fromEntries(elementos(arvore).filter(e => e.type === 'select').map(e => [e.props.name, e.props]))
  return { arvore, selects, html: renderToStaticMarkup(arvore) }
}

for (const a of ['SIM', 'NAO']) for (const b of ['SIM', 'NAO']) for (const c of ['SIM', 'NAO']) {
  test(`RED contrato UI: aplicabilidade imediata e historico ${a}/${b}/${c}`, () => {
    const envios = [], dados = { ...historico, criterio_a: a, criterio_b: b, criterio_c: c }, antes = structuredClone(dados)
    const antesMudanca = montar(historico, envios)
    assert.equal(antesMudanca.selects.atmosfera_oxigenio.disabled, false)
    assert.equal(antesMudanca.selects.possui_placa_identificacao.disabled, false)
    const atual = montar(dados, envios)
    for (const [campo] of campos.atmosferaNr33) assert.equal(atual.selects[campo].disabled, c !== 'SIM')
    assert.equal(atual.selects.possui_placa_identificacao.disabled, ![a, b, c].every(v => v === 'SIM'))
    assert.equal(atual.selects.atmosfera_oxigenio.value, 'SIM')
    assert.equal(atual.selects.atmosfera_contaminantes.value, 'NAO')
    assert.equal(atual.selects.atmosfera_explosiva.value, '')
    assert.equal(atual.selects.possui_placa_identificacao.value, 'NAO')
    assert.deepEqual(dados, antes)
    assert.deepEqual(envios, [], 'Mudar aplicabilidade nao deve limpar respostas via onChange')
    const retorno = montar({ ...dados, criterio_a: 'SIM', criterio_b: 'SIM', criterio_c: 'SIM' })
    assert.ok(Object.values(retorno.selects).every(s => !s.disabled))
    assert.equal(retorno.selects.atmosfera_contaminantes.value, 'NAO')
  })
}

test('RED contrato UI: eventos dos dependentes preservam booleano negativo e PATCH sem limpeza historica', () => {
  const envios = [], { selects } = montar(historico, envios)
  selects.atmosfera_oxigenio.onChange({ target: { value: 'NAO' } })
  assert.deepEqual(envios, [['atmosfera_oxigenio', false]])
  const antes = { ...historico, acesso_controlado: 'SIM', ventilacao_adequada: 'SIM',
    monitoramento_atmosferico: 'SIM', procedimento_emergencia: 'SIM' }
  assert.deepEqual(campos.prepararEdicaoChecklist({ ...antes, criterio_c: 'NAO' }, antes), { criterio_c: 'NAO' })
})

test('RED contrato UI: nao adiciona controles de hipotese especifica, armazenagem, engolfamento ou afogamento', () => {
  const { arvore } = montar(historico)
  const controles = elementos(arvore).filter(e => ['input', 'select', 'textarea'].includes(e.type))
  assert.deepEqual(controles.map(e => e.props.name).sort(), [...campos.booleanosNr33].sort())
  for (const e of controles) assert.ok(![campos.marcadorNr33, ...campos.condicoesEspecificasNr33.map(([c]) => c)].includes(e.props.name))
})

test('RED contrato UI: orientacao nao adia habilitacao dos campos ate salvar', () => {
  assert.doesNotMatch(montar(historico).html, /aplicabilidade será atualizada ao salvar/i)
})

test('RED contrato UI: preenchimento concluido e classificacao normativa pendente sao distintos', () => {
  const avaliacao = { classificacao: { resultado: 'PENDENTE', origem: 'AVALIACAO_PENDENTE',
    regraGeral: 'NAO_CARACTERIZADO_PELA_REGRA_GERAL', hipoteseEspecifica: 'NAO_AVALIADA' },
    validacao_conclusao: { pode_concluir: true, erros: [], avisos: [] } }
  const html = renderToStaticMarkup(AvaliacaoNr33({ avaliacao, status: 'CONCLUIDO' }))
  assert.match(html, /Concluído/)
  assert.match(html, /preenchimento/i, 'Status concluido deve ter alcance de preenchimento explicito')
  assert.match(html, /regra geral/i)
  assert.match(html, /(?:classificação[\s\S]*pendente|hipótese específica[\s\S]*não avaliada)/i)
  assert.match(html, /não autoriza a entrada/i)
})

test('RED contrato UI: aviso de ausencia de sinalizacao aplicavel e ausencia de autorizacao permanecem', () => {
  const html = renderToStaticMarkup(AvaliacaoNr33({ status: 'CONCLUIDO', avaliacao: {
    validacao_conclusao: { pode_concluir: true, erros: [], avisos: ['AUSENCIA_SINALIZACAO'] } } }))
  assert.match(html, /Ausência de sinalização/)
  assert.match(html, /não autoriza a entrada/)
})
