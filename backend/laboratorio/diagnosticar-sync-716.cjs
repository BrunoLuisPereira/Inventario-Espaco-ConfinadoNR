const crypto=require('node:crypto');
async function executar() {
  if(process.env.NR33_EXECUCAO_715!=='inventario_nr33_multitenant_dev') throw Error('Destino recusado.');
  const {Pool}=require('pg');
  const pool=new Pool({host:'127.0.0.1',port:5432,database:'inventario_nr33_multitenant_dev',user:'nr33_dev_app',password:process.env.NR33_CREDENCIAL_715,connectionTimeoutMillis:5000});
  pool.on('error',()=>{});
  let fase='consulta_contexto';
  const conectar=pool.connect.bind(pool);
  pool.connect=async()=>{
    const c=await conectar(), consultar=c.query.bind(c);
    c.query=async(sql,...args)=>{
      try { return await consultar(sql,...args); } catch(e) {
        if(e.code==='42P08') {
          const texto=String(sql);
          const detalhe=String(e.message)+' '+String(e.detail);
          console.error(JSON.stringify({codigo:e.code,fase,consulta:texto.includes('data_sincronizacao = CASE')?'finalizar/UPDATE sincronizacao':texto.includes('INSERT INTO sincronizacao')?'registrar/INSERT sincronizacao':'outra',parametro:detalhe.match(/\$\d+/)?.[0],tipos:[...new Set(detalhe.match(/character varying|bigint|uuid|integer|text/g)||[])],posicao:e.position}));
        }
        throw e;
      }
    };
    return c;
  };
  try {
    const c=await conectar();
    const r=await c.query(`SELECT c.id_campanha,u.id_usuario,u.id_ambiente,u.perfil_acesso FROM campanha c
      JOIN usuario u ON u.id_usuario=c.id_usuario AND u.id_ambiente=c.id_ambiente
      WHERE c.nome_campanha LIKE $1 AND u.ativo=TRUE ORDER BY c.id_campanha LIMIT 1`,['%passo715_d645c859bdcb%']);
    c.release();
    if(!r.rows[0]) throw Error('Contexto sintetico ausente.');
    const u={...r.rows[0],id_usuario:Number(r.rows[0].id_usuario)};
    const database=require.resolve('../src/config/database');require.cache[database]={id:database,filename:database,loaded:true,exports:pool};
    const sync=require('../src/services/sincronizacaoMultiTenantService');
    fase='registrar';
    const s=await sync.criarSincronizacao({entidade:'LOCAL',operacao:'CRIAR',id_operacao_cliente:crypto.randomUUID(),id_registro_cliente:crypto.randomUUID(),dados_cliente:{id_campanha:u.id_campanha,nome_local:'Diagnostico sintetico716'}},u);
    fase='processar';
    await sync.processarSincronizacao(s.id_sincronizacao,u);
    console.log('SYNC716_OK');
  } catch(e) { console.log(JSON.stringify({fase,codigo:e.code||'VALIDACAO',status:e.statusCode||null}));process.exitCode=1; }
  finally { await pool.end(); }
}
if(require.main===module) executar().catch(()=>{console.error('Diagnostico recusado.');process.exitCode=1;});
