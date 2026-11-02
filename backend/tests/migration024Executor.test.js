const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { plano, validarFonte, executar } = require('../laboratorio/migrar-recuperacao-024.cjs');
const { receber } = require('../laboratorio/migration-024-canal.cjs');
const fonte = fs.readFileSync(require.resolve('../database/024_recuperacao_senha.sql'), 'utf8');
const banco = 'inventario_nr33_multitenant_dev';
const opcoes = { banco, executar: true, confirmacao: 'APLICAR 024 ' + banco };
const env = { NR33_MIGRACAO_024_USER: 'postgres', NR33_MIGRACAO_024_PASSWORD: 'credencial-sintetica' };
const pre = { esquema: true, proprietario: true, referencia: true, papel_app: true, usuario_app: true,
  anteriores: true, chave_composta: true, coluna_ausente: true, objetos_ausentes: true };
const pos = { tabelas: true, indices: true, versao: true, versao_check: true, fk: true,
  ativacao: true, privilegios: true, publico_sem_acesso: true };
function simular(op = {}) {
  const consultas = [], eventos = [];
  const client = {
    async connect() { eventos.push('connect'); }, async end() { eventos.push('end'); },
    async query(sql, parametros) {
      consultas.push({ sql, parametros });
      if (op.falha && sql.includes(op.falha)) throw Error('detalhe SQL privado');
      if (sql.includes('preflight:identidade')) return { rows: [{ banco, versao: 17, host: '127.0.0.1', porta: 5432,
        papel: 'postgres', sessao: 'postgres', ...op.identidade }] };
      if (sql.includes('migration024:preflight')) return { rows: [{ ...pre, ...op.pre }] };
      if (sql.includes('migration024:posflight')) return { rows: [{ ...pos, ...op.pos }] };
      return { rows: [] };
    },
  };
  return { consultas, eventos, deps: { env: { ...env, ...op.env }, lerFonte: () => op.fonte || fonte,
    criarClient(config) { eventos.push('driver'); assert.equal(config.host, '127.0.0.1');
      assert.equal(config.port, 5432); assert.equal(config.database, banco); assert.equal(config.ssl, false); return client; } } };
}
test('plano puro e fonte fixa com LF/CRLF; preserva dados existentes', () => {
  assert.equal(plano().executado, false); assert.equal(plano().versao, 17);
  assert.ok(!JSON.stringify(plano()).includes(env.NR33_MIGRACAO_024_PASSWORD));
  assert.equal(validarFonte(fonte), validarFonte(fonte.replace(/\r?\n/g, '\r\n')));
  assert.match(fonte, /sessao_versao INTEGER NOT NULL DEFAULT 0/);
  assert.match(fonte, /REFERENCES public.usuario \(id_usuario, id_ambiente\)/);
  assert.match(fonte, /GRANT SELECT, INSERT, UPDATE, DELETE ON public.recuperacao_senha, public.recuperacao_limite, public.recuperacao_envio TO nr33_dev_app/);
  assert.match(fonte, /REVOKE ALL.*FROM PUBLIC/);
  assert.doesNotMatch(validarFonte(fonte), /^\s*(?:UPDATE|DELETE|DROP|TRUNCATE)\b/im);
  assert.match(fonte, /consumido_em IS NULL OR ativado_em IS NOT NULL/);
});
test('execução simulada usa uma transação com grants e verifica catálogo e privilégios', async () => {
  const c = simular();
  assert.deepEqual(await executar(opcoes, c.deps), { banco, migration: '024', aplicada: true });
  const sql = c.consultas.map(c => c.sql);
  const ddl = sql.findIndex(s => s.includes('ALTER TABLE public.usuario ADD COLUMN'));
  assert.equal(sql.filter(s => s === 'BEGIN').length, 1); assert.equal(sql.at(-1), 'COMMIT');
  assert.ok(sql.findIndex(s => s.includes('migration024:preflight')) < ddl);
  assert.ok(sql.findIndex(s => s.includes('migration024:posflight')) > ddl);
  assert.ok(sql.includes("SET LOCAL lock_timeout = '3s'"));
  assert.ok(sql.includes("SET LOCAL statement_timeout = '10s'"));
  assert.ok(sql[ddl].includes('GRANT SELECT, INSERT, UPDATE, DELETE'));
  assert.deepEqual(c.eventos, ['driver', 'connect', 'end']);
});
for (const flag of Object.keys(pre)) test('pré-requisito divergente impede DDL: ' + flag, async () => {
  const c = simular({ pre: { [flag]: false } });
  await assert.rejects(executar(opcoes, c.deps));
  assert.ok(!c.consultas.some(c => c.sql.includes('ALTER TABLE public.usuario ADD COLUMN')));
  assert.equal(c.consultas.at(-1).sql, 'ROLLBACK');
});
for (const flag of Object.keys(pos)) test('pós-condição divergente impede commit: ' + flag, async () => {
  const c = simular({ pos: { [flag]: false } });
  await assert.rejects(executar(opcoes, c.deps));
  assert.ok(!c.consultas.some(c => c.sql === 'COMMIT'));
  assert.equal(c.consultas.at(-1).sql, 'ROLLBACK');
});
for (const identidade of [{ banco: 'postgres' }, { versao: 16 }, { host: '192.0.2.1' }, { porta: 55432 }, { sessao: 'outro' }]) {
  test('conexão com identidade errada recusada: ' + Object.keys(identidade)[0], async () => {
    const c = simular({ identidade }); await assert.rejects(executar(opcoes, c.deps));
    assert.ok(!c.consultas.some(c => c.sql === 'BEGIN'));
  });
}
for (const op of [{ env: { PGHOST: 'override' } }, { env: { NODE_OPTIONS: 'override' } }, { fonte: fonte + '-- alteração' }]) {
  test('override ou fonte alterada não carrega driver: ' + JSON.stringify(Object.keys(op)), async () => {
    const c = simular(op); await assert.rejects(executar(opcoes, c.deps)); assert.deepEqual(c.eventos, []);
  });
}
test('destino/consentimento incorretos não conectam', async () => {
  for (const op of [{ ...opcoes, executar: false }, { ...opcoes, banco: 'postgres' }, { ...opcoes, confirmacao: 'sim' }]) {
    const c = simular(); await assert.rejects(executar(op, c.deps)); assert.deepEqual(c.eventos, []);
  }
});
for (const falha of ['ALTER TABLE', 'migration024:posflight', 'COMMIT']) test('falha não repete operação nem expõe detalhes: ' + falha, async () => {
  const c = simular({ falha });
  await assert.rejects(executar(opcoes, c.deps), e => !e.message.includes('detalhe SQL privado') &&
    (falha !== 'COMMIT' || e.message.includes('COMMIT_INCERTO')));
  assert.equal(c.eventos.filter(e => e === 'connect').length, 1);
  assert.equal(c.consultas.at(-1).sql, 'ROLLBACK');
});
test('canal privado compatível, credenciais somente em memória e erros fixos', async () => {
  const c = simular();
  await receber(JSON.stringify({ banco, operador: 'postgres', senha: 'credencial-sintetica', confirmacao: opcoes.confirmacao }),
    (op, deps) => executar(op, { ...c.deps, env: deps.env }));
  assert.equal(c.consultas.at(-1).sql, 'COMMIT');
  await assert.rejects(receber('{}', () => assert.fail()));
});
test('wrapper privado não aceita senha em argumentos nem usa .env', () => {
  const ps = fs.readFileSync(require.resolve('../laboratorio/aplicar-recuperacao-024.ps1'), 'utf8');
  assert.match(ps, /Read-Host.*-AsSecureString/);
  assert.match(ps, /EnvironmentVariables.Clear\(\)/);
  assert.match(ps, /StandardInput.BaseStream.Write/);
  assert.doesNotMatch(ps, /param\([^\n]*Senha|\.env|PGPASSWORD/);
});
