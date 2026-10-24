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
      registros.push({ texto: String(valor), pagina: this._pageBuffer.indexOf(this.page), x: args[0], y: args[1], opcoes: args[2], tamanho: this._fontSize });
      if (falhar) throw new Error('FALHA_RENDER_SIMULADA'); return super.text(valor, ...args);
    }
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

test('layout usual tem três páginas A4, seções separadas e rodapés exatos', async t => {
  const s = preparar(t), d = fixture.dados();
  const buffer = await s.service.gerarPdfRelatorio(d, { somenteBuffer: true, imagens: new Map([[1, fixture.imagem(900, 520)]]) });
  assert.equal(paginasGravadas(buffer).length, 3);
  const pagina = inicio => s.registros.find(r => r.texto.startsWith(inicio)).pagina;
  assert.equal(pagina('1. Identificação'), 0);
  assert.equal(pagina('4. Checklist'), 1);
  assert.equal(pagina('5. Dados Técnicos'), 1);
  assert.equal(pagina('6. Evidências'), 2);
  assert.deepEqual(s.textos.filter(v => /^Página \d+ de/.test(v)), ['Página 1 de 3', 'Página 2 de 3', 'Página 3 de 3']);
  assert.equal(s.textos.filter(v => v === 'INVENTÁRIO DE').length, 6);
  assert.equal(s.paginas.length, 3);
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

test('cabeçalho da tabela é repetido em continuação com respostas extensas', async t => {
  const s = preparar(t), d = fixture.dados();
  d.criterio_a = 'ZYXW'.repeat(4000);
  await s.service.gerarPdfRelatorio(d, { somenteBuffer: true });
  assert.ok(s.textos.filter(v => v === 'Critério').length > 1);
  assert.equal(s.textos.filter(v => v === 'Critério').length, s.textos.filter(v => v === 'Atende').length);
  assert.equal(s.registros.filter(r => r.x > 470 && /^[ZYXW]+$/.test(r.texto)).map(r => r.texto).join(''), d.criterio_a);
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
  for (const valor of ['0,00', '0,00 %', '0,00 °C', '0,0000000', '0,00 m', d.observacoes_dados_tecnicos, 'Captura GPS', 'Registro da evidência']) assert.ok(s.textos.includes(valor), valor);
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
  assert.equal(gravadas.length, 6, 'conta as páginas efetivamente gravadas no PDF');
  const ultima = gravadas.at(-1).replace(/\s/g, '');
  for (const metadado of ['Localização da evidência', 'Latitude', 'Longitude', 'Origem das coordenadas', 'Precisão estimada', 'Captura GPS', 'Registro da evidência']) {
    assert.ok(ultima.includes(metadado.replace(/\s/g, '')), `${metadado} deve estar nos bytes da página 6`);
  }
  assert.equal(s.paginas.length, 6, 'amostra anterior tinha oito páginas');
  const fimCartoes = s.registros.findIndex(r => r.texto === 'Umidade');
  const observacoesTecnicas = s.registros.findIndex((r, i) => i > fimCartoes && r.texto === 'Observações');
  const statusTecnico = s.registros.findIndex((r, i) => i > observacoesTecnicas && r.texto === 'Status');
  assert.equal(s.registros[fimCartoes].pagina, 2);
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
  assert.equal(registro.pagina, 5);
  assert.ok(s.registros.some(r => r.pagina === registro.pagina && r.texto.includes('Observação extensa')));
  assert.equal(s.textos.filter(v => v === '0,00 m').length, 2);
  assert.equal(s.textos.filter(v => v === 'Captura GPS').length, 2);
  for (const [i, [w, h]] of [[539.28, 323.568], [172.5, 345]].entries()) {
    assert.ok(Math.abs(s.fotografias[i].width - w) < .001 && Math.abs(s.fotografias[i].height - h) < .001);
  }
  assert.ok(s.registros.filter(r => r.y >= 119 && r.y < 790).every(r => r.y + r.tamanho <= 776));
  assert.ok(s.registros.filter(r => r.x === 36 && r.texto.startsWith('Observação extensa')).every(r => r.tamanho === 9));
  assert.deepEqual(s.textos.filter(v => /^Página \d+ de/.test(v)), Array.from({ length: 6 }, (_, i) => `Página ${i + 1} de 6`));
});

test('falha síncrona em doc.image preserva a evidência e permite renderizar a seguinte sem páginas vazias', async t => {
  const falha = new Error('DETALHE_INTERNO_NAO_PUBLICAR');
  const s = preparar(t, false, { falhaImagem: falha }), d = fixture.dados();
  d.evidencias[0].descricao = 'PRIMEIRA_DESCRICAO';
  d.evidencias.push({ ...d.evidencias[0], id_evidencia: 2, descricao: 'SEGUNDA_DESCRICAO' });
  const buffer = await s.service.gerarPdfRelatorio(d, { somenteBuffer: true, imagens: new Map([[1, png], [2, png]]) });
  assert.equal(paginasGravadas(buffer).length, 4);
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
    assert.equal(paginasGravadas(fs.escritas[0].buffer).length, 4);
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
