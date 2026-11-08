// Inspecao estatica e modelo logico restrito das CHECKs; nao executa SQL,
// nao comprova persistencia real, locks ou comportamento do motor PostgreSQL.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const regras = require('../src/utils/regrasCaracterizacaoNr33');
const sql = fs.readFileSync(path.join(__dirname, '../database/026_criterios_atmosfera_sinalizacao_nr33.sql'), 'utf8');
const corpo = sql.replace(/--[^\r\n]*/g, '').trim();
const comandos = corpo.split(';').map(c => c.trim()).filter(Boolean);
const marcador = 'avaliacao_especifica_iniciada';
const condicoes = regras.CONDICOES_ESPECIFICAS;
const booleanos = [...regras.DEPENDENTES, marcador];
const colunas = [...corpo.matchAll(/ADD COLUMN (\w+) (BOOLEAN|VARCHAR\(3\)) NULL(?=\s*[,;])/g)]
  .map(([, nome, tipo]) => ({ nome, tipo }));

// Separar as clausulas externas sem quebrar virgulas dentro de IN/VARCHAR.
function separarClausulas(texto) {
  const partes = []; let profundidade = 0, inicio = 0;
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] === '(') profundidade++;
    if (texto[i] === ')') profundidade--;
    if (texto[i] === ',' && profundidade === 0) { partes.push(texto.slice(inicio, i).trim()); inicio = i + 1; }
    assert.ok(profundidade >= 0);
  }
  assert.equal(profundidade, 0); partes.push(texto.slice(inicio).trim()); return partes;
}
const clausulas = separarClausulas(comandos[1].replace(/^ALTER TABLE public\.checklist_nr33\s+/, ''));
const checks = Object.fromEntries(clausulas.filter(c => c.startsWith('ADD CONSTRAINT ')).map(c => {
  const encontrado = /^ADD CONSTRAINT (\w+)\s+CHECK \(([\s\S]+)\)$/.exec(c);
  assert.ok(encontrado, `Constraint fora do subconjunto inspecionado: ${c}`);
  return [encontrado[1], encontrado[2]];
}));

// Avaliador de testes do subconjunto usado nesta migration (sem eval ou I/O).
// Conserva UNKNOWN (null) em IN; CHECK aceita TRUE ou UNKNOWN, rejeita FALSE.
function avaliarExpressao(expressao, registro) {
  const tokens = expressao.match(/'[^']*'|[a-z_]+|[A-Z]+|[(),]/g) || [];
  assert.equal(tokens.join(''), expressao.replace(/\s/g, ''));
  let indice = 0;
  function exigir(token) { assert.equal(tokens[indice++], token); }
  function atomo() {
    if (tokens[indice] === '(') { indice++; const valor = ou(); exigir(')'); return valor; }
    const campo = tokens[indice++]; assert.ok(Object.hasOwn(registro, campo), `Campo desconhecido: ${campo}`);
    const valor = registro[campo];
    if (tokens[indice] === 'IS') {
      indice++; const predicado = tokens[indice++]; assert.ok(['NULL', 'TRUE'].includes(predicado));
      return predicado === 'NULL' ? valor === null : valor === true;
    }
    exigir('IN'); exigir('('); const valores = [];
    do { const literal = tokens[indice++]; assert.match(literal, /^'[^']*'$/); valores.push(literal.slice(1, -1));
      if (tokens[indice] !== ',') break; indice++;
    } while (true);
    exigir(')'); return valor === null ? null : valores.includes(valor);
  }
  function e() {
    let valor = atomo();
    while (tokens[indice] === 'AND') { indice++; const outro = atomo();
      valor = valor === false || outro === false ? false : valor === null || outro === null ? null : true; }
    return valor;
  }
  function ou() {
    let valor = e();
    while (tokens[indice] === 'OR') { indice++; const outro = e();
      valor = valor === true || outro === true ? true : valor === null || outro === null ? null : false; }
    return valor;
  }
  const resultado = ou(); assert.equal(indice, tokens.length); return resultado;
}
const aceitaChecks = registro => Object.values(checks).every(c => avaliarExpressao(c, registro) !== false);
const vazio = () => Object.fromEntries([...booleanos, ...condicoes].map(c => [c, null]));

test('DDL tem somente BEGIN, ALTER aditivo no checklist e COMMIT', () => {
  assert.equal(comandos.length, 3); assert.equal(comandos[0], 'BEGIN'); assert.equal(comandos[2], 'COMMIT');
  assert.match(comandos[1], /^ALTER TABLE public\.checklist_nr33\s/);
  assert.equal(clausulas.length, 17);
  for (const c of clausulas) assert.match(c, /^(?:ADD COLUMN \w+ (?:BOOLEAN|VARCHAR\(3\)) NULL|ADD CONSTRAINT \w+\s+CHECK \([\s\S]+\))$/);
  assert.doesNotMatch(corpo, /\b(?:UPDATE|INSERT|DELETE|DROP|TRUNCATE|DEFAULT|NOT NULL|REFERENCES|TRIGGER|FUNCTION|GRANT|REVOKE|EXECUTE|COPY|DO)\b/i);
});

test('dez colunas opcionais com nomes exatos, sem classificacao persistida ou alteracao de A/B', () => {
  assert.equal(colunas.length, 10); assert.equal(new Set(colunas.map(c => c.nome)).size, 10);
  assert.deepEqual(colunas.map(c => c.nome).sort(), [...booleanos, ...condicoes].sort());
  for (const c of colunas) assert.equal(c.tipo, condicoes.includes(c.nome) ? 'VARCHAR(3)' : 'BOOLEAN');
  assert.doesNotMatch(corpo, /\b(?:criterio_a|criterio_b|criterio_c|status|id_local|id_usuario|id_ambiente|data_atualizacao)\b/);
});

test('sete constraints nomeadas, sem truncamento ou regras adicionais', () => {
  assert.equal(Object.keys(checks).length, 7);
  assert.deepEqual(Object.keys(checks).sort(), [...condicoes.map(c => `ck_checklist_${c}_dominio`),
    'ck_checklist_avaliacao_especifica_iniciada_dominio', 'ck_checklist_avaliacao_especifica_presenca'].sort());
  for (const nome of Object.keys(checks)) assert.ok(Buffer.byteLength(nome) <= 63);
});

test('dominios das cinco condicoes preservam NULL e admitem somente SIM/NAO', () => {
  for (const campo of condicoes) {
    const expressao = checks[`ck_checklist_${campo}_dominio`];
    assert.equal(expressao, `${campo} IN ('SIM', 'NAO')`);
    for (const valor of [null, 'SIM', 'NAO']) assert.notEqual(avaliarExpressao(expressao, { [campo]: valor }), false);
    for (const valor of ['', 'sim', 'NA', 'NÃO', 'S', '0']) assert.equal(avaliarExpressao(expressao, { [campo]: valor }), false);
  }
});

test('marcador admite TRUE ou NULL e rejeita FALSE', () => {
  const expressao = checks.ck_checklist_avaliacao_especifica_iniciada_dominio;
  assert.equal(avaliarExpressao(expressao, { [marcador]: null }), true);
  assert.equal(avaliarExpressao(expressao, { [marcador]: true }), true);
  assert.equal(avaliarExpressao(expressao, { [marcador]: false }), false);
});

test('729 estados das condicoes/marcador respeitam presenca e valores desconhecidos', () => {
  let combinacoes = [[]];
  for (const campo of condicoes) combinacoes = combinacoes.flatMap(p => [null, 'SIM', 'NAO'].map(v => [...p, v]));
  let total = 0;
  for (const valores of combinacoes) for (const iniciou of [null, true, false]) {
    const registro = { ...vazio(), ...Object.fromEntries(condicoes.map((c, i) => [c, valores[i]])), [marcador]: iniciou };
    const esperado = iniciou === true || iniciou === null && valores.every(v => v === null);
    assert.equal(aceitaChecks(registro), esperado, JSON.stringify(registro)); total++;
  }
  assert.equal(total, 729);
});

test('booleanos de atmosfera/placa nao sao restringidos: TRUE/FALSE/NULL permanecem distintos', () => {
  for (const campo of regras.DEPENDENTES) {
    for (const expressao of Object.values(checks)) assert.doesNotMatch(expressao, new RegExp(`\\b${campo}\\b`));
    for (const valor of [true, false, null]) assert.equal(aceitaChecks({ ...vazio(), [campo]: valor }), true);
  }
});

test('historicos pendentes/concluidos com campos novos NULL sao compativeis com todas as CHECKs', () => {
  for (const status of ['PENDENTE', 'CONCLUIDO']) {
    const registro = { ...vazio(), status, criterio_a: 'SIM', criterio_b: 'NAO', criterio_c: 'NAO' };
    assert.equal(aceitaChecks(registro), true);
    assert.equal(aceitaChecks({ ...registro, observacoes: 'Edicao legitima de registro antigo' }), true);
  }
  // Ausencia de DML/DEFAULT verificada acima; preservacao fisica sera homologada no PostgreSQL.
});

test('reconstrucao documentada preserva estados do contrato 2A sem alterar suas funcoes', () => {
  const adaptarNoTeste = registro => registro[marcador] === null ? null
    : Object.fromEntries(condicoes.map(c => [c, registro[c]]));
  assert.equal(regras.avaliarHipoteseEspecifica(adaptarNoTeste(vazio())), 'NAO_AVALIADA');
  assert.equal(regras.avaliarHipoteseEspecifica(adaptarNoTeste({ ...vazio(), [marcador]: true })), 'INFORMACOES_INSUFICIENTES');
  assert.equal(regras.avaliarHipoteseEspecifica(adaptarNoTeste({ ...vazio(), [marcador]: true, utilizado_armazenagem: 'NAO' })), 'NAO_ATENDIDA');
  assert.equal(regras.avaliarHipoteseEspecifica(adaptarNoTeste({ ...vazio(), [marcador]: true,
    nao_destinado_ocupacao_humana: 'SIM', meios_limitados_entrada_saida: 'SIM', utilizado_armazenagem: 'SIM', potencial_afogamento: 'SIM' })), 'ATENDIDA');
});

test('aplicacao unica segue 025: nao ignora duplicidade nem altera constraints existentes', () => {
  const anterior = fs.readFileSync(path.join(__dirname, '../database/025_caracterizacao_checklist_nr33.sql'), 'utf8').replace(/--[^\r\n]*/g, '');
  for (const fonte of [anterior, corpo]) {
    assert.match(fonte, /\bBEGIN;/); assert.match(fonte, /\bCOMMIT;/);
    assert.doesNotMatch(fonte, /IF NOT EXISTS|DROP CONSTRAINT/i);
  }
  assert.match(sql, /reexecucao deve falhar/);
  // Nao reexecuta SQL: erro de duplicidade/rollback deve ser verificado em banco autorizado.
});
