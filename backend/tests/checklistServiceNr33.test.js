const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const regras = require('../src/utils/regrasCaracterizacaoNr33');
const { CAMPOS_NR33, MARCADOR } = require('../src/utils/adaptadorCamposNr33');
const { CAMPOS: CAMPOS025 } = require('../src/utils/caracterizacaoChecklist');
const { conferir: conferirCapacidadeSql } = require('./helpers/rbacSqlSimulado.cjs');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const respostas = { criterio_a:'SIM',criterio_b:'SIM',criterio_c:'SIM',acesso_controlado:'SIM',
  ventilacao_adequada:'SIM',monitoramento_atmosferico:'SIM',procedimento_emergencia:'SIM' };
const nulos = Object.fromEntries(CAMPOS_NR33.map(c=>[c,null]));
const valido = { ...nulos,atmosfera_oxigenio:true,possui_placa_identificacao:true };
const especifica = { ...nulos,[MARCADOR]:true,nao_destinado_ocupacao_humana:'SIM',meios_limitados_entrada_saida:'SIM',
  utilizado_armazenagem:'SIM',potencial_engolfamento:'NAO',potencial_afogamento:'SIM',possui_placa_identificacao:false };

function preparar({ status='PENDENTE', salvo=valido, legado=false }={}) {
  const usuario={id_usuario:11,id_ambiente:A};
  const estado={ambiente:A,ativo:true,ambienteAtivo:true,perfil:'ENGENHEIRO_SEGURANCA',existe:true,localExiste:true,
    consultas:[],escritas:[],locks:[],releases:[],avaliacoes:[],classificacoes:[],chamadasRegras:[],aberta:false,globais:0,versao:7,
    falhaRegra:null,falhaSnapshot:null,hook:null,
    row:{id_checklist:50,id_local:40,id_usuario:99,...respostas,...nulos,...salvo,status,
      observacoes:'Historico',...Object.fromEntries(CAMPOS025.map(c=>[c,null])),data_atualizacao:new Date('2026-01-01T12:00:00Z')} };
  const permitido=()=>estado.ambiente===usuario.id_ambiente&&estado.ativo&&estado.ambienteAtivo&&estado.localExiste&&
    ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR'].includes(estado.perfil);
  const pool={async query(){estado.globais++;throw Error('Leitura fora da transacao proibida');},async connect(){return client;}};
  const client={
    async query(texto,params=[]){
      const sql=texto.replace(/\s+/g,' ').trim();estado.consultas.push({sql,params:structuredClone(params)});
      if(sql==='BEGIN ISOLATION LEVEL READ COMMITTED'){assert.equal(estado.aberta,false);estado.aberta=true;estado.antes={row:structuredClone(estado.row),versao:estado.versao};return {rows:[]};}
      if(sql==='ROLLBACK'){estado.row=structuredClone(estado.antes.row);estado.versao=estado.antes.versao;estado.aberta=false;return {rows:[]};}
      if(sql==='COMMIT'){assert.equal(estado.aberta,true);estado.aberta=false;return {rows:[]};}
      assert.equal(estado.aberta,true);assert.equal(params[1],A);assert.equal(params[2],11);
      assert.match(sql,/(?:a|c)\.id_ambiente = \$2/);assert.match(sql,/u\.id_usuario = \$3/);
      assert.match(sql,/u\.ativo = TRUE/);assert.match(sql,/a\.ativo = TRUE/);conferirCapacidadeSql(sql,'u');
      const lock=/FOR (SHARE|UPDATE) OF (a|u|c|l|ch)$/.exec(sql);
      if(lock){
        estado.locks.push(lock[2]);assert.equal(lock[1],['a','u'].includes(lock[2])?'SHARE':'UPDATE');
        if(params.length===5)assert.deepEqual(params.slice(3),[10,40]);
        if(estado.hook)estado.hook(lock[2],estado);
        const criar=!sql.includes('INNER JOIN checklist_nr33 AS ch');
        return {rows:permitido()&&(criar||estado.existe)?[{id_campanha:10,id_local:40,...(sql.includes('LEFT JOIN checklist_nr33 AS estrutura_nr33 ON FALSE')?nulos:{})}]:[]};
      }
      if(sql.startsWith('SELECT ch.* FROM checklist_nr33 AS ch')){
        if(estado.falhaSnapshot)throw estado.falhaSnapshot;
        assert.deepEqual(estado.locks,['a','u','c','l','ch']);assert.deepEqual(params,[50,A,11,10,40]);
        return {rows:permitido()&&estado.existe?[estado.row]:[]};
      }
      assert.equal(permitido(),true);const criar=sql.startsWith('INSERT');
      assert.deepEqual(estado.locks,criar?['a','u','c','l']:['a','u','c','l','ch']);
      assert.match(sql,/^(INSERT INTO|UPDATE) checklist_nr33 AS ch/);estado.escritas.push({sql,params:structuredClone(params)});
      if(criar){
        const lista=/INSERT INTO checklist_nr33 AS ch \((.*?)\) SELECT/.exec(sql)[1].split(',').map(c=>c.trim());
        estado.row={id_checklist:60,id_local:params[0],id_usuario:params[2],...nulos,
          ...Object.fromEntries(Object.keys(respostas).map((c,i)=>[c,params[3+i]])),observacoes:params[10]||null,status:params[11],
          ...Object.fromEntries(CAMPOS025.map((c,i)=>[c,params[12+i]]))};
        for(const [i,c]of lista.filter(c=>CAMPOS_NR33.includes(c)).entries())estado.row[c]=params[20+i];
      }else if(sql.includes('criterio_a = COALESCE')){
        for(const [i,c]of Object.keys(respostas).entries())if(params[3+i]!=null)estado.row[c]=params[3+i];
        if(params[10]!=null)estado.row.observacoes=params[10]||null;
        for(const [i,c]of CAMPOS025.entries())if(params[11+2*i])estado.row[c]=params[12+2*i];
        for(const [,c,indice]of sql.matchAll(/\b(\w+) = \$(\d+)(?=,|\s)/g))if(CAMPOS_NR33.includes(c))estado.row[c]=params[Number(indice)-1];
      }else estado.row.status=params[3];
      estado.row.data_atualizacao=new Date('2026-11-08T12:00:00Z');estado.versao++;
      return {rows:[structuredClone(estado.row)]};
    },release(erro){estado.releases.push(erro);},
  };
  const paths={banco:require.resolve('../src/config/database'),repo:require.resolve('../src/repositories/checklistMultiTenantRepository'),
    service:require.resolve('../src/services/checklistMultiTenantService'),regras:require.resolve('../src/utils/regrasCaracterizacaoNr33')};
  const anteriores=new Map(Object.values(paths).map(p=>[p,require.cache[p]]));
  const instalar=(p,exports)=>{const m=new Module(p);m.filename=p;m.loaded=true;m.exports=exports;require.cache[p]=m;};
  const monitor={...regras};
  for(const nome of ['consolidarCaracterizacao','determinarAplicabilidade','validarConclusao','prepararTransicao','selecionarRespostasDependentes'])monitor[nome]=(...args)=>{
    estado.chamadasRegras.push(nome);
    if(nome!=='selecionarRespostasDependentes'){assert.equal(estado.aberta,true);assert.ok(estado.locks.includes('l'));}
    if(nome==='validarConclusao'&&estado.falhaRegra)throw estado.falhaRegra;
    const r=regras[nome](...args);
    if(nome==='validarConclusao')estado.avaliacoes.push(r);
    if(nome==='consolidarCaracterizacao')estado.classificacoes.push(r);
    return r;
  };
  let service;
  try{
    instalar(paths.banco,pool);delete require.cache[paths.repo];delete require.cache[paths.service];
    require(paths.repo);instalar(paths.regras,monitor);service=require(paths.service);
  }finally{for(const [p,anterior]of anteriores){if(anterior)require.cache[p]=anterior;else delete require.cache[p];}}
  return {service,estado,usuario};
}
const criar=(ctx,dados={})=>ctx.service.criarChecklist({id_local:40,...respostas,...dados},ctx.usuario);
const atualizar=(ctx,dados)=>ctx.service.atualizarChecklist(50,dados,ctx.usuario);
const status=(ctx,valor)=>ctx.service.alterarStatusChecklist(50,{status:valor},ctx.usuario);
const terminou=ctx=>{assert.equal(ctx.estado.aberta,false);assert.deepEqual(ctx.estado.releases,[undefined]);assert.equal(ctx.estado.globais,0);assert.equal(Object.hasOwn(ctx.estado.row,'avaliacao_nr33'),false);};
async function rejeitou(ctx,executar,codigo){
  const antes=structuredClone(ctx.estado.row),versao=ctx.estado.versao;
  let erro;try{await executar();}catch(e){erro=e;}
  assert.ok(erro);assert.equal(erro.statusCode,codigo);assert.deepEqual(ctx.estado.row,antes);assert.equal(ctx.estado.versao,versao);
  assert.equal(ctx.estado.escritas.length,0);assert.equal(ctx.estado.consultas.at(-1).sql,'ROLLBACK');terminou(ctx);return erro;
}

test('POST pendente de cliente antigo e preservado sem campos novos nem excecao de conclusao',async()=>{
  const ctx=preparar();const r=await criar(ctx);
  assert.equal(r.status,'PENDENTE');assert.equal(ctx.estado.escritas.length,1);
  assert.equal(ctx.estado.avaliacoes[0].valido,false);assert.ok(!ctx.estado.escritas[0].sql.includes('atmosfera_oxigenio'));
  assert.ok(r.avaliacao_nr33);terminou(ctx);
});

test('POST concluido valida proposta integral depois da autorizacao e antes do INSERT',async()=>{
  const forjado=preparar();await assert.rejects(criar(forjado,{...valido,status:'CONCLUIDO',avaliacao_nr33:{resultado:'forjado'}}),{statusCode:400,code:'NR33_CAMPO_SOMENTE_LEITURA'});
  assert.equal(forjado.estado.consultas.length,0);assert.equal(forjado.estado.escritas.length,0);
  const ctx=preparar();const r=await criar(ctx,{...valido,status:'CONCLUIDO'});
  assert.equal(r.status,'CONCLUIDO');assert.equal(ctx.estado.avaliacoes[0].valido,true);
  assert.equal(ctx.estado.classificacoes[0].origem,'REGRA_GERAL');assert.ok(r.avaliacao_nr33);terminou(ctx);
});

test('POST concluido antigo incompleto e rejeitado, sem INSERT',async()=>{
  const ctx=preparar();const erro=await rejeitou(ctx,()=>criar(ctx,{status:'CONCLUIDO'}),400);
  assert.equal(erro.code,'NR33_CONCLUSAO_INVALIDA');assert.ok(erro.validacaoNr33.some(e=>e.codigo==='CONDICAO_ATMOSFERICA_OBRIGATORIA'));
});

for(const oxigenio of [null,false])for(const placa of [true,false,null])test(`conclusao exige atmosfera verdadeira: oxigenio=${oxigenio}, placa=${placa}`,async()=>{
  const ctx=preparar({salvo:{...valido,atmosfera_oxigenio:oxigenio,possui_placa_identificacao:placa}});
  await rejeitou(ctx,()=>status(ctx,'CONCLUIDO'),400);
  assert.ok(ctx.estado.avaliacoes[0].erros.some(e=>e.codigo==='CONDICAO_ATMOSFERICA_OBRIGATORIA'));
});

for(const placa of [true,false,null])test(`placa na conclusao: ${placa}`,async()=>{
  const ctx=preparar({salvo:{...valido,possui_placa_identificacao:placa}});
  if(placa===null){await rejeitou(ctx,()=>status(ctx,'CONCLUIDO'),400);return;}
  const r=await status(ctx,'CONCLUIDO');assert.equal(r.possui_placa_identificacao,placa);assert.equal(r.status,'CONCLUIDO');
  assert.deepEqual(ctx.estado.avaliacoes[0].avisos,placa?[]:['AUSENCIA_SINALIZACAO']);assert.ok(r.avaliacao_nr33);terminou(ctx);
});

test('PATCH repetido CONCLUIDO e NO-OP mesmo em historico incompleto, sem UPDATE/regularizacao',async()=>{
  const ctx=preparar({status:'CONCLUIDO',salvo:{},legado:true}),antes=structuredClone(ctx.estado.row);
  const r=await status(ctx,'CONCLUIDO');const {avaliacao_nr33,...persistido}=r;assert.deepEqual(persistido,antes);assert.notEqual(r,ctx.estado.row);
  assert.equal(avaliacao_nr33.validacao_conclusao.pode_concluir,false);
  assert.equal(ctx.estado.versao,7);assert.equal(ctx.estado.escritas.length,0);assert.equal(ctx.estado.avaliacoes.length,1);
  assert.equal(ctx.estado.consultas.at(-1).sql,'COMMIT');terminou(ctx);
});

test('reabertura dispensa completude e preserva todas as respostas e autoria',async()=>{
  const ctx=preparar({status:'CONCLUIDO',salvo:{...valido,atmosfera_oxigenio:null,possui_placa_identificacao:false}});
  const antes=structuredClone(ctx.estado.row),r=await status(ctx,'PENDENTE');
  for(const [c,v]of Object.entries(antes))if(!['status','data_atualizacao'].includes(c))assert.deepEqual(r[c],v);
  assert.equal(r.status,'PENDENTE');assert.equal(ctx.estado.avaliacoes.length,1);terminou(ctx);
});

test('PUT parcial em pendente preserva false, campos omitidos e status',async()=>{
  const ctx=preparar();const r=await atualizar(ctx,{possui_placa_identificacao:false,criterio_b:null,status:'CONCLUIDO',id_usuario:999});
  assert.equal(r.possui_placa_identificacao,false);assert.equal(r.atmosfera_oxigenio,true);
  assert.equal(r.criterio_b,'SIM');assert.equal(r.status,'PENDENTE');assert.equal(r.id_usuario,99);terminou(ctx);
});

test('NULL sobre informacao ja ausente e preservado sem falsa confirmacao',async()=>{
  const ctx=preparar();const r=await atualizar(ctx,{atmosfera_contaminantes:null});
  assert.equal(r.atmosfera_contaminantes,null);assert.equal(r.atmosfera_oxigenio,true);terminou(ctx);
});

test('PUT irrelevante em concluido antigo nao exige regularizacao',async()=>{
  const ctx=preparar({status:'CONCLUIDO',salvo:{},legado:true});
  const r=await atualizar(ctx,{observacoes:'Edicao permitida',geometria:'Cilindro'});
  assert.equal(r.observacoes,'Edicao permitida');assert.equal(r.geometria,'Cilindro');assert.equal(r.status,'CONCLUIDO');
  assert.equal(ctx.estado.avaliacoes.length,1);terminou(ctx);
});

test('reenviar valores relevantes iguais nao provoca regularizacao de historico',async()=>{
  const ctx=preparar({status:'CONCLUIDO',salvo:{},legado:true});
  const r=await atualizar(ctx,{criterio_a:'SIM',atmosfera_contaminantes:null});
  assert.equal(r.status,'CONCLUIDO');assert.equal(ctx.estado.avaliacoes.length,1);terminou(ctx);
});

test('PUT relevante valido em concluido valida resultado completo sem reabrir',async()=>{
  const ctx=preparar({status:'CONCLUIDO'});const r=await atualizar(ctx,{ventilacao_adequada:'NAO',possui_placa_identificacao:false});
  assert.equal(r.status,'CONCLUIDO');assert.equal(r.ventilacao_adequada,'NAO');
  assert.equal(ctx.estado.avaliacoes[0].valido,true);assert.deepEqual(ctx.estado.avaliacoes[0].avisos,['AUSENCIA_SINALIZACAO']);terminou(ctx);
});

test('PUT relevante invalido em concluido reverte tambem observacoes',async()=>{
  const ctx=preparar({status:'CONCLUIDO'});
  await rejeitou(ctx,()=>atualizar(ctx,{atmosfera_oxigenio:false,observacoes:'Nao gravar'}),400);
});

test('hipotese especifica caracteriza e exige placa sem inferir A ou exigir C afirmativo',async()=>{
  const ctx=preparar();const r=await criar(ctx,{...especifica,criterio_a:'NAO',criterio_c:'NAO',status:'CONCLUIDO'});
  assert.equal(r.criterio_a,'NAO');assert.equal(r.criterio_c,'NAO');assert.equal(r.nao_destinado_ocupacao_humana,'SIM');
  assert.equal(ctx.estado.classificacoes[0].origem,'HIPOTESE_ESPECIFICA');assert.deepEqual(ctx.estado.avaliacoes[0].avisos,['AUSENCIA_SINALIZACAO']);terminou(ctx);
  const faltaPlaca=preparar();await rejeitou(faltaPlaca,()=>criar(faltaPlaca,{...especifica,criterio_c:'NAO',possui_placa_identificacao:null,status:'CONCLUIDO'}),400);
});

test('hipotese descartada e regra geral negativa permitem conclusao nao caracterizada',async()=>{
  const ctx=preparar();await criar(ctx,{...nulos,criterio_c:'NAO',[MARCADOR]:true,utilizado_armazenagem:'NAO',status:'CONCLUIDO'});
  assert.equal(ctx.estado.classificacoes[0].resultado,'NAO_CARACTERIZADO');assert.equal(ctx.estado.avaliacoes[0].valido,true);terminou(ctx);
});

for(const iniciou of [null,true])test(`hipotese ${iniciou===null?'nao iniciada':'iniciada vazia'} conserva pendencia`,async()=>{
  const ctx=preparar();const r=await criar(ctx,{...nulos,criterio_c:'NAO',[MARCADOR]:iniciou});
  assert.equal(r[MARCADOR],iniciou);assert.equal(ctx.estado.classificacoes[0].resultado,'PENDENTE');
  assert.equal(ctx.estado.classificacoes[0].hipoteseEspecifica,iniciou===null?'NAO_AVALIADA':'INFORMACOES_INSUFICIENTES');terminou(ctx);
  const concluido=preparar();await rejeitou(concluido,()=>criar(concluido,{...nulos,criterio_c:'NAO',[MARCADOR]:iniciou,status:'CONCLUIDO'}),400);
});

test('PUT pendente inicia avaliacao especifica sem preencher automaticamente A/B',async()=>{
  const ctx=preparar();const r=await atualizar(ctx,{[MARCADOR]:true});
  assert.equal(r[MARCADOR],true);for(const c of regras.CONDICOES_ESPECIFICAS)assert.equal(r[c],null);
  assert.equal(ctx.estado.classificacoes[0].origem,'REGRA_GERAL');terminou(ctx);
});

test('transicao que oculta atmosfera/placa preserva respostas e permite salvar',async()=>{
  const ctx=preparar();const r=await atualizar(ctx,{criterio_c:'NAO'});
  assert.equal(r.criterio_c,'NAO');assert.equal(r.atmosfera_oxigenio,true);assert.equal(r.possui_placa_identificacao,true);
  assert.equal(r.avaliacao_nr33.aplicabilidade.atmosfera,false);
  assert.equal(r.avaliacao_nr33.classificacao.regraGeral,'NAO_CARACTERIZADO_PELA_REGRA_GERAL');
  assert.ok(ctx.estado.chamadasRegras.includes('prepararTransicao'));
  terminou(ctx);
});

test('concluido não é reaberto nem salvo com caracterização pendente por critério alterado',async()=>{
  const ctx=preparar({status:'CONCLUIDO'});
  const erro=await rejeitou(ctx,()=>atualizar(ctx,{criterio_c:'NAO'}),400);
  assert.equal(erro.code,'NR33_CONCLUSAO_INVALIDA');
  assert.equal(ctx.estado.row.status,'CONCLUIDO');assert.equal(ctx.estado.row.atmosfera_oxigenio,true);
});

for(const valor of [true,false])test(`limpeza explicita de resposta ${valor} nao aceita NULL como consentimento`,async()=>{
  const ctx=preparar({salvo:{...valido,possui_placa_identificacao:valor}});
  const erro=await rejeitou(ctx,()=>atualizar(ctx,{possui_placa_identificacao:null,confirmacao_limpeza:{confirmado:true,estado_token:'forjado'}}),409);
  assert.deepEqual(erro.camposLimpeza,['possui_placa_identificacao']);
});

test('limpeza da hipotese especifica preenchida tambem aguarda contrato definitivo',async()=>{
  const ctx=preparar({salvo:especifica});
  const patch=Object.fromEntries([...regras.CONDICOES_ESPECIFICAS,MARCADOR].map(c=>[c,null]));
  const erro=await rejeitou(ctx,()=>atualizar(ctx,patch),409);assert.ok(erro.camposLimpeza.includes('potencial_engolfamento'));
});

test('estado mais recente sob bloqueio decide conclusao, sem leitura antecipada',async()=>{
  const ctx=preparar();ctx.estado.hook=(alias,s)=>{if(alias==='ch')s.row.atmosfera_oxigenio=false;};
  await rejeitou(ctx,()=>status(ctx,'CONCLUIDO'),400);
});

for(const configurar of [s=>{s.ambiente=B;},s=>{s.ativo=false;},s=>{s.ambienteAtivo=false;},s=>{s.perfil='VISUALIZADOR';},s=>{s.existe=false;}]) {
  test(`autorizacao precede validacao normativa: ${configurar.toString()}`,async()=>{
    const ctx=preparar({status:'CONCLUIDO',salvo:{},legado:true});configurar(ctx.estado);
    const erro=await rejeitou(ctx,()=>atualizar(ctx,{criterio_c:'NAO'}),404);
    assert.equal(erro.necessitaConfirmacaoLimpeza,undefined);assert.equal(ctx.estado.classificacoes.length,0);
  });
}

test('tipos conhecidos invalidos da entrada viram 400 sem conexao ou escrita',async()=>{
  for(const patch of [{atmosfera_oxigenio:'false'},{possui_placa_identificacao:1},{[MARCADOR]:false},{potencial_afogamento:'sim'}]){
    const ctx=preparar();await assert.rejects(atualizar(ctx,patch),{statusCode:400});assert.equal(ctx.estado.consultas.length,0);
  }
  const ctx=preparar();await assert.rejects(criar(ctx,{potencial_afogamento:'SIM'}),{statusCode:400});assert.equal(ctx.estado.consultas.length,0);
});

test('incoerencia estrutural do patch vira erro conhecido depois da autorizacao',async()=>{
  const ctx=preparar();await rejeitou(ctx,()=>atualizar(ctx,{potencial_afogamento:'SIM'}),400);
});

test('TypeError inesperado das regras ou repository nao e convertido em 400',async()=>{
  for(const origem of ['regra','repository']){
    const ctx=preparar(),erro=new TypeError(origem==='repository'?'atmosfera_oxigenio deve ser booleano ou null.':'Defeito interno simulado');
    if(origem==='regra')ctx.estado.falhaRegra=erro;else ctx.estado.falhaSnapshot=erro;
    await assert.rejects(status(ctx,'CONCLUIDO'),recebido=>recebido===erro&&recebido.statusCode===undefined);
    assert.equal(ctx.estado.escritas.length,0);assert.equal(ctx.estado.consultas.at(-1).sql,'ROLLBACK');terminou(ctx);
  }
});

test('snapshot persistido com tipo invalido nao e rotulado como erro do cliente',async()=>{
  const ctx=preparar({salvo:{...valido,atmosfera_oxigenio:'invalido'}});
  await assert.rejects(status(ctx,'CONCLUIDO'),erro=>erro instanceof TypeError&&erro.statusCode===undefined);
  assert.equal(ctx.estado.escritas.length,0);terminou(ctx);
});
