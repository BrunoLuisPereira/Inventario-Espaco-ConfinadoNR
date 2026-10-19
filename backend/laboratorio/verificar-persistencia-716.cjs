const assert=require('node:assert/strict');
async function executar(marcador) {
  if(process.env.NR33_EXECUCAO_715!=='inventario_nr33_multitenant_dev' || !/^ui716_[a-f0-9]{10}$/.test(marcador||''))throw Error('Destino ou marcador recusado.');
  const {Pool}=require('pg');
  const pool=new Pool({host:'127.0.0.1',port:5432,database:'inventario_nr33_multitenant_dev',user:'nr33_dev_app',password:process.env.NR33_CREDENCIAL_715,connectionTimeoutMillis:5000});
  pool.on('error',()=>{});
  try {
    assert.equal((await pool.query('SELECT current_database() AS banco')).rows[0].banco,'inventario_nr33_multitenant_dev');
    const usuarios=(await pool.query(`SELECT u.email,u.id_usuario,u.perfil_acesso,a.id_ambiente,a.nome FROM usuario u JOIN ambiente a USING(id_ambiente)
      WHERE u.email=ANY($1::text[]) ORDER BY u.email`,[[`a_${marcador}@lab.invalid`,`b_${marcador}@lab.invalid`,`eng_${marcador}@lab.invalid`]])).rows;
    assert.equal(usuarios.length,3);
    const a=usuarios.find(u=>u.email.startsWith('a_')),b=usuarios.find(u=>u.email.startsWith('b_')),eng=usuarios.find(u=>u.email.startsWith('eng_'));
    assert.notEqual(a.id_ambiente,b.id_ambiente);assert.equal(eng.id_ambiente,a.id_ambiente);
    assert.equal(a.nome,`Empresa A ${marcador}`);assert.equal(b.nome,`Empresa B ${marcador}`);
    assert.equal(a.perfil_acesso,'ADMINISTRADOR');assert.equal(b.perfil_acesso,'ADMINISTRADOR');assert.equal(eng.perfil_acesso,'ENGENHEIRO_SEGURANCA');
    const cs=(await pool.query('SELECT id_campanha,id_ambiente,id_usuario FROM campanha WHERE id_ambiente=ANY($1::uuid[])',[[a.id_ambiente,b.id_ambiente]])).rows;
    assert.equal(cs.length,2);assert.ok(cs.every(c=>usuarios.some(u=>u.id_usuario===c.id_usuario && u.id_ambiente===c.id_ambiente)));
    const locais=(await pool.query('SELECT l.id_local,c.id_ambiente FROM local l JOIN campanha c USING(id_campanha) WHERE c.id_ambiente=ANY($1::uuid[])',[[a.id_ambiente,b.id_ambiente]])).rows;
    assert.equal(locais.length,1);assert.equal(locais[0].id_ambiente,a.id_ambiente);
    const convites=(await pool.query('SELECT id_ambiente,data_aceite FROM convite WHERE email=$1',[eng.email])).rows;
    assert.equal(convites.length,1);assert.equal(convites[0].id_ambiente,a.id_ambiente);assert.ok(convites[0].data_aceite);
    console.log(JSON.stringify({resultado:'PERSISTENCIA716_OK',marcador,ambientes:2,usuarios:3,campanhas:2,locais:1,convites_aceitos:1,nomes_empresa_preservados:true,conexao_independente:true}));
  } finally {await pool.end();}
}
if(require.main===module)executar(process.argv[2]).catch(()=>{console.error('Prova de persistencia716 recusada ou divergente; sem dados sensiveis.');process.exitCode=1;});
