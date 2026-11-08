import test from 'node:test'
import assert from 'node:assert/strict'
import { preencherCamposNr33, selecionarCamposNr33, camposNr33, lerRespostaNr33,
  prepararEdicaoChecklist, textoRespostaNr33, respostasNr33Alteradas, mensagemErroNr33,
  exigirConexaoChecklist, descreverPendenciasNr33 } from '../src/services/camposNr33.js'
import { criarHttp } from '../src/services/http.js'

test('dez campos anulaveis sem converter desconhecido em resposta negativa', () => {
  const dados = preencherCamposNr33()
  assert.equal(Object.keys(dados).length, 10)
  assert.ok(Object.values(dados).every(v => v === null))
  assert.deepEqual(selecionarCamposNr33(dados), dados)
})
test('null, false e NAO permanecem distintos e objetos recebidos nao sao alterados', () => {
  const antes = Object.freeze({ atmosfera_oxigenio: false, utilizado_armazenagem: 'NAO', potencial_afogamento: null })
  assert.deepEqual(selecionarCamposNr33(antes), antes)
  assert.equal(textoRespostaNr33('atmosfera_oxigenio', false), 'Não')
  assert.equal(textoRespostaNr33('potencial_afogamento', null), 'Não avaliado')
  assert.equal(textoRespostaNr33('avaliacao_especifica_iniciada', null), 'Não iniciada')
})
test('seletor omite campos estranhos e calculados sem encaminhar identidade ou status', () => {
  assert.deepEqual(selecionarCamposNr33({ atmosfera_oxigenio: undefined, avaliacao_nr33: {}, id_ambiente: 8, status: 'CONCLUIDO' }), {})
})
for (const [campo, valor] of [['atmosfera_oxigenio', 'false'], ['atmosfera_contaminantes', 1], ['atmosfera_explosiva', {}],
  ['possui_placa_identificacao', 'NAO'], ['avaliacao_especifica_iniciada', false], ['utilizado_armazenagem', true], ['potencial_afogamento', 'sim']]) {
  test(`tipo invalido em ${campo}`, () => assert.throws(() => selecionarCamposNr33({ [campo]: valor }), /inválida/))
}
test('controles convertem somente os dominios DOM permitidos', () => {
  assert.equal(lerRespostaNr33('atmosfera_oxigenio', 'NAO'), false)
  assert.equal(lerRespostaNr33('atmosfera_oxigenio', 'SIM'), true)
  assert.equal(lerRespostaNr33('atmosfera_oxigenio', ''), null)
  assert.equal(lerRespostaNr33('potencial_engolfamento', 'NAO'), 'NAO')
  assert.equal(lerRespostaNr33('avaliacao_especifica_iniciada', 'INICIADA'), true)
  assert.equal(lerRespostaNr33('avaliacao_especifica_iniciada', ''), null)
  assert.throws(() => lerRespostaNr33('avaliacao_especifica_iniciada', 'NAO'))
  assert.throws(() => lerRespostaNr33('status', 'SIM'))
})
test('PUT parcial preserva omissao, altera false e null explicitamente, nao inclui status', () => {
  const antes = { ...preencherCamposNr33(), atmosfera_oxigenio: true, utilizado_armazenagem: 'SIM', status: 'CONCLUIDO', observacoes: 'Original' }
  const form = { ...antes, possui_placa_identificacao: false, utilizado_armazenagem: null, observacoes: 'Nova', status: 'PENDENTE', avaliacao_nr33: {} }
  assert.deepEqual(prepararEdicaoChecklist(form, antes), { possui_placa_identificacao: false, utilizado_armazenagem: null, observacoes: 'Nova' })
  assert.equal(antes.utilizado_armazenagem, 'SIM')
})
test('historico sem respostas permite edicao irrelevante sem preencher criterios', () => {
  const antes = { status: 'CONCLUIDO', ...preencherCamposNr33() }
  assert.deepEqual(prepararEdicaoChecklist({ ...antes, observacoes: 'Nota' }, antes), { observacoes: 'Nota' })
  assert.deepEqual(prepararEdicaoChecklist(antes, antes), {})
})
test('NAO continua textual e limpeza de criterio geral nao e inventada', () => {
  const antes = { criterio_a: 'SIM', utilizado_armazenagem: null }
  assert.deepEqual(prepararEdicaoChecklist({ ...antes, utilizado_armazenagem: 'NAO' }, antes), { utilizado_armazenagem: 'NAO' })
  assert.throws(() => prepararEdicaoChecklist({ criterio_a: '' }, antes), /Critério A/)
})
test('indicador de respostas nao salvas nao calcula classificacao', () => {
  const antes = { ...preencherCamposNr33(), criterio_a: 'SIM' }
  assert.equal(respostasNr33Alteradas({ ...antes, observacoes: 'Nota' }, antes), false)
  assert.equal(respostasNr33Alteradas({ ...antes, atmosfera_oxigenio: false }, antes), true)
})

for (const criterio of ['criterio_a', 'criterio_b', 'criterio_c']) test(`${criterio} SIM → NÃO → SIM envia somente o critério e preserva dependentes`, () => {
  const antes = { ...preencherCamposNr33(), criterio_a: 'SIM', criterio_b: 'SIM', criterio_c: 'SIM',
    atmosfera_oxigenio: true, atmosfera_contaminantes: false, atmosfera_explosiva: null, possui_placa_identificacao: false, status: 'CONCLUIDO' }
  const nao = { ...antes, [criterio]: 'NAO' }
  assert.deepEqual(prepararEdicaoChecklist(nao, antes), { [criterio]: 'NAO' })
  assert.deepEqual(prepararEdicaoChecklist({ ...nao, [criterio]: 'SIM' }, nao), { [criterio]: 'SIM' })
  for (const campo of camposNr33) assert.equal(nao[campo], antes[campo])
  assert.equal(nao.status, 'CONCLUIDO')
})
test('409 explica indisponibilidade da confirmacao sem inventar token', () => {
  assert.match(mensagemErroNr33({ status: 409, code: 'NR33_CONFIRMACAO_LIMPEZA_NECESSARIA' }), /Nenhuma resposta foi apagada/)
})
for (const [status, texto] of [[401, /Autenticação/], [403, /permissão/], [404, /inacessível/], [503, /esquema/]]) {
  test(`mensagem publica ${status}`, () => assert.match(mensagemErroNr33({ status }), texto))
}
test('erros normativos usam rotulos conhecidos, sem expor detalhes tecnicos', () => {
  const erros = [{ codigo: 'RESPOSTA_PLACA_OBRIGATORIA', campos: ['possui_placa_identificacao', 'SQL_INTERNO'] }, { codigo: 'SQL_INTERNO', campos: [] }]
  assert.equal(descreverPendenciasNr33(erros).length, 1)
  assert.match(mensagemErroNr33({ status: 400, message: 'Conclusão inválida.', details: { erros } }), /placa de identificação/)
  assert.equal(mensagemErroNr33({ details: { erros } }).includes('SQL_INTERNO'), false)
})
test('offline bloqueia explicitamente, online nao cria fila ou efeito colateral', () => {
  assert.throws(() => exigirConexaoChecklist(false), e => e.code === 'NR33_OFFLINE')
  assert.doesNotThrow(() => exigirConexaoChecklist(true))
})
test('cliente HTTP preserva code/details NR33 e token existente, sem alterar envelope de sucesso', async () => {
  const details = { campos: ['atmosfera_oxigenio'] }
  const request = criarHttp({ obterToken: () => 'TOKEN_SINTETICO', expirar() { throw Error('Não deve expirar'); },
    fetchImpl: async (url, init) => { assert.equal(url, '/api/checklists/50'); assert.equal(init.headers.Authorization, 'Bearer TOKEN_SINTETICO');
      return Response.json({ status: 'error', message: 'Confirmação necessária.', code: 'NR33_CONFIRMACAO_LIMPEZA_NECESSARIA', details }, { status: 409 }) } })
  await assert.rejects(request('/checklists/50'), e => e.status === 409 && e.code === 'NR33_CONFIRMACAO_LIMPEZA_NECESSARIA' && e.details.campos[0] === details.campos[0])
  const ok = criarHttp({ obterToken: () => null, expirar() {}, fetchImpl: async () => Response.json({ status: 'success', data: { ...preencherCamposNr33(), avaliacao_nr33: {} } }) })
  assert.deepEqual((await ok('/checklists')).data, { ...preencherCamposNr33(), avaliacao_nr33: {} })
})
test('erros internos nao ganham codigo/detalhes controlados ou mensagem sensivel', async () => {
  const request = criarHttp({ obterToken: () => null, expirar() {}, fetchImpl: async () => Response.json({ message: 'SEGREDO', code: 'NR33_CONCLUSAO_INVALIDA', details: { sql: 'SEGREDO' } }, { status: 500 }) })
  await assert.rejects(request('/checklists/50'), e => e.status === 500 && !e.code && !e.details && !e.message.includes('SEGREDO'))
})
test('401 continua expirando a sessao existente', async () => {
  let expirou = false
  const request = criarHttp({ obterToken: () => 'TOKEN_SINTETICO', expirar() { expirou = true }, fetchImpl: async () => Response.json({}, { status: 401 }) })
  await assert.rejects(request('/checklists'), { status: 401 })
  assert.equal(expirou, true)
})
test('contrato de dez campos permanece sem metadados ou classificacao persistida', () => {
  assert.equal(camposNr33.includes('avaliacao_nr33'), false)
  assert.equal(camposNr33.includes('estado_token'), false)
})
