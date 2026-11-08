const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const regras = require('../src/utils/regrasCaracterizacaoNr33');
const adaptador = require('../src/utils/adaptadorCamposNr33');
const { CAMPOS: campos025 } = require('../src/utils/caracterizacaoChecklist');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const respostas = Object.fromEntries(['criterio_a','criterio_b','criterio_c','acesso_controlado',
  'ventilacao_adequada','monitoramento_atmosferico','procedimento_emergencia'].map(c => [c,'SIM']));
const nulos = Object.fromEntries(adaptador.CAMPOS_NR33.map(c => [c,null]));
const valido = { ...nulos, atmosfera_oxigenio: true, possui_placa_identificacao: false };
let ctx;
function preparar() {
  return { aberta: false, consultas: [], locks: [], escritas: 0, liberacoes: 0, calculos: 0, conexoes: 0,
    esquema: true, ambiente: A, falhaCalculo: false, falhaMontagem: false, falhaSerializacao: false,
    row: { id_checklist: 50, id_local: 40, id_usuario: 11, ...respostas, ...valido,
      status: 'PENDENTE', observacoes: 'Anterior', versao: 7,
      data_atualizacao: new Date('2026-01-01T00:00:00Z') } };
}
const pool = {
  async query() { throw Error('Consulta global proibida'); },
  async connect() {
    ctx.conexoes++;
    return {
      async query(texto, params = []) {
        const sql = texto.replace(/\s+/g,' ').trim();
        ctx.consultas.push(sql);
        if (sql.startsWith('BEGIN')) { ctx.aberta = true; ctx.antes = structuredClone(ctx.row); return { rows: [] }; }
        if (sql === 'ROLLBACK') { ctx.aberta = false; ctx.row = structuredClone(ctx.antes); return { rows: [] }; }
        if (sql === 'COMMIT') { assert.ok(ctx.calculos > 0, 'Avaliacao deve estar calculada antes do COMMIT'); ctx.aberta = false; return { rows: [] }; }
        assert.equal(ctx.aberta,true);
        assert.deepEqual(params.slice(1,3),[A,11]);
        assert.match(sql,/(?:a|c)\.id_ambiente = \$2/);
        assert.match(sql,/u\.id_usuario = \$3/);
        assert.match(sql,/u\.ativo = TRUE/); assert.match(sql,/a\.ativo = TRUE/);
        const lock = /FOR (?:SHARE|UPDATE) OF (a|u|c|l|ch)$/.exec(sql);
        if (lock) {
          ctx.locks.push(lock[1]);
          if (ctx.ambiente !== A) return { rows: [] };
          const prova = sql.includes('LEFT JOIN checklist_nr33 AS estrutura_nr33 ON FALSE');
          if (prova) {
            assert.equal(lock[1],'l');
            assert.deepEqual(ctx.locks,['a','u','c','l']);
            for (const campo of adaptador.CAMPOS_NR33) assert.ok(sql.includes('estrutura_nr33.'+campo));
            if (!ctx.esquema) throw Object.assign(Error('SQL_INTERNO'),{ code:'42703' });
          }
          return { rows:[{ id_campanha:10,id_local:40,...(prova?nulos:{}) }] };
        }
        if (sql.startsWith('SELECT ch.*')) {
          assert.deepEqual(ctx.locks,['a','u','c','l','ch']);
          const row = structuredClone(ctx.row);
          if (!ctx.esquema) delete row.potencial_afogamento;
          return { rows:[row] };
        }
        assert.match(sql,/^(INSERT INTO|UPDATE) checklist_nr33 AS ch/);
        assert.ok(ctx.calculos > 0, 'DML somente depois de calcular a avaliacao');
        assert.equal(sql.includes('avaliacao_nr33'),false);
        ctx.escritas++;
        if (sql.startsWith('INSERT')) {
          ctx.row={ id_checklist:60,id_local:params[0],id_usuario:params[2],...nulos,
            ...Object.fromEntries(Object.keys(respostas).map((c,i)=>[c,params[3+i]])),
            status:params[11],observacoes:params[10]??null,
            ...Object.fromEntries(campos025.map((c,i)=>[c,params[12+i]])) };
          const lista=/INSERT INTO checklist_nr33 AS ch \((.*?)\) SELECT/.exec(sql)[1].split(',').map(c=>c.trim());
          lista.filter(c=>adaptador.CAMPOS_NR33.includes(c)).forEach((c,i)=>{ctx.row[c]=params[20+i];});
        } else if (sql.includes('criterio_a = COALESCE')) {
          Object.keys(respostas).forEach((c,i)=>{if(params[3+i]!=null)ctx.row[c]=params[3+i];});
          if(params[10]!=null)ctx.row.observacoes=params[10]||null;
          for(const [,c,i]of sql.matchAll(/\b(\w+) = \$(\d+)(?=,|\s)/g))if(adaptador.CAMPOS_NR33.includes(c))ctx.row[c]=params[Number(i)-1];
        } else ctx.row.status=params[3];
        ctx.row.versao=(ctx.row.versao||0)+1;ctx.row.data_atualizacao=new Date('2026-11-08T00:00:00Z');
        return { rows:[structuredClone(ctx.row)] };
      },
      release() { ctx.liberacoes++; },
    };
  },
};
// Mocks instalados antes do carregamento do repository/service/controllers/app.
const dbPath = require.resolve('../src/config/database');
const rulesPath = require.resolve('../src/utils/regrasCaracterizacaoNr33');
function instalar(p,exports) { const m=new Module(p);m.filename=p;m.loaded=true;m.exports=exports;require.cache[p]=m; }
instalar(dbPath,pool);
const monitor = {...regras};
for(const nome of ['consolidarCaracterizacao','determinarAplicabilidade','validarConclusao'])monitor[nome]=(...args)=>{
  assert.equal(ctx.aberta,true,'Nenhum calculo normativo apos COMMIT');
  ctx.calculos++;
  if(ctx.falhaCalculo)throw new TypeError('DEFEITO_INTERNO_NAO_PUBLICAR');
  const r=regras[nome](...args);
  if(nome==='validarConclusao'&&ctx.falhaMontagem)Object.defineProperty(r,'avisos',{enumerable:true,get(){throw Error('FALHA_MONTAGEM_NAO_PUBLICAR');}});
  if(nome==='validarConclusao'&&ctx.falhaSerializacao)r.classificacao.ciclo=r.classificacao;
  return r;
};
instalar(rulesPath,monitor);
const appPath = require.resolve('../src/app');
const load = Module._load;
let app;
try {
  Module._load=function(request,parent,...args){
    if(parent?.filename===appPath&&request.startsWith('./routes/')&&request!=='./routes/checklistRoutes')return (_req,_res,next)=>next();
    if(request==='../middlewares/autenticacaoMiddleware'&&parent?.filename.endsWith('checklistRoutes.js'))return {
      autenticarMultiTenant(req,_res,next){req.usuario={id_usuario:11,id_ambiente:A,perfil_acesso:'ADMINISTRADOR',eh_fundador:true};next();}
    };
    return load.call(this,request,parent,...args);
  };
  app=require(appPath);
} finally { Module._load=load; }
let servidor,base;
test.before(async()=>{servidor=app.listen(0,'127.0.0.1');await new Promise(r=>servidor.once('listening',r));base='http://127.0.0.1:'+servidor.address().port+'/api/checklists';});
test.after(async()=>{servidor.closeAllConnections();await new Promise(r=>servidor.close(r));});
test.beforeEach(()=>{ctx=preparar();});
async function pedir(op,body){const path=op==='POST'?'':op==='PUT'?'/50':'/50/status';const r=await fetch(base+path,{method:op,headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
function terminou(sucesso){assert.equal(ctx.aberta,false);assert.equal(ctx.liberacoes,1);assert.equal(Object.hasOwn(ctx.row,'avaliacao_nr33'),false);assert.equal(ctx.consultas.at(-1),sucesso?'COMMIT':'ROLLBACK');if(!sucesso){assert.equal(ctx.escritas,0);assert.equal(ctx.consultas.includes('COMMIT'),false);assert.deepEqual(ctx.row,ctx.antes);}}
function conferirAvaliacao(r,status){assert.equal(r.status,status);assert.equal(r.body.status,'success');assert.deepEqual(Object.keys(r.body.data.avaliacao_nr33),['classificacao','aplicabilidade','validacao_conclusao']);const esperado=regras.validarConclusao(adaptador.prepararDadosRegrasNr33(ctx.row));assert.deepEqual(r.body.data.avaliacao_nr33.validacao_conclusao,JSON.parse(JSON.stringify({...esperado,pode_concluir:esperado.valido})));}

for(const [op,body,codigo]of [
  ['POST',{id_local:40,...respostas,...valido,status:'CONCLUIDO'},201],
  ['PUT',{observacoes:'Novo',possui_placa_identificacao:false},200],
  ['PATCH',{status:'CONCLUIDO'},200],
])test(op+' ativo devolve avaliacao calculada antes da escrita e preserva envelope',async()=>{
  const r=await pedir(op,body);conferirAvaliacao(r,codigo);
  assert.equal(r.body.data.avaliacao_nr33.classificacao.origem,'REGRA_GERAL');
  assert.deepEqual(r.body.data.avaliacao_nr33.validacao_conclusao.avisos,['AUSENCIA_SINALIZACAO']);
  if(op!=='POST')assert.equal(typeof r.body.message,'string');
  assert.equal(ctx.escritas,1);terminou(true);
});
test('POST especifico caracteriza sem inferir A/B',async()=>{
  const r=await pedir('POST',{id_local:40,...respostas,...nulos,criterio_a:'NAO',criterio_c:'NAO',avaliacao_especifica_iniciada:true,
    nao_destinado_ocupacao_humana:'SIM',meios_limitados_entrada_saida:'SIM',utilizado_armazenagem:'SIM',potencial_afogamento:'SIM',possui_placa_identificacao:true,status:'CONCLUIDO'});
  conferirAvaliacao(r,201);assert.equal(r.body.data.avaliacao_nr33.classificacao.origem,'HIPOTESE_ESPECIFICA');terminou(true);
});
test('POST pendente com novos campos omitidos conserva respostas desconhecidas',async()=>{
  const r=await pedir('POST',{id_local:40,...respostas});conferirAvaliacao(r,201);
  assert.equal(r.body.data.avaliacao_nr33.validacao_conclusao.pode_concluir,false);terminou(true);
});
for(const op of ['POST','PUT','PATCH'])test(op+' rejeita esquema antigo antes do callback/DML',async()=>{
  ctx.esquema=false;const body=op==='POST'?{id_local:40,...respostas}:op==='PUT'?{observacoes:'Nao gravar'}:{status:'CONCLUIDO'};
  const r=await pedir(op,body);assert.equal(r.status,503);assert.equal(r.body.code,'NR33_ESQUEMA_INCOMPATIVEL');assert.equal(ctx.calculos,0);terminou(false);
});
test('NO-OP concluido historico calcula avaliacao sem UPDATE, mudanca de versao ou timestamps',async()=>{
  ctx.row={...ctx.row,...nulos,status:'CONCLUIDO'};const antes=structuredClone(ctx.row);
  const r=await pedir('PATCH',{status:'CONCLUIDO'});conferirAvaliacao(r,200);
  assert.equal(r.body.data.avaliacao_nr33.validacao_conclusao.pode_concluir,false);
  assert.equal(ctx.escritas,0);assert.deepEqual(ctx.row,antes);terminou(true);
});
test('NO-OP com esquema ausente nao chega ao calculo ou COMMIT',async()=>{
  ctx.row.status='CONCLUIDO';ctx.esquema=false;
  assert.equal((await pedir('PATCH',{status:'CONCLUIDO'})).status,503);assert.equal(ctx.calculos,0);terminou(false);
});
test('historico concluido aceita PUT irrelevante e dez NULLs sem exigir regularizacao',async()=>{
  ctx.row={...ctx.row,...nulos,status:'CONCLUIDO'};
  const r=await pedir('PUT',{observacoes:'Edicao'});conferirAvaliacao(r,200);
  assert.equal(r.body.data.status,'CONCLUIDO');assert.equal(r.body.data.avaliacao_nr33.validacao_conclusao.pode_concluir,false);terminou(true);
});
test('reabertura preserva respostas incompletas e calcula avaliacao',async()=>{
  ctx.row={...ctx.row,...nulos,status:'CONCLUIDO'};
  const r=await pedir('PATCH',{status:'PENDENTE'});conferirAvaliacao(r,200);assert.equal(r.body.data.status,'PENDENTE');terminou(true);
});
test('PUT relevante preserva respostas omitidas e false',async()=>{
  const r=await pedir('PUT',{ventilacao_adequada:'NAO',possui_placa_identificacao:false,atmosfera_contaminantes:null});conferirAvaliacao(r,200);
  assert.equal(r.body.data.atmosfera_oxigenio,true);assert.equal(r.body.data.possui_placa_identificacao,false);assert.equal(r.body.data.atmosfera_contaminantes,null);terminou(true);
});
for(const op of ['POST','PUT','PATCH'])test(op+' recusa classificacao do cliente sem transacao',async()=>{
  assert.equal((await pedir(op,{avaliacao_nr33:{classificacao:'FORJADA'}})).status,400);assert.equal(ctx.conexoes,0);
});
test('limpeza sem confirmacao reverte operacao',async()=>{
  const r=await pedir('PUT',{possui_placa_identificacao:null});assert.equal(r.status,409);terminou(false);
});

for (const criterio of ['criterio_a','criterio_b','criterio_c'])
for (const hipotese of ['descartada','atendida'])
for (const estadoStatus of ['PENDENTE','CONCLUIDO']) test(`HTTP ${criterio} SIM → NAO → SIM, hipótese ${hipotese}, ${estadoStatus}: sem perda e com recálculo`,async()=>{
  Object.assign(ctx.row, {status:estadoStatus,atmosfera_oxigenio:true,atmosfera_contaminantes:false,atmosfera_explosiva:null,
    avaliacao_especifica_iniciada:true,nao_destinado_ocupacao_humana:'SIM',meios_limitados_entrada_saida:'SIM',
    utilizado_armazenagem:hipotese==='atendida'?'SIM':'NAO',potencial_engolfamento:'SIM',potencial_afogamento:null});
  const camposPreservados=[...adaptador.CAMPOS_NR33,'status','id_usuario','id_local'];
  const antes=Object.fromEntries(camposPreservados.map(c=>[c,ctx.row[c]]));
  for (const [i,valor] of ['NAO','SIM'].entries()) {
    ctx.locks=[];
    const r=await pedir('PUT',{[criterio]:valor});conferirAvaliacao(r,200);
    const dados=r.body.data,avaliacao=dados.avaliacao_nr33;
    assert.deepEqual(Object.fromEntries(camposPreservados.map(c=>[c,dados[c]])),antes);
    assert.equal(dados.versao,8+i);
    assert.equal(avaliacao.classificacao.regraGeral,valor==='SIM'?'CARACTERIZADO':'NAO_CARACTERIZADO_PELA_REGRA_GERAL');
    assert.equal(avaliacao.classificacao.resultado,valor==='SIM'||hipotese==='atendida'?'CARACTERIZADO':'NAO_CARACTERIZADO');
    assert.equal(avaliacao.classificacao.origem,valor==='SIM'?(hipotese==='atendida'?'AMBAS':'REGRA_GERAL'):(hipotese==='atendida'?'HIPOTESE_ESPECIFICA':'HIPOTESES_DESCARTADAS'));
    assert.equal(avaliacao.aplicabilidade.atmosfera,criterio!=='criterio_c'||valor==='SIM');
    assert.equal(avaliacao.validacao_conclusao.pode_concluir,true);
  }
  assert.equal(ctx.escritas,2);assert.equal(ctx.consultas.at(-1),'COMMIT');
});

for (const valor of [true,false]) test(`limpeza atmosférica ${valor} permanece 409 mesmo com C=NAO`,async()=>{
  Object.assign(ctx.row,{criterio_c:'NAO',atmosfera_contaminantes:valor});
  const r=await pedir('PUT',{atmosfera_contaminantes:null});
  assert.equal(r.status,409);assert.equal(r.body.code,'NR33_CONFIRMACAO_LIMPEZA_NECESSARIA');terminou(false);
});
test('conclusao incompleta falha antes de COMMIT',async()=>{
  ctx.row.atmosfera_oxigenio=false;const r=await pedir('PATCH',{status:'CONCLUIDO'});assert.equal(r.status,400);terminou(false);
});
for(const op of ['POST','PUT','PATCH'])for(const fase of ['falhaCalculo','falhaMontagem','falhaSerializacao'])test(op+' '+fase+' faz rollback antes de qualquer DML/COMMIT',async t=>{
  t.mock.method(console,'error',()=>{});ctx[fase]=true;if(op==='PATCH')ctx.row.status='CONCLUIDO';
  const body=op==='POST'?{id_local:40,...respostas}:op==='PUT'?{observacoes:'Nao gravar'}:{status:'CONCLUIDO'};
  const r=await pedir(op,body);assert.equal(r.status,500);assert.deepEqual(r.body,{status:'error',message:'Erro interno do servidor.'});terminou(false);
});
for(const op of ['POST','PUT','PATCH'])test(op+' ambiente externo nao entrega avaliacao nem grava',async()=>{
  ctx.ambiente=B;const body=op==='POST'?{id_local:40,...respostas}:op==='PUT'?{}:{status:'CONCLUIDO'};
  const r=await pedir(op,body);assert.equal(r.status,404);assert.equal(ctx.calculos,0);assert.equal(Object.hasOwn(r.body,'data'),false);terminou(false);
});
