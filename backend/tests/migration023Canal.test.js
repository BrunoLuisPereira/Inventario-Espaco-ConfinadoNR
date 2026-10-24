const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const {receber}=require('../laboratorio/migration-023-canal.cjs');
const entrada={banco:'inventario_nr33_multitenant_dev',operador:'postgres',senha:'senha-sintetica-023',
  confirmacao:'APLICAR 023 inventario_nr33_multitenant_dev'};
test('canal privado entrega credencial apenas ao executor, sem alterar ambiente ou registrar segredo',async t=>{
  const antes={...process.env}, logs=[];
  t.mock.method(console,'log',(...args)=>logs.push(args));
  await receber(JSON.stringify(entrada),async(opcoes,deps)=>{
    assert.equal(opcoes.banco,entrada.banco);assert.equal(opcoes.executar,true);
    assert.equal(deps.env.NR33_MIGRACAO_023_PASSWORD,entrada.senha);
    assert.equal(deps.env.NR33_MIGRACAO_023_USER,'postgres');
    assert.equal(deps.env.JWT_SECRET,undefined);
  });
  assert.deepEqual({...process.env},antes);assert.deepEqual(logs,[]);
});
for(const alterar of [e=>{e.banco='postgres';},e=>{e.operador='nr33_dev_app';},e=>{e.senha='';},e=>{e.confirmacao='sim';}]) {
  test('entrada divergente falha antes do executor',async()=>{
    const e={...entrada};alterar(e);let chamadas=0;
    await assert.rejects(receber(JSON.stringify(e),async()=>{chamadas++;}),/recusado/);
    assert.equal(chamadas,0);
  });
}
test('erro do executor nao revela credencial',async()=>{
  await assert.rejects(receber(JSON.stringify(entrada),async()=>{throw Error(entrada.senha);}),
    e=>!e.message.includes(entrada.senha));
});
test('PowerShell simulado: cancelamento, falha, ambiente e sintaxe',{skip:process.platform!=='win32'},()=>{
  const saida=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',
    path.join(__dirname,'helpers/entradaAdmin023Teste.ps1')],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.match(saida,/APROVADO/);assert.doesNotMatch(saida,/credencial-sintetica/);
});
