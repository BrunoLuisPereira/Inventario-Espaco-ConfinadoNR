import test from 'node:test'
import assert from 'node:assert/strict'
import { indicadoresUsuarios, filtrarUsuarios, nomePerfil } from '../src/services/usuarios.js'
const dados = [
  { id_usuario: 1, nome: 'João Silva', email: 'joao@example.invalid', perfil_acesso: 'ADMINISTRADOR', ativo: true },
  { id_usuario: 2, nome: 'Maria', email: 'maria@example.invalid', perfil_acesso: 'ENGENHEIRO_SEGURANCA', ativo: false },
  { id_usuario: 3, nome: 'Ana', email: 'ana@example.invalid', perfil_acesso: 'ENGENHEIRO_SEGURANCA', ativo: true },
]
test('indicadores usam todos os usuarios retornados, incluindo inativos', () => {
  assert.deepEqual(indicadoresUsuarios(dados), { total: 3, administradores: 1, engenheiros: 2 })
  assert.deepEqual(indicadoresUsuarios([]), { total: 0, administradores: 0, engenheiros: 0 })
})
test('busca por nome ignora maiusculas, acentos e espacos externos', () => {
  assert.deepEqual(filtrarUsuarios(dados, '  JOAO  '), [dados[0]])
})
test('busca por email e busca sem resultados', () => {
  assert.deepEqual(filtrarUsuarios(dados, 'MARIA@'), [dados[1]])
  assert.deepEqual(filtrarUsuarios(dados, 'ausente'), [])
})
test('busca vazia preserva referencias e nao altera os indicadores', () => {
  const antes = structuredClone(dados)
  assert.deepEqual(filtrarUsuarios(dados, ''), dados)
  assert.equal(filtrarUsuarios(dados, 'ana')[0], dados[2])
  assert.deepEqual(indicadoresUsuarios(dados), { total: 3, administradores: 1, engenheiros: 2 })
  assert.deepEqual(dados, antes)
})
test('rotulos de perfis preservam valores desconhecidos sem atribuir permissoes', () => {
  assert.equal(nomePerfil('ADMINISTRADOR'), 'Administrador')
  assert.equal(nomePerfil('ENGENHEIRO_SEGURANCA'), 'Engenheiro de segurança')
  assert.equal(nomePerfil('OUTRO'), 'OUTRO')
  assert.equal(nomePerfil(null), 'Não informado')
})
