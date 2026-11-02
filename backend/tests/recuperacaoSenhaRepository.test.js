require('./helpers/evidenciaIsolamentoPreload.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarRepository } = require('../src/repositories/recuperacaoSenhaRepository');
const A = '11111111-1111-4111-8111-111111111111';
const tokenHash = 'a'.repeat(64);

// SQL é executado pelo repositório real contra este double de conexão.
// A fila modela FOR UPDATE: o segundo consumidor lê o estado após COMMIT.
function bancoSimulado(opcoes = {}) {
  const eventos = [];
  const estado = { usado: false, versao: 0, hash: 'antigo', invalidado: false, ativo: true };
  let fila = Promise.resolve();
  let conexoes = 0;
  const banco = {
    async query(sql, valores) {
      eventos.push({ sql: sql.replace(/\s+/g, ' ').trim(), valores });
      return { rows: opcoes.limitado ? [] : [{ chave_hash: tokenHash }] };
    },
    async connect() {
      const id = ++conexoes;
      let liberar, snapshot;
      return {
        release(descartar) { eventos.push({ release: id, descartar }); },
        async query(texto, valores) {
          const sql = texto.replace(/\s+/g, ' ').trim();
          eventos.push({ id, sql, valores });
          if (opcoes.falhar && sql.startsWith(opcoes.falhar)) throw new Error('Falha SQL sintética');
          if (sql === 'BEGIN') return { rows: [] };
          if (sql.includes('FROM usuario') && sql.includes('FOR UPDATE')) {
            const anterior = fila;
            fila = new Promise(resolve => { liberar = resolve; });
            await anterior;
            snapshot = structuredClone(estado);
            if (opcoes.inativo) return { rows: [] };
            return { rows: [{ id_usuario: 1, id_ambiente: A, email: 'a@example.invalid', sessao_versao: estado.versao }] };
          }
          if (sql === 'COMMIT' || sql === 'ROLLBACK') {
            if (sql === 'ROLLBACK' && snapshot) Object.assign(estado, snapshot);
            liberar?.(); return { rows: [] };
          }
          if (sql.startsWith('SELECT id_usuario, id_ambiente FROM') || sql.startsWith('SELECT u.id_usuario, u.id_ambiente FROM')) return { rows: opcoes.ausente ? [] : [{ id_usuario: 1, id_ambiente: A }] };
          if (sql.startsWith('SELECT id_ambiente FROM ambiente')) return { rows: opcoes.ambienteInativo ? [] : [{ id_ambiente: A }] };
          if (sql.startsWith('SELECT token_hash FROM')) return { rows: !estado.ativo || estado.usado || estado.invalidado || opcoes.expirado ? [] : [{ token_hash: tokenHash }] };
          if (sql.startsWith('UPDATE recuperacao_senha SET ativado_em')) {
            if (estado.invalidado || opcoes.expirado || opcoes.reservaPerdida) return { rows: [] };
            estado.ativo = true; return { rows: [{ token_hash: tokenHash }] };
          }
          if (sql.startsWith('UPDATE recuperacao_senha SET consumido_em')) {
            if (opcoes.expirouDuranteHash) return { rows: [] };
            estado.usado = true; return { rows: [{ token_hash: tokenHash }] };
          }
          if (sql.startsWith('UPDATE usuario SET senha_hash')) {
            estado.hash = valores[2]; estado.versao++;
            return { rows: opcoes.updateVazio ? [] : [{ id_usuario: 1 }] };
          }
          if (sql.startsWith('UPDATE recuperacao_senha SET invalidado_em')) { estado.invalidado = true; return { rows: [] }; }
          if (sql.startsWith('UPDATE recuperacao_envio SET concluido_em')) return { rows: [] };
          if (sql.startsWith('INSERT INTO recuperacao_senha')) { estado.invalidado = false; estado.ativo = false; return { rows: [] }; }
          throw new Error('SQL não previsto pelo teste');
        },
      };
    },
  };
  return { banco, eventos, estado, repo: criarRepository(banco) };
}

test('emissão invalida anteriores antes do INSERT; guarda apenas hash e contexto do banco', async () => {
  const c = bancoSimulado();
  assert.deepEqual(await c.repo.emitir('a@example.invalid', tokenHash), { email: 'a@example.invalid' });
  const sql = c.eventos.filter(e => e.sql).map(e => e.sql);
  assert.ok(sql.findIndex(s => s.startsWith('UPDATE recuperacao')) < sql.findIndex(s => s.startsWith('INSERT')));
  const insert = c.eventos.find(e => e.sql?.startsWith('INSERT'));
  assert.deepEqual(insert.valores, [tokenHash, 1, A, 'a@example.invalid', 0]);
  assert.equal(sql.at(-1), 'COMMIT');
  assert.equal(c.estado.ativo, false);
  assert.equal(c.eventos.at(-1).descartar, false);
});
test('consumo concorrente usa locks e só uma transação atualiza senha e versão', async () => {
  const c = bancoSimulado();
  let hashes = 0;
  const preparar = async () => { hashes++; await new Promise(resolve => setImmediate(resolve)); return 'bcrypt-sintetico'; };
  const resultados = await Promise.all([c.repo.consumir(tokenHash, preparar), c.repo.consumir(tokenHash, preparar)]);
  assert.deepEqual(resultados, [true, false]);
  assert.equal(hashes, 1); assert.equal(c.estado.versao, 1); assert.equal(c.estado.hash, 'bcrypt-sintetico');
  const consulta = c.eventos.find(e => e.sql?.startsWith('SELECT token_hash'));
  assert.match(consulta.sql, /expira_em > clock_timestamp\(\)/);
  assert.match(consulta.sql, /ativado_em IS NOT NULL/);
  assert.match(consulta.sql, /consumido_em IS NULL AND invalidado_em IS NULL FOR UPDATE/);
  assert.deepEqual(consulta.valores, [tokenHash, 1, A, 'a@example.invalid', 0]);
});
for (const opcoes of [{ ausente: true }, { ambienteInativo: true }, { inativo: true }, { expirado: true }]) {
  test('estado inválido não calcula hash nem escreve: ' + JSON.stringify(opcoes), async () => {
    const c = bancoSimulado(opcoes);
    assert.equal(await c.repo.consumir(tokenHash, () => { throw new Error('bcrypt não deveria executar'); }), false);
    assert.equal(c.estado.hash, 'antigo'); assert.equal(c.estado.versao, 0);
  });
}
test('expiração durante bcrypt impede consumo e alteração da senha', async () => {
  const c = bancoSimulado({ expirouDuranteHash: true });
  assert.equal(await c.repo.consumir(tokenHash, async () => 'novo'), false);
  assert.equal(c.estado.hash, 'antigo'); assert.equal(c.estado.usado, false);
});
for (const opcoes of [{ updateVazio: true }, { falhar: 'UPDATE usuario SET senha_hash' }, { falhar: 'UPDATE recuperacao_senha SET invalidado_em' }]) {
  test('falha reverte consumo, senha e versão atomicamente: ' + JSON.stringify(opcoes), async () => {
    const c = bancoSimulado(opcoes);
    await assert.rejects(c.repo.consumir(tokenHash, async () => 'novo'));
    assert.equal(c.estado.hash, 'antigo'); assert.equal(c.estado.versao, 0); assert.equal(c.estado.usado, false);
    assert.ok(c.eventos.some(e => e.sql === 'ROLLBACK'));
    assert.equal(c.eventos.at(-1).descartar, true);
  });
}
test('limite usa UPSERT condicional atômico e limpeza limitada, sem dados pessoais', async () => {
  const c = bancoSimulado();
  assert.equal(await c.repo.limitar(tokenHash, 5), true);
  assert.match(c.eventos[0].sql, /LIMIT 100/);
  assert.match(c.eventos[1].sql, /ON CONFLICT.*WHERE .*requisicoes < \$2/);
  assert.deepEqual(c.eventos[1].valores, [tokenHash, 5]);
  assert.equal(await bancoSimulado({ limitado: true }).repo.limitar(tokenHash, 5), false);
});
test('token pendente é recusado antes do hash; ativação exige lease atual e contexto', async () => {
  const c = bancoSimulado(); c.estado.ativo = false;
  assert.equal(await c.repo.consumir(tokenHash, async () => assert.fail()), false);
  assert.equal(await c.repo.ativar(tokenHash, 'envio', 'reserva'), true);
  const ativacao = c.eventos.find(e => e.sql?.startsWith('UPDATE recuperacao_senha SET ativado_em'));
  assert.match(ativacao.sql, /reserva = \$5/); assert.match(ativacao.sql, /reservado_ate > clock_timestamp\(\)/);
  assert.deepEqual(ativacao.valores, [tokenHash, 'a@example.invalid', 0, 'envio', 'reserva']);
});
for (const opcoes of [{ expirado: true }, { reservaPerdida: true }]) test('ativação tardia recusada: ' + JSON.stringify(opcoes), async () => {
  const c = bancoSimulado(opcoes); c.estado.ativo = false;
  assert.equal(await c.repo.ativar(tokenHash, 'envio', 'reserva'), false);
  assert.equal(c.estado.ativo, false);
});
test('fila persistente usa reserva atômica com SKIP LOCKED e finalização por lease', async () => {
  const c = bancoSimulado();
  await c.repo.enfileirar('a@example.invalid'); await c.repo.reivindicar();
  await c.repo.finalizar('envio', 'reserva'); await c.repo.limpar();
  assert.deepEqual(c.eventos[0].valores, ['a@example.invalid']);
  assert.match(c.eventos[1].sql, /FOR UPDATE SKIP LOCKED LIMIT 1/);
  assert.match(c.eventos[1].sql, /tentativas < 3/);
  assert.match(c.eventos[2].sql, /id_envio = \$1 AND reserva = \$2/);
  assert.ok(c.eventos.slice(3).every(e => /LIMIT 100/.test(e.sql)));
});
