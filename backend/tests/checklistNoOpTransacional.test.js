const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { conferir: conferirCapacidadeSql } = require('./helpers/rbacSqlSimulado.cjs');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const respostas = { criterio_a: 'SIM', criterio_b: 'NAO', criterio_c: 'SIM', acesso_controlado: 'SIM',
  ventilacao_adequada: 'NAO', monitoramento_atmosferico: 'SIM', procedimento_emergencia: 'NAO' };

function preparar(status = 'CONCLUIDO') {
  const usuario = { id_usuario: 11, id_ambiente: A };
  const estado = { ambiente: A, usuarioAtivo: true, ambienteAtivo: true, perfil: 'ENGENHEIRO_SEGURANCA',
    existe: true, localExiste: true, snapshotNegado: false, hook: null, falha: null, rollbackErro: null,
    consultas: [], locks: [], escritas: [], releases: [], conexoes: 0, consultasGlobais: 0, aberta: false,
    versao: 7, row: { id_checklist: 50, id_local: 40, id_usuario: 99, ...respostas, status,
      observacoes: 'Historico sem campos 026', data_criacao: new Date('2026-01-01T12:00:00Z'),
      data_atualizacao: new Date('2026-01-02T12:00:00Z') } };
  const permitido = () => estado.ambiente === usuario.id_ambiente && estado.usuarioAtivo && estado.ambienteAtivo &&
    estado.localExiste && ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR'].includes(estado.perfil);
  function conferir(sql, params) {
    assert.match(sql, /(?:a|c)\.id_ambiente = \$2/); assert.match(sql, /u\.id_usuario = \$3/);
    assert.match(sql, /u\.ativo = TRUE/); assert.match(sql, /a\.ativo = TRUE/);
    assert.match(sql, /u\.id_ambiente = (?:a|c)\.id_ambiente/);
    assert.match(sql, /c\.id_campanha = l\.id_campanha|l\.id_campanha = c\.id_campanha/);
    conferirCapacidadeSql(sql, 'u');
    assert.equal(params[1], usuario.id_ambiente); assert.equal(params[2], usuario.id_usuario);
    assert.ok(!sql.includes(usuario.id_ambiente));
  }
  async function executar(texto, params = [], transacional = true) {
    const sql = texto.replace(/\s+/g, ' ').trim(); estado.consultas.push({ sql, params: structuredClone(params) });
    if (estado.falha?.sql === sql) throw estado.falha.erro;
    if (sql === 'BEGIN ISOLATION LEVEL READ COMMITTED') {
      assert.equal(estado.aberta, false); estado.aberta = true;
      estado.antes = { row: structuredClone(estado.row), versao: estado.versao }; return { rows: [] };
    }
    if (sql === 'ROLLBACK') {
      if (estado.rollbackErro) throw estado.rollbackErro;
      estado.row = structuredClone(estado.antes.row); estado.versao = estado.antes.versao; estado.aberta = false; return { rows: [] };
    }
    if (sql === 'COMMIT') { assert.equal(estado.aberta, true); estado.aberta = false; return { rows: [] }; }
    if (transacional) assert.equal(estado.aberta, true);
    conferir(sql, params);
    const lock = /FOR (SHARE|UPDATE) OF (a|u|c|l|ch)$/.exec(sql);
    if (lock) {
      assert.match(sql, /^SELECT c\.id_campanha, l\.id_local/);
      assert.equal(lock[1], ['a','u'].includes(lock[2]) ? 'SHARE' : 'UPDATE'); estado.locks.push(lock[2]);
      if (params.length === 5) { assert.deepEqual(params.slice(3), [10,40]); assert.match(sql, /c\.id_campanha = \$4 AND l\.id_local = \$5/); }
      if (estado.hook) estado.hook(lock[2], estado);
      const criacao = !sql.includes('INNER JOIN checklist_nr33 AS ch');
      return { rows: permitido() && (criacao || estado.existe) ? [{ id_campanha: 10, id_local: 40 }] : [] };
    }
    if (sql.startsWith('SELECT ch.* FROM checklist_nr33 AS ch')) {
      assert.deepEqual(estado.locks, ['a','u','c','l','ch']);
      assert.match(sql, /l\.id_local = ch\.id_local/);
      assert.match(sql, /c\.id_campanha = \$4 AND l\.id_local = \$5/);
      assert.deepEqual(params, [50,A,11,10,40]);
      return { rows: permitido() && estado.existe && !estado.snapshotNegado ? [estado.row] : [] };
    }
    assert.match(sql, /^UPDATE checklist_nr33 AS ch SET status = \$4,/);
    if (transacional) assert.deepEqual(estado.locks, ['a','u','c','l','ch']);
    assert.equal(permitido(), true); assert.deepEqual(params.slice(0,3), [50,A,11]); assert.equal(params.length,4);
    estado.escritas.push({ sql, params: structuredClone(params) });
    estado.row.status = params[3]; estado.row.data_atualizacao = new Date('2026-11-08T12:00:00Z'); estado.versao++;
    return { rows: [structuredClone(estado.row)] };
  }
  const pool = {
    async connect() { estado.conexoes++; return { query: (q, p) => executar(q, p), release: erro => estado.releases.push(erro) }; },
    async query(q, p) { estado.consultasGlobais++; return executar(q, p, false); },
  };
  const bancoPath = require.resolve('../src/config/database'), repoPath = require.resolve('../src/repositories/checklistMultiTenantRepository');
  const bancoAntes = require.cache[bancoPath], repoAntes = require.cache[repoPath];
  const fake = new Module(bancoPath); fake.filename = bancoPath; fake.loaded = true; fake.exports = pool;
  require.cache[bancoPath] = fake; delete require.cache[repoPath];
  let repo;
  try { repo = require(repoPath); }
  finally {
    if (bancoAntes) require.cache[bancoPath] = bancoAntes; else delete require.cache[bancoPath];
    if (repoAntes) require.cache[repoPath] = repoAntes; else delete require.cache[repoPath];
  }
  return { repo, usuario, estado };
}
const noop = ctx => ({ validarEstado: () => ctx.repo.statusConcluidoSemAlteracao() });
const alterar = (ctx, status, opcoes = noop(ctx)) => ctx.repo.atualizarStatusNoAmbiente(50,status,ctx.usuario,opcoes);
const liberou = ctx => { assert.equal(ctx.estado.aberta,false); assert.deepEqual(ctx.estado.releases,[undefined]); assert.equal(ctx.estado.consultasGlobais,0); };
const semDml = ctx => {
  assert.equal(ctx.estado.escritas.length,0);
  assert.ok(ctx.estado.consultas.every(q => !/^(UPDATE|INSERT|DELETE|ALTER|CREATE|DROP)\b/.test(q.sql)));
};

test('CONCLUIDO repetido: NO-OP autorizado, sem DML, timestamp e versao preservados', async () => {
  const ctx = preparar(), antes = structuredClone(ctx.estado.row), versao = ctx.estado.versao;
  const resultado = await alterar(ctx,'CONCLUIDO');
  assert.deepEqual(resultado,antes); assert.deepEqual(ctx.estado.row,antes); assert.equal(ctx.estado.versao,versao);
  assert.deepEqual(ctx.estado.locks,['a','u','c','l','ch']);
  assert.equal(ctx.estado.consultas[0].sql,'BEGIN ISOLATION LEVEL READ COMMITTED');
  assert.equal(ctx.estado.consultas.at(-1).sql,'COMMIT');
  assert.equal(ctx.estado.consultas.filter(q => q.sql.startsWith('SELECT ch.*')).length,1);
  semDml(ctx); liberou(ctx);
});

test('callback recebe copias; retorno NO-OP usa snapshot privado e devolve outra copia', async () => {
  const ctx = preparar(), antes = structuredClone(ctx.estado.row);
  let copia;
  const resultado = await alterar(ctx,'CONCLUIDO',{ validarEstado: async ({ estadoAtual, dadosPropostos }) => {
    assert.equal(ctx.estado.aberta,true); assert.equal(ctx.estado.escritas.length,0);
    assert.deepEqual(ctx.estado.locks,['a','u','c','l','ch']);
    copia = estadoAtual; estadoAtual.id_usuario = 999; estadoAtual.status = 'PENDENTE'; estadoAtual.data_atualizacao.setUTCFullYear(2000);
    dadosPropostos.status = 'PENDENTE'; await Promise.resolve(); return ctx.repo.statusConcluidoSemAlteracao();
  } });
  assert.deepEqual(resultado,antes); assert.notEqual(resultado,copia); assert.notEqual(resultado,ctx.estado.row);
  assert.notEqual(resultado.data_atualizacao,ctx.estado.row.data_atualizacao);
  resultado.id_usuario = 777; resultado.data_atualizacao.setUTCFullYear(1999);
  assert.deepEqual(ctx.estado.row,antes); semDml(ctx); liberou(ctx);
});

for (const [atual,pedido] of [['PENDENTE','CONCLUIDO'],['CONCLUIDO','PENDENTE'],['PENDENTE','PENDENTE']]) {
  test(`NO-OP recusado em ${atual} -> ${pedido}, mesmo se callback falsificar suas copias`, async () => {
    const ctx = preparar(atual), antes = structuredClone(ctx.estado.row);
    await assert.rejects(alterar(ctx,pedido,{validarEstado: ({estadoAtual,dadosPropostos}) => {
      estadoAtual.status = 'CONCLUIDO'; dadosPropostos.status = 'CONCLUIDO'; return ctx.repo.statusConcluidoSemAlteracao();
    }}),{statusCode:400});
    assert.deepEqual(ctx.estado.row,antes); assert.equal(ctx.estado.versao,7);
    assert.equal(ctx.estado.consultas.at(-1).sql,'ROLLBACK'); semDml(ctx); liberou(ctx);
  });
}

for (const nome of ['criar','atualizar']) test(`sinal genuino nao pode produzir NO-OP em ${nome}`, async () => {
  const ctx = preparar();
  const executar = nome === 'criar'
    ? () => ctx.repo.criarNoAmbiente({id_local:40,...respostas},ctx.usuario,noop(ctx))
    : () => ctx.repo.atualizarNoAmbiente(50,{observacoes:'Nao gravar'},ctx.usuario,noop(ctx));
  await assert.rejects(executar,{statusCode:400});
  assert.equal(ctx.estado.consultas.at(-1).sql,'ROLLBACK'); semDml(ctx); liberou(ctx);
});

for (const falsificar of [
  () => 'STATUS_CONCLUIDO_SEM_ALTERACAO',
  () => Symbol('STATUS_CONCLUIDO_SEM_ALTERACAO'),
  () => Symbol.for('STATUS_CONCLUIDO_SEM_ALTERACAO'),
  () => ({semAlteracao:true}),
  ctx => ({semAlteracao:ctx.repo.statusConcluidoSemAlteracao(),estado:ctx.estado.row}),
  () => ({status:'CONCLUIDO',semAlteracao:true}),
  ctx => ctx.repo.statusConcluidoSemAlteracao,
  () => null, () => undefined, () => false,
]) test(`sinal falso ou malformado e rejeitado: ${falsificar.toString()}`, async () => {
  const ctx = preparar();
  await assert.rejects(alterar(ctx,'CONCLUIDO',{validarEstado:()=>falsificar(ctx)}),{statusCode:400});
  assert.equal(ctx.estado.consultas.at(-1).sql,'ROLLBACK'); semDml(ctx); liberou(ctx);
});

for (const [nome, configurar] of [
  ['outro ambiente',s=>{s.ambiente=B;}],['usuario inativo',s=>{s.usuarioAtivo=false;}],
  ['ambiente inativo',s=>{s.ambienteAtivo=false;}],['checklist ausente',s=>{s.existe=false;}],
  ['local ausente',s=>{s.localExiste=false;}],
  ...['SUPERVISOR','AUDITOR','VISUALIZADOR'].map(perfil=>[perfil,s=>{s.perfil=perfil;}]),
]) test(`NO-OP nao contorna autorizacao: ${nome}`, async () => {
  const ctx = preparar(); configurar(ctx.estado); let chamadas=0;
  assert.equal(await alterar(ctx,'CONCLUIDO',{validarEstado:()=>{chamadas++;return ctx.repo.statusConcluidoSemAlteracao();}}),null);
  assert.equal(chamadas,0); assert.equal(ctx.estado.consultas.some(q=>q.sql.startsWith('SELECT ch.*')),false);
  assert.equal(ctx.estado.consultas.at(-1).sql,'ROLLBACK'); semDml(ctx); liberou(ctx);
});

test('snapshot sem autorizacao nao chega ao callback', async () => {
  const ctx = preparar(); ctx.estado.snapshotNegado=true;
  assert.equal(await alterar(ctx,'CONCLUIDO',{validarEstado:()=>assert.fail('Nao chamar')}),null);
  assert.equal(ctx.estado.consultas.at(-1).sql,'ROLLBACK'); semDml(ctx); liberou(ctx);
});

test('status mais recente sob locks e verificado independentemente do callback', async () => {
  const ctx = preparar(); ctx.estado.hook=(alias,s)=>{if(alias==='ch')s.row.status='PENDENTE';};
  await assert.rejects(alterar(ctx,'CONCLUIDO'),{statusCode:400});
  assert.equal(ctx.estado.consultas.at(-1).sql,'ROLLBACK'); semDml(ctx); liberou(ctx);
});

test('falha de COMMIT no NO-OP nao retorna sucesso e executa rollback', async () => {
  const ctx = preparar(), erro = new Error('COMMIT falhou');ctx.estado.falha={sql:'COMMIT',erro};
  await assert.rejects(alterar(ctx,'CONCLUIDO'),recebido=>recebido===erro);
  assert.equal(ctx.estado.consultas.at(-1).sql,'ROLLBACK');semDml(ctx);liberou(ctx);
});

test('falha de rollback descarta conexao e preserva erro original', async () => {
  const ctx = preparar('PENDENTE'), erroRollback=new Error('ROLLBACK falhou');ctx.estado.rollbackErro=erroRollback;
  await assert.rejects(alterar(ctx,'CONCLUIDO'),{statusCode:400});
  assert.deepEqual(ctx.estado.releases,[erroRollback]);assert.ok(!ctx.estado.consultas.some(q=>q.sql==='COMMIT'));semDml(ctx);
});

for (const opcoes of [undefined,{bloquearAutorizacao:true},{validarEstado:({dadosPropostos})=>dadosPropostos}]) {
  test(`sem sinal explicito o UPDATE anterior permanece: ${String(opcoes?.bloquearAutorizacao)}`,async()=>{
    const ctx=preparar();await alterar(ctx,'CONCLUIDO',opcoes??{});
    assert.equal(ctx.estado.escritas.length,1);assert.equal(ctx.estado.versao,8);
    assert.equal(ctx.estado.row.data_atualizacao.toISOString(),'2026-11-08T12:00:00.000Z');
    if(opcoes)liberou(ctx);else{assert.equal(ctx.estado.conexoes,0);assert.equal(ctx.estado.consultasGlobais,1);}
  });
}

test('sinal ou campos de corpo HTTP nao podem solicitar NO-OP diretamente',async()=>{
  for(const status of ['STATUS_CONCLUIDO_SEM_ALTERACAO',{status:'CONCLUIDO',semAlteracao:true}]){
    const ctx=preparar();await assert.rejects(alterar(ctx,status,{}),{statusCode:400});assert.equal(ctx.estado.conexoes,0);assert.equal(ctx.estado.consultas.length,0);
  }
  const ctx=preparar();await alterar(ctx,'CONCLUIDO',{semAlteracao:ctx.repo.statusConcluidoSemAlteracao()});
  assert.equal(ctx.estado.escritas.length,1);
});

test('NO-OP funciona em snapshot anterior a 026 e nao consulta versionamento ou novo schema',async()=>{
  const ctx=preparar();await alterar(ctx,'CONCLUIDO');
  for(const q of ctx.estado.consultas)assert.doesNotMatch(q.sql,/atmosfera_|avaliacao_especifica|possui_placa|versao_entidade|information_schema/);
  semDml(ctx);liberou(ctx);
});
