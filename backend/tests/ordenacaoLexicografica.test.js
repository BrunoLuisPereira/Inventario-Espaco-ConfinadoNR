const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { compararLexicograficamente } = require('../src/utils/ordenacaoLexicografica');

// Oraculo: comportamento nativo anterior, sem executar scripts de laboratorio.
const original = valores => Reflect.apply(Array.prototype.sort, [...valores], []);
const casos = [
  [], ['igual', 'igual', 'a', 'z'],
  ['2', '10', '1', '9007199254740993', '9223372036854775807'],
  [2, 10, 1, 21, 3], [2, '10', 1n, '21', 3n],
  ['é', 'e\u0301', 'Z', 'a', '李', '😀', '𐀀', '\uE000', '\uD800', '\uDC00', ''],
  ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
];
for (const [indice, valores] of casos.entries()) {
  test('equivalencia com sort nativo, conjunto ' + indice, () => {
    assert.deepEqual([...valores].sort(compararLexicograficamente), original(valores));
  });
}

test('equivalencia UTF-16 em 128 permutacoes de chaves Unicode', () => {
  let seed = 2871;
  const chaves = Array.from({ length: 128 }, (_, i) => String.fromCharCode(i * 511) + String(i));
  for (let rodada = 0; rodada < 128; rodada++) {
    const entrada = [...chaves];
    for (let i = entrada.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [entrada[i], entrada[j]] = [entrada[j], entrada[i]];
    }
    assert.deepEqual(entrada.sort(compararLexicograficamente), original(chaves));
  }
});

test('ordem textual dos IDs nao vira ordem numerica', () => {
  assert.deepEqual([2, 10, 1].sort(compararLexicograficamente), [1, 10, 2]);
});

test('ordem de locks das onze tabelas permanece identica', () => {
  const fonte = fs.readFileSync(path.join(__dirname, '../laboratorio/executar-limpeza-718.cjs'), 'utf8');
  const corpo = /const tabelas = \{([\s\S]*?)\n\};/.exec(fonte)[1];
  const tabelas = [...corpo.matchAll(/^ {2}(\w+):/gm)].map(m => m[1]);
  assert.equal(tabelas.length, 11);
  const sql = nomes => 'LOCK TABLE ' + nomes.map(t => 'public.' + t).join(',') + ' IN SHARE ROW EXCLUSIVE MODE';
  assert.equal(sql([...tabelas].sort(compararLexicograficamente)), sql(original(tabelas)));
  assert.match(fonte, /LOCK TABLE \$\{Object\.keys\(tabelas\)\.sort\(compararLexicograficamente\)/);
});

test('contrato do helper HTTP preserva campos e dados sinteticos via stdin', () => {
  const { casos } = require('./helpers/senhaCanalHttpMock.cjs');
  const input = JSON.stringify(casos.map(([categoria, senha]) => ({ categoria, senha })));
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/senhaCanalHttpMock.cjs')],
    { input, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.deepEqual(JSON.parse(output.trim()), {
    aprovado: true, casos: 6, integridadeUtf8: true, espacosPreservados: true, semApiReal: true,
  });
});
