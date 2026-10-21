const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const politica = require('../src/utils/permissoes');
const normalizarId = require('../src/utils/normalizarIdDominio');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
function carregar(arquivo, deps) {
  const filename = path.resolve(__dirname, arquivo), module = { exports: {} };
  vm.runInThisContext('(function(require,module,exports){' + fs.readFileSync(filename, 'utf8') + '\n})', { filename })(nome => {
    assert.ok(Object.hasOwn(deps, nome), 'Dependência não simulada: ' + nome); return deps[nome];
  }, module, module.exports);
  return module.exports;
}
function preparar(t) {
  const usuarios = [{ id_usuario: 1, id_ambiente: A, ativo: true, ambienteAtivo: true, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR' },
    { id_usuario: 2, id_ambiente: B, ativo: true, ambienteAtivo: true, eh_fundador: true, perfil_acesso: 'ADMINISTRADOR' }];
  const registros = Array.from({ length: 201 }, (_, i) => ({ id_auditoria: i + 1, id_ambiente: A, perfil_novo: 'SUPERVISOR' }));
  registros.push({ id_auditoria: 300, id_ambiente: B, perfil_novo: 'AUDITOR' });
  const chamadas = [];
  let tecnica = false;
  const repo = carregar('../src/repositories/usuarioPermissoesRepository.js', {
    '../utils/permissoes': politica, '../utils/normalizarIdDominio': normalizarId,
    '../config/database': {
      async query(sql, parametros) {
        chamadas.push(parametros);
        // Simulador estrito desta única leitura. Falha se sumir qualquer
        // restrição de ambiente, identidade, atividade, fundador ou limite.
        const q = sql.replace(/\s+/g, ' ');
        for (const fragmento of ['FROM auditoria_perfil_usuario h WHERE h.id_ambiente=$1', 'u.id_usuario=$2', 'u.id_ambiente=h.id_ambiente', 'u.ativo AND a.ativo', "u.eh_fundador AND u.perfil_acesso='ADMINISTRADOR'", 'ORDER BY h.data_hora DESC,h.id_auditoria DESC LIMIT 200']) assert.ok(q.includes(fragmento), 'SQL desconhecido ou sem restrição: ' + fragmento);
        assert.equal(parametros.length, 2);
        if (tecnica) throw Object.assign(new Error('SQL_TOKEN_INTERNO'), { code: '42501' });
        const [ambiente, id] = parametros;
        const u = usuarios.find(u => u.id_usuario === id && u.id_ambiente === ambiente && u.ativo && u.ambienteAtivo && u.eh_fundador && u.perfil_acesso === 'ADMINISTRADOR');
        return { rows: u ? registros.filter(r => r.id_ambiente === ambiente).sort((a, b) => b.id_auditoria - a.id_auditoria).slice(0, 200) : [] };
      },
      connect() { throw Error('Conexão/escrita proibida'); },
    },
  });
  const controller = carregar('../src/controllers/usuarioPermissoesController.js', { '../repositories/usuarioPermissoesRepository': repo });
  t.mock.method(console, 'error', () => {});
  async function consultar(usuario, query = {}) {
    let corpo, codigo;
    await controller.auditoria({ usuario, query, body: { id_ambiente: B }, params: { id_ambiente: B } }, {
      headersSent: false, status(n) { codigo = n; return this; }, json(data) { corpo = data; return this; },
    });
    return { codigo, corpo };
  }
  return { usuarios, repo, consultar, chamadas, falhar() { tecnica = true; } };
}
for (const i of [0, 1]) test('consulta real de auditoria limita ambiente ' + (i ? 'B' : 'A') + ' e 200 registros', async t => {
  const c = preparar(t), u = c.usuarios[i];
  const r = await c.consultar(u, { id_ambiente: i ? A : B, limit: 999999, page: 2 });
  assert.equal(r.codigo, 200); assert.equal(r.corpo.data.length, i ? 1 : 200);
  assert.ok(r.corpo.data.every(h => h.id_ambiente === u.id_ambiente));
  assert.deepEqual(c.chamadas, [[u.id_ambiente, u.id_usuario]]);
});
for (const perfil of politica.perfis.filter(p => p !== 'ADMINISTRADOR')) test('consulta nega perfil ' + perfil + ' antes do SQL', async t => {
  const c = preparar(t); const r = await c.consultar({ ...c.usuarios[0], perfil_acesso: perfil });
  assert.equal(r.codigo, 403); assert.deepEqual(c.chamadas, []);
});
test('revogação/inatividade no banco simulado impede retorno apesar de contexto anterior', async t => {
  for (const campo of ['ativo', 'ambienteAtivo', 'eh_fundador']) {
    const c = preparar(t); const anterior = { ...c.usuarios[0] }; c.usuarios[0][campo] = false;
    assert.deepEqual((await c.consultar(anterior)).corpo.data, []);
  }
});
test('erro técnico da consulta real não expõe detalhes nem dados anteriores', async t => {
  const c = preparar(t); c.falhar(); const r = await c.consultar(c.usuarios[0]);
  assert.deepEqual(r, { codigo: 500, corpo: { status: 'error', message: 'Erro interno ao gerenciar permissões.' } });
});
