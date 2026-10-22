const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
test('PowerShell restaura HMAC e ambiente sem gerar segredos ou iniciar backend',{skip:process.platform!=='win32'},()=>{
  const saida=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',
    path.join(__dirname,'helpers/ambienteLocalTeste.ps1')],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.match(saida,/APROVADO: HMAC, restauracao/);
  assert.ok(!saida.includes('substituicao-sintetica'));
});
