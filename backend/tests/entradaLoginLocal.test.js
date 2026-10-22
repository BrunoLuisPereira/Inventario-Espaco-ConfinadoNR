const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
test('entrada protegida: falhas distintas, fixture privada e encerramento seguro',{skip:process.platform!=='win32'},()=>{
  const saida=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',
    path.join(__dirname,'helpers/entradaLoginLocalTeste.ps1')],{encoding:'utf8',windowsHide:true,timeout:45000});
  assert.match(saida,/APROVADO/);
  assert.doesNotMatch(saida,/SEGREDO_FIXTURE/);
});
