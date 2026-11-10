const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { preparar, A, B } = require('./helpers/contaSimulada.cjs');

for (const ambiente of [A, B]) for (const idioma of ['pt-BR', 'en', undefined, null, 'fr', {}, ['en']]) {
  test(`idioma ${JSON.stringify(idioma)} limitado ao solicitante em ${ambiente}`, async t => {
    const c = preparar(t, { usuario: { id_ambiente: ambiente } });
    await c.executar('patch', '/preferencias/idioma', { idioma });
    assert.equal(c.res.statusCode, 200);
    assert.deepEqual(c.res.body.data, { id_usuario: 1, id_ambiente: ambiente, idioma: idioma === 'en' ? 'en' : 'pt-BR' });
    assert.equal(c.estado.usuario.sessao_versao, 0);
    assert.equal(c.estado.usuario.perfil_acesso, 'ADMINISTRADOR');
    assert.equal(c.estado.usuario.nome, 'Original');
    const update = c.eventos.find(e => e.sql?.startsWith('UPDATE usuario'));
    assert.deepEqual(update.params, [1, ambiente, idioma === 'en' ? 'en' : 'pt-BR']);
    assert.match(update.sql, /u.id_usuario = \$1 AND u.id_ambiente = \$2/);
    assert.match(update.sql, /conta|ADMINISTRADOR/);
  });
}
for (const idioma of ['en', 'pt-BR', undefined, 'fr']) {
  test(`perfil retorna identidade do ambiente e fallback para ${idioma}`, async t => {
    const c = preparar(t, { usuario: { idioma } });
    await c.executar('get', '/perfil');
    assert.equal(c.res.body.data.id_ambiente, A);
    assert.equal(c.res.body.data.idioma, idioma === 'en' ? 'en' : 'pt-BR');
    assert.equal('senha_hash' in c.res.body.data, false);
  });
}
for (const dados of [{ id_usuario: 2, idioma: 'en' }, { id_ambiente: B, idioma: 'en' }, { perfil_acesso: 'ADMINISTRADOR' }, [], null]) {
  test(`rejeita campos estranhos ${JSON.stringify(dados)}`, async t => {
    const c = preparar(t);
    await c.executar('patch', '/preferencias/idioma', dados);
    assert.equal(c.res.statusCode, 400);
    assert.equal(c.eventos.some(e => e.sql?.startsWith('UPDATE')), false);
  });
}
for (const token of [null, 'invalido', 'expirado']) {
  test(`preferência exige JWT ${token}`, async t => {
    const c = preparar(t);
    await c.executar('patch', '/preferencias/idioma', { idioma: 'en' }, token);
    assert.equal(c.res.statusCode, 401);
    assert.deepEqual(c.eventos, []);
  });
}
for (const usuario of [{ ativo: false }, { perfil_acesso: 'DESCONHECIDO' }]) {
  test('usuário inativo ou perfil inválido não escreve preferência', async t => {
    const c = preparar(t, { usuario });
    await c.executar('patch', '/preferencias/idioma', { idioma: 'en' });
    assert.ok([401, 403].includes(c.res.statusCode));
    assert.equal(c.eventos.some(e => e.sql?.startsWith('UPDATE')), false);
  });
}
test('migration não aplicada retorna 503 e rollback, sem afetar perfil existente', async t => {
  const c = preparar(t, { falhar: sql => sql.startsWith('UPDATE usuario'), erro: Object.assign(new Error('coluna ausente'), { code: '42703' }) });
  await c.executar('patch', '/preferencias/idioma', { idioma: 'en' });
  assert.equal(c.res.statusCode, 503);
  assert.ok(c.eventos.some(e => e.sql === 'ROLLBACK'));
  assert.equal(c.estado.usuario.idioma, undefined);
});
test('migration 027 é apenas aditiva e transacional', () => {
  const sql = fs.readFileSync(require.resolve('../database/027_preferencia_idioma_usuario.sql'), 'utf8');
  assert.match(sql, /BEGIN;[\s\S]*ALTER TABLE public.usuario/);
  assert.match(sql, /DEFAULT 'pt-BR'/);
  assert.match(sql, /CHECK \(idioma IN \('pt-BR', 'en'\)\)/);
  assert.match(sql, /COMMIT;/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/i);
});
