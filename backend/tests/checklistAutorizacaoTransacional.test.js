const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
const repo = require('../src/repositories/checklistMultiTenantRepository');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const campos = ['criterio_a', 'criterio_b', 'criterio_c', 'acesso_controlado', 'ventilacao_adequada', 'monitoramento_atmosferico', 'procedimento_emergencia'];
const respostas = Object.fromEntries(campos.map(c => [c, 'SIM']));
const opcoes = { bloquearAutorizacao: true };

function preparar(t, ambiente = A, engenheiro = false) {
  const u = { id_usuario: ambiente === A ? 11 : 21, id_ambiente: ambiente };
  const estado = { ativo: true, ambienteAtivo: true, ambiente, criadorAmbiente: ambiente, perfil: engenheiro ? 'ENGENHEIRO_SEGURANCA' : 'ADMINISTRADOR', responsavel: u.id_usuario,
    campanha: 10, local: { id_local: 40, id_campanha: 10 }, checklist: { id_checklist: 50, id_local: 40, id_usuario: 99, ...respostas, observacoes: 'Historico', status: 'PENDENTE' },
    consultas: [], escritas: [], liberacoes: [], inesperadas: [], falha: null, hook: null, vazio: false, rollbackFalha: false, aberta: false, antes: null };
  const permitido = () => estado.ativo && estado.ambienteAtivo && estado.ambiente === u.id_ambiente && (estado.perfil === 'ADMINISTRADOR' || estado.responsavel === u.id_usuario);
  function contexto(sql, params) {
    assert.match(sql, /c\.id_ambiente\s*=\s*\$[12]|a\.id_ambiente\s*=\s*\$2/);
    assert.match(sql, /u\.id_usuario\s*=\s*\$[23]/);
    assert.match(sql, /u\.id_ambiente\s*=\s*c\.id_ambiente|u\.id_ambiente\s*=\s*a\.id_ambiente/);
    assert.match(sql, /u\.ativo\s*=\s*TRUE/); assert.match(sql, /a\.ativo\s*=\s*TRUE/);
    assert.match(sql, /u\.perfil_acesso\s*=\s*'ADMINISTRADOR'\s+OR\s+c\.id_usuario\s*=\s*u\.id_usuario/);
    assert.ok(params.includes(u.id_ambiente)); assert.ok(params.includes(u.id_usuario));
    assert.equal(sql.includes(u.id_ambiente), false);
  }
  const client = {
    async query(texto, params = []) {
      const sql = texto.replace(/\s+/g, ' ').trim(); estado.consultas.push({ sql, params: [...params] });
      if (estado.falha?.prefixo && sql.startsWith(estado.falha.prefixo)) throw estado.falha.erro;
      if (sql === 'BEGIN ISOLATION LEVEL READ COMMITTED') { assert.equal(estado.aberta, false); estado.aberta = true; estado.antes = { ...estado.checklist }; return { rows: [] }; }
      if (sql === 'ROLLBACK') { if (estado.rollbackFalha) throw new Error('Rollback falhou'); estado.checklist = estado.antes; estado.aberta = false; return { rows: [] }; }
      if (sql === 'COMMIT') { assert.equal(estado.aberta, true); estado.aberta = false; return { rows: [] }; }
      const lock = sql.match(/FOR (?:UPDATE|SHARE) OF (a|u|c|l|ch)$/);
      if (lock && sql.startsWith('SELECT c.id_campanha, l.id_local FROM ambiente AS a')) {
        assert.equal(estado.aberta, true); contexto(sql, params);
        const criacao = !sql.includes('INNER JOIN checklist_nr33 AS ch');
        assert.deepEqual(params.slice(0, 3), [criacao ? 40 : 50, u.id_ambiente, u.id_usuario]);
        if (params.length === 5) { assert.deepEqual(params.slice(3), [10, 40]); assert.match(sql, /c\.id_campanha = \$4 AND l\.id_local = \$5/); }
        if (estado.hook?.alias === lock[1]) estado.hook.executar(estado);
        const vinculo = estado.local.id_campanha === estado.campanha && (criacao || estado.checklist.id_local === estado.local.id_local);
        const pais = params.length === 3 || params[3] === estado.campanha && params[4] === estado.local.id_local;
        return { rows: permitido() && vinculo && pais ? [{ id_campanha: estado.campanha, id_local: estado.local.id_local }] : [] };
      }
      if (/^(INSERT INTO checklist_nr33 AS ch|UPDATE checklist_nr33 AS ch)\b/.test(sql)) {
        assert.equal(estado.aberta, true); contexto(sql, params);
        const criacao = sql.startsWith('INSERT');
        const locks = estado.consultas.map(q => q.sql.match(/FOR (?:UPDATE|SHARE) OF (a|u|c|l|ch)$/)?.[1]).filter(Boolean);
        assert.deepEqual(locks, criacao ? ['a', 'u', 'c', 'l'] : ['a', 'u', 'c', 'l', 'ch']);
        assert.equal(permitido(), true, 'Nao tentar escrita depois de recusar autorizacao');
        estado.escritas.push({ sql, params });
        if (estado.vazio) return { rows: [] };
        if (criacao) {
          assert.match(sql, /SELECT l\.id_local, \$4, \$5, \$6, \$7, \$8, \$9, \$10, NULLIF\(\$11::text, ''\), \$12, \$3 FROM local AS l/);
          assert.deepEqual(params.slice(0, 3), [40, u.id_ambiente, u.id_usuario]);
          return { rows: [{ id_checklist: 99, id_local: 40, id_usuario: params[2], ...Object.fromEntries(campos.map((c,i) => [c, params[i+3]])), observacoes: params[10] || null, status: params[11] }] };
        }
        assert.match(sql, /l\.id_local = ch\.id_local/); assert.match(sql, /c\.id_campanha = l\.id_campanha/);
        const set = sql.split(' SET ')[1].split(' FROM ')[0]; assert.doesNotMatch(set, /id_local|id_usuario|id_ambiente/);
        if (sql.includes('COALESCE')) {
          assert.equal(params.length, 11);
          for (const [i, campo] of campos.entries()) {
            assert.ok(sql.includes(`${campo} = COALESCE($${4+i}, ch.${campo})`));
            if (params[i+3] != null) estado.checklist[campo] = params[i+3];
          }
          assert.match(sql, /WHEN \$11::text IS NULL THEN ch\.observacoes ELSE NULLIF\(\$11::text, ''\)/);
          if (params[10] != null) estado.checklist.observacoes = params[10] || null;
          assert.doesNotMatch(set, /\bstatus\s*=/);
        } else { assert.match(sql, /SET status = \$4,/); estado.checklist.status = params[3]; }
        return { rows: [{ ...estado.checklist }] };
      }
      estado.inesperadas.push(sql); throw new Error('SQL transacional desconhecido');
    },
    release(erro) { estado.liberacoes.push(erro); },
  };
  t.mock.method(pool, 'connect', async () => client);
  t.mock.method(pool, 'query', async (texto, params) => {
    const sql = texto.replace(/\s+/g, ' ').trim(); estado.consultas.push({ sql, params });
    if (!sql.startsWith('SELECT ch.*, l.nome_local, criador.nome AS usuario_responsavel FROM checklist_nr33 AS ch')) { estado.inesperadas.push(sql); throw new Error('Leitura desconhecida'); }
    contexto(sql, params);
    assert.match(sql, /l\.id_local = ch\.id_local/); assert.match(sql, /c\.id_campanha = l\.id_campanha/);
    assert.match(sql, /criador\.id_ambiente = c\.id_ambiente/);
    const autorizacao = sql.slice(sql.indexOf('AND EXISTS'));
    assert.doesNotMatch(autorizacao, /\b(?:ch\.id_usuario|criador\.)/i);
    const individual = sql.includes('ch.id_checklist = $1');
    assert.deepEqual(params, individual ? [50, u.id_ambiente, u.id_usuario] : [u.id_ambiente, u.id_usuario]);
    return { rows: permitido() && estado.criadorAmbiente === estado.ambiente ? [{ ...estado.checklist }] : [] };
  });
  t.after(() => assert.deepEqual(estado.inesperadas, []));
  return { estado, u };
}
const escritas = [
  ['criar', (u, d = {}) => repo.criarNoAmbiente({ id_local: 40, ...respostas, ...d }, u, opcoes)],
  ['atualizar', (u, d = {}) => repo.atualizarNoAmbiente(50, { criterio_a: 'NAO', ...d }, u, opcoes)],
  ['status', u => repo.atualizarStatusNoAmbiente(50, 'CONCLUIDO', u, opcoes)],
];
for (const [nome, executar] of escritas) {
  for (const ambiente of [A, B]) for (const engenheiro of [false, true]) test(`${nome}: autoriza, bloqueia e COMMIT ${ambiente} engenheiro=${engenheiro}`, async t => {
    const { estado, u } = preparar(t, ambiente, engenheiro);
    const resultado = await executar(u); assert.ok(resultado);
    if (nome === 'criar') assert.equal(resultado.id_usuario, u.id_usuario);
    assert.equal(estado.consultas[0].sql, 'BEGIN ISOLATION LEVEL READ COMMITTED');
    assert.equal(estado.consultas.at(-1).sql, 'COMMIT'); assert.equal(estado.escritas.length, 1); assert.deepEqual(estado.liberacoes, [undefined]);
  });
  for (const [alias, condicao] of [['a', 'ambiente'], ['u', 'usuario'], ['c', 'perfil'], ['c', 'responsavel'], ['l', 'campanha'], ...nome === 'criar' ? [] : [['ch', 'local']]]) test(`${nome}: revogacao/troca ${condicao} recusa sem escrita`, async t => {
    const { estado, u } = preparar(t, A, condicao === 'responsavel');
    estado.hook = { alias, executar(s) { if (condicao === 'ambiente') s.ambienteAtivo = false; if (condicao === 'usuario') s.ativo = false; if (condicao === 'perfil') s.perfil = 'ENGENHEIRO_SEGURANCA', s.responsavel = 999; if (condicao === 'responsavel') s.responsavel = 999; if (condicao === 'campanha') s.local.id_campanha = 20; if (condicao === 'local') s.checklist.id_local = 90; } };
    assert.equal(await executar(u), null); assert.deepEqual(estado.escritas, []); assert.equal(estado.consultas.at(-1).sql, 'ROLLBACK'); assert.deepEqual(estado.liberacoes, [undefined]);
  });
  for (const prefixo of ['BEGIN', 'SELECT', nome === 'criar' ? 'INSERT' : 'UPDATE', 'COMMIT']) test(`${nome}: erro tecnico em ${prefixo} nao vira autorizacao`, async t => {
    const { estado, u } = preparar(t); const erro = new Error('Tecnico simulado'); estado.falha = { prefixo, erro };
    await assert.rejects(executar(u), recebido => recebido === erro); assert.equal(estado.liberacoes.length, 1);
    if (prefixo !== 'BEGIN') assert.equal(estado.consultas.at(-1).sql, 'ROLLBACK');
  });
  test(`${nome}: rollback falho descarta conexao e preserva erro original`, async t => {
    const { estado, u } = preparar(t); const erro = new Error('Persistencia falhou');
    estado.falha = { prefixo: nome === 'criar' ? 'INSERT' : 'UPDATE', erro }; estado.rollbackFalha = true;
    await assert.rejects(executar(u), recebido => recebido === erro); assert.equal(estado.liberacoes.length, 1); assert.ok(estado.liberacoes[0] instanceof Error); assert.equal(estado.consultas.some(q => q.sql === 'COMMIT'), false);
  });
  test(`${nome}: escrita vazia apos bloqueios e falha interna`, async t => {
    const { estado, u } = preparar(t); estado.vazio = true;
    await assert.rejects(executar(u), { statusCode: 500 }); assert.equal(estado.consultas.at(-1).sql, 'ROLLBACK'); assert.equal(estado.liberacoes.length, 1);
  });
}
for (const individual of [false, true]) for (const ambiente of [A, B]) for (const condicao of ['autorizado', 'externo', 'naoResponsavel', 'inativo', 'ambienteInativo', 'criadorExterno']) test(`Leitura SQL individual=${individual} ${ambiente} ${condicao}`, async t => {
  const { estado, u } = preparar(t, ambiente, true);
  if (condicao === 'externo') estado.ambiente = ambiente === A ? B : A;
  if (condicao === 'naoResponsavel') estado.responsavel = 999;
  if (condicao === 'inativo') estado.ativo = false;
  if (condicao === 'ambienteInativo') estado.ambienteAtivo = false;
  if (condicao === 'criadorExterno') estado.criadorAmbiente = ambiente === A ? B : A;
  const resultado = individual ? await repo.buscarPermitidoPorIdNoAmbiente(50, u) : await repo.listarPermitidosNoAmbiente(u);
  assert.deepEqual(resultado, condicao === 'autorizado' ? individual ? estado.checklist : [estado.checklist] : individual ? null : []);
  assert.equal(estado.liberacoes.length, 0);
});
test('PUT preserva respostas concorrentes omitidas e nao transfere vinculos', async t => {
  const { estado, u } = preparar(t);
  estado.hook = { alias: 'ch', executar(s) { s.checklist.criterio_b = 'NAO'; } };
  const ch = await repo.atualizarNoAmbiente(50, { criterio_a: 'NAO', id_local: 90, id_usuario: 99, status: 'CONCLUIDO' }, u, opcoes);
  assert.equal(ch.criterio_b, 'NAO'); assert.equal(ch.criterio_a, 'NAO'); assert.equal(ch.id_local, 40); assert.equal(ch.id_usuario, 99); assert.equal(ch.status, 'PENDENTE');
  assert.deepEqual(estado.escritas[0].params.slice(3), ['NAO', null, null, null, null, null, null, null]);
});
for (const observacoes of [undefined, null, '', '   ', "Texto'; DROP TABLE checklist_nr33; --"]) test('Observacoes preservam contrato e parametrizacao: ' + String(observacoes), async t => {
  const { estado, u } = preparar(t);
  const ch = await repo.atualizarNoAmbiente(50, { observacoes }, u, opcoes);
  assert.equal(ch.observacoes, observacoes == null ? 'Historico' : observacoes || null);
  if (observacoes) assert.equal(estado.escritas[0].sql.includes(observacoes), false);
  for (const campo of campos) assert.equal(ch[campo], 'SIM');
});
for (const constraint of ['checklist_nr33_id_local_key', 'checklist_nr33_pkey', 'outra_constraint']) test('Duplicidade transacional distingue constraint ' + constraint, async t => {
  const { estado, u } = preparar(t);
  const erro = Object.assign(new Error('SQL_DETALHE_SENSIVEL'), { code: '23505', constraint }); estado.falha = { prefixo: 'INSERT', erro };
  await assert.rejects(repo.criarNoAmbiente({ id_local: 40, ...respostas }, u, opcoes), recebido => constraint === 'checklist_nr33_id_local_key' ? recebido.statusCode === 409 && recebido.message === 'Este local já possui um checklist NR-33.' && !recebido.message.includes('SQL_DETALHE') : recebido === erro);
  assert.equal(estado.consultas.at(-1).sql, 'ROLLBACK'); assert.equal(estado.liberacoes.length, 1); assert.equal(estado.consultas.some(q => q.sql === 'COMMIT'), false);
});
test('Falha ao adquirir cliente nao executa SQL nem release ficticio', async t => {
  const { estado, u } = preparar(t); const erro = new Error('Pool indisponivel');
  t.mock.method(pool, 'connect', async () => { throw erro; });
  await assert.rejects(repo.atualizarStatusNoAmbiente(50, 'CONCLUIDO', u, opcoes), recebido => recebido === erro); assert.deepEqual(estado.consultas, []); assert.deepEqual(estado.liberacoes, []);
});
