import test from 'node:test'
import assert from 'node:assert/strict'
import { gerarCsvAuditoria, nomeArquivoAuditoria } from '../src/services/auditoriaCsv.js'

const registro = { id_auditoria: 1, id_usuario_afetado: '2', id_usuario_responsavel: 1, perfil_anterior: 'COORDENADOR', perfil_novo: 'SUPERVISOR', data_hora: '2026-10-20T23:57:53Z' }
const usuarios = [{ id_usuario: 1, nome: 'José' }, { id_usuario: 2, nome: 'Ana' }]
test('um registro usa seis colunas, BOM UTF-8, ponto e vírgula e CRLF', () => {
  const csv = gerarCsvAuditoria([registro], usuarios)
  assert.deepEqual([...Buffer.from(csv).subarray(0, 3)], [239, 187, 191])
  assert.ok(csv.startsWith('\uFEFF"Usuário";"Perfil anterior";"Novo perfil";"Responsável";"Data";"Hora"\r\n'))
  assert.ok(csv.includes('"Ana";"Coordenador";"Supervisor";"José";'))
  assert.equal(csv.split('\r\n').length, 3)
})
test('múltiplos registros mantêm a ordem recebida e não alteram os originais', () => {
  const linhas = [registro, { ...registro, id_auditoria: 9, perfil_novo: 'AUDITOR' }]
  const antes = structuredClone(linhas)
  const csv = gerarCsvAuditoria(linhas, usuarios)
  assert.ok(csv.indexOf('Supervisor') < csv.indexOf('Auditor'))
  assert.deepEqual(linhas, antes)
})
test('histórico vazio gera somente cabeçalho; interface decide não baixar', () => {
  assert.equal(gerarCsvAuditoria([], usuarios).split('\r\n').length, 2)
})
test('acentos, aspas, ponto e vírgula e quebras de linha permanecem em uma célula citada', () => {
  const csv = gerarCsvAuditoria([registro], [{ id_usuario: 2, nome: 'Márcia "A";B\r\nC' }])
  assert.ok(csv.includes('"Márcia ""A"";B\r\nC";'))
  assert.ok(csv.includes('"Usuário #1";'))
})
for (const nome of ['=1+1', '+SOMA(1)', '-1+2', '@SOMA(1)', '  =1', '\t=1', '\r+1', '\n@1', '\u0000=1', '\uFEFF=1', '＝1', '＋1', '－1', '＠1', '\tTexto']) {
  test('neutraliza fórmula ou controle inicial: ' + JSON.stringify(nome), () => {
    const csv = gerarCsvAuditoria([registro], [{ id_usuario: 2, nome }, { id_usuario: 1, nome }])
    assert.ok(csv.includes('"\'' + nome + '";'))
    assert.equal(csv.includes('"' + nome + '";'), false)
  })
}
test('perfil desconhecido também recebe proteção contra fórmulas, sem conceder permissões', () => {
  const csv = gerarCsvAuditoria([{ ...registro, perfil_novo: '=1' }], usuarios)
  assert.ok(csv.includes('"\'=1"'))
})
test('datas e horários seguem o fuso local da apresentação existente', () => {
  const data = new Date(registro.data_hora)
  const csv = gerarCsvAuditoria([registro], usuarios)
  assert.ok(csv.includes('"' + data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + '"'))
  assert.ok(csv.includes('"' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + '"'))
  for (const data_hora of [null, undefined, '', 'inválida']) assert.throws(() => gerarCsvAuditoria([{ ...registro, data_hora }], usuarios))
})
test('nome do arquivo completo usa data local sem sobrescrever arquivos pelo código', () => {
  assert.equal(nomeArquivoAuditoria(new Date(2026, 9, 20, 23, 10)), 'auditoria_permissoes_2026-10-20.csv')
})
test('200 registros são aceitos; respostas acima do contrato falham sem truncar silenciosamente', () => {
  assert.equal(gerarCsvAuditoria(Array(200).fill(registro), usuarios).split('\r\n').length, 202)
  assert.throws(() => gerarCsvAuditoria(Array(201).fill(registro), usuarios))
  for (const dados of [null, {}, undefined]) assert.throws(() => gerarCsvAuditoria(dados, usuarios))
})
test('somente os seis campos públicos entram no CSV', () => {
  const csv = gerarCsvAuditoria([{ ...registro, token: 'NAO_EXPORTAR', senha: 'NAO_EXPORTAR', sql: 'NAO_EXPORTAR' }], usuarios)
  assert.equal(csv.includes('NAO_EXPORTAR'), false)
})
