const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync,spawnSync}=require('node:child_process');
const {gerar}=require('../laboratorio/hmac-canal.cjs');
const {hmacValido}=require('../src/utils/loginHmac');
const canal=require.resolve('../laboratorio/hmac-canal.cjs');
test('geração usa exatamente 32 bytes e limpa o buffer, com RNG sintético',()=>{
  const bytes=Buffer.alloc(32,7);let chamadas=0;
  const resultado=gerar(tamanho=>{assert.equal(tamanho,32);chamadas++;return bytes;});
  assert.equal(chamadas,1);assert.equal(hmacValido(resultado),true);assert.ok(bytes.every(b=>b===0));
});
test('CLI recusa geração sem marcador privado e não exibe chave',()=>{
  const env={...process.env};delete env.NR33_HMAC_CANAL_INTERNO;
  const r=spawnSync(process.execPath,[canal,'gerar'],{env,encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr,'Canal HMAC privado obrigatorio.\n');
});
test('validação em novo Node recebe somente stdin e retorna apenas booleano',()=>{
  const r=execFileSync(process.execPath,[canal,'validar'],{env:{...process.env,NR33_HMAC_CANAL_INTERNO:'PASSO28_PIPE'},
    input:Buffer.alloc(32,7).toString('base64'),encoding:'utf8',windowsHide:true,timeout:10000});
  assert.deepEqual(JSON.parse(r),{formatoValido:true});
});
test('validação inválida não devolve conteúdo de entrada',()=>{
  const r=spawnSync(process.execPath,[canal,'validar'],{env:{...process.env,NR33_HMAC_CANAL_INTERNO:'PASSO28_PIPE'},
    input:'CREDENCIAL_SINTETICA_NAO_EXIBIR',encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(r.status,1);assert.deepEqual(JSON.parse(r.stdout),{formatoValido:false});assert.equal(r.stderr,'');
});
