import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { i18n, recursos } from '../src/i18n/index.js'
import { traduzir, traduzirMensagem, rotuloEnum } from '../src/i18n/apresentacao.js'
import { formatarData, formatarNumero, localeAtivo } from '../src/i18n/formatacao.js'
import { lerRespostaNr33, prepararEdicaoChecklist } from '../src/services/camposNr33.js'

const require = createRequire(import.meta.url)
const { parse } = require('@babel/parser')
const root = fileURLToPath(new URL('../src', import.meta.url))
const referencias = new Map(Object.values(recursos['pt-BR']).flatMap(c => Object.entries(c).map(([k,v]) => [v,k])))
test.afterEach(async () => { await i18n.changeLanguage('pt-BR') })

test('todos os rótulos e modelos possuem tradução efetiva em inglês, sem interpolação pendente', async () => {
  await i18n.changeLanguage('en')
  for (const [ns, catalogo] of Object.entries(recursos['pt-BR'])) {
    assert.deepEqual(Object.keys(catalogo).sort(), Object.keys(recursos.en[ns]).sort(), ns)
    for (const [key, original] of Object.entries(catalogo)) {
      const params = Object.fromEntries([...original.matchAll(/{{(\w+)}}/g)].map(m => [m[1], 'Synthetic']))
      const actual = i18n.t(key, { ns, ...params, keySeparator: false, nsSeparator: false })
      assert.ok(actual.trim(), ns + ':' + key)
      assert.doesNotMatch(actual, /{{|}}|undefined|\uFFFD/, ns + ':' + key)
      assert.equal(actual, recursos.en[ns][key].replace(/{{\w+}}/g, 'Synthetic'))
    }
  }
})

test('chaves usadas no JSX e textos estáticos visíveis estão catalogados', () => {
  function visitar(dir) {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entrada.name)
      if (entrada.isDirectory()) { visitar(file); continue }
      if (!file.endsWith('.jsx')) continue
      const ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] })
      function checar(node) {
        if (!node || typeof node !== 'object') return
        if (node.type === 'CallExpression' && node.callee.name === 'tr' && node.arguments[0]?.type === 'StringLiteral') {
          assert.ok(referencias.has(node.arguments[0].value), file + ':' + node.loc.start.line + ' ' + node.arguments[0].value)
        }
        if (node.type === 'JSXText' && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(node.value)) {
          assert.ok(['English', 'Português (Brasil)'].includes(node.value.trim()), 'Texto sem tradução: ' + file + ':' + node.loc.start.line + ' ' + node.value.trim())
        }
        for (const [key, value] of Object.entries(node)) {
          if (['loc', 'extra', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue
          if (Array.isArray(value)) value.forEach(checar)
          else if (value && typeof value === 'object') checar(value)
        }
      }
      checar(ast)
    }
  }
  visitar(root)
})

test('mensagem já visível muda de idioma sem modificar o estado original ou Error', async () => {
  const erro = new Error('Informe o nome e o e-mail.')
  assert.equal(traduzirMensagem(erro.message), erro.message)
  await i18n.changeLanguage('en')
  assert.equal(traduzirMensagem(erro.message), 'Enter your name and email address.')
  assert.equal(erro.message, 'Informe o nome e o e-mail.')
  await i18n.changeLanguage('pt-BR')
  assert.equal(traduzirMensagem(erro.message), erro.message)
})

test('validações NR-33, detalhes e parâmetros traduzem somente a apresentação', async () => {
  await i18n.changeLanguage('en')
  assert.equal(traduzirMensagem('Responda Critério A com Sim ou Não.'), 'Answer Criterion A with Yes or No.')
  assert.equal(traduzirMensagem('Resposta obrigatória: Critério A, Critério B.'), 'Response required: Criterion A, Criterion B.')
  assert.equal(traduzir('Editar campanha {{p0}}', { p0: 'Campanhas' }), 'Edit campaign Campanhas')
  assert.equal(lerRespostaNr33('atmosfera_oxigenio', 'NAO'), false)
  assert.throws(() => lerRespostaNr33('criterio_c', 'SIM')) // Domínio geral não passa pelo adaptador específico.
})

test('enums persistidos permanecem intactos durante tradução e preparação de payload', async () => {
  const original = { criterio_a: 'SIM', criterio_b: 'NAO', criterio_c: 'SIM', observacoes: 'Descrição livre' }
  const copia = structuredClone(original)
  await i18n.changeLanguage('en')
  assert.equal(rotuloEnum(original.criterio_a), 'YES')
  assert.equal(rotuloEnum(original.criterio_b), 'NO')
  assert.deepEqual(original, copia)
  assert.deepEqual(prepararEdicaoChecklist({ ...original, criterio_b: 'SIM' }, original), { criterio_b: 'SIM' })
})

test('mensagens desconhecidas do servidor usam fallback inglês sem exibir detalhes', async () => {
  await i18n.changeLanguage('en')
  assert.equal(traduzirMensagem('Falha nova sem catálogo'), 'Unable to complete the operation. Please try again.')
  assert.equal(traduzirMensagem('Se houver uma conta habilitada para este e-mail, enviaremos as instruções de recuperação.'), 'If there is an enabled account for this email address, we will send recovery instructions.')
})

test('confirmações multilinha e mensagens de transporte mantêm todo o conteúdo traduzido', async () => {
  await i18n.changeLanguage('en')
  assert.equal(traduzirMensagem('Tem certeza que deseja excluir a evidência #12?\n\nEsta ação removerá o registro e o arquivo associado.'),
    'Are you sure you want to delete evidence #12?\n\nThis action will remove the record and its associated file.')
  const texto = 'Convite criado. Não foi possível confirmar o envio do e-mail. O convite permanece pendente por 48 horas a partir da emissão. Não há reenvio automático; uma nova emissão para esse e-mail ficará bloqueada enquanto ele estiver válido e pendente.'
  assert.match(traduzirMensagem(texto), /Unable to confirm email delivery\./)
  assert.doesNotMatch(traduzirMensagem(texto), /Não|convite|pendente/)
})

test('datas sem horário não mudam de dia; timestamps mantêm o fuso escolhido', async () => {
  assert.equal(formatarData('2026-01-02', { timeZone: 'America/Los_Angeles' }), '02/01/2026')
  await i18n.changeLanguage('en')
  assert.equal(localeAtivo(), 'en-GB')
  assert.equal(formatarData('2026-01-02', { timeZone: 'America/Los_Angeles' }), '02/01/2026')
  assert.equal(formatarData('2026-01-02T00:30:00Z', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false }), '02/01/2026, 00:30')
})

test('números e strings NUMERIC preservam casas decimais, zero e sinal', async () => {
  assert.equal(formatarNumero('123456789012.123456'), '123.456.789.012,123456')
  assert.equal(formatarNumero('-0.000001'), '-0,000001')
  assert.equal(formatarNumero('0.000000'), '0,000000')
  assert.equal(formatarNumero(1234.1234567), '1.234,1234567')
  await i18n.changeLanguage('en')
  assert.equal(formatarNumero('123456789012.123456'), '123,456,789,012.123456')
  assert.equal(formatarNumero('-0.000001'), '-0.000001')
  assert.equal(formatarNumero(0), '0')
})
