const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
test('recuperação HMAC em PowerShell: mocks de armazenamento, sem leitura do segredo real',{skip:process.platform!=='win32'},()=>{
  const r=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',
    path.join(__dirname,'helpers/hmacProtegidoTeste.ps1')],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.match(r,/APROVADO: recuperacao segura simulada/);
});
