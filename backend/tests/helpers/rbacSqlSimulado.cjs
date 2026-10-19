const assert = require('node:assert/strict');
// Listas independentes da implementação. SQL desconhecido continua recusado
// pelo simulador de cada módulo; este helper verifica a autorização reconhecida.
const conjuntos = [
  ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA'],
  ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','COORDENADOR'],
  ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR'],
  ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR','SUPERVISOR','AUDITOR'],
  ['ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR','SUPERVISOR','AUDITOR','VISUALIZADOR'],
];
function conferir(sql, alias) {
  const m = sql.match(new RegExp('\\b'+alias+"\\.perfil_acesso IN \\(([^)]+)\\)"));
  assert.ok(m, 'SQL deve conter uma lista explícita de capacidades para '+alias);
  const lista = m[1].split(',').map(p => p.trim().replace(/^'|'$/g,''));
  assert.ok(conjuntos.some(c => JSON.stringify(c) === JSON.stringify(lista)), 'Lista de perfis SQL não reconhecida');
  assert.doesNotMatch(sql, new RegExp("OR (?:c|e)\\.id_usuario = "+alias+"\\.id_usuario"), 'Responsabilidade individual não substitui a política do ambiente');
  return lista;
}
module.exports = { conferir };
