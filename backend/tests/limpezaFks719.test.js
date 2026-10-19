const test=require('node:test');
const assert=require('node:assert/strict');
const {types}=require('pg');
const {verificarFKs}=require('../laboratorio/executar-limpeza-718.cjs');
function cliente({metadados,orfao=false}={}) {
  const chamadas=[];
  return {chamadas,async query(sql) {
    chamadas.push(sql);
    if(chamadas.length===1) {
      // Usa o parser real do driver correspondente ao tipo retornado pelo SQL.
      const origemTextual=/array_agg\(x\.attname::text ORDER BY k\.ord\)/.test(sql);
      const destinoTextual=/array_agg\(y\.attname::text ORDER BY k\.ord\)/.test(sql);
      return {rows:metadados || [{origem:'campanha',destino:'usuario',
        cols_origem:types.getTypeParser(origemTextual?1009:1003)('{id_usuario,id_ambiente}'),
        cols_destino:types.getTypeParser(destinoTextual?1009:1003)('{id_usuario,id_ambiente}')} ]};
    }
    assert.match(sql,/^SELECT count\(\*\)/);
    return {rows:[{n:orfao?'1':'0'}]};
  }};
}
test('driver preserva name[] como string e interpreta text[] como array',()=>{
  assert.equal(typeof types.getTypeParser(1003)('{id_usuario,id_ambiente}'),'string');
  assert.deepEqual(types.getTypeParser(1009)('{id_usuario,id_ambiente}'),['id_usuario','id_ambiente']);
});
test('consulta corrigida verifica todos os componentes da FK com parser real',async()=>{
  const c=cliente();assert.equal(await verificarFKs(c),1);
  assert.match(c.chamadas[1],/o\."id_usuario" IS NOT NULL AND o\."id_ambiente" IS NOT NULL/);
  assert.match(c.chamadas[1],/d\."id_usuario"=o\."id_usuario" AND d\."id_ambiente"=o\."id_ambiente"/);
  assert.equal(c.chamadas.length,2);
});
test('registro orfao faz verificacao falhar',async()=>{
  await assert.rejects(verificarFKs(cliente({orfao:true})),/Integridade referencial divergente/);
});
test('metadados name[] nao sao aceitos silenciosamente',async()=>{
  const c=cliente({metadados:[{origem:'campanha',destino:'usuario',cols_origem:'{id_usuario}',cols_destino:'{id_usuario}'}]});
  await assert.rejects(verificarFKs(c),/arrays JavaScript/);assert.equal(c.chamadas.length,1);
});
test('catalogo sem FKs nao produz sucesso falso',async()=>{
  await assert.rejects(verificarFKs(cliente({metadados:[]})),/Nenhuma FK/);
});
test('FK fora das onze tabelas autorizadas e rejeitada antes da consulta',async()=>{
  const c=cliente({metadados:[{origem:'outra_tabela',destino:'usuario',cols_origem:['id_usuario'],cols_destino:['id_usuario']}]});
  await assert.rejects(verificarFKs(c));assert.equal(c.chamadas.length,1);
});
