const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
const repository = require('../src/repositories/contaMultiTenantRepository');

const ambientes = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
];

for (const eh_fundador of [true, false]) {
  test(`perfil retorna somente o nome do ambiente autenticado: fundador=${eh_fundador}`, async t => {
    const nomes = new Map(ambientes.map((id, i) => [id, `Empresa ${i} ${'nome longo '.repeat(15)}`]));
    t.mock.method(pool, 'query', async (sql, parametros) => {
      assert.match(sql, /a.nome AS nome_ambiente/);
      assert.match(sql, /JOIN ambiente AS a ON a.id_ambiente = u.id_ambiente/);
      assert.match(sql, /u.id_usuario = \$1 AND u.id_ambiente = \$2/);
      assert.match(sql, /u.ativo = TRUE AND a.ativo = TRUE/);
      assert.equal(parametros[0], 7);
      return { rows: [{ id_usuario: 7, perfil_acesso: eh_fundador ? 'ADMINISTRADOR' : 'ENGENHEIRO_SEGURANCA',
        eh_fundador, nome_ambiente: nomes.get(parametros[1]) }] };
    });
    for (const id_ambiente of ambientes) {
      const perfil = await repository.buscarPerfil({ id_usuario: 7, id_ambiente });
      assert.equal(perfil.nome_ambiente, nomes.get(id_ambiente));
      assert.notEqual(perfil.nome_ambiente, nomes.get(ambientes.find(id => id !== id_ambiente)));
    }
  });
}

test('perfil não retorna nome quando usuário/ambiente está indisponível', async t => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  await assert.rejects(repository.buscarPerfil({ id_usuario: 7, id_ambiente: ambientes[0] }), { statusCode: 401 });
});
