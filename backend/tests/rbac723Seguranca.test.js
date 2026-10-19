const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const pool = require('../src/config/database');
const rbac = require('../src/utils/permissoes');
const permissoes = require('../src/repositories/usuarioPermissoesRepository');
const controller = require('../src/controllers/usuarioPermissoesController');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const CONVITE = '33333333-3333-4333-8333-333333333333';
// Expectativas independentes da matriz de produção.
const P = ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR','SUPERVISOR','AUDITOR','VISUALIZADOR'];
const ESCRITORES = P.slice(0,4);
const AV = [P[0],P[1],P[3]];
const identidade = perfil => ({ id_usuario: 10, id_ambiente: A, perfil_acesso: perfil, eh_fundador: perfil === P[0] });
const capacidades = {
  'campanhas.consultar': P, 'locais.consultar': P, 'checklists.consultar': P,
  'dados_tecnicos.consultar': P, 'evidencias.consultar': P, 'relatorios.consultar': P,
  'campanhas.criar': ESCRITORES, 'campanhas.editar': ESCRITORES, 'campanhas.status': ESCRITORES,
  'locais.criar': ESCRITORES, 'locais.editar': ESCRITORES, 'locais.status': ESCRITORES,
  'checklists.editar': ESCRITORES, 'dados_tecnicos.editar': ESCRITORES,
  'evidencias.criar': ESCRITORES, 'evidencias.editar': ESCRITORES, 'evidencias.excluir': AV,
  'relatorios.criar': AV, 'relatorios.editar': AV, 'relatorios.gerar': AV,
  'locais.exportar': P.slice(0,6), 'auditoria.consultar': [P[0],P[1],P[3],P[4],P[5]],
  'sincronizacao.executar': ESCRITORES, 'usuarios.consultar': [P[0]],
  'usuarios.permissoes.alterar': [P[0]], 'convites.criar': [P[0]], 'usuarios.auditoria.consultar': [P[0]],
};
for (const perfil of P) for (const [capacidade, permitidos] of Object.entries(capacidades)) {
  test(`matriz ${perfil}: ${capacidade}`, () => {
    assert.equal(rbac.pode(identidade(perfil), capacidade), permitidos.includes(perfil));
    if (permitidos.length === 1) assert.equal(rbac.pode({ ...identidade(perfil), eh_fundador: false }, capacidade), false);
  });
}
test('sete perfis; seis convites; capacidade/alias desconhecidos não autorizam', () => {
  assert.deepEqual(rbac.perfis, P); assert.deepEqual(rbac.perfisConvite, P.slice(1));
  assert.throws(() => rbac.pode(identidade(P[0]), 'inventada'));
  assert.throws(() => rbac.sqlCapacidade('u; DROP', 'campanhas.consultar'));
});
for (const perfil of P) test('JWT antigo usa o perfil atual do banco: '+perfil,async t=>{
  const anterior=process.env.JWT_SECRET;
  process.env.JWT_SECRET='segredo-exclusivamente-sintetico-rbac-723';
  t.after(()=>{if(anterior===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=anterior;});
  const usuarioRepo=require('../src/repositories/usuarioRepository');
  const consultar=t.mock.method(usuarioRepo,'buscarIdentidadeAutenticada',async id=>{
    assert.equal(id,10);return {...identidade(perfil),id_usuario:'10'};
  });
  const token=require('jsonwebtoken').sign({perfil:'ADMINISTRADOR'},process.env.JWT_SECRET,{algorithm:'HS256',subject:'10',expiresIn:'1h',issuer:process.env.JWT_ISSUER||'inventario-espacos-confinados-api',audience:process.env.JWT_AUDIENCE||'inventario-espacos-confinados-pwa'});
  const req={headers:{authorization:'Bearer '+token},body:{perfil_acesso:'ADMINISTRADOR',id_ambiente:B}};
  const res={headersSent:false,status(){assert.fail('Identidade atual válida deve autenticar');},json(){assert.fail('Não deve responder erro');}};
  let next=0;await require('../src/middlewares/autenticacaoMiddleware').autenticarMultiTenant(req,res,()=>{next++;});
  assert.equal(next,1);assert.equal(consultar.mock.callCount(),1);assert.deepEqual(req.usuario,identidade(perfil));
});

const leituras = [
  ['campanhas', require('../src/repositories/campanhaMultiTenantRepository'), 'listarPermitidasNoAmbiente', 'solicitante'],
  ['locais', require('../src/repositories/localMultiTenantRepository'), 'listarPermitidosNoAmbiente', 'u'],
  ['checklists', require('../src/repositories/checklistMultiTenantRepository'), 'listarPermitidosNoAmbiente', 'u'],
  ['dados técnicos', require('../src/repositories/dadosTecnicosMultiTenantRepository'), 'listarPermitidosNoAmbiente', 'u'],
  ['evidências', require('../src/repositories/evidenciaMultiTenantRepository'), 'listarPermitidasNoAmbiente', 'solicitante'],
  ['relatórios', require('../src/repositories/relatorioMultiTenantRepository'), 'listarPermitidosNoAmbiente', 'u'],
];
for (const perfil of P) for (const [modulo, repo, metodo, alias] of leituras) for (const ambiente of [A,B]) {
  test(`SQL real ${modulo}: ${perfil} lê por ambiente ${ambiente}`, async t => {
    // O registro tem outro responsável. Somente ambiente, atividade e capacidade autorizam.
    const recurso = { id: 40, id_usuario: 999, id_ambiente: A };
    let chamadas = 0;
    t.mock.method(pool, 'query', async (sql, params) => {
      chamadas++;
      assert.match(sql, /^\s*SELECT/);
      assert.match(sql, /c\.id_ambiente\s*=\s*\$1/);
      assert.match(sql, new RegExp(alias+'\\.id_usuario\\s*=\\s*\\$2'));
      assert.match(sql, new RegExp(alias+'\\.id_ambiente\\s*=\\s*c\\.id_ambiente'));
      assert.match(sql, /ativo = TRUE/);
      const m = sql.match(new RegExp(alias+"\\.perfil_acesso IN \\(([^)]+)\\)"));
      assert.ok(m);
      assert.deepEqual(m[1].split(',').map(p => p.trim().replace(/^'|'$/g,'')), P);
      assert.doesNotMatch(sql.slice(sql.indexOf('AND EXISTS')), /OR c\.id_usuario\s*=/);
      assert.deepEqual(params, [ambiente,10]);
      return { rows: ambiente === recurso.id_ambiente && P.includes(perfil) ? [recurso] : [] };
    });
    t.mock.method(pool, 'connect', () => { throw Error('Leitura não deve abrir transação ou conexão real'); });
    assert.deepEqual(await repo[metodo]({ ...identidade(perfil), id_ambiente: ambiente }), ambiente === A ? [recurso] : []);
    assert.equal(chamadas,1);
  });
}

const respostaChecklist = Object.fromEntries(['criterio_a','criterio_b','criterio_c','acesso_controlado','ventilacao_adequada','monitoramento_atmosferico','procedimento_emergencia'].map(c => [c,'SIM']));
const criacoes = [
  ['campanhas',ESCRITORES, u => leituras[0][1].criarNoAmbiente({nomeCampanha:'Campanha sintética',empresa:'Empresa A',responsavel:'Atribuição',dataInicio:'2026-10-19',status:'EM ANDAMENTO',idUsuario:u.id_usuario},u.id_ambiente,{bloquearAutorizacao:true})],
  ['locais',ESCRITORES, u => leituras[1][1].criarNoAmbiente({nomeLocal:'Tanque A',idCampanha:30},u,{bloquearAutorizacao:true})],
  ['checklists',ESCRITORES, u => leituras[2][1].criarNoAmbiente({id_local:40,...respostaChecklist},u,{bloquearAutorizacao:true})],
  ['dados_tecnicos',ESCRITORES, u => leituras[3][1].criarNoAmbiente({id_local:40,oxigenio:0},u)],
  ['evidencias',ESCRITORES, u => leituras[4][1].criarNoAmbiente({id_local:40,tipo:'TEXTO',descricao:'Texto seguro'},u)],
  ['relatorios',AV, u => leituras[5][1].criarNoAmbiente({id_local:40,nome_responsavel_tecnico:'Nome técnico'},u)],
];
for (const perfil of P) for (const [modulo, permitidos, executar] of criacoes) {
  test(`escrita SQL real ${modulo}: perfil atual ${perfil}`,async t=>{
    const u=identidade(perfil), eventos=[], tentativas=[];
    let aberta=false, liberacoes=0;
    const registro={id_campanha:30,id_local:40,id_checklist:50,id_dados:50,id_evidencia:50,id_relatorio:50,id_usuario:10};
    t.mock.method(pool,'query',()=>{throw Error('Escrita deve permanecer no cliente bloqueado');});
    t.mock.method(pool,'connect',async()=>({
      async query(sql,params=[]) {
        const q=sql.replace(/\s+/g,' ').trim();eventos.push(q);
        if(q.startsWith('BEGIN')){assert.equal(aberta,false);aberta=true;return {rows:[]};}
        assert.ok(aberta);
        if(q==='COMMIT'||q==='ROLLBACK'){aberta=false;return {rows:[]};}
        assert.ok(params.includes(A));assert.ok(params.includes(10));
        const alias=modulo==='evidencias'?'solicitante':'u';
        const m=q.match(new RegExp(alias+"\\.perfil_acesso IN \\(([^)]+)\\)"));assert.ok(m);
        assert.deepEqual(m[1].split(',').map(p=>p.trim().replace(/^'|'$/g,'')),permitidos);
        assert.match(q,/id_ambiente\s*=\s*\$\d+/);
        assert.doesNotMatch(q,/OR c\.id_usuario\s*=/);
        if(q.startsWith('SELECT')) {
          assert.match(q,/FOR (?:SHARE|UPDATE) OF (?:a|u|c|l|solicitante)$/);
          return {rows:permitidos.includes(perfil)?[registro]:[]};
        }
        assert.match(q,/^INSERT INTO /);tentativas.push(q);
        assert.equal(permitidos.includes(perfil),true,'Nunca tentar INSERT após recusar a autorização');
        assert.ok(eventos.filter(q=>/FOR (?:SHARE|UPDATE) OF/.test(q)).length>=2);
        return {rows:[registro]};
      }, release(){assert.equal(aberta,false);liberacoes++;}
    }));
    const r=await executar(u);
    if(permitidos.includes(perfil)){assert.ok(r);assert.equal(tentativas.length,1);assert.equal(eventos.at(-1),'COMMIT');}
    else {assert.equal(r,null);assert.deepEqual(tentativas,[]);assert.equal(eventos.at(-1),'ROLLBACK');}
    assert.equal(liberacoes,1);
  });
}

function transacao(t, op = {}) {
  const ator = { ...identidade(P[0]), ativo:true };
  const alvo = { id_usuario:'20',id_ambiente:A,nome:'Pessoa convidada',email:'pessoa@example.invalid',perfil_acesso:P[1],ativo:true,eh_fundador:false,id_convite_origem:CONVITE };
  const estado = { ator,alvo,auditoria:[],eventos:[],updates:0,liberacoes:[],aberta:false };
  let pendente, auditoria, responsavel;
  const row = (...rows) => ({ rows });
  t.mock.method(pool,'connect',async()=>({
    async query(sql,params=[]) {
      const q=sql.replace(/\s+/g,' ').trim(); estado.eventos.push(q);
      if(op.falhar && q.startsWith(op.falhar)) throw op.erro;
      if(q==='BEGIN') { assert.equal(estado.aberta,false); estado.aberta=true; pendente={...alvo}; auditoria=[]; return row(); }
      assert.ok(estado.aberta);
      if(q==='ROLLBACK') { estado.aberta=false; if(op.rollbackFalha) throw Error('ROLLBACK falhou'); return row(); }
      if(q==='COMMIT') { Object.assign(alvo,pendente);estado.auditoria.push(...auditoria);estado.aberta=false;return row(); }
      if(q==='SELECT id_ambiente FROM ambiente WHERE id_ambiente=$1 AND ativo=TRUE FOR SHARE') {
        assert.deepEqual(params,[A]);return op.ambienteInativo ? row() : row({id_ambiente:A});
      }
      if(q.startsWith('SELECT id_usuario,nome,email,perfil_acesso,ativo,eh_fundador,id_convite_origem,') && q.includes('FROM usuario WHERE')) {
        assert.match(q,/id_ambiente=\$1 AND id_usuario=ANY\(\$2::bigint\[\]\) ORDER BY id_usuario FOR UPDATE$/);
        assert.deepEqual(params,[A,[10,op.idAlvo??20]]);
        op.antesLock?.(estado);
        return {rows:[ator,...(op.externo?[]:[{...alvo,eh_fundador:!!op.fundador,id_convite_origem:op.semOrigem?null:CONVITE}])].filter(u=>u.id_ambiente===A&&params[1].includes(Number(u.id_usuario)))};
      }
      if(q.startsWith('SELECT id_convite FROM convite')) {
        assert.match(q,/id_convite=\$1 AND id_ambiente=\$2 AND data_aceite IS NOT NULL FOR SHARE$/);
        assert.deepEqual(params,[CONVITE,A]);return op.origemInvalida?row():row({id_convite:CONVITE});
      }
      if(q==="SELECT set_config('nr33.usuario_responsavel',$1,true)") { assert.deepEqual(params,['10']);responsavel=params[0];return row(); }
      if(q.startsWith('UPDATE usuario alvo SET perfil_acesso=$3,')) {
        estado.updates++;
        assert.match(q,/alvo.id_usuario=\$1 AND alvo.id_ambiente=\$2 AND NOT alvo.eh_fundador AND alvo.id_convite_origem=\$5/);
        assert.match(q,/u.ativo AND a.ativo AND u.eh_fundador AND u.perfil_acesso='ADMINISTRADOR'/);
        assert.deepEqual(params.slice(0,2),[20,A]);assert.deepEqual(params.slice(3),[10,CONVITE]);
        assert.equal(responsavel,'10');assert.equal(ator.perfil_acesso,P[0]);assert.ok(ator.ativo&&ator.eh_fundador);
        if(op.updateVazio)return row();
        // Simula o trigger AFTER UPDATE. Falha no registro aborta também a alteração.
        if(op.auditoriaFalha)throw op.erro;
        if (pendente.perfil_acesso !== params[2]) auditoria.push({id_ambiente:A,id_usuario_responsavel:10,id_usuario_afetado:20,perfil_anterior:pendente.perfil_acesso,perfil_novo:params[2],data_hora:'2026-10-19T00:00:00Z'});
        pendente.perfil_acesso=params[2];return row({...pendente});
      }
      assert.fail('SQL não reconhecido no simulador de permissões: '+q);
    }, release(descartar) { estado.liberacoes.push(descartar); }
  }));
  t.mock.method(pool,'query',()=>{throw Error('Operação atômica não pode sair da transação');});
  return estado;
}
for(const perfil of P.slice(1)) test('fundador altera convidado para '+perfil+' com auditoria atômica',async t=>{
  const e=transacao(t);const r=await permissoes.alterar('20',perfil,identidade(P[0]));
  assert.equal(r.perfil_acesso,perfil);assert.equal(r.nome,'Pessoa convidada');assert.equal(r.email,'pessoa@example.invalid');
  assert.equal(e.alvo.perfil_acesso,perfil);assert.equal(e.auditoria.length,perfil === P[1] ? 0 : 1);
  if (perfil !== P[1]) assert.deepEqual(e.auditoria[0],{id_ambiente:A,id_usuario_responsavel:10,id_usuario_afetado:20,perfil_anterior:P[1],perfil_novo:perfil,data_hora:'2026-10-19T00:00:00Z'});
  assert.equal(e.eventos.at(-1),'COMMIT');assert.deepEqual(e.liberacoes,[undefined]);
});
for(const [nome,op,status]of [
  ['externo',{externo:true},404],['inexistente',{externo:true,idAlvo:99},404],['fundador',{fundador:true},409],
  ['legado sem origem',{semOrigem:true},409],['origem não aceita',{origemInvalida:true},409],['ambiente inativo',{ambienteInativo:true},401],
  ['ator inativo',{antesLock:e=>{e.ator.ativo=false;}},401],
  ['perfil revogado antes do lock',{antesLock:e=>{e.ator.perfil_acesso='AUDITOR';}},403],
  ['fundador revogado antes do lock',{antesLock:e=>{e.ator.eh_fundador=false;}},403],
]) test('permissões recusam '+nome+' sem UPDATE',async t=>{
  const e=transacao(t,op);await assert.rejects(permissoes.alterar(op.idAlvo??20,P[3],identidade(P[0])),{statusCode:status});
  assert.equal(e.updates,0);assert.equal(e.alvo.perfil_acesso,P[1]);assert.deepEqual(e.auditoria,[]);
  assert.equal(e.eventos.at(-1),'ROLLBACK');assert.equal(e.liberacoes.length,1);
});
for(const perfil of [...P.slice(1),'DESCONHECIDO'])test('convidado '+perfil+' não altera a si mesmo',async t=>{
  const conectar=t.mock.method(pool,'connect',()=>{throw Error('Não deve conectar');});
  await assert.rejects(permissoes.alterar(10,P[0],identidade(perfil)),{statusCode:403});assert.equal(conectar.mock.callCount(),0);
});
for(const perfil of ['ADMINISTRADOR','admin',null,{},[]])test('novo perfil administrativo/malformado recusado '+String(perfil),async t=>{
  const conectar=t.mock.method(pool,'connect',()=>{throw Error('Não deve conectar');});
  await assert.rejects(permissoes.alterar(20,perfil,identidade(P[0])),{statusCode:400});assert.equal(conectar.mock.callCount(),0);
});
for(const falhar of ['SELECT id_ambiente','SELECT id_usuario','SELECT id_convite','UPDATE usuario','COMMIT','AUDITORIA'])test('falha técnica '+falhar+' não confirma perfil nem auditoria',async t=>{
  const erro=Error('SQL_SIMULADO_NAO_PUBLICAR');const e=transacao(t,{erro,falhar:falhar==='AUDITORIA'?undefined:falhar,auditoriaFalha:falhar==='AUDITORIA'});
  await assert.rejects(permissoes.alterar(20,P[3],identidade(P[0])),r=>r===erro);
  assert.equal(e.alvo.perfil_acesso,P[1]);assert.equal(e.auditoria.length,0);assert.equal(e.eventos.at(-1),'ROLLBACK');assert.equal(e.liberacoes.length,1);
});
test('falha de rollback descarta conexão e preserva erro original',async t=>{
  const erro=Error('Falha simulada');const e=transacao(t,{falhar:'UPDATE usuario',erro,rollbackFalha:true});
  await assert.rejects(permissoes.alterar(20,P[3],identidade(P[0])),r=>r===erro);assert.deepEqual(e.liberacoes,[true]);assert.equal(e.auditoria.length,0);
});
test('controller rejeita identidade/ambiente forjados no payload antes do repositório',async t=>{
  const alterar=t.mock.method(permissoes,'alterar',()=>{throw Error('Não deve chegar');});
  t.mock.method(console,'error',()=>{});
  let status,body;const res={headersSent:false,status(s){status=s;return this;},json(b){body=b;return this;}};
  await controller.alterar({params:{id:20},usuario:identidade(P[0]),body:{perfil_acesso:P[3],id_ambiente:B}},res);
  assert.equal(status,400);assert.equal(body.status,'error');assert.equal(alterar.mock.callCount(),0);
});
test('migration 022 mantém guardas, mapeamento explícito, triggers e auditoria restrita',()=>{
  const sql=fs.readFileSync(require('node:path').join(__dirname,'../database/022_perfis_fundador_auditoria.sql'),'utf8');
  assert.match(sql,/current_database\(\) <> 'inventario_nr33_multitenant_dev'/);
  assert.match(sql,/id_usuario=21 AND u.id_ambiente='a9cdba4a-fd68-4b3e-bfd0-d86a9281bb66'/);
  assert.match(sql,/id_usuario=22 AND u.id_ambiente='021ae9c9-7c37-4be0-ab2b-306ebb0a3004'/);
  assert.match(sql,/CREATE UNIQUE INDEX uq_usuario_fundador_ambiente/);
  assert.match(sql,/FOREIGN KEY\(id_convite_origem,id_ambiente\)/);
  assert.match(sql,/AFTER UPDATE OF perfil_acesso/);
  assert.match(sql,/BEFORE UPDATE OR DELETE ON public.auditoria_perfil_usuario/);
  assert.match(sql,/GRANT SELECT ON public.auditoria_perfil_usuario TO nr33_dev_app/);
  assert.doesNotMatch(sql,/GRANT (?:INSERT|UPDATE|DELETE).*auditoria_perfil_usuario/);
});
// Testes simulados não comprovam execução PL/pgSQL, locks reais, deadlocks,
// privilégios SECURITY DEFINER ou isolamento PostgreSQL. Migration não executada.
