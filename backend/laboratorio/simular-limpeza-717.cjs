// SOMENTE LEITURA. Este auxiliar nao executa exclusoes nem abre arquivos de evidencias.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const BANCO='inventario_nr33_multitenant_dev';
const preservar=[{id_usuario:'21',email:process.env.NR33_PRESERVAR_EMAIL_21},{id_usuario:'22',email:process.env.NR33_PRESERVAR_EMAIL_22}];
const especificacoes={
  ambiente:{id:'id_ambiente',sql:'SELECT id_ambiente,nome,ativo FROM public.ambiente ORDER BY id_ambiente'},
  usuario:{id:'id_usuario',sql:'SELECT id_usuario,LOWER(BTRIM(email)) AS email,id_ambiente,perfil_acesso,ativo FROM public.usuario ORDER BY id_usuario'},
  campanha:{id:'id_campanha',sql:'SELECT id_campanha,id_usuario,id_ambiente FROM public.campanha ORDER BY id_campanha'},
  local:{id:'id_local',sql:'SELECT l.id_local,l.id_campanha,c.id_ambiente FROM public.local l JOIN public.campanha c USING(id_campanha) ORDER BY l.id_local'},
  checklist_nr33:{id:'id_checklist',sql:'SELECT e.id_checklist,e.id_local,e.id_usuario,c.id_ambiente FROM public.checklist_nr33 e JOIN public.local l USING(id_local) JOIN public.campanha c USING(id_campanha) ORDER BY e.id_checklist'},
  dados_tecnicos:{id:'id_dados',sql:'SELECT e.id_dados,e.id_local,e.id_usuario,c.id_ambiente FROM public.dados_tecnicos e JOIN public.local l USING(id_local) JOIN public.campanha c USING(id_campanha) ORDER BY e.id_dados'},
  evidencia:{id:'id_evidencia',sql:"SELECT e.id_evidencia,e.id_local,e.id_usuario,c.id_ambiente,(NULLIF(BTRIM(e.caminho_arquivo),'') IS NOT NULL) AS possui_arquivo FROM public.evidencia e JOIN public.local l USING(id_local) JOIN public.campanha c USING(id_campanha) ORDER BY e.id_evidencia"},
  relatorio:{id:'id_relatorio',sql:"SELECT e.id_relatorio,e.id_local,e.id_usuario_responsavel,c.id_ambiente,(NULLIF(BTRIM(e.caminho_pdf),'') IS NOT NULL) AS possui_arquivo FROM public.relatorio e JOIN public.local l USING(id_local) JOIN public.campanha c USING(id_campanha) ORDER BY e.id_relatorio"},
  convite:{id:'id_convite',sql:'SELECT id_convite,id_ambiente,id_usuario_convite,LOWER(BTRIM(email)) AS email,(data_aceite IS NOT NULL) AS aceito FROM public.convite ORDER BY id_convite'},
  sincronizacao:{id:'id_sincronizacao',sql:'SELECT id_sincronizacao,id_ambiente,id_usuario,id_usuario_resolucao,entidade,id_entidade,status FROM public.sincronizacao ORDER BY id_sincronizacao'},
  versao_entidade:{id:'id_versao',sql:'SELECT id_versao,id_ambiente,entidade,id_entidade,versao,excluido FROM public.versao_entidade ORDER BY id_versao'},
};
async function executar() {
  if(process.env.NR33_SIMULAR_717!==BANCO || !process.env.NR33_CREDENCIAL_715 || process.env.NODE_OPTIONS)throw Error('Configuracao de simulacao recusada.');
  const pasta=process.env.NR33_PLANO_717_PASTA;
  const raizProjeto=path.resolve(__dirname,'../..');
  const relativo=pasta && path.relative(raizProjeto,path.resolve(pasta));
  if(!pasta || !path.isAbsolute(pasta) || !relativo || (!relativo.startsWith('..'+path.sep) && !path.isAbsolute(relativo)))throw Error('Informe pasta privada absoluta fora do repositorio em NR33_PLANO_717_PASTA.');
  assert.ok(preservar.every(p=>typeof p.email==='string' && /^[^\s@]+@[^\s@]+$/.test(p.email) && p.email===p.email.trim().toLowerCase()),'Identificacao dos usuarios preservados ausente ou invalida.');
  const {Pool}=require('pg');
  const pool=new Pool({host:'127.0.0.1',port:5432,database:BANCO,user:'nr33_dev_app',password:process.env.NR33_CREDENCIAL_715,
    options:'-c default_transaction_read_only=on -c search_path=public,pg_catalog',connectionTimeoutMillis:5000,max:1});
  pool.on('error',()=>{});
  const c=await pool.connect();
  let fase='conexao';
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await c.query("SET LOCAL statement_timeout='20s'");
    const destino=(await c.query("SELECT current_database() AS banco,host(inet_server_addr()) AS host,inet_server_port() AS porta,current_user AS papel,current_setting('transaction_read_only') AS somente_leitura,current_setting('transaction_isolation') AS isolamento")).rows[0];
    console.log(JSON.stringify({verificacao_destino:destino}));
    assert.equal(destino.banco,BANCO);assert.equal(destino.host,'127.0.0.1');assert.equal(destino.porta,5432);assert.equal(destino.somente_leitura,'on');
    fase='usuarios_preservados';
    const usuarios=(await c.query(especificacoes.usuario.sql)).rows;
    const protegidos=preservar.map(p=>{
      const rs=usuarios.filter(u=>u.email===p.email);assert.equal(rs.length,1,'Email preservado ausente ou duplicado.');
      assert.equal(rs[0].id_usuario,p.id_usuario,'ID preservado divergente.');return rs[0];
    });
    const ambientesProtegidos=new Set(protegidos.map(u=>u.id_ambiente));
    fase='inventario';
    const tabelasAtuais=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
    assert.deepEqual(tabelasAtuais,Object.keys(especificacoes).sort(),'Escopo estrutural inesperado.');
    const registros={usuario:usuarios};
    for(const [tabela,s] of Object.entries(especificacoes))if(tabela!=='usuario')registros[tabela]=(await c.query(s.sql)).rows;
    const ambientesCandidatos=registros.ambiente.filter(a=>!ambientesProtegidos.has(a.id_ambiente));
    const candidatos=new Set(ambientesCandidatos.map(a=>a.id_ambiente));
    const usuariosPorId=new Map(usuarios.map(u=>[u.id_usuario,u]));
    const inconsistencias=[];
    for(const p of protegidos)assert.ok(registros.ambiente.some(a=>a.id_ambiente===p.id_ambiente));
    const planejamento={};
    for(const [tabela,s] of Object.entries(especificacoes)) {
      const remover=registros[tabela].filter(r=>candidatos.has(r.id_ambiente));
      const manter=registros[tabela].filter(r=>ambientesProtegidos.has(r.id_ambiente));
      assert.equal(remover.length+manter.length,registros[tabela].length,'Registro sem escopo comprovado.');
      const contagemReal=(await c.query(`SELECT count(*)::text AS total FROM public.${tabela}`)).rows[0].total;
      assert.equal(BigInt(contagemReal),BigInt(registros[tabela].length),'Ancestralidade incompleta.');
      planejamento[tabela]={total:registros[tabela].length,remover:remover.length,preservar:manter.length,
        ids_remover:remover.map(r=>r[s.id]),ids_preservar:manter.map(r=>r[s.id])};
      for(const r of registros[tabela])for(const campo of ['id_usuario','id_usuario_responsavel','id_usuario_convite','id_usuario_resolucao'])if(r[campo]!=null && tabela!=='usuario') {
        if(usuariosPorId.get(r[campo])?.id_ambiente!==r.id_ambiente)inconsistencias.push({tabela,id:r[s.id],motivo:'Autor de outro ambiente ou ausente.'});
      }
    }
    const entidades={CAMPANHA:'campanha',LOCAL:'local',CHECKLIST_NR33:'checklist_nr33',DADOS_TECNICOS:'dados_tecnicos',EVIDENCIA:'evidencia'};
    for(const [entidade,tabela] of Object.entries(entidades))for(const r of registros[tabela]) {
      const vs=registros.versao_entidade.filter(v=>v.entidade===entidade && v.id_entidade===r[especificacoes[tabela].id]);
      if(vs.length!==1 || vs[0].id_ambiente!==r.id_ambiente || vs[0].excluido)inconsistencias.push({tabela,id:r[especificacoes[tabela].id],motivo:'Versao ativa ausente ou inconsistente.'});
    }
    for(const v of registros.versao_entidade) {
      const tabela=entidades[v.entidade];
      const r=tabela && registros[tabela].find(r=>r[especificacoes[tabela].id]===v.id_entidade);
      if(r && r.id_ambiente!==v.id_ambiente)inconsistencias.push({tabela:'versao_entidade',id:v.id_versao,motivo:'Versao externa ao ambiente do recurso.'});
    }
    const mistos=usuarios.filter(u=>ambientesProtegidos.has(u.id_ambiente) && !preservar.some(p=>p.id_usuario===u.id_usuario));
    const estrutura=(await c.query(`SELECT
      (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated) AS constraints_nao_validadas,
      (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND t.tgenabled NOT IN ('O','A')) AS triggers_inativos`)).rows[0];
    if(estrutura.constraints_nao_validadas || estrutura.triggers_inativos)inconsistencias.push({motivo:'Protecoes estruturais inativas ou nao validadas.'});
    const plano={passo:717,modo:'SIMULACAO_SEM_ESCRITAS',destino,preservados:protegidos,
      ambientes_preservados:registros.ambiente.filter(a=>ambientesProtegidos.has(a.id_ambiente)),
      ambientes_candidatos:ambientesCandidatos.map(a=>({...a,usuarios:usuarios.filter(u=>u.id_ambiente===a.id_ambiente),
        contagens:Object.fromEntries(Object.keys(especificacoes).map(t=>[t,registros[t].filter(r=>r.id_ambiente===a.id_ambiente).length]))})),
      tabelas:planejamento,registros_candidatos:Object.fromEntries(Object.keys(especificacoes).map(t=>[t,registros[t].filter(r=>candidatos.has(r.id_ambiente))])),
      sinteticos_em_ambientes_preservados:mistos,inconsistencias,estrutura,
      arquivos_fisicos_referenciados:{evidencias:registros.evidencia.filter(r=>candidatos.has(r.id_ambiente)&&r.possui_arquivo).length,relatorios:registros.relatorio.filter(r=>candidatos.has(r.id_ambiente)&&r.possui_arquivo).length},
      pronto_para_aprovacao:inconsistencias.length===0 && mistos.length===0};
    await c.query('COMMIT'); // Transacao estritamente READ ONLY.
    const arquivo=path.join(pasta,'plano-717-'+crypto.randomUUID()+'.json');
    const conteudo=JSON.stringify(plano,null,2)+'\n';
    fs.writeFileSync(arquivo,conteudo,{flag:'wx'});
    const hash=crypto.createHash('sha256').update(conteudo).digest('hex');
    console.log(JSON.stringify({arquivo_plano:arquivo,sha256:hash,...plano,registros_candidatos:undefined}));
  } catch(e) {
    await c.query('ROLLBACK').catch(()=>{});
    console.error(JSON.stringify({resultado:'SIMULACAO_INTERROMPIDA',fase,codigo:e.code||'VALIDACAO',motivo:e.code?undefined:e.message}));process.exitCode=1;
  } finally {c.release();await pool.end();}
}
if(require.main===module)executar().catch(()=>{console.error('Simulacao717 recusada antes das consultas.');process.exitCode=1;});
