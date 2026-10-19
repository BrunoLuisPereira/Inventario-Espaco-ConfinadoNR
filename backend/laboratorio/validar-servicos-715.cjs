// Provas reais, somente banco novo. Preserva registros sinteticos identificados.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
async function executar() {
  const banco='inventario_nr33_multitenant_dev';
  if(process.env.NR33_EXECUCAO_715!==banco || !process.env.NR33_CREDENCIAL_715) throw Error('Destino nao autorizado.');
  const {Pool}=require('pg');
  const pool=new Pool({host:'127.0.0.1',port:5432,database:banco,user:'nr33_dev_app',password:process.env.NR33_CREDENCIAL_715,
    options:'-c search_path=public,pg_catalog',connectionTimeoutMillis:5000,max:5});
  pool.on('error',()=>{});
  const marcador='passo715_'+crypto.randomBytes(6).toString('hex');
  let fase='conexao', recusas=0;
  try {
    const d=(await pool.query('SELECT current_database() AS banco,current_user AS papel')).rows[0];
    assert.equal(d.banco,banco); assert.equal(d.papel,'nr33_dev_app');
    const database=require.resolve('../src/config/database');
    require.cache[database]={id:database,filename:database,loaded:true,exports:pool};
    process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');
    process.env.JWT_ISSUER='nr33-validacao715'; process.env.JWT_AUDIENCE='nr33-validacao715';
    const cadastro=require('../src/services/cadastroService');
    const auth=require('../src/services/authService');
    const {autenticarMultiTenant}=require('../src/middlewares/autenticacaoMiddleware');
    const campanhas=require('../src/services/campanhaMultiTenantService');
    const locais=require('../src/services/localMultiTenantService');
    const checklists=require('../src/services/checklistMultiTenantService');
    const tecnicos=require('../src/services/dadosTecnicosMultiTenantService');
    const evidencias=require('../src/services/evidenciaMultiTenantService');
    const relatorios=require('../src/services/relatorioMultiTenantService');
    const convites=require('../src/services/conviteService');
    const sync=require('../src/services/sincronizacaoMultiTenantService');
    const senha=crypto.randomBytes(32).toString('hex');
    async function negar(p,status=404) { await assert.rejects(p,{statusCode:status}); recusas++; }
    async function sessao(email) {
      const login=await auth.login({email,senha});
      const req={headers:{authorization:'Bearer '+login.token},body:{id_ambiente:crypto.randomUUID(),perfil_acesso:'MASTER'},query:{id_ambiente:crypto.randomUUID()}};
      let autorizado=false;
      const res={headersSent:false,status(){return this;},json(){throw Error('Autenticacao inesperadamente recusada.');}};
      await autenticarMultiTenant(req,res,()=>{autorizado=true;}); assert.equal(autorizado,true);
      return req.usuario;
    }
    fase='cadastro_sessao';
    console.log(JSON.stringify({fase,marcador,dados:'exclusivamente sinteticos; registros serao preservados'}));
    const usuarios=[];
    for(const empresa of ['a','b']) {
      const email=`${empresa}_${marcador}@lab.invalid`;
      const r=await cadastro.cadastrarAmbiente({nome:`Sintetico ${empresa} ${marcador}`,email,senha,id_ambiente:'FORJADO',perfil_acesso:'MASTER'});
      const u=await sessao(email); assert.equal(u.perfil_acesso,'ADMINISTRADOR'); assert.equal(u.id_ambiente,r.ambiente.id_ambiente);
      usuarios.push(u);
    }
    assert.notEqual(usuarios[0].id_ambiente,usuarios[1].id_ambiente);
    await negar(cadastro.cadastrarAmbiente({nome:'Duplicado sintetico',email:` A_${marcador.toUpperCase()}@LAB.INVALID `,senha}),409);
    fase='recursos';
    const recursos=[];
    const respostas=Object.fromEntries(['criterio_a','criterio_b','criterio_c','acesso_controlado','ventilacao_adequada','monitoramento_atmosferico','procedimento_emergencia'].map(c=>[c,'SIM']));
    for(const [i,u] of usuarios.entries()) {
      const externa=usuarios[1-i];
      const campanha=await campanhas.criarCampanha({nome_campanha:`Campanha ${marcador} ${i}`,empresa:`Empresa sintetica ${i}`,responsavel:'Equipe sintetica',data_inicio:'2026-10-18',id_usuario:externa.id_usuario,id_ambiente:externa.id_ambiente},u);
      assert.equal(campanha.id_ambiente,u.id_ambiente); assert.equal(Number(campanha.id_usuario),u.id_usuario);
      const local=await locais.criarLocal({id_campanha:campanha.id_campanha,nome_local:`Local ${marcador} ${i}`,latitude:0,longitude:0,id_ambiente:externa.id_ambiente},u);
      const checklist=await checklists.criarChecklist({id_local:local.id_local,...respostas},u);
      const tecnico=await tecnicos.criarDadosTecnicos({id_local:local.id_local,oxigenio:20.9},u);
      const operacao=crypto.randomUUID();
      const entrada={id_local:local.id_local,tipo:'TEXTO',descricao:`Sintetico ${marcador}`,latitude:0,longitude:0,origem_coordenadas:'MANUAL',id_operacao_cliente:operacao};
      const evidencia=await evidencias.criarEvidencia(entrada,u);
      assert.equal(String((await evidencias.criarEvidencia(entrada,u)).id_evidencia),String(evidencia.id_evidencia));
      const relatorio=await relatorios.criarRelatorio({id_local:local.id_local,nome_responsavel_tecnico:'Sintetico'},u);
      recursos.push({campanha,local,checklist,tecnico,evidencia,relatorio,operacao});
    }
    fase='isolamento_leituras_escritas';
    for(const [i,u] of usuarios.entries()) {
      const outro=recursos[1-i];
      await negar(campanhas.buscarCampanhaPorId(outro.campanha.id_campanha,u));
      await negar(locais.buscarLocalPorId(outro.local.id_local,u));
      await negar(checklists.buscarChecklistPorId(outro.checklist.id_checklist,u));
      await negar(tecnicos.buscarDadosTecnicosPorId(outro.tecnico.id_dados,u));
      await negar(evidencias.buscarEvidenciaPorId(outro.evidencia.id_evidencia,u));
      await negar(relatorios.buscarRelatorioPorId(outro.relatorio.id_relatorio,u));
      await negar(locais.criarLocal({id_campanha:outro.campanha.id_campanha,nome_local:'Recusado'},u));
      await negar(evidencias.criarEvidencia({id_local:outro.local.id_local,tipo:'TEXTO'},u));
      const lista=await campanhas.listarCampanhas(u); assert.ok(lista.length>0); assert.ok(lista.every(c=>c.id_ambiente===u.id_ambiente));
    }
    fase='convites_concorrentes';
    const emailEng=`eng_${marcador}@lab.invalid`;
    const convite=await convites.emitirConvite(usuarios[0].id_usuario,{email:emailEng,perfilAcesso:'ENGENHEIRO_SEGURANCA',id_ambiente:usuarios[1].id_ambiente});
    assert.equal(convite.convite.id_ambiente,usuarios[0].id_ambiente);
    await negar(cadastro.cadastrarAmbiente({nome:'Recusado por reserva',email:emailEng,senha}),409);
    const aceites=await Promise.allSettled([1,2].map(()=>convites.aceitarConvite(convite.token,{nome:'Engenheiro sintetico715',senha})));
    assert.equal(aceites.filter(r=>r.status==='fulfilled').length,1);
    const falha=aceites.find(r=>r.status==='rejected'); assert.equal(falha.reason.statusCode,409);
    const eng=await sessao(emailEng); assert.equal(eng.id_ambiente,usuarios[0].id_ambiente);
    await negar(campanhas.buscarCampanhaPorId(recursos[0].campanha.id_campanha,eng));
    await negar(campanhas.buscarCampanhaPorId(recursos[1].campanha.id_campanha,eng));
    fase='sincronizacao';
    const dados={entidade:'LOCAL',operacao:'CRIAR',id_operacao_cliente:crypto.randomUUID(),id_registro_cliente:crypto.randomUUID(),dados_cliente:{id_campanha:recursos[0].campanha.id_campanha,nome_local:`Offline ${marcador}`,latitude:0,longitude:0}};
    const s=await sync.criarSincronizacao(dados,usuarios[0]);
    await negar(sync.buscarSincronizacaoPorId(s.id_sincronizacao,usuarios[1]));
    const aplicada=await sync.processarSincronizacao(s.id_sincronizacao,usuarios[0]);
    assert.equal(aplicada.status,'SINCRONIZADO');
    const repetida=await sync.criarSincronizacao(dados,usuarios[0]);
    assert.equal(String(repetida.id_sincronizacao),String(aplicada.id_sincronizacao));
    assert.equal(String(repetida.id_entidade),String(aplicada.id_entidade));
    await negar(sync.processarSincronizacao(s.id_sincronizacao,usuarios[0]),409);
    await negar(sync.excluirSincronizacao(s.id_sincronizacao,usuarios[0]),409);
    console.log(JSON.stringify({resultado:'SERVICOS715_OK',marcador,ambientes:2,administradores:2,engenheiros:1,
      recusas,aceite_concorrente:'um sucesso e um 409',offline:'aplicado e repeticao sem duplicacao',dados_sinteticos:'preservados',arquivos_fisicos:'nao acessados'}));
  } catch(e) {
    console.error(JSON.stringify({resultado:'SERVICOS715_FALHA',fase,marcador,codigo:/^[0-9A-Z]{5}$/.test(e.code||'')?e.code:'VALIDACAO',status:e.statusCode||null}));
    process.exitCode=1;
  } finally { await pool.end(); }
}
if(require.main===module) executar().catch(()=>{console.error('Prova de servicos715 recusada antes da conexao.');process.exitCode=1;});
module.exports={executar};
