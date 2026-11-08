const test = require('node:test');
const assert = require('node:assert/strict');
const { CAMPOS, LIMITES_TEXTOS, selecionarCaracterizacao } = require('../src/utils/caracterizacaoChecklist');
const service = require('../src/services/checklistMultiTenantService');
const repo = require('../src/repositories/checklistMultiTenantRepository');
const pool = require('../src/config/database');
const usuario = { id_usuario: 10, id_ambiente: '11111111-1111-4111-8111-111111111111' };
const respostas = Object.fromEntries(['criterio_a', 'criterio_b', 'criterio_c', 'acesso_controlado',
  'ventilacao_adequada', 'monitoramento_atmosferico', 'procedimento_emergencia'].map(c => [c, 'SIM']));
const caracterizacao = { codigo_identificacao: 'TG-01', volume_m3: '123.456789', quantidade_aberturas: 0,
  dimensoes_aberturas: 'BM-01: Ø 600 mm\nBM-02: 800 × 600 mm', formas_acesso: 'Escada: 3 m',
  geometria: 'Cilíndrico', utilizacao_produto: 'Água', perigos_antes_liberacao: 'Atmosfera perigosa' };

test('serviço encaminha criação, consulta e edição sem modificar status ou identidade', async t => {
  const salvo = { ...respostas, ...caracterizacao, id_checklist: 50, id_local: 40, status: 'PENDENTE',
    ...Object.fromEntries(require('../src/utils/adaptadorCamposNr33').CAMPOS_NR33.map(c => [c, null])) };
  t.mock.method(repo, 'criarNoAmbiente', async (d, u, opcoes) => {
    assert.deepEqual(u, usuario); assert.equal(opcoes.bloquearAutorizacao, true);
    for (const campo of CAMPOS) assert.equal(d[campo], caracterizacao[campo]);
    assert.equal(d.id_usuario, undefined); return salvo;
  });
  t.mock.method(repo, 'buscarPermitidoPorIdNoAmbiente', async () => salvo);
  t.mock.method(repo, 'listarPermitidosNoAmbiente', async () => [salvo]);
  t.mock.method(repo, 'atualizarNoAmbiente', async (id, d, u) => {
    assert.equal(id, 50); assert.deepEqual(u, usuario);
    assert.deepEqual(d, { volume_m3: null, quantidade_aberturas: 0, codigo_identificacao: null });
    return { ...salvo, ...d };
  });
  assert.deepEqual(await service.criarChecklist({ id_local: 40, ...respostas, ...caracterizacao, id_usuario: 999 }, usuario), { ...salvo, avaliacao_nr33: undefined });
  const { avaliacao_nr33, ...consultado } = await service.buscarChecklistPorId(50, usuario);
  assert.ok(avaliacao_nr33);
  assert.deepEqual(consultado, salvo);
  const [listado] = await service.listarChecklists(usuario);
  assert.ok(listado.avaliacao_nr33);
  const { avaliacao_nr33: avaliacaoLista, ...camposListados } = listado;
  assert.deepEqual(camposListados, salvo);
  const editado = await service.atualizarChecklist(50, { volume_m3: null, codigo_identificacao: '', quantidade_aberturas: 0,
    status: 'CONCLUIDO', id_local: 99, id_ambiente: 'forjado' }, usuario);
  assert.equal(editado.status, 'PENDENTE'); assert.equal(editado.geometria, salvo.geometria);
});

test('repository parametriza valores, ausência e limpeza sem interpolar conteúdo', async t => {
  const consultas = [];
  t.mock.method(pool, 'connect', () => { throw Error('Banco real proibido'); });
  t.mock.method(pool, 'query', async (sql, params) => { consultas.push({ sql, params }); return { rows: [] }; });
  await repo.criarNoAmbiente({ id_local: 40, ...respostas, ...caracterizacao }, usuario);
  assert.deepEqual(consultas[0].params.slice(12), CAMPOS.map(c => caracterizacao[c]));
  for (const campo of CAMPOS) assert.ok(consultas[0].sql.includes(campo));
  assert.ok(!consultas[0].sql.includes('TG-01'));
  await repo.atualizarNoAmbiente(50, { codigo_identificacao: null, quantidade_aberturas: 0 }, usuario);
  const { sql, params } = consultas[1];
  assert.deepEqual(params.slice(11, 17), [true, null, false, null, true, 0]);
  assert.match(sql, /codigo_identificacao = CASE WHEN \$12::boolean THEN \$13 ELSE ch.codigo_identificacao END/);
  assert.match(sql, /c.id_ambiente = \$2/); assert.match(sql, /u.id_usuario = \$3/);
  assert.match(sql, /RETURNING ch.\*/);
});

test('registro antigo e atualização sem campos novos permanecem compatíveis', () => {
  assert.deepEqual(selecionarCaracterizacao({ observacoes: 'Histórico' }), {});
  assert.deepEqual(selecionarCaracterizacao({ volume_m3: undefined }), {});
  for (const valor of [null, '', '   ']) {
    assert.deepEqual(selecionarCaracterizacao(Object.fromEntries(CAMPOS.map(c => [c, valor]))),
      Object.fromEntries(CAMPOS.map(c => [c, null])));
  }
});

for (const valor of [0, -1, 'NaN', NaN, Infinity, true, [], {}, '1e3', '1,5', '0.0000001', '1000000000000', '1.1234567', '0x10']) {
  test(`volume inválido: ${String(valor)}`, async t => {
    const mock = t.mock.method(repo, 'atualizarNoAmbiente', () => { throw Error('Não deveria persistir'); });
    await assert.rejects(service.atualizarChecklist(50, { volume_m3: valor }, usuario), { statusCode: 400 });
    assert.equal(mock.mock.callCount(), 0);
  });
}
for (const valor of [-1, 1.2, '1.0', '1e2', 2147483648, true, [], {}, Infinity]) {
  test(`quantidade inválida: ${String(valor)}`, () => {
    assert.throws(() => selecionarCaracterizacao({ quantidade_aberturas: valor }), { statusCode: 400 });
  });
}
for (const [campo, limite] of Object.entries(LIMITES_TEXTOS)) {
  test(`limite de texto: ${campo}`, () => {
    assert.equal(selecionarCaracterizacao({ [campo]: 'x'.repeat(limite) })[campo].length, limite);
    assert.throws(() => selecionarCaracterizacao({ [campo]: 'x'.repeat(limite + 1) }), { statusCode: 400 });
    assert.throws(() => selecionarCaracterizacao({ [campo]: 123 }), { statusCode: 400 });
  });
}
test('limites válidos de números e preservação da precisão decimal', () => {
  assert.deepEqual(selecionarCaracterizacao({ volume_m3: '999999999999.999999', quantidade_aberturas: '2147483647' }),
    { volume_m3: '999999999999.999999', quantidade_aberturas: 2147483647 });
  assert.equal(selecionarCaracterizacao({ volume_m3: '0.000001' }).volume_m3, '0.000001');
});
