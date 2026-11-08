const politicaRbac723 = require('../src/utils/permissoes');
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const PDFDocument = require('pdfkit');
const fonte = require.resolve('../src/services/pdfService');
const fixture = require('./helpers/pdfNr33Fixture.cjs');
// Leitura das páginas e streams dos PDFs sintéticos emitidos pelo PDFKit.
// Confere bytes efetivos, além dos registros de chamadas do renderizador.
function paginasGravadas(buffer) {
  const objetos = new Map(Array.from(buffer.toString('latin1').matchAll(/(?:^|\n)(\d+) 0 obj\r?\n([\s\S]*?)\r?\nendobj/g), m => [m[1], m[2]]));
  return Array.from(objetos.values()).filter(objeto => /\/Type \/Page\s/.test(objeto)).map(pagina => {
    const referencia = /\/Contents (\d+) 0 R/.exec(pagina);
    assert.ok(referencia, 'página deve apontar para seu conteúdo');
    const objeto = objetos.get(referencia[1]);
    const stream = /\bstream\r?\n/.exec(objeto), comprimento = /\/Length (\d+)( 0 R)?/.exec(objeto);
    assert.ok(stream && comprimento, 'conteúdo e comprimento da página devem estar gravados');
    const tamanho = Number(comprimento[2] ? objetos.get(comprimento[1]).trim() : comprimento[1]);
    // O último byte comprimido pode ser 0x0D: não o confundir com a quebra
    // de linha que antecede endstream. Use o tamanho declarado no PDF.
    const inicio = stream.index + stream[0].length;
    const bytes = Buffer.from(objeto, 'latin1').subarray(inicio, inicio + tamanho);
    const conteudo = /\/Filter \/FlateDecode/.test(objeto) ? require('node:zlib').inflateSync(bytes).toString('latin1') : bytes.toString('latin1');
    return Array.from(conteudo.matchAll(/<([0-9a-f]+)>/gi), m => Buffer.from(m[1], 'hex').toString('latin1')).join('');
  });
}
test('leitor de páginas preserva byte 0x0D no final do stream comprimido', () => {
  const zlib = require('node:zlib');
  let conteudo = 'BT [<5445535445>] TJ ET\n%', comprimido = zlib.deflateSync(conteudo);
  for (let i = 0; comprimido.at(-1) !== 13 && i < 256; i++) {
    conteudo += 'a'; comprimido = zlib.deflateSync(conteudo);
  }
  assert.equal(comprimido.at(-1), 13);
  const buffer = Buffer.concat([Buffer.from(`1 0 obj\n<< /Type /Page /Contents 2 0 R >>\nendobj\n2 0 obj\n<< /Length ${comprimido.length} /Filter /FlateDecode >>\nstream\n`), comprimido, Buffer.from('\nendstream\nendobj\n')]);
  assert.deepEqual(paginasGravadas(buffer), ['TESTE']);
});
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
function preparar(t, falhar = false, opcoes = {}) {
  const textos = [], imagens = [], fisico = [], registros = [], fotografias = [], paginas = [];
  class Documento extends PDFDocument {
    addPage(...args) { const resultado = super.addPage(...args); paginas.push({ width: this.page.width, height: this.page.height }); return resultado; }
    text(valor, ...args) {
      textos.push(String(valor));
      registros.push({ texto: String(valor), pagina: this._pageBuffer.indexOf(this.page), x: args[0], y: args[1], opcoes: args[2], tamanho: this._fontSize, cor: this.corTeste });
      if (falhar) throw new Error('FALHA_RENDER_SIMULADA'); return super.text(valor, ...args);
    }
    fillColor(cor, ...args) { this.corTeste = cor; return super.fillColor(cor, ...args); }
    image(valor, x, y, dimensoes) {
      fotografias.push({ pagina: this._pageBuffer.indexOf(this.page), x, y, ...dimensoes });
      if (opcoes.falhaImagem && fotografias.length === 1) {
        this.y = 770; // PDFKit pode ter alterado seu cursor antes de falhar.
        throw opcoes.falhaImagem;
      }
      return super.image(valor, x, y, dimensoes);
    }
    openImage(valor) { assert.ok(Buffer.isBuffer(valor), 'imagem precisa vir do buffer autorizado'); imagens.push(valor); return super.openImage(valor); }
  }
  const load = Module._load; delete require.cache[fonte];
  Module._load = function (r, parent, ...args) {
      // Politica RBAC pura; demais imports desconhecidos continuam proibidos.
      if (r === '../utils/permissoes') return politicaRbac723;
    if (parent?.filename === fonte && r === 'pdfkit') return Documento;
    if (parent?.filename === fonte && r === 'fs') return opcoes.fs || new Proxy({}, { get(_o, nome) { return () => { fisico.push(nome); throw new Error('FILESYSTEM_PROIBIDO'); }; } });
    return load.call(this, r, parent, ...args);
  };
  let service;
  try { service = require(fonte); } finally { Module._load = load; }
  t.after(() => { delete require.cache[fonte]; assert.deepEqual(fisico, []); });
  return { service, textos, imagens, registros, fotografias, paginas };
}
function dados() { return {
  id_relatorio: 7, id_local: 40, nome_local: 'LOCAL_EXCLUSIVO_A', nome_campanha: 'CAMPANHA_EXCLUSIVA_A', empresa: 'EMPRESA_A',
  nome_responsavel_tecnico: 'TECNICO_A', crea: 'CREA_A', numero_art: 'ART_A', data_art: '2026-10-18',
  id_checklist: 1, criterio_a: 'SIM', criterio_b: 'SIM', criterio_c: 'NAO', acesso_controlado: 'SIM',
  id_dados: 2, oxigenio: 0, temperatura: 0, observacoes_dados_tecnicos: 'DADOS_A',
  evidencias: [{ id_evidencia: 1, tipo: 'FOTO', caminho_arquivo: 'uploads/evidencias/legada.jpg', descricao: 'LEGENDA_A', latitude: 0, longitude: 0, origem_coordenadas: 'GPS', precisao_gps: 0 }]
}; }
const rotulosCaracterizacao = ['Código de identificação / rastreio', 'Volume do espaço (m³)',
  'Quantidade de aberturas e bocas de visita', 'Dimensões das aberturas e bocas de visita',
  'Formas de acesso e respectivas dimensões', 'Geometria do espaço confinado',
  'Utilização do espaço / produto armazenado', 'Possíveis perigos antes da liberação de entrada'];

for (const a of ['SIM', 'NAO', null]) for (const b of ['SIM', 'NAO', null]) for (const c of ['SIM', 'NAO', null]) {
  test(`indicador PDF usa a mesma função da listagem para ${a}/${b}/${c}`, async t => {
    const s = preparar(t), d = { ...fixture.dados(), criterio_a: a, criterio_b: b, criterio_c: c };
    const antes = structuredClone(d);
    const { espacoConfinado } = await import('../../shared/espacoConfinado.mjs');
    const esperado = espacoConfinado(d);
    const buffer = await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
    const i = s.registros.findIndex(r => r.texto === 'Espaço Confinado?');
    assert.ok(i > 0);
    assert.equal(s.registros[i + 1].texto, esperado.texto.toLocaleUpperCase('pt-BR'));
    assert.equal(s.registros[i + 1].cor, { sim: '#123D28', nao: '#852320', 'nao-avaliado': '#475467' }[esperado.classe]);
    assert.deepEqual(d, antes);
    validarPaginas(s, buffer);
  });
}

test('dependentes aplicáveis imprimem SIM, NÃO e NÃO AVALIADO, sem limpar ou exibir hipótese específica', async t => {
  const s = preparar(t), d = { ...fixture.dados(), criterio_a: 'SIM', criterio_b: 'SIM', criterio_c: 'SIM',
    atmosfera_oxigenio: true, atmosfera_contaminantes: false, atmosfera_explosiva: null, possui_placa_identificacao: false };
  const antes = structuredClone(d);
  const buffer = await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
  const i = s.textos.indexOf('C-1'), fim = s.textos.indexOf('D', s.textos.indexOf('C-1'));
  const respostas = s.textos.slice(i, fim).filter(v => ['SIM', 'NÃO', 'NÃO AVALIADO', 'NÃO APLICÁVEL'].includes(v));
  assert.deepEqual(respostas, ['SIM', 'NÃO', 'NÃO AVALIADO', 'NÃO']);
  assert.doesNotMatch(s.textos.join(''), /Hipótese específica|Engolfamento|Afogamento/);
  assert.deepEqual(d, antes); validarPaginas(s, buffer);
});

test('tabela principal contém A/B/C, C-1/C-2/C-3, placa sem código e D/E/F/G na mesma formatação', async t => {
  const s = preparar(t), d = { ...fixture.dados(), criterio_a: 'SIM', criterio_b: 'SIM', criterio_c: 'SIM',
    atmosfera_oxigenio: true, atmosfera_contaminantes: false, atmosfera_explosiva: null, possui_placa_identificacao: true };
  const buffer = await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
  const inicio = s.registros.findIndex(r => r.texto === 'Critério');
  const fim = s.registros.findIndex(r => r.texto === 'Caracterização do Espaço Confinado');
  const tabela = s.registros.slice(inicio, fim);
  assert.deepEqual(tabela.filter(r => r.x === 36 && /^(?:[A-G]|C-[123]|)$/.test(r.texto)).map(r => r.texto),
    ['A', 'B', 'C', 'C-1', 'C-2', 'C-3', '', 'D', 'E', 'F', 'G']);
  assert.deepEqual(tabela.filter(r => r.x === 92 && r.texto !== 'Descrição').map(r => r.texto),
    ['Não projetado para ocupação humana contínua', 'Meios limitados de entrada/saída', 'Atmosfera perigosa existente OU potencial',
      'Deficiência ou enriquecimento de oxigênio', 'Presença de contaminantes', 'Atmosfera explosiva', 'Possui placa de identificação?',
      'Acesso controlado', 'Ventilação adequada', 'Monitoramento atmosférico', 'Procedimento de emergência']);
  assert.ok(tabela.every(r => r.tamanho === 9));
  assert.ok(tabela.some(r => r.texto === 'NÃO' && r.cor === '#852320'));
  assert.ok(tabela.some(r => r.texto === 'NÃO AVALIADO' && r.cor === '#475467'));
  assert.doesNotMatch(s.textos.join(''), /Detalhamento atmosférico|Sinalização/);
  validarPaginas(s, buffer);
});

for (const especifica of [false, true]) test(`C=NAO preserva atmosfera sem utilizá-la; placa segue aplicabilidade existente, específica=${especifica}`, async t => {
  const s = preparar(t), d = { ...fixture.dados(), atmosfera_oxigenio: true, atmosfera_contaminantes: false,
    atmosfera_explosiva: null, possui_placa_identificacao: true,
    ...(especifica ? { avaliacao_especifica_iniciada: true, nao_destinado_ocupacao_humana: 'SIM', meios_limitados_entrada_saida: 'SIM',
      utilizado_armazenagem: 'SIM', potencial_engolfamento: 'SIM', potencial_afogamento: null } : {}) };
  const buffer = await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
  const i = s.textos.indexOf('C-1'), fim = s.textos.indexOf('D', s.textos.indexOf('C-1'));
  assert.deepEqual(s.textos.slice(i, fim).filter(v => ['SIM', 'NÃO', 'NÃO AVALIADO', 'NÃO APLICÁVEL'].includes(v)),
    ['NÃO APLICÁVEL', 'NÃO APLICÁVEL', 'NÃO APLICÁVEL', especifica ? 'SIM' : 'NÃO AVALIADO']);
  assert.equal(d.atmosfera_oxigenio, true);assert.equal(d.atmosfera_contaminantes, false);
  validarPaginas(s, buffer);
});

test('valores técnicos negativos e potencialmente perigosos não são limitados ou substituídos', async t => {
  const s = preparar(t), d = { ...fixture.dados(), pressao_atmosferica: '-7.25', oxigenio: '99.99',
    gas_inflamavel: '999999.99', monoxido_carbono: '2500.00', sulfeto_hidrogenio: '6500.00', temperatura: '-45.50', umidade: '120.00' };
  await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
  for (const valor of ['-7,25', '99,99', '999.999,99', '2.500,00', '6.500,00', '-45,50', '120,00']) assert.ok(s.textos.includes(valor), valor);
});

for (const id of [null, 1]) test(`histórico sem novos campos e sem respostas ABC: checklist=${id}`, async t => {
  const s = preparar(t), d = { ...fixture.dados(), id_checklist: id, criterio_a: null, criterio_b: null, criterio_c: null };
  const buffer = await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
  const i = s.textos.indexOf('Espaço Confinado?');
  assert.equal(s.textos[i + 1], 'NÃO AVALIADO');
  if (id) {
    const inicio = s.textos.indexOf('C-1'), fim = s.textos.indexOf('D', s.textos.indexOf('C-1'));
    assert.equal(s.textos.slice(inicio, fim).filter(v => v === 'NÃO AVALIADO').length, 4);
  } else assert.ok(s.textos.includes('Checklist não cadastrado para este local.'));
  validarPaginas(s, buffer);
});
function validarPaginas(s, buffer) {
  const paginas = paginasGravadas(buffer);
  assert.deepEqual(s.textos.filter(v => /^Página \d+ de/.test(v)), paginas.map((_, i) => `Página ${i + 1} de ${paginas.length}`));
  for (let i = 0; i < paginas.length; i++) {
    const corpo = s.registros.filter(r => r.pagina === i && r.y >= 119 && r.y < 790);
    assert.ok(corpo.some(r => r.y >= 156), 'cada página deve ter conteúdo, não apenas cabeçalho/título');
    assert.ok(corpo.every(r => r.y + r.tamanho <= 776), 'conteúdo deve respeitar o rodapé');
    const inicio = s.registros.findIndex(r => r.pagina === i && r.texto === 'INVENTÁRIO DE');
    assert.ok(inicio >= 0, 'cabeçalho em cada página');
  }
  return paginas;
}
test('caracterização imprime oito rótulos, valores, volume preciso e zero, na ordem solicitada', async t => {
  const s = preparar(t), d = { ...fixture.dados(), ...fixture.caracterizacao() };
  const buffer = await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
  const inicio = s.registros.findIndex(r => r.texto === 'Caracterização do Espaço Confinado');
  const fim = s.registros.findIndex((r, i) => i > inicio && r.texto === 'Observações');
  assert.ok(inicio > s.registros.findIndex(r => r.texto === 'Procedimento de emergência'));
  const bloco = s.registros.slice(inicio, fim).map(r => r.texto).join('').replace(/\s/g, '');
  for (const r of rotulosCaracterizacao) assert.ok(bloco.includes(r.replace(/\s/g, '')), r);
  for (const v of ['EC-SINTETICO-025', '125,123456', '0', 'BM-01: circular, 600 mm', 'BM-02: retangular, 800 x 600 mm',
    'Escada fixa: 3 m', 'Entrada superior: 600 mm', 'Cilíndrico vertical', 'Água de processo', 'Risco de queda na entrada.']) {
    assert.ok(bloco.includes(v.replace(/\s/g, '')), v);
  }
  assert.doesNotMatch(bloco, /Item[ABCDG]/);
  const titulo = s.registros[inicio], primeiro = s.registros[inicio + 1];
  assert.equal(titulo.pagina, primeiro.pagina, 'título permanece com a primeira linha');
  validarPaginas(s, buffer);
});
for (const vazio of [undefined, null, '']) test(`caracterização antiga/ausente: ${String(vazio)}`, async t => {
  const s = preparar(t), d = fixture.dados();
  for (const campo of Object.keys(fixture.caracterizacao())) d[campo] = vazio;
  const buffer = await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
  const inicio = s.registros.findIndex(r => r.texto === 'Caracterização do Espaço Confinado');
  const fim = s.registros.findIndex((r, i) => i > inicio && r.texto === 'Observações');
  assert.equal(s.registros.slice(inicio, fim).filter(r => r.texto === 'Não informado').length, 8);
  validarPaginas(s, buffer);
});
test('volume máximo NUMERIC(18,6) conserva a precisão sem conversão para ponto flutuante', async t => {
  const s = preparar(t), d = { ...fixture.dados(), volume_m3: '999999999999.999999', quantidade_aberturas: 0 };
  await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
  assert.ok(s.textos.includes('999.999.999.999,999999'));
  assert.ok(s.textos.includes('0'));
});
test('caracterização extensa e multilinha continua sem perdas, páginas vazias ou sobreposição', async t => {
  const s = preparar(t), d = { ...fixture.dados(), ...fixture.caracterizacao() };
  for (const campo of ['dimensoes_aberturas', 'formas_acesso', 'geometria', 'utilizacao_produto', 'perigos_antes_liberacao']) {
    d[campo] = `${campo}_INICIO\n` + 'ÁÇã'.repeat(campo === 'geometria' ? 500 : 1500) + `\n${campo}_FIM`;
  }
  const buffer = await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
  const paginas = validarPaginas(s, buffer);
  assert.ok(paginas.length > 5);
  assert.ok(s.textos.some(v => v.includes('Caracterização do Espaço Confinado (continuação)')));
  const inicio = s.registros.findIndex(r => r.texto === 'Caracterização do Espaço Confinado');
  const fim = s.registros.findIndex((r, i) => i > inicio && r.texto === 'Observações');
  const prosa = s.registros.slice(inicio, fim).filter(r => r.x === 36 && r.tamanho === 9).map(r => r.texto).join('').replace(/\s/g, '');
  for (const campo of ['dimensoes_aberturas', 'formas_acesso', 'geometria', 'utilizacao_produto', 'perigos_antes_liberacao']) {
    assert.ok(prosa.includes(d[campo].replace(/\s/g, '')), `texto integral de ${campo}`);
  }
  const textos = paginas.join('').replace(/\s/g, '');
  const titulos = ['1. Dados da Campanha', '2. Identificação do Local', '3. Checklist NR-33', '4. Dados Técnicos', '5. Evidências', '6. Identificação e Responsabilidade'];
  let anterior = -1;
  for (const titulo of titulos) { const posicao = textos.indexOf(titulo.replace(/\s/g, '')); assert.ok(posicao > anterior); anterior = posicao; }
  const responsabilidade = s.registros.findIndex(r => r.texto === '6. Identificação e Responsabilidade');
  assert.equal(new Set(s.registros.slice(responsabilidade).filter(r => r.y >= 119 && r.y < 776).map(r => r.pagina)).size, 1);
});
for (const quantidade of [0, 1, 3]) {
  test(`ordem e numeração nos bytes do PDF com ${quantidade} evidências preservam responsabilidade`, async t => {
    const s = preparar(t), d = fixture.dados();
    Object.assign(d, { responsavel: 'USUARIO_TESTE', email_responsavel: 'pdf@example.invalid', perfil_responsavel: 'ADMINISTRADOR', nome_responsavel_tecnico: 'TECNICO_TESTE', crea: 'CREA_TESTE', numero_art: 'ART_TESTE' });
    d.evidencias = Array.from({ length: quantidade }, (_, i) => ({ ...d.evidencias[0], id_evidencia: i + 1, descricao: `EVIDENCIA_FINAL_${i}` }));
    const buffer = await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
    const texto = paginasGravadas(buffer).join('').replace(/\s/g, '');
    const titulos = ['1. Dados da Campanha', '2. Identificação do Local', '3. Checklist NR-33', '4. Dados Técnicos', '5. Evidências', '6. Identificação e Responsabilidade'];
    let anterior = -1;
    for (const titulo of titulos) {
      const posicao = texto.indexOf(titulo.replace(/\s/g, ''));
      assert.ok(posicao > anterior, titulo); anterior = posicao;
    }
    for (const valor of [d.responsavel, d.email_responsavel, d.perfil_responsavel, d.nome_responsavel_tecnico, d.crea, d.numero_art]) {
      assert.ok(texto.slice(anterior).includes(valor.replace(/\s/g, '')), valor);
    }
    if (quantidade) assert.ok(texto.indexOf(`EVIDENCIA_FINAL_${quantidade - 1}`) < anterior);
    else assert.ok(texto.indexOf('Nenhumaevidênciacadastrada.') < anterior);
  });
}
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

test('layout usual tem cinco páginas A4, seções separadas e rodapés exatos', async t => {
  const s = preparar(t), d = fixture.dados();
  const buffer = await s.service.gerarPdfRelatorio(d, { somenteBuffer: true, imagens: new Map([[1, fixture.imagem(900, 520)]]) });
  assert.equal(paginasGravadas(buffer).length, 5);
  const pagina = inicio => s.registros.find(r => r.texto.startsWith(inicio)).pagina;
  assert.equal(pagina('1. Dados da Campanha'), 0);
  assert.equal(pagina('2. Identificação do Local'), 0);
  assert.equal(pagina('3. Checklist'), 1);
  assert.equal(pagina('4. Dados Técnicos'), 2);
  assert.equal(pagina('Pressão atmosférica'), pagina('4. Dados Técnicos'), 'título acompanhado pelo primeiro cartão');
  assert.equal(pagina('5. Evidências'), 3);
  assert.equal(pagina('6. Identificação e Responsabilidade'), 4);
  const inicioResponsabilidade = s.registros.findIndex(r => r.texto === '6. Identificação e Responsabilidade');
  assert.ok(s.registros.slice(inicioResponsabilidade).filter(r => r.y >= 119 && r.y < 776).every(r => r.pagina === 4));
  assert.deepEqual(s.textos.filter(v => /^Página \d+ de/.test(v)), Array.from({ length: 5 }, (_, i) => `Página ${i + 1} de 5`));
  assert.equal(s.textos.filter(v => v === 'INVENTÁRIO DE').length, 10);
  assert.equal(s.paginas.length, 5);
  assert.ok(s.paginas.every(p => Math.abs(p.width - 595.28) < .01 && Math.abs(p.height - 841.89) < .01));
  assert.ok(s.fotografias.every(r => r.pagina >= 2));
  assert.ok(s.textos.includes('RASCUNHO'), 'não altera o status recebido');
  assert.ok(s.textos.includes('Não informado'), 'emissão ausente preservada');
});

test('textos maiores que uma página e palavras extensas são preservados sem invadir rodapé', async t => {
  const s = preparar(t), d = fixture.dados();
  const longo = 'INÍCIO_' + 'áÇã'.repeat(4000) + '_FIM';
  d.descricao_local = longo; d.observacoes_checklist = longo; d.observacoes_dados_tecnicos = longo; d.evidencias[0].descricao = longo;
  await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
  // Cabeçalhos de continuação intercalam os fragmentos; a prosa extensa pode
  // aproveitar a largura completa sem perder caracteres entre páginas.
  const unido = s.registros.filter(r => /^[INÍCIO_áÇãFM]+$/.test(r.texto)).map(r => r.texto).join('');
  assert.equal(unido.split(longo).length - 1, 4);
  const rodapes = s.textos.filter(v => /^Página \d+ de/.test(v));
  assert.ok(rodapes.length > 3);
  assert.ok(rodapes.every((v, i) => v === `Página ${i + 1} de ${rodapes.length}`));
  for (const r of s.registros.filter(r => r.y >= 119 && r.y < 790)) {
    assert.ok(r.y + r.tamanho <= 776, `texto fora da área útil: ${r.y}`);
  }
});

for (const quantidade of [0, 1, 3]) test(`responsabilidade fica agrupada com ${quantidade} fotografias`, async t => {
  const s = preparar(t), d = fixture.dados();
  d.evidencias = Array.from({ length: quantidade }, (_, i) => ({ ...d.evidencias[0], id_evidencia: i + 1 }));
  const imagem = fixture.imagem(1000, 600);
  const buffer = await s.service.gerarPdfRelatorio(d, { somenteBuffer: true, imagens: new Map(d.evidencias.map(e => [e.id_evidencia, imagem])) });
  const inicio = s.registros.findIndex(r => r.texto === '6. Identificação e Responsabilidade');
  const corpo = s.registros.slice(inicio).filter(r => r.y >= 119 && r.y < 790);
  assert.equal(new Set(corpo.map(r => r.pagina)).size, 1);
  assert.ok(corpo.some(r => r.texto === 'E-mail'));
  assert.ok(corpo.some(r => r.texto === 'Perfil'));
  assert.ok(corpo.every(r => r.y + r.tamanho <= 776));
  const total = paginasGravadas(buffer).length;
  assert.deepEqual(s.textos.filter(v => /^Página \d+ de/.test(v)), Array.from({ length: total }, (_, i) => `Página ${i + 1} de ${total}`));
  assert.equal(s.textos.filter(v => v === 'INVENTÁRIO DE').length, total * 2);
  assert.ok(s.fotografias.every(f => Math.abs(f.width - 539.28) < .001 && Math.abs(f.height - 323.568) < .001));
  if (!quantidade) assert.equal(total, 4, 'sem evidências não cria página adicional');
});

for (const linhas of [0, 1, 2, 4, 8]) test(`seção 6 reserva sua altura real junto ao limite: ${linhas} linhas extras`, async t => {
  const s = preparar(t), d = fixture.dados();
  Object.assign(d, { responsavel: 'USUARIO', nome_responsavel_tecnico: 'TECNICO', email_responsavel: 'pdf@example.invalid' });
  d.evidencias[0].descricao = 'Descrição' + '\nLinha'.repeat(linhas);
  const buffer = await s.service.gerarPdfRelatorio(d, { somenteBuffer: true, imagens: new Map([[1, fixture.imagem(1000, 600)]]) });
  const inicio = s.registros.findIndex(r => r.texto === '6. Identificação e Responsabilidade');
  const titulo = s.registros[inicio];
  const corpo = s.registros.slice(inicio).filter(r => r.y >= 119 && r.y < 790);
  const fimEvidencia = s.registros.slice(0, inicio).findLast(r => r.texto === 'Registro da evidência');
  // O rótulo começa 5 pontos abaixo da linha; restam 16 de linha e 9 de intervalo.
  const inicioDisponivel = fimEvidencia.y + 25;
  const altura = 37 + 6 * 21;
  assert.equal(titulo.pagina, fimEvidencia.pagina + (inicioDisponivel + altura > 776 ? 1 : 0));
  assert.ok(corpo.every(r => r.pagina === titulo.pagina && r.y + r.tamanho <= 776));
  assert.equal(paginasGravadas(buffer).length, titulo.pagina + 1);
  assert.equal(s.textos.filter(v => v.startsWith('6. Identificação')).length, 1, 'não cria continuação residual');
});

test('cabeçalho da tabela é repetido em continuação com respostas extensas', async t => {
  const s = preparar(t), d = fixture.dados();
  d.procedimento_emergencia = 'ZYXW'.repeat(4000);
  await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
  assert.ok(s.textos.filter(v => v === 'Critério').length > 1);
  assert.equal(s.textos.filter(v => v === 'Critério').length, s.textos.filter(v => v === 'Atende').length);
  assert.equal(s.registros.filter(r => r.x > 470 && /^[ZYXW]+$/.test(r.texto)).map(r => r.texto).join(''), d.procedimento_emergencia);
});

test('múltiplas imagens horizontais e verticais conservam proporção e só entram nas evidências', async t => {
  const s = preparar(t), d = fixture.dados();
  d.evidencias.push({ ...d.evidencias[0], id_evidencia: 2, descricao: 'Segunda evidência vertical' });
  await s.service.gerarPdfRelatorio(d, { somenteBuffer: true, imagens: new Map([[1, fixture.imagem(900, 520)], [2, fixture.imagem(320, 800)]]) });
  assert.equal(s.fotografias.length, 2);
  for (const [i, proporcao] of [900 / 520, 320 / 800].entries()) {
    const f = s.fotografias[i];
    assert.ok(Math.abs(f.width / f.height - proporcao) < 0.0001);
    assert.ok(f.pagina >= 2 && f.width <= 540 && f.height <= 345 && f.y + f.height < 776);
  }
  assert.ok(s.textos.includes('EVIDÊNCIA 02 • ID 2'));
});

test('zeros, acentos, unidades e GPS são preservados; fórmulas usam subscritos locais', async t => {
  const s = preparar(t), d = fixture.dados();
  for (const k of ['pressao_atmosferica', 'oxigenio', 'gas_inflamavel', 'monoxido_carbono', 'sulfeto_hidrogenio', 'temperatura', 'umidade']) d[k] = 0;
  d.observacoes_dados_tecnicos = 'Atenção: ventilação, oxigênio, pressão e manutenção.';
  await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
  for (const valor of ['0,00', '0,0000000', '0,00 m', d.observacoes_dados_tecnicos, 'Captura GPS', 'Registro da evidência']) assert.ok(s.textos.includes(valor), valor);
  assert.equal(s.textos.includes('0,00 %'), false);
  assert.equal(s.textos.includes('0,00 °C'), false);
  assert.ok(s.registros.some(r => r.texto === '2' && r.tamanho === 7));
  assert.doesNotMatch(s.textos.join(''), /uploads\/|hash_pdf|hash_sha256|Liberado para entrada/);
});

test('responsabilidade, campanha e ventilação extensas não são truncadas', async t => {
  const s = preparar(t), d = fixture.dados(), valor = 'ZYXW'.repeat(3000);
  d.nome_responsavel_tecnico = valor; d.nome_campanha = valor; d.ventilacao = valor;
  await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
  assert.equal(s.textos.filter(v => /^[ZYXW]+$/.test(v)).join(''), valor.repeat(3));
  assert.ok(s.registros.filter(r => /^[ZYXW]+$/.test(r.texto)).every(r => r.y >= 119 && r.y + r.tamanho < 776));
});

test('imagem inválida mantém descrição e GPS sem expor referências de armazenamento', async t => {
  const s = preparar(t), d = fixture.dados();
  d.evidencias[0].caminho_arquivo = 'uploads/evidencias/NAO_EXIBIR.png';
  await s.service.gerarPdfRelatorio(d, { somenteBuffer: true, imagens: new Map([[1, Buffer.from('NAO_E_IMAGEM')]]) });
  assert.ok(s.textos.includes('Não foi possível inserir esta imagem no relatório.'));
  assert.ok(s.textos.includes('GPS'));
  assert.doesNotMatch(s.textos.join(''), /NAO_EXIBIR|uploads\/|NAO_E_IMAGEM/);
});

test('GPS parcial mantém os metadados disponíveis mesmo sem o par de coordenadas', async t => {
  const s = preparar(t), d = fixture.dados();
  d.evidencias[0].latitude = null; d.evidencias[0].longitude = null;
  await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
  for (const valor of ['Não informada', 'GPS', '0,00 m', 'Captura GPS']) assert.ok(s.textos.includes(valor), valor);
});

test('amostra extensa aproveita páginas sem separar observações técnicas ou deixar uma data isolada', async t => {
  const s = preparar(t), d = fixture.dados();
  d.evidencias.push({ ...d.evidencias[0], id_evidencia: 2, descricao: 'Ilustração sintética vertical.\n' + 'Observação extensa de homologação. '.repeat(180) });
  d.observacoes_checklist = 'Observações completas preservadas. '.repeat(160);
  const buffer = await s.service.gerarPdfRelatorio(d, { somenteBuffer: true, imagens: new Map([[1, fixture.imagem(1000, 600)], [2, fixture.imagem(400, 800)]]) });
  const gravadas = paginasGravadas(buffer);
  assert.equal(gravadas.length, 8, 'conta as páginas efetivamente gravadas no PDF');
  const ultima = gravadas[6].replace(/\s/g, '');
  for (const metadado of ['Localização da evidência', 'Latitude', 'Longitude', 'Origem das coordenadas', 'Precisão estimada', 'Captura GPS', 'Registro da evidência']) {
    assert.ok(ultima.includes(metadado.replace(/\s/g, '')), `${metadado} deve estar nos bytes da página 7`);
  }
  assert.equal(s.paginas.length, 8, 'responsabilidade ao final usa uma nova página');
  const fimCartoes = s.registros.findIndex(r => r.texto === 'Umidade');
  const observacoesTecnicas = s.registros.findIndex((r, i) => i > fimCartoes && r.texto === 'Observações');
  const statusTecnico = s.registros.findIndex((r, i) => i > observacoesTecnicas && r.texto === 'Status');
  assert.equal(s.registros[fimCartoes].pagina, 3);
  assert.equal(s.registros[observacoesTecnicas].pagina, s.registros[fimCartoes].pagina);
  assert.equal(s.registros[statusTecnico].pagina, s.registros[fimCartoes].pagina);
  const inicioObservacoes = s.registros.findIndex(r => r.texto === 'Observações');
  const fimObservacoes = s.registros.findIndex((r, i) => i > inicioObservacoes && r.texto === 'Status');
  const inicioDescricao = s.registros.findIndex(r => r.texto === 'Ilustração sintética vertical.');
  const fimDescricao = s.registros.findIndex((r, i) => i > inicioDescricao && r.texto.startsWith('Localização da'));
  const prosa = registros => registros.filter(r => r.x === 36 && r.tamanho === 9).map(r => r.texto).join('').replace(/\s/g, '');
  assert.equal(prosa(s.registros.slice(inicioObservacoes + 1, fimObservacoes)), d.observacoes_checklist.replace(/\s/g, ''));
  assert.equal(prosa(s.registros.slice(inicioDescricao, fimDescricao)), d.evidencias[1].descricao.replace(/\s/g, ''));
  const registro = s.registros.findLast(r => r.texto.startsWith('Registro da'));
  assert.equal(registro.pagina, 6);
  assert.ok(s.registros.some(r => r.pagina === registro.pagina && r.texto.includes('Observação extensa')));
  assert.equal(s.textos.filter(v => v === '0,00 m').length, 2);
  assert.equal(s.textos.filter(v => v === 'Captura GPS').length, 2);
  for (const [i, [w, h]] of [[539.28, 323.568], [172.5, 345]].entries()) {
    assert.ok(Math.abs(s.fotografias[i].width - w) < .001 && Math.abs(s.fotografias[i].height - h) < .001);
  }
  assert.ok(s.registros.filter(r => r.y >= 119 && r.y < 790).every(r => r.y + r.tamanho <= 776));
  assert.ok(s.registros.filter(r => r.x === 36 && r.texto.startsWith('Observação extensa')).every(r => r.tamanho === 9));
  assert.deepEqual(s.textos.filter(v => /^Página \d+ de/.test(v)), Array.from({ length: 8 }, (_, i) => `Página ${i + 1} de 8`));
});

test('falha síncrona em doc.image preserva a evidência e permite renderizar a seguinte sem páginas vazias', async t => {
  const falha = new Error('DETALHE_INTERNO_NAO_PUBLICAR');
  const s = preparar(t, false, { falhaImagem: falha }), d = fixture.dados();
  d.evidencias[0].descricao = 'PRIMEIRA_DESCRICAO';
  d.evidencias.push({ ...d.evidencias[0], id_evidencia: 2, descricao: 'SEGUNDA_DESCRICAO' });
  const buffer = await s.service.gerarPdfRelatorio(d, { somenteBuffer: true, imagens: new Map([[1, png], [2, png]]) });
  assert.equal(paginasGravadas(buffer).length, 6);
  assert.equal(s.fotografias.length, 2, 'continua até a próxima fotografia');
  for (const valor of ['Não foi possível inserir esta imagem no relatório.', 'PRIMEIRA_DESCRICAO', 'SEGUNDA_DESCRICAO']) assert.ok(s.textos.includes(valor), valor);
  const textosEvidencias = s.registros.filter(r => r.pagina >= 2).map(r => r.texto);
  for (const valor of ['Latitude', 'Longitude', 'GPS', '0,00 m', 'Captura GPS', 'Registro da evidência']) assert.equal(textosEvidencias.filter(v => v === valor).length, 2, valor);
  assert.doesNotMatch(s.textos.join(''), /DETALHE_INTERNO_NAO_PUBLICAR/);
  assert.ok(s.registros.filter(r => r.y >= 119 && r.y < 790).every(r => r.y + r.tamanho <= 776));
  for (let pagina = 0; pagina < s.paginas.length; pagina++) {
    assert.ok(s.registros.some(r => r.pagina === pagina && r.y >= 156 && r.y < 776), 'página contém conteúdo além do cabeçalho');
  }
});

function fsLegadoFixture({ ausente, invalida, falhaLeitura, falhaPersistencia, falhaDiretorio } = {}) {
  const leituras = [], consultas = [], escritas = [];
  return { leituras, consultas, escritas,
    existsSync(caminho) { consultas.push(caminho); return !(ausente && caminho.endsWith('falha.png')); },
    readFileSync(caminho) {
      leituras.push(caminho);
      if (caminho.endsWith('falha.png')) {
        if (falhaLeitura) throw falhaLeitura;
        if (invalida) return Buffer.from('NAO_E_IMAGEM');
      }
      return png;
    },
    mkdirSync() { if (falhaDiretorio) throw falhaDiretorio; },
    writeFileSync(caminho, buffer, opcoes) {
      assert.equal(opcoes.flag, 'wx');
      if (falhaPersistencia) throw falhaPersistencia;
      escritas.push({ caminho, buffer: Buffer.from(buffer) });
    },
  };
}
for (const caso of ['ausente', 'ENOENT', 'EACCES', 'EPERM', 'EISDIR', 'EIO', 'ENOTDIR', 'invalida']) {
  test(`foto legada ${caso}: falha individual não impede PDF, metadados ou próxima evidência`, async t => {
    const fs = fsLegadoFixture({ ausente: caso === 'ausente', invalida: caso === 'invalida',
      falhaLeitura: !['ausente', 'invalida'].includes(caso) ? Object.assign(new Error('CAMINHO_INTERNO_NAO_PUBLICAR'), { code: caso }) : null });
    const s = preparar(t, false, { fs }), d = fixture.dados();
    d.evidencias[0].descricao = 'PRIMEIRA_DESCRICAO';
    d.evidencias[0].caminho_arquivo = 'uploads/evidencias/falha.png';
    d.evidencias.push({ ...d.evidencias[0], id_evidencia: 2, caminho_arquivo: 'uploads/evidencias/valida.png', descricao: 'SEGUNDA_DESCRICAO' });
    const resultado = await s.service.gerarPdfRelatorio(d);
    assert.equal(fs.escritas.length, 1);
    assert.equal(paginasGravadas(fs.escritas[0].buffer).length, 6);
    assert.equal(resultado.hash, require('node:crypto').createHash('sha256').update(fs.escritas[0].buffer).digest('hex'));
    assert.equal(s.fotografias.length, 1, 'somente a segunda fotografia foi inserida');
    for (const valor of ['PRIMEIRA_DESCRICAO', 'SEGUNDA_DESCRICAO']) assert.ok(s.textos.includes(valor));
    for (const valor of ['GPS', '0,00 m', 'Captura GPS', 'Registro da evidência']) assert.equal(s.textos.filter(v => v === valor).length, 2);
    assert.ok(s.textos.some(v => v.includes(caso === 'invalida' ? 'Não foi possível inserir' : 'indisponível')));
    assert.doesNotMatch(s.textos.join(''), /uploads[\/\\]|CAMINHO_INTERNO_NAO_PUBLICAR|NAO_E_IMAGEM/);
    if (caso === 'ausente') assert.equal(fs.leituras.some(c => c.endsWith('falha.png')), false);
  });
}

for (const statusCode of [403, 404]) test(`erro de autorização/isolamento ${statusCode} não vira imagem indisponível`, async t => {
  const falha = Object.assign(new Error('RECUSA_SINTETICA'), { code: 'EACCES', statusCode });
  const fs = fsLegadoFixture({ falhaLeitura: falha }), s = preparar(t, false, { fs }), d = fixture.dados();
  d.evidencias[0].caminho_arquivo = 'uploads/evidencias/falha.png';
  await assert.rejects(s.service.gerarPdfRelatorio(d), e => e === falha);
  assert.equal(fs.escritas.length, 0);
});

test('erro inesperado na leitura legada não é ocultado', async t => {
  const falha = new TypeError('ERRO_INESPERADO_SINTETICO');
  const fs = fsLegadoFixture({ falhaLeitura: falha }), s = preparar(t, false, { fs }), d = fixture.dados();
  d.evidencias[0].caminho_arquivo = 'uploads/evidencias/falha.png';
  await assert.rejects(s.service.gerarPdfRelatorio(d), e => e === falha);
  assert.equal(fs.escritas.length, 0);
});

for (const etapa of ['falhaPersistencia', 'falhaDiretorio']) test(`${etapa} propaga mesmo após recuperar falha de foto legada`, async t => {
  const falha = Object.assign(new Error('FALHA_PERSISTENCIA_SINTETICA'), { code: 'EACCES' });
  const fs = fsLegadoFixture({ falhaLeitura: Object.assign(new Error(), { code: 'ENOENT' }), [etapa]: falha });
  const s = preparar(t, false, { fs }), d = fixture.dados();
  d.evidencias[0].caminho_arquivo = 'uploads/evidencias/falha.png';
  await assert.rejects(s.service.gerarPdfRelatorio(d), e => e === falha);
  assert.equal(fs.escritas.length, 0);
});

test('tratamento legado mantém bloqueio de caminhos externos, tipos e extensões não permitidos', async t => {
  const fs = fsLegadoFixture(), s = preparar(t, false, { fs }), d = fixture.dados();
  d.evidencias = ['../fora.png', 'uploads/../../fora.png', 'uploads/evidencias/imagem.svg', 'uploads/evidencias/imagem.pdf'].map((caminho_arquivo, i) => ({ id_evidencia: i + 1, tipo: 'FOTO', descricao: 'DESCRICAO_PRESERVADA', caminho_arquivo }));
  d.evidencias.push({ id_evidencia: 5, tipo: 'DOCUMENTO', caminho_arquivo: 'uploads/evidencias/documento.png' });
  await s.service.gerarPdfRelatorio(d);
  assert.deepEqual(fs.consultas, []);
  assert.deepEqual(fs.leituras, []);
  assert.equal(fs.escritas.length, 1);
});
