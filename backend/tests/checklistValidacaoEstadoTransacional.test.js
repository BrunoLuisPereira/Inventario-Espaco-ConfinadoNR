const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { conferir: conferirCapacidadeSql } = require('./helpers/rbacSqlSimulado.cjs');
const { CAMPOS: caracterizacao } = require('../src/utils/caracterizacaoChecklist');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const respostas = { criterio_a: 'SIM', criterio_b: 'NAO', criterio_c: 'SIM', acesso_controlado: 'SIM',
  ventilacao_adequada: 'NAO', monitoramento_atmosferico: 'SIM', procedimento_emergencia: 'NAO' };
const campos = Object.keys(respostas);

function preparar() {
  const usuario = { id_usuario: 11, id_ambiente: A };
  const estado = { ambiente: A, usuarioAtivo: true, ambienteAtivo: true, perfil: 'ENGENHEIRO_SEGURANCA',
    localExiste: true, campanha: 10, local: 40, existe: true, snapshotNegado: false,
    consultas: [], escritas: [], locks: [], liberacoes: [], aberta: false, conexoes: 0, globais: 0, hook: null, falha: null,
    checklist: { id_checklist: 50, id_local: 40, id_usuario: 99, ...respostas,
      status: 'PENDENTE', observacoes: 'Anterior', codigo_identificacao: 'TG-01', volume_m3: '1.250000',
      quantidade_aberturas: 0, dimensoes_aberturas: null, formas_acesso: 'Escada', geometria: 'Cilindro',
      utilizacao_produto: null, perigos_antes_liberacao: null, data_criacao: new Date('2026-01-01T12:00:00Z') } };
  const permitido = () => estado.localExiste && estado.ambiente === usuario.id_ambiente && estado.usuarioAtivo && estado.ambienteAtivo &&
    ['ADMINISTRADOR', 'ENGENHEIRO_SEGURANCA', 'TECNICO_SEGURANCA', 'COORDENADOR'].includes(estado.perfil);
  function conferir(sql, params) {
    assert.match(sql, /(?:a|c)\.id_ambiente = \$2/);
    assert.match(sql, /u\.id_usuario = \$3/);
    assert.match(sql, /u\.ativo = TRUE/); assert.match(sql, /a\.ativo = TRUE/);
    assert.match(sql, /u\.id_ambiente = (?:a|c)\.id_ambiente/);
    conferirCapacidadeSql(sql, 'u');
    assert.equal(params[1], usuario.id_ambiente); assert.equal(params[2], usuario.id_usuario);
    assert.ok(!sql.includes(usuario.id_ambiente));
  }
  const client = {
    async query(texto, params = []) {
      const sql = texto.replace(/\s+/g, ' ').trim(); estado.consultas.push({ sql, params: structuredClone(params) });
      const lock = /FOR (SHARE|UPDATE) OF (a|u|c|l|ch)$/.exec(sql);
      const snapshot = sql.startsWith('SELECT ch.* FROM checklist_nr33 AS ch');
      const escrita = /^(?:INSERT INTO|UPDATE) checklist_nr33 AS ch\b/.test(sql);
      const fase = lock ? 'lock' : snapshot ? 'snapshot' : escrita ? 'write' : sql;
      if (estado.falha?.fase === fase) throw estado.falha.erro;
      if (sql === 'BEGIN ISOLATION LEVEL READ COMMITTED') { assert.equal(estado.aberta, false); estado.aberta = true; estado.antes = structuredClone(estado.checklist); return { rows: [] }; }
      if (sql === 'ROLLBACK') { estado.aberta = false; estado.checklist = structuredClone(estado.antes); return { rows: [] }; }
      if (sql === 'COMMIT') { assert.equal(estado.aberta, true); estado.aberta = false; return { rows: [] }; }
      assert.equal(estado.aberta, true);
      if (lock) {
        assert.match(sql, /^SELECT c\.id_campanha, l\.id_local FROM ambiente AS a/); conferir(sql, params);
        estado.locks.push(lock[2]);
        assert.equal(lock[1], ['a', 'u'].includes(lock[2]) ? 'SHARE' : 'UPDATE');
        if (estado.hook) estado.hook(lock[2], estado);
        const criacao = !sql.includes('INNER JOIN checklist_nr33 AS ch');
        assert.equal(params[0], criacao ? 40 : 50);
        if (params.length === 5) { assert.deepEqual(params.slice(3), [10, 40]); assert.match(sql, /c\.id_campanha = \$4 AND l\.id_local = \$5/); }
        return { rows: permitido() && (criacao || estado.existe) && estado.campanha === 10 && estado.local === 40
          ? [{ id_campanha: 10, id_local: 40 }] : [] };
      }
      if (snapshot) {
        conferir(sql, params); assert.deepEqual(estado.locks, ['a', 'u', 'c', 'l', 'ch']);
        assert.match(sql, /l\.id_local = ch\.id_local/); assert.match(sql, /c\.id_campanha = l\.id_campanha/);
        assert.match(sql, /c\.id_campanha = \$4 AND l\.id_local = \$5/);
        assert.deepEqual(params, [50, usuario.id_ambiente, usuario.id_usuario, 10, 40]);
        // Retorna a referencia do mock para provar o destacamento feito pelo repo.
        return { rows: permitido() && estado.existe && !estado.snapshotNegado ? [estado.checklist] : [] };
      }
      if (escrita) {
        conferir(sql, params); assert.equal(permitido(), true);
        const criar = sql.startsWith('INSERT');
        assert.deepEqual(estado.locks, criar ? ['a', 'u', 'c', 'l'] : ['a', 'u', 'c', 'l', 'ch']);
        estado.escritas.push({ sql, params: structuredClone(params) });
        if (criar) {
          assert.equal(params.length, 20);
          estado.checklist = { id_checklist: 60, id_local: params[0], id_usuario: params[2],
            ...Object.fromEntries(campos.map((c, i) => [c, params[3 + i]])), observacoes: params[10] || null,
            status: params[11], ...Object.fromEntries(caracterizacao.map((c, i) => [c, params[12 + i]])) };
        } else if (sql.includes('criterio_a = COALESCE')) {
          assert.equal(params.length, 27);
          for (const [i, c] of campos.entries()) if (params[3 + i] != null) estado.checklist[c] = params[3 + i];
          if (params[10] != null) estado.checklist.observacoes = params[10] || null;
          for (const [i, c] of caracterizacao.entries()) if (params[11 + 2 * i]) estado.checklist[c] = params[12 + 2 * i];
        } else { assert.equal(params.length, 4); estado.checklist.status = params[3]; }
        return { rows: [structuredClone(estado.checklist)] };
      }
      throw Error('Consulta nao prevista: ' + sql);
    },
    release(erro) { estado.liberacoes.push(erro); },
  };
  const pool = {
    async connect() { estado.conexoes++; return client; },
    async query() { estado.globais++; throw Error('pool.query fora da transacao proibido'); },
  };
  // Mock instalado ANTES de importar o repository; nao importa pg nem config real.
  const bancoPath = require.resolve('../src/config/database');
  const repoPath = require.resolve('../src/repositories/checklistMultiTenantRepository');
  const bancoAntes = require.cache[bancoPath], repoAntes = require.cache[repoPath];
  const modulo = new Module(bancoPath); modulo.filename = bancoPath; modulo.loaded = true; modulo.exports = pool;
  require.cache[bancoPath] = modulo; delete require.cache[repoPath];
  let repo;
  try { repo = require(repoPath); }
  finally {
    if (bancoAntes) require.cache[bancoPath] = bancoAntes; else delete require.cache[bancoPath];
    if (repoAntes) require.cache[repoPath] = repoAntes; else delete require.cache[repoPath];
  }
  return { repo, estado, usuario };
}

const operacoes = {
  criar: (ctx, opcoes) => ctx.repo.criarNoAmbiente({ id_local: 40, ...respostas, observacoes: 'Novo' }, ctx.usuario, opcoes),
  atualizar: (ctx, opcoes) => ctx.repo.atualizarNoAmbiente(50, { criterio_a: 'NAO', observacoes: 'Novo' }, ctx.usuario, opcoes),
  status: (ctx, opcoes) => ctx.repo.atualizarStatusNoAmbiente(50, 'CONCLUIDO', ctx.usuario, opcoes),
};
const finalizou = ctx => {
  assert.equal(ctx.estado.aberta, false); assert.deepEqual(ctx.estado.liberacoes, [undefined]); assert.equal(ctx.estado.globais, 0);
};

for (const [nome, executar] of Object.entries(operacoes)) {
  test(`${nome}: callback assincrono depois de todos os locks, sem client e com copia do estado`, async () => {
    const ctx = preparar(); let chamadas = 0;
    const resultado = await executar(ctx, { validarEstado: async entrada => {
      chamadas++; assert.equal(ctx.estado.aberta, true); assert.equal(ctx.estado.escritas.length, 0);
      assert.deepEqual(Object.keys(entrada).sort(), ['dadosPropostos', 'estadoAtual']);
      assert.deepEqual(ctx.estado.locks, nome === 'criar' ? ['a', 'u', 'c', 'l'] : ['a', 'u', 'c', 'l', 'ch']);
      if (nome === 'criar') assert.equal(entrada.estadoAtual, null);
      else {
        assert.deepEqual(entrada.estadoAtual, ctx.estado.checklist); assert.notEqual(entrada.estadoAtual, ctx.estado.checklist);
        entrada.estadoAtual.id_local = 999; entrada.estadoAtual.id_usuario = 777;
        entrada.estadoAtual.data_criacao.setUTCFullYear(2000);
      }
      assert.equal(entrada.dadosPropostos.id_local, undefined); assert.equal(entrada.dadosPropostos.id_usuario, undefined);
      await Promise.resolve();
      return entrada.dadosPropostos;
    } });
    assert.equal(chamadas, 1); assert.equal(resultado.id_local, 40);
    assert.equal(resultado.id_usuario, nome === 'criar' ? 11 : 99);
    if (nome !== 'criar') assert.equal(resultado.data_criacao.getUTCFullYear(), 2026);
    assert.equal(ctx.estado.consultas.at(-1).sql, 'COMMIT'); finalizou(ctx);
  });

  test(`${nome}: erro de validacao rejeita antes de INSERT/UPDATE e executa rollback`, async () => {
    const ctx = preparar(); const erro = Object.assign(new Error('Rejeitado pelo service simulado'), { statusCode: 400 });
    const antes = structuredClone(ctx.estado.checklist);
    await assert.rejects(executar(ctx, { validarEstado: async () => { throw erro; } }), recebido => recebido === erro);
    assert.deepEqual(ctx.estado.escritas, []); assert.deepEqual(ctx.estado.checklist, antes);
    assert.equal(ctx.estado.consultas.at(-1).sql, 'ROLLBACK'); finalizou(ctx);
  });

  test(`${nome}: callback nao altera SQL nem parametros se aprovar os dados originais`, async () => {
    const legado = preparar(), novo = preparar();
    await executar(legado, { bloquearAutorizacao: true });
    await executar(novo, { bloquearAutorizacao: false, validarEstado: ({ dadosPropostos }) => dadosPropostos });
    assert.deepEqual(novo.estado.escritas, legado.estado.escritas);
    assert.equal(legado.estado.consultas.some(q => q.sql.startsWith('SELECT ch.*')), false);
    assert.equal(novo.estado.conexoes, 1); finalizou(novo); finalizou(legado);
  });

  for (const [cenario, configurar] of [
    ['ambiente externo', s => { s.ambiente = B; }],
    ['usuario inativo', s => { s.usuarioAtivo = false; }],
    ['ambiente inativo', s => { s.ambienteAtivo = false; }],
    ['local inexistente', s => { s.localExiste = false; }],
    ['ancestralidade divergente', s => { s.campanha = 90; }],
    ...['SUPERVISOR', 'AUDITOR', 'VISUALIZADOR'].map(p => [p, s => { s.perfil = p; }]),
    ...(nome === 'criar' ? [] : [['checklist inexistente', s => { s.existe = false; }]]),
  ]) test(`${nome}: ${cenario} nao recebe estado nem escreve`, async () => {
    const ctx = preparar(); configurar(ctx.estado); let chamadas = 0;
    assert.equal(await executar(ctx, { validarEstado: () => { chamadas++; return {}; } }), null);
    assert.equal(chamadas, 0); assert.equal(ctx.estado.consultas.some(q => q.sql.startsWith('SELECT ch.*')), false);
    assert.equal(ctx.estado.escritas.length, 0); assert.equal(ctx.estado.consultas.at(-1).sql, 'ROLLBACK'); finalizou(ctx);
  });

  for (const campo of ['id', 'id_ambiente', 'id_campanha', 'id_local', 'id_checklist', 'id_usuario', 'usuario', 'perfil_acesso', 'avaliacao_nr33']) {
    test(`${nome}: retorno do callback com ${campo} e recusado`, async () => {
      const ctx = preparar();
      await assert.rejects(executar(ctx, { validarEstado: ({ dadosPropostos }) => ({ ...dadosPropostos, [campo]: 999 }) }), { statusCode: 400 });
      assert.equal(ctx.estado.escritas.length, 0); assert.equal(ctx.estado.consultas.at(-1).sql, 'ROLLBACK'); finalizou(ctx);
    });
  }

  for (const valor of [undefined, null, false, 1, 'dados', [], new Date('2026-01-01T00:00:00Z')]) test(`${nome}: callback com retorno invalido ${String(valor)}`, async () => {
    const ctx = preparar();
    await assert.rejects(executar(ctx, { validarEstado: () => valor }), { statusCode: 400 });
    assert.equal(ctx.estado.escritas.length, 0); finalizou(ctx);
  });

  for (const fase of ['write', 'COMMIT']) test(`${nome}: falha tecnica em ${fase} reverte escrita e libera conexao`, async () => {
    const ctx = preparar(); const antes = structuredClone(ctx.estado.checklist), erro = new Error('Falha tecnica');
    ctx.estado.falha = { fase, erro };
    await assert.rejects(executar(ctx, { validarEstado: ({ dadosPropostos }) => dadosPropostos }), recebido => recebido === erro);
    assert.deepEqual(ctx.estado.checklist, antes); assert.equal(ctx.estado.consultas.at(-1).sql, 'ROLLBACK'); finalizou(ctx);
  });
}

test('estado completo e o mais recente sob locks; callback aprova dados diferentes', async () => {
  const ctx = preparar(); ctx.estado.hook = (alias, s) => { if (alias === 'ch') s.checklist.criterio_b = 'SIM'; };
  const resultado = await ctx.repo.atualizarNoAmbiente(50, { observacoes: 'Proposta' }, ctx.usuario, {
    validarEstado: ({ estadoAtual, dadosPropostos }) => {
      assert.equal(estadoAtual.criterio_b, 'SIM'); assert.equal(dadosPropostos.observacoes, 'Proposta');
      return { observacoes: "Aprovado'; DROP TABLE x; --", quantidade_aberturas: 0, volume_m3: null };
    },
  });
  assert.equal(resultado.criterio_b, 'SIM'); assert.equal(resultado.volume_m3, null); assert.equal(resultado.quantidade_aberturas, 0);
  assert.equal(resultado.observacoes, "Aprovado'; DROP TABLE x; --");
  assert.ok(!ctx.estado.escritas[0].sql.includes('DROP TABLE')); finalizou(ctx);
});

test('criacao persiste dados aprovados e preserva local e autor autenticados', async () => {
  const ctx = preparar();
  const resultado = await operacoes.criar(ctx, { validarEstado: ({ dadosPropostos }) => ({
    ...dadosPropostos, criterio_b: 'SIM', observacoes: 'Aprovado', status: 'CONCLUIDO',
    codigo_identificacao: '  TG-02  ', quantidade_aberturas: 0,
  }) });
  assert.equal(resultado.id_local, 40); assert.equal(resultado.id_usuario, 11);
  assert.equal(resultado.criterio_b, 'SIM'); assert.equal(resultado.status, 'CONCLUIDO');
  assert.equal(resultado.observacoes, 'Aprovado'); assert.equal(resultado.codigo_identificacao, 'TG-02');
  assert.equal(resultado.quantidade_aberturas, 0); finalizou(ctx);
});

test('operacao de status persiste somente status aprovado, sem modificar respostas', async () => {
  const ctx = preparar(); const antes = structuredClone(ctx.estado.checklist);
  const resultado = await operacoes.status(ctx, { validarEstado: ({ estadoAtual }) => ({ status: estadoAtual.status }) });
  assert.deepEqual(resultado, antes);
  assert.deepEqual(ctx.estado.escritas[0].params, [50, A, 11, 'PENDENTE']); finalizou(ctx);
});

test('leitura revalida autorizacao e nao chama callback se snapshot nao estiver autorizado', async () => {
  const ctx = preparar(); ctx.estado.snapshotNegado = true; let chamou = false;
  assert.equal(await operacoes.atualizar(ctx, { validarEstado: () => { chamou = true; } }), null);
  assert.equal(chamou, false); assert.equal(ctx.estado.escritas.length, 0); finalizou(ctx);
});

test('erro na leitura de snapshot causa rollback antes de validar/escrever', async () => {
  const ctx = preparar(), erro = new Error('Leitura falhou'); ctx.estado.falha = { fase: 'snapshot', erro };
  await assert.rejects(operacoes.atualizar(ctx, { validarEstado: () => assert.fail('Nao chamar') }), recebido => recebido === erro);
  assert.equal(ctx.estado.escritas.length, 0); finalizou(ctx);
});

test('revogacao e troca de pais durante bloqueios nao vazam estado', async () => {
  for (const alias of ['a', 'u', 'c', 'l', 'ch']) {
    const ctx = preparar(); ctx.estado.hook = (atual, s) => { if (atual === alias) s.usuarioAtivo = false; };
    assert.equal(await operacoes.atualizar(ctx, { validarEstado: () => assert.fail('Nao chamar') }), null);
    assert.equal(ctx.estado.escritas.length, 0); finalizou(ctx);
  }
});

test('invalidos no retorno sao revalidados, sem novas regras de status/conclusao', async () => {
  for (const [nome, aprovados] of [['criar', {}], ['criar', { ...respostas, status: 'INVALIDO' }],
    ['atualizar', { criterio_a: false }], ['atualizar', { volume_m3: '-1' }], ['status', {}], ['status', { status: 'INVALIDO' }],
    ['atualizar', { status: 'CONCLUIDO' }], ['status', { status: 'PENDENTE', observacoes: 'fora' }]]) {
    const ctx = preparar();
    await assert.rejects(operacoes[nome](ctx, { validarEstado: () => aprovados }), { statusCode: 400 });
    assert.equal(ctx.estado.escritas.length, 0); finalizou(ctx);
  }
});

test('campo simbolico e getter no retorno sao recusados sem executar acessor', async () => {
  for (const retorno of [{ [Symbol('proibido')]: true }, Object.defineProperty({}, 'observacoes', { get() { assert.fail('Nao executar'); } })]) {
    const ctx = preparar();
    await assert.rejects(operacoes.atualizar(ctx, { validarEstado: () => retorno }), { statusCode: 400 });
    assert.equal(ctx.estado.escritas.length, 0); finalizou(ctx);
  }
});

test('callback invalido e recusado antes de conectar', async () => {
  for (const valor of [null, true, 'funcao', {}]) {
    const ctx = preparar();
    await assert.rejects(operacoes.atualizar(ctx, { validarEstado: valor }), { statusCode: 400 });
    assert.equal(ctx.estado.conexoes, 0); assert.equal(ctx.estado.globais, 0);
  }
});

test('rollback falho descarta conexao mas preserva erro de validacao original', async () => {
  const ctx = preparar(), original = new Error('Rejeicao do callback'), rollback = new Error('Rollback falhou');
  await assert.rejects(operacoes.atualizar(ctx, { validarEstado: () => {
    ctx.estado.falha = { fase: 'ROLLBACK', erro: rollback }; throw original;
  } }), recebido => recebido === original);
  assert.deepEqual(ctx.estado.liberacoes, [rollback]); assert.equal(ctx.estado.escritas.length, 0);
  assert.equal(ctx.estado.consultas.some(q => q.sql === 'COMMIT'), false);
});
