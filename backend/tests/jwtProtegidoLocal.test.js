const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const jwt=require('jsonwebtoken');
const {gerar}=require('../laboratorio/jwt-canal.cjs');
const {jwtValido}=require('../laboratorio/jwt-formato.cjs');
test('geracao JWT usa 48 bytes e zera buffer; formato distinto do HMAC',()=>{
  const bytes=Buffer.alloc(48,9);
  const segredo=gerar(n=>{assert.equal(n,48);return bytes;});
  assert.equal(jwtValido(segredo),true);assert.ok(bytes.every(b=>b===0));
  for(const invalido of [null,{},'',segredo+'\n',Buffer.alloc(32,7).toString('base64'),segredo.slice(0,63)+'='])assert.equal(jwtValido(invalido),false);
});
test('JWT protegido e compativel com HS256 e verificacao apos nova leitura sintetica',()=>{
  const chave=Buffer.alloc(48,9).toString('base64');
  const token=jwt.sign({sub:'fixture'},chave,{algorithm:'HS256',expiresIn:'1m',issuer:'nr33-local-dev',audience:'nr33-local-browser'});
  assert.equal(jwt.verify(token,String(chave),{algorithms:['HS256'],issuer:'nr33-local-dev',audience:'nr33-local-browser'}).sub,'fixture');
});
test('launcher nao gera JWT; exige cofre independente e possui limpeza finally',()=>{
  const fonte=fs.readFileSync(path.join(__dirname,'../laboratorio/postgres-local.ps1'),'utf8');
  assert.doesNotMatch(fonte,/NewGuid|randomBytes/);
  assert.match(fonte,/Ler-JwtProtegidoLocal \$Banco/);
  assert.match(fonte,/\$env:JWT_SECRET -ceq \$env:LOGIN_HMAC_SECRET/);
  assert.match(fonte,/\$jwtRecuperadoLocal.Dispose\(\)/);
  assert.match(fonte,/Restaurar-AmbienteLocal \$anterioresLocal/);
});
test('PowerShell JWT com armazenamento sintetico, formato e falhas seguras',{skip:process.platform!=='win32'},()=>{
  const saida=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',
    path.join(__dirname,'helpers/jwtProtegidoTeste.ps1')],{encoding:'utf8',windowsHide:true,timeout:20000});
  assert.match(saida,/APROVADO/);
});
