const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const {casos}=require('./helpers/senhaCanalHttpMock.cjs');
const authService=require('../src/services/authService');
const bcrypt=require('bcryptjs');
const repository=require('../src/repositories/autenticacaoMultiTenantRepository');
test('senha sintetica preservada: TextBox, SecureString, pipe PowerShell/Node e HTTP mock',{skip:process.platform!=='win32'},()=>{
  const output=execFileSync('powershell.exe',['-NoProfile','-STA','-File',path.join(__dirname,'helpers/senhaCanalHttpTeste.ps1')],
    {encoding:'utf8',windowsHide:true,timeout:20000});
  const resultado=JSON.parse(output.trim());
  assert.deepEqual(resultado,{aprovado:true,casos:6,integridadeUtf8:true,espacosPreservados:true,semApiReal:true});
});
for(const [categoria,senha] of casos)test('backend entrega senha integral ao bcrypt: '+categoria,async t=>{
  const anterior=process.env.JWT_SECRET;process.env.JWT_SECRET='fixture-jwt-unitario-nao-real';
  t.after(()=>{if(anterior===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=anterior;});
  const usuario={id_usuario:'42',id_ambiente:'11111111-1111-4111-8111-111111111111',nome:'Fixture',email:'testeacesso@inventario.com',
    senha_hash:'fixture-nao-e-hash-real',perfil_acesso:'ADMINISTRADOR',eh_fundador:true,ativo:true,ambiente_ativo:true};
  t.mock.method(require('../src/services/loginProtecaoService'),'executar',async(email,_ip,verificar)=>{
    assert.equal(email,'testeacesso@inventario.com');return verificar();
  });
  t.mock.method(repository,'buscarPorEmailComAmbiente',async()=>usuario);
  t.mock.method(bcrypt,'compare',async recebida=>{assert.equal(recebida,senha);return true;});
  const resultado=await authService.login({email:'  Testeacesso@inventario.com  ',senha},'127.0.0.1');
  assert.equal(resultado.usuario.email,'testeacesso@inventario.com');
  assert.equal(bcrypt.compare.mock.calls.length,1);
});
