const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const PDFDocument = require('pdfkit');
const fonte = require.resolve('../src/services/pdfService');
// PNG RGB de um pixel criado em memória, com zlib e CRC válidos.
function chunk(tipo, dados) {
  const corpo = Buffer.concat([Buffer.from(tipo), dados]); let crc = 0xffffffff;
  for (const byte of corpo) { crc ^= byte; for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; }
  const tamanho = Buffer.alloc(4), checksum = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([tamanho, corpo, checksum]);
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr),
  chunk('IDAT', require('node:zlib').deflateSync(Buffer.from([0,255,0,0]))), chunk('IEND', Buffer.alloc(0))]);
function preparar(t, falhar = false) {
  const textos = [], imagens = [], fisico = [];
  class Documento extends PDFDocument {
    text(valor, ...args) { textos.push(String(valor)); if (falhar) throw new Error('FALHA_RENDER_SIMULADA'); return super.text(valor, ...args); }
    openImage(valor) { assert.ok(Buffer.isBuffer(valor), 'imagem precisa vir do buffer autorizado'); imagens.push(valor); return super.openImage(valor); }
  }
  const load = Module._load; delete require.cache[fonte];
  Module._load = function (r, parent, ...args) {
    if (parent?.filename === fonte && r === 'pdfkit') return Documento;
    if (parent?.filename === fonte && r === 'fs') return new Proxy({}, { get(_o, nome) { return () => { fisico.push(nome); throw new Error('FILESYSTEM_PROIBIDO'); }; } });
    return load.call(this, r, parent, ...args);
  };
  let service;
  try { service = require(fonte); } finally { Module._load = load; }
  t.after(() => { delete require.cache[fonte]; assert.deepEqual(fisico, []); });
  return { service, textos, imagens };
}
function dados() { return {
  id_relatorio: 7, id_local: 40, nome_local: 'LOCAL_EXCLUSIVO_A', nome_campanha: 'CAMPANHA_EXCLUSIVA_A', empresa: 'EMPRESA_A',
  nome_responsavel_tecnico: 'TECNICO_A', crea: 'CREA_A', numero_art: 'ART_A', data_art: '2026-10-18',
  id_checklist: 1, criterio_a: 'SIM', criterio_b: 'SIM', criterio_c: 'NAO', acesso_controlado: 'SIM',
  id_dados: 2, oxigenio: 0, temperatura: 0, observacoes_dados_tecnicos: 'DADOS_A',
  evidencias: [{ id_evidencia: 1, tipo: 'FOTO', caminho_arquivo: 'uploads/evidencias/legada.jpg', descricao: 'LEGENDA_A', latitude: 0, longitude: 0, origem_coordenadas: 'GPS', precisao_gps: 0 }]
}; }
test('PDFKit real gera buffer e preserva seções, ART, GPS zero e legenda de foto legada', async t => {
  const s = preparar(t); const buffer = await s.service.gerarPdfRelatorio(dados(), { somenteBuffer: true, imagens: new Map() });
  assert.ok(Buffer.isBuffer(buffer)); assert.equal(buffer.subarray(0, 5).toString(), '%PDF-'); assert.match(buffer.toString('latin1'), /%%EOF/);
  const texto = s.textos.join('\n');
  for (const valor of ['LOCAL_EXCLUSIVO_A', 'CAMPANHA_EXCLUSIVA_A', 'TECNICO_A', 'CREA_A', 'ART_A', 'Checklist NR-33', 'Dados Técnicos', 'Evidências', 'LEGENDA_A', 'Latitude', 'Longitude', 'GPS', '0,0000000', 'indisponível']) assert.ok(texto.includes(valor), valor);
  assert.doesNotMatch(texto, /EMPRESA_B|LOCAL_B|uploads\/evidencias|legada\.jpg/); assert.equal(s.imagens.length, 0);
});
test('foto gerenciada é renderizada somente a partir do buffer fornecido', async t => {
  const s = preparar(t); const buffer = await s.service.gerarPdfRelatorio(dados(), { somenteBuffer: true, imagens: new Map([[1, png]]) });
  assert.ok(buffer.length > 1000); assert.ok(s.imagens.length >= 1); assert.ok(s.imagens.every(i => i === png));
  assert.ok(!s.textos.some(v => v.includes('Não foi possível inserir')), 'PNG deve ser efetivamente renderizado');
});
test('relatório sem módulos opcionais mantém as mensagens e gera documento válido', async t => {
  const s = preparar(t); const buffer = await s.service.gerarPdfRelatorio({ id_relatorio: 7, evidencias: [] }, { somenteBuffer: true });
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-'); const texto = s.textos.join('\n');
  assert.match(texto, /Checklist não cadastrado/); assert.match(texto, /Dados técnicos não cadastrados/); assert.match(texto, /Nenhuma evidência cadastrada/);
});
test('falha do renderizador rejeita a geração sem persistência física', async t => {
  const s = preparar(t, true); await assert.rejects(s.service.gerarPdfRelatorio(dados(), { somenteBuffer: true }), /FALHA_RENDER_SIMULADA/);
});
