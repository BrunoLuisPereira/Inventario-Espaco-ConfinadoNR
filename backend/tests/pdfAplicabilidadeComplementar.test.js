const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const PDFDocument = require('pdfkit');
const fixture = require('./helpers/pdfNr33Fixture.cjs');
const { criarIdiomaPdf } = require('../src/utils/idiomaPdf');
const fonte = require.resolve('../src/services/pdfService');

// PASSO 06: complemento separado da selecao de referencia. PDF real em memoria,
// sem filesystem de producao, banco, rede ou alteracao dos 123 testes RED.
function preparar(t) {
  const textos = [], registros = [];
  class Documento extends PDFDocument {
    text(valor, x, y, opcoes) {
      registros.push({ texto: String(valor), x, y, tamanho: this._fontSize,
        largura: opcoes.width, larguraReal: this.widthOfString(String(valor)) });
      textos.push(String(valor));
      return super.text(valor, x, y, opcoes);
    }
  }
  const anterior = require.cache[fonte], load = Module._load;
  delete require.cache[fonte];
  t.mock.method(Module, '_load', function (nome, parent, ...args) {
    if (parent?.filename === fonte && nome === 'pdfkit') return Documento;
    if (parent?.filename === fonte && nome === 'fs') return new Proxy({}, {
      get() { throw Error('Filesystem de producao proibido neste teste'); },
    });
    return load.call(this, nome, parent, ...args);
  });
  const service = require(fonte);
  t.after(() => { delete require.cache[fonte]; if (anterior) require.cache[fonte] = anterior; });
  return { ...service, textos, registros };
}

for (const idioma of ['pt-BR', 'en'])
for (const a of ['SIM', 'NAO', null]) for (const b of ['SIM', 'NAO', null]) for (const c of ['SIM', 'NAO', null]) {
  test(`PDF complementar: aplicabilidade ternaria ${a}/${b}/${c}, ${idioma}`, async t => {
    const s = preparar(t), d = { ...fixture.dados(), criterio_a: a, criterio_b: b, criterio_c: c,
      atmosfera_oxigenio: true, atmosfera_contaminantes: false, atmosfera_explosiva: null,
      possui_placa_identificacao: false };
    const antes = structuredClone(d), { t: traduzir } = criarIdiomaPdf(idioma);
    const buffer = await s.gerarPdfRelatorio(d, { somenteBuffer: true, idioma });
    assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
    const inicio = s.textos.indexOf('C-1'), fim = s.textos.indexOf('D', inicio);
    const valores = ['SIM', 'NÃO', 'NÃO AVALIADO', 'NÃO APLICÁVEL'];
    const respostas = s.textos.slice(inicio, fim).filter(v => valores.map(traduzir).includes(v));
    const atmosfera = c === 'SIM' ? ['SIM', 'NÃO', 'NÃO AVALIADO']
      : Array(3).fill(c === 'NAO' ? 'NÃO APLICÁVEL' : 'NÃO AVALIADO');
    const placa = [a, b, c].includes('NAO') ? 'NÃO APLICÁVEL'
      : [a, b, c].every(v => v === 'SIM') ? 'NÃO' : 'NÃO AVALIADO';
    assert.deepEqual(respostas, [...atmosfera, placa].map(traduzir));
    assert.deepEqual(d, antes);
    for (const r of s.registros.filter(r => r.y >= 119 && r.y < 790)) {
      assert.ok(r.y + r.tamanho <= 776, `Rodape invadido: ${r.texto}`);
      assert.ok(r.larguraReal <= r.largura + 0.5, `Texto horizontalmente cortado: ${r.texto}`);
    }
  });
}

const especifica = { avaliacao_especifica_iniciada: true, nao_destinado_ocupacao_humana: 'SIM',
  meios_limitados_entrada_saida: 'SIM', utilizado_armazenagem: 'SIM', potencial_engolfamento: 'SIM' };
for (const [nome, campos, resultado] of [
  ['nao avaliada', {}, 'Não avaliada'],
  ['insuficiente', { avaliacao_especifica_iniciada: true }, 'Informações insuficientes'],
  ['atendida', especifica, 'Atendida'],
  ['descartada', { avaliacao_especifica_iniciada: true, utilizado_armazenagem: 'NAO' }, 'Não atendida'],
]) test(`PDF complementar: hipotese ${nome} preservada internamente e omitida na apresentacao`, async t => {
  const s = preparar(t), d = { ...fixture.dados(), ...campos };
  const antes = structuredClone(d);
  const { determinarAplicabilidade } = require('../src/utils/regrasCaracterizacaoNr33');
  const { reconstruirAvaliacaoEspecifica } = require('../src/utils/adaptadorCamposNr33');
  const avaliacao = determinarAplicabilidade({ ...d, avaliacao_especifica: reconstruirAvaliacaoEspecifica(d) });
  const estados = { 'Não avaliada': 'NAO_AVALIADA', 'Informações insuficientes': 'INFORMACOES_INSUFICIENTES',
    Atendida: 'ATENDIDA', 'Não atendida': 'NAO_ATENDIDA' };
  assert.equal(avaliacao.classificacao.hipoteseEspecifica, estados[resultado]);
  await s.gerarPdfRelatorio(d, { somenteBuffer: true });
  const texto = s.textos.join(' ');
  assert.match(texto, /Status do preenchimento/);
  assert.doesNotMatch(texto, /Avaliação NR-33|Hipótese específica|Classificação normativa consolidada/);
  assert.match(texto, /Não exclui outras hipóteses normativas/);
  assert.deepEqual(d, antes);
  if (nome === 'nao avaliada' || nome === 'insuficiente') {
    assert.equal(avaliacao.classificacao.resultado, 'PENDENTE');
    assert.doesNotMatch(texto, /Não caracterizado após avaliação das hipóteses/);
  }
});

test('PDF complementar: aviso de ausencia de placa somente quando aplicavel', async t => {
  const s = preparar(t);
  await s.gerarPdfRelatorio({ ...fixture.dados(), criterio_a: 'SIM', criterio_b: 'SIM', criterio_c: 'SIM',
    atmosfera_oxigenio: true, possui_placa_identificacao: false }, { somenteBuffer: true });
  assert.ok(s.textos.includes('Aviso de sinalização'));
  assert.match(s.textos.join(' '), /Ausência de sinalização/);
});

test('PDF complementar: classificacao usa respostas brutas e ignora avaliacao derivada forjada', async t => {
  const s = preparar(t), d = { ...fixture.dados(), avaliacao_nr33: {
    classificacao: { resultado: 'NAO_CARACTERIZADO', hipoteseEspecifica: 'NAO_ATENDIDA' } } };
  await s.gerarPdfRelatorio(d, { somenteBuffer: true });
  const i = s.textos.indexOf('Espaço classificado como Confinado?');
  assert.ok(i >= 0);
  assert.equal(s.textos[i + 1], 'NÃO');
  assert.match(s.textos.join(' '), /Não exclui outras hipóteses normativas/);
  assert.ok(!s.textos.includes('Não caracterizado após avaliação das hipóteses'));
});
