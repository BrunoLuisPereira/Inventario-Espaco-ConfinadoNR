// pg_dump/restore pode distribuir o cast text[] pelos literais de um ARRAY
// de perfis. Canoniza somente esse caso; operadores e demais casts permanecem.
function normalizar(definicao) {
  let s=definicao.replace(/\(ARRAY\[([^\]]+)\]\)::text\[\]/g,(original,corpo)=>{
    return corpo.split(/,\s*/).every(t=>/^'[A-Z_]+'::character varying$/.test(t.trim()))?`ARRAY[${corpo}]`:original;
  });
  return s.replace(/ARRAY\[([^\]]+)\]/g,(original,corpo)=>{
    const itens=corpo.split(/,\s*/).map(t=>t.trim().match(/^(?:'([A-Z_]+)'::character varying|\('([A-Z_]+)'::character varying\)::text)$/));
    return itens.every(Boolean)?`ARRAY[${itens.map(m=>`'${m[1]||m[2]}'`).join(', ')}]`:original;
  });
}
module.exports={normalizar};
