const politicaRbac723 = require('../src/utils/permissoes');
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const U = { id_usuario: 11, id_ambiente: A };
const R = { id_dados: 50, id_local: 40, id_usuario: 11, oxigenio: '20.90', status: 'PENDENTE' };
const numeros = ['pressao_atmosferica', 'oxigenio', 'gas_inflamavel', 'monoxido_carbono', 'sulfeto_hidrogenio', 'temperatura', 'umidade'];
function preparar(t, respostas = {}) {
  const chamadas = [], proibidas = [];
  const repo = Object.fromEntries(['criarNoAmbiente', 'listarPermitidosNoAmbiente', 'buscarPorIdNoAmbiente', 'buscarPorLocalNoAmbiente', 'buscarLocalAutorizadoNoAmbiente', 'atualizarNoAmbiente', 'excluirNoAmbiente'].map(nome => [nome, async (...args) => {
    chamadas.push({ nome, args });
    if (!Object.hasOwn(respostas, nome)) { proibidas.push(nome); throw new Error('Consulta inesperada'); }
    return typeof respostas[nome] === 'function' ? respostas[nome](...args) : respostas[nome];
  }]));
  const caminho = require.resolve('../src/services/dadosTecnicosMultiTenantService');
  const anterior = require.cache[caminho], carregar = Module._load;
  let service;
  try {
    delete require.cache[caminho];
    Module._load = function(request, parent, ...args) {
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (request === '../utils/permissoes') return politicaRbac723;
      if (parent?.filename === caminho) {
        if (request === '../repositories/dadosTecnicosMultiTenantRepository') return repo;
        proibidas.push(request); throw new Error('Dependência real proibida');
      }
      return carregar.call(this, request, parent, ...args);
    };
    service = require(caminho);
  } finally { Module._load = carregar; if (anterior) require.cache[caminho] = anterior; else delete require.cache[caminho]; }
  t.after(() => assert.deepEqual(proibidas, []));
  return { service, chamadas };
}
function operacoes(s, u) {
  return [() => s.criarDadosTecnicos({ id_local: 40 }, u), () => s.listarDadosTecnicos(u), () => s.buscarDadosTecnicosPorId(50, u), () => s.buscarDadosTecnicosPorLocal(40, u), () => s.atualizarDadosTecnicos(50, {}, u), () => s.excluirDadosTecnicos(50, u)];
}
for (const [nome, usuarios] of [
  ['ausente', [undefined, null, {}, [], true, 'usuario']],
  ['usuario', [0, -1, 1.5, NaN, Infinity, true, [], {}, Number.MAX_SAFE_INTEGER + 1].map(id_usuario => ({ ...U, id_usuario }))],
  ['ambiente', [undefined, null, '', 123, 'invalido'].map(id_ambiente => ({ ...U, id_ambiente }))],
]) test('Identidade ' + nome + ' é 401 nas seis funções sem consultar', async t => {
  const { service, chamadas } = preparar(t);
  for (const u of usuarios) for (const executar of operacoes(service, u)) await assert.rejects(executar, { statusCode: 401 });
  assert.deepEqual(chamadas, []);
});
test('IDs inseguros/inválidos são 400 antes de consultar', async t => {
  const { service: s, chamadas } = preparar(t);
  for (const id of [undefined, null, '', 'abc', 0, -1, 1.5, NaN, Infinity, true, [], {}, Number.MAX_SAFE_INTEGER + 1]) for (const executar of [() => s.criarDadosTecnicos({ id_local: id }, U), () => s.buscarDadosTecnicosPorId(id, U), () => s.buscarDadosTecnicosPorLocal(id, U), () => s.atualizarDadosTecnicos(id, {}, U), () => s.excluirDadosTecnicos(id, U)]) await assert.rejects(executar, { statusCode: 400 });
  assert.deepEqual(chamadas, []);
});
test('Corpos inválidos não alcançam escritas', async t => {
  const { service, chamadas } = preparar(t);
  for (const body of [undefined, null, [], true, false, 0, 'dados']) {
    await assert.rejects(service.criarDadosTecnicos(body, U), { statusCode: 400 });
    await assert.rejects(service.atualizarDadosTecnicos(50, body, U), { statusCode: 400 });
  }
  assert.deepEqual(chamadas, []);
});
for (const campo of numeros) {
  test(campo + ': preserva zero e texto decimal sem mudar unidade/precisão', async t => {
    const { service, chamadas } = preparar(t, { criarNoAmbiente: R, atualizarNoAmbiente: R });
    for (const valor of [0, '0', -1.25, '20.900000000000000001']) {
      assert.strictEqual(await service.criarDadosTecnicos({ id_local: 40, [campo]: valor }, U), R);
      assert.strictEqual(await service.atualizarDadosTecnicos(50, { [campo]: valor }, U), R);
      assert.strictEqual(chamadas.at(-1).args[1][campo], valor); assert.strictEqual(chamadas.at(-2).args[0][campo], valor);
    }
  });
  test(campo + ': rejeita false, tipos inválidos e não finitos sem coerção', async t => {
    const { service, chamadas } = preparar(t);
    for (const valor of [false, true, [], {}, '', '   ', 'abc', 'Infinity', NaN, Infinity, -Infinity]) {
      await assert.rejects(service.criarDadosTecnicos({ id_local: 40, [campo]: valor }, U), { statusCode: 400 });
      await assert.rejects(service.atualizarDadosTecnicos(50, { [campo]: valor }, U), { statusCode: 400 });
    }
    assert.deepEqual(chamadas, []);
  });
}
test('Criação aplica padrões existentes e ignora identidade/vínculos forjados', async t => {
  const { service, chamadas } = preparar(t, { criarNoAmbiente: R });
  await service.criarDadosTecnicos({ id_local: '40', id_usuario: 999, id_ambiente: B, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR', id_campanha: 999 }, U);
  assert.deepEqual(chamadas, [{ nome: 'criarNoAmbiente', args: [{ id_local: 40, ventilacao: 'NAO_INFORMADA', status: 'PENDENTE' }, U] }]);
});
test('PUT omitido/null preserva contrato sem leitura de valores antigos', async t => {
  const { service, chamadas } = preparar(t, { atualizarNoAmbiente: R });
  await service.atualizarDadosTecnicos('50', { oxigenio: null, observacoes: null, ventilacao: null, status: null, id_local: 999, id_usuario: 999 }, U);
  assert.deepEqual(chamadas, [{ nome: 'atualizarNoAmbiente', args: [50, {}, U] }]);
});
test('Observações vazias e espaços são preservados; false não vira texto', async t => {
  const { service, chamadas } = preparar(t, { atualizarNoAmbiente: R });
  for (const valor of ['', '   ', 'Texto']) {
    await service.atualizarDadosTecnicos(50, { observacoes: valor }, U);
    assert.equal(chamadas.at(-1).args[1].observacoes, valor);
  }
  for (const valor of [false, true, 123, [], {}]) await assert.rejects(service.atualizarDadosTecnicos(50, { observacoes: valor }, U), { statusCode: 400 });
  assert.equal(chamadas.length, 3);
});
test('Ventilação e status mantêm opções existentes no POST e PUT', async t => {
  const { service, chamadas } = preparar(t, { criarNoAmbiente: R, atualizarNoAmbiente: R });
  for (const ventilacao of ['NATURAL', 'MECANICA', 'FORCADA', 'NAO_INFORMADA']) await service.criarDadosTecnicos({ id_local: 40, ventilacao }, U);
  for (const status of ['PENDENTE', 'CONCLUIDO']) await service.atualizarDadosTecnicos(50, { status }, U);
  assert.equal(chamadas.length, 6);
  for (const status of [null, '', false, 'CONCLUIDA']) await assert.rejects(service.criarDadosTecnicos({ id_local: 40, status }, U), { statusCode: 400 });
  for (const ventilacao of ['', false, 'natural', 'OUTRA']) await assert.rejects(service.atualizarDadosTecnicos(50, { ventilacao }, U), { statusCode: 400 });
  assert.equal(chamadas.length, 6);
});
test('GET por local confirma autorização antes da consulta dos dados', async t => {
  const { service, chamadas } = preparar(t, { buscarLocalAutorizadoNoAmbiente: null });
  await assert.rejects(service.buscarDadosTecnicosPorLocal(40, U), { statusCode: 404, message: 'Local não encontrado.' });
  assert.deepEqual(chamadas, [{ nome: 'buscarLocalAutorizadoNoAmbiente', args: [40, U] }]);
});
test('Local autorizado sem dados mantém mensagem específica 404', async t => {
  const { service, chamadas } = preparar(t, { buscarLocalAutorizadoNoAmbiente: { id_local: 40 }, buscarPorLocalNoAmbiente: null });
  await assert.rejects(service.buscarDadosTecnicosPorLocal(40, U), { statusCode: 404, message: 'Dados técnicos não encontrados para este local.' });
  assert.deepEqual(chamadas.map(c => c.nome), ['buscarLocalAutorizadoNoAmbiente', 'buscarPorLocalNoAmbiente']);
});
test('Seis funções propagam erros internos sem convertê-los em autorização', async t => {
  const erro = new Error('SQL_INTERNO_SIMULADO');
  const nomes = ['criarNoAmbiente', 'listarPermitidosNoAmbiente', 'buscarPorIdNoAmbiente', 'buscarLocalAutorizadoNoAmbiente', 'atualizarNoAmbiente', 'excluirNoAmbiente'];
  const { service, chamadas } = preparar(t, Object.fromEntries(nomes.map(n => [n, () => { throw erro; }])));
  for (const executar of operacoes(service, U)) await assert.rejects(executar, recebido => recebido === erro);
  assert.equal(chamadas.length, 6);
});
test('Ambientes A e B têm argumentos distintos e retornos sem reconstrução', async t => {
  const { service, chamadas } = preparar(t, { listarPermitidosNoAmbiente: [R], buscarPorIdNoAmbiente: R, excluirNoAmbiente: R });
  for (const u of [U, { id_usuario: 21, id_ambiente: B }]) {
    assert.deepEqual(await service.listarDadosTecnicos(u), [R]); assert.strictEqual(await service.buscarDadosTecnicosPorId(50, u), R); assert.strictEqual(await service.excluirDadosTecnicos(50, u), R);
    for (const c of chamadas.slice(-3)) assert.deepEqual(c.args.at(-1), u);
  }
});
