// SOMENTE apos aprovacao do laboratorio. Nao importa pg, app principal ou dotenv.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { destino } = require('./config.cjs');
async function executar(banco) {
  const d = destino(banco);
  const base = `http://${d.host}:${d.portaHTTP}/api`;
  async function api(endpoint, esperado, token, dados, method = dados ? 'POST' : 'GET') {
    const r = await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(dados ? { body: JSON.stringify(dados) } : {}), signal: AbortSignal.timeout(10000) });
    assert.equal(r.status, esperado, `${method} ${endpoint}: status divergente (conteudo omitido)`);
    const body = await r.json();
    assert.equal(body.status, esperado >= 400 ? 'error' : 'success');
    return body;
  }
  const saude = await api('/health', 200);
  assert.equal(saude.laboratorio, true); assert.equal(saude.banco, banco);
  // Nenhuma escrita antes de confirmar o marcador de laboratorio e o banco exato.
  const sufixo = crypto.randomBytes(6).toString('hex');
  const senha = 'LaboratorioSintetico702!'; // Exclusivamente contas sinteticas, nunca reutilizar.
  const contas = [];
  await api('/cadastro/ambiente', 400, null, { nome: 'x'.repeat(121), email: `invalido_${sufixo}@lab.invalid`, senha });
  for (const empresa of ['a','b']) {
    const email = `${empresa}_${sufixo}@lab.invalid`;
    await api('/cadastro/ambiente', 201, null, { nome: `Administrador sintetico ${empresa}`, email, senha, id_ambiente: 'FORJADO', perfil_acesso: 'MASTER' });
    await api('/auth/login', 401, null, { email, senha: 'incorreta' });
    const login = (await api('/auth/login', 200, null, { email, senha })).data;
    assert.equal(typeof login.usuario.id_usuario, 'string', 'Driver deve preservar INT8 textual');
    const perfil = (await api('/auth/perfil', 200, login.token)).data;
    assert.equal(perfil.perfil_acesso, 'ADMINISTRADOR');
    contas.push({ ...login, perfil, email });
  }
  assert.notEqual(contas[0].perfil.id_ambiente, contas[1].perfil.id_ambiente);
  const recursos = [];
  for (const [i, conta] of contas.entries()) {
    const outra = contas[1-i];
    const campanha = (await api('/campanhas',201,conta.token,{ nome_campanha:`Campanha sintetica ${i}`,empresa:`Empresa ${i}`,responsavel:'Equipe sintetica',data_inicio:'2026-10-18', id_ambiente:outra.perfil.id_ambiente,id_usuario:outra.perfil.id_usuario })).data;
    assert.equal(campanha.status,'EM ANDAMENTO'); assert.equal(campanha.id_ambiente,conta.perfil.id_ambiente);
    const local = (await api('/locais',201,conta.token,{nome_local:`Local sintetico ${i}`,id_campanha:campanha.id_campanha,latitude:0,longitude:0,id_ambiente:outra.perfil.id_ambiente})).data;
    assert.equal(Number(local.latitude),0); assert.equal(Number(local.longitude),0);
    recursos.push({ campanha, local });
  }
  for (const [i, conta] of contas.entries()) {
    const externa = recursos[1-i];
    const campanhas = (await api('/campanhas',200,conta.token)).data;
    assert.ok(campanhas.every(c => c.id_ambiente === conta.perfil.id_ambiente));
    assert.ok(!(await api('/locais',200,conta.token)).data.some(l => l.id_local === externa.local.id_local));
    for (const [rota, id] of [['campanhas',externa.campanha.id_campanha],['locais',externa.local.id_local]]) {
      const fora = await api(`/${rota}/${id}`,404,conta.token);
      const ausente = await api(`/${rota}/9007199254740991`,404,conta.token);
      assert.deepEqual(fora,ausente);
      await api(`/${rota}/${id}`,404,conta.token,rota === 'locais' ? {nome_local:'Recusado'} : {nome_campanha:'Recusado',empresa:'Sintetica',responsavel:'Equipe',data_inicio:'2026-10-18'},'PUT');
      await api(`/${rota}/${id}/status`,404,conta.token,{status:rota === 'locais' ? 'INATIVO':'CANCELADA'},'PATCH');
    }
    await api('/locais',404,conta.token,{nome_local:'Recusado',id_campanha:externa.campanha.id_campanha});
  }
  await api('/campanhas',401);
  await api('/campanhas',401,'token-invalido');
  const conviteEmail = `engenheiro_${sufixo}@lab.invalid`;
  const convite = (await api('/convites',201,contas[0].token,{email:conviteEmail,perfilAcesso:'ENGENHEIRO_SEGURANCA',id_ambiente:contas[1].perfil.id_ambiente})).data;
  assert.equal(convite.convite.id_ambiente,contas[0].perfil.id_ambiente);
  await api('/cadastro/ambiente',409,null,{nome:'Recusado por reserva',email:conviteEmail,senha});
  await api('/convites/aceitar',400,null,{token:convite.token,nome:'x'.repeat(121),senha});
  await api('/convites/aceitar',201,null,{token:convite.token,nome:'Engenheiro sintetico',senha});
  await api('/convites/aceitar',409,null,{token:convite.token,nome:'Engenheiro sintetico',senha});
  const engenheiro = (await api('/auth/login',200,null,{email:conviteEmail,senha})).data;
  assert.deepEqual((await api('/campanhas',200,engenheiro.token)).data,[]);
  await api(`/campanhas/${recursos[0].campanha.id_campanha}`,404,engenheiro.token);
  await api(`/usuarios/${contas[1].perfil.id_usuario}/status`,200,contas[1].token,{ativo:false},'PATCH');
  await api('/auth/perfil',401,contas[1].token);
  console.log('Fluxos reais sinteticos concluidos: cadastro, login, A/B, campanhas, locais, convites e inatividade.');
  console.log(`Conta A para navegador: ${contas[0].email} (senha sintetica descrita no roteiro).`);
}
if (require.main === module) {
  if (process.argv[2] !== '--executar' || process.argv[3] !== '--banco' || process.argv.length !== 5) throw Error('Execucao exige --executar --banco DESTINO_APROVADO.');
  executar(process.argv[4]).catch(() => { console.error('Validacao HTTP do laboratorio falhou; detalhes sensiveis omitidos.'); process.exitCode=1; });
}
module.exports = { executar };
