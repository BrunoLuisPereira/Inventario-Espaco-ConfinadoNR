import test from 'node:test'
import assert from 'node:assert/strict'
import { pode, perfisConvite, nomesPerfis, descricoesPerfis } from '../src/services/permissoes.js'

const perfis = ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR','SUPERVISOR','AUDITOR','VISUALIZADOR']
test('convite e modal usam os seis perfis não administrativos com descrições', () => {
  assert.deepEqual(perfisConvite, perfis.slice(1))
  for (const perfil of perfisConvite) {
    assert.equal(typeof nomesPerfis[perfil], 'string')
    assert.ok(descricoesPerfis[perfil].length > 30)
  }
})
for (const perfil of perfis) test('menus e ações para '+perfil, () => {
  const u = { perfil_acesso: perfil, eh_fundador: perfil === perfis[0] }
  assert.equal(pode(u, 'usuarios.consultar'), perfil === perfis[0])
  assert.equal(pode(u, 'usuarios.permissoes.alterar'), perfil === perfis[0])
  assert.equal(pode(u, 'convites.criar'), perfil === perfis[0])
  assert.equal(pode(u, 'campanhas.consultar'), true)
  assert.equal(pode(u, 'locais.consultar'), true)
  assert.equal(pode(u, 'campanhas.editar'), perfis.slice(0,4).includes(perfil))
  assert.equal(pode(u, 'locais.exportar'), perfil !== 'VISUALIZADOR')
  assert.equal(pode(u, 'evidencias.excluir'), ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','COORDENADOR'].includes(perfil))
  assert.equal(pode(u, 'relatorios.gerar'), ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','COORDENADOR'].includes(perfil))
})
test('perfil antigo não se mantém após revalidação; ADMIN sem fundador é recusado', () => {
  const u = { perfil_acesso:'ENGENHEIRO_SEGURANCA', eh_fundador:false }
  assert.equal(pode(u,'evidencias.criar'),true)
  u.perfil_acesso='AUDITOR'
  assert.equal(pode(u,'evidencias.criar'),false)
  assert.equal(pode(u,'evidencias.consultar'),true)
  assert.equal(pode({perfil_acesso:'ADMINISTRADOR'},'usuarios.permissoes.alterar'),false)
  assert.equal(pode({perfil_acesso:'MASTER',eh_fundador:true},'usuarios.permissoes.alterar'),false)
})
