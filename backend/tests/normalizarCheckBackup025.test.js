const test=require('node:test'),assert=require('node:assert/strict');
const {normalizar}=require('../laboratorio/normalizar-check-backup025.cjs');
test('normaliza somente a distribuição do cast nos arrays literais de perfis',()=>{
  const a="CHECK (((perfil)::text = ANY ((ARRAY['ADMINISTRADOR'::character varying, 'AUDITOR'::character varying])::text[])))";
  const b="CHECK (((perfil)::text = ANY (ARRAY[('ADMINISTRADOR'::character varying)::text, ('AUDITOR'::character varying)::text])))";
  assert.equal(normalizar(a),normalizar(b));
  assert.notEqual(normalizar(a),normalizar(b.replace(' = ANY',' <> ANY')));
  assert.notEqual(normalizar(a),normalizar(b.replace("'AUDITOR'","'SUPERVISOR'")));
  assert.notEqual(normalizar(a+' AND ativo'),normalizar(b+' OR ativo'));
});
test('não remove casts de colunas, parênteses lógicos ou arrays calculados',()=>{
  for(const s of ["CHECK ((valor::integer > 0) AND (ativo OR fundador))","CHECK (perfil=ANY(ARRAY[lower(nome)]::text[]))"]){
    assert.equal(normalizar(s),s);
  }
});
