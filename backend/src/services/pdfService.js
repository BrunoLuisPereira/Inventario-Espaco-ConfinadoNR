const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Recursos visuais vetoriais locais. No fluxo multi-tenant somente os buffers
// previamente autorizados podem fornecer fotografias.
const C = { navy: '#073451', blue: '#07517B', yellow: '#FFCD16', ink: '#102C46',
  line: '#D6E0E9', pale: '#EFF4F8', white: '#FFFFFF' };
const M = 28, TOP = 119, BOTTOM = 776, LINE = 11;
const presente = v => v !== null && v !== undefined && v !== '';
const texto = v => presente(v) ? String(v) : 'Não informado';
function numero(v, casas = 2) {
  return presente(v) && Number.isFinite(Number(v))
    ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) : texto(v);
}
function data(v, hora = false) {
  if (!presente(v)) return 'Não informado';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : hora ? d.toLocaleString('pt-BR') : d.toLocaleDateString('pt-BR');
}
function corStatus(v) {
  const s = String(v).toUpperCase();
  if (['SIM', 'ATIVO', 'CONCLUIDO', 'CONCLUÍDO', 'GERADO'].includes(s)) return ['#C7F1D2', '#123D28'];
  if (['NAO', 'NÃO', 'INATIVO', 'INATIVA', 'CANCELADO'].includes(s)) return ['#FFD5D2', '#852320'];
  if (s === 'RASCUNHO') return [C.yellow, C.ink];
  if (['EM ANDAMENTO', 'EM_ANDAMENTO'].includes(s)) return ['#D0EDFF', C.blue];
  return [C.pale, C.ink];
}
function capacete(doc, x, y, escala = 1) {
  doc.save().translate(x, y).scale(escala).fillColor(C.yellow);
  doc.path('M 2 28 C 2 12 10 5 20 5 L 20 1 L 27 1 L 27 5 C 39 7 44 16 44 28 Z').fill();
  doc.roundedRect(0, 28, 47, 5, 2).fill();
  doc.lineWidth(3).strokeColor(C.yellow).path('M 9 35 L 9 41 Q 23 47 38 41 L 38 35').stroke();
  doc.strokeColor(C.navy).lineWidth(2).moveTo(17, 8).lineTo(17, 20).moveTo(30, 8).lineTo(30, 20).stroke();
  doc.restore();
}
class Layout {
  constructor(doc, dados) { this.doc = doc; this.dados = dados; this.w = doc.page.width - 2 * M; this.y = TOP; this.cabecalho(); }
  escrever(s, x, y, largura, { bold = false, size = 9, color = C.ink, align = 'left' } = {}) {
    this.doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color)
      .text(String(s), x, y, { width: largura, height: Math.max(LINE + 3, size * 1.3), lineBreak: false, align });
  }
  // Quebra explícita inclusive de palavras extensas: nenhuma página é criada
  // automaticamente pelo texto, sem os elementos de continuação.
  linhas(valor, largura, bold = false, size = 9) {
    this.doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
    const linhas = [];
    for (const paragrafo of (valor === '' ? '' : texto(valor)).split(/\r\n|\n|\r/)) {
      let linha = '';
      for (const caractere of paragrafo) {
        if (linha && this.doc.widthOfString(linha + caractere) > largura) {
          const espaco = linha.lastIndexOf(' ');
          if (espaco > 0) { linhas.push(linha.slice(0, espaco)); linha = linha.slice(espaco + 1) + caractere; }
          else { linhas.push(linha); linha = caractere; }
        } else linha += caractere;
      }
      linhas.push(linha);
    }
    return linhas;
  }
  cabecalho() {
    const d = this.doc;
    d.save();
    d.roundedRect(M, 18, this.w, 87, 5).fill(C.yellow);
    const gradiente = d.linearGradient(M, 18, M + this.w, 95).stop(0, C.blue).stop(1, '#041D36');
    d.roundedRect(M, 16, this.w, 86, 5).fill(gradiente);
    // Silhueta industrial discreta, sem fotografia ou serviço externo.
    d.save().fillOpacity(0.10).fillColor(C.white);
    for (let i = 0; i < 4; i++) d.rect(340 + i * 25, 53 - i * 5, 20, 49 + i * 5).fill();
    d.restore();
    capacete(d, M + 13, 33, 0.88);
    this.escrever('INVENTÁRIO DE', M + 70, 29, 330, { bold: true, size: 19, color: C.white });
    this.escrever('ESPAÇOS CONFINADOS', M + 70, 52, 345, { bold: true, size: 19, color: C.yellow });
    this.escrever('Relatório Técnico • NR-33', M + 70, 78, 310, { size: 12, color: C.white });
    d.strokeColor('#9BB4C8').lineWidth(0.6).moveTo(470, 29).lineTo(470, 88).stroke();
    this.escrever('Relatório nº', 477, 27, 85, { size: 9, color: C.white, align: 'center' });
    const id = texto(this.dados.id_relatorio);
    this.escrever(id, 475, 44, 88, { bold: true, size: Math.min(25, 130 / id.length), color: C.white, align: 'center' });
    const status = texto(this.dados.status_relatorio);
    d.roundedRect(477, 77, 82, 17, 3).fill(corStatus(status)[0]);
    this.escrever(status, 480, 81, 76, { bold: true, size: Math.min(8, 90 / status.length), align: 'center' });
    d.restore(); this.y = TOP;
  }
  pagina() { this.doc.addPage(); this.cabecalho(); }
  espaco(altura, continuar) { if (this.y + altura > BOTTOM) { this.pagina(); if (continuar) continuar(); } }
  secao(titulo) {
    this.espaco(56);
    this.doc.roundedRect(M, this.y, this.w, 29, 4).fill(C.navy);
    this.doc.rect(M, this.y + 4, 3, 21).fill(C.yellow);
    this.escrever(titulo, M + 14, this.y + 8, this.w - 25, { bold: true, size: 12, color: C.white });
    this.y += 37;
  }
  tabela(larguras, linhas, { cabecalho, titulo } = {}) {
    const repetir = () => { if (titulo) this.secao(`${titulo} (continuação)`); if (cabecalho) desenharCabecalho(); };
    const desenharCabecalho = () => {
      let x = M;
      cabecalho.forEach((c, i) => {
        this.doc.rect(x, this.y, larguras[i], 25).fillAndStroke('#DDE8F1', C.line);
        this.escrever(c, x + 8, this.y + 7, larguras[i] - 16, { bold: true }); x += larguras[i];
      }); this.y += 25;
    };
    if (cabecalho) { this.espaco(51, titulo ? () => this.secao(`${titulo} (continuação)`) : undefined); desenharCabecalho(); }
    for (const linha of linhas) {
      const celulas = linha.map((v, i) => this.linhas(v?.valor ?? v, larguras[i] - 16, v?.rotulo === true));
      let offset = 0;
      const total = Math.max(...celulas.map(c => c.length));
      while (offset < total) {
        const alturaRestante = (total - offset) * LINE + 10;
        // Linhas curtas permanecem inteiras. Blocos extensos precisam de espaço
        // para duas linhas, não de uma reserva fixa que descarte área utilizável.
        this.espaco(alturaRestante <= 92 ? alturaRestante : Math.min(total - offset, 2) * LINE + 10, repetir);
        const quantidade = Math.max(1, Math.min(total - offset, Math.floor((BOTTOM - this.y - 10) / LINE)));
        const altura = quantidade * LINE + 10;
        let x = M;
        linha.forEach((v, i) => {
          const rotulo = v?.rotulo === true;
          this.doc.rect(x, this.y, larguras[i], altura).fillAndStroke(rotulo ? C.pale : C.white, C.line);
          if (v?.status && offset === 0 && celulas[i].length === 1) {
            const [fundo, cor] = corStatus(v.valor);
            const bw = Math.min(larguras[i] - 16, Math.max(54, this.doc.font('Helvetica-Bold').fontSize(9).widthOfString(texto(v.valor)) + 18));
            this.doc.roundedRect(x + 8, this.y + 2, bw, 17, 3).fill(fundo);
            this.escrever(texto(v.valor), x + 10, this.y + 5, bw - 4, { bold: true, color: cor, align: 'center' });
          } else celulas[i].slice(offset, offset + quantidade).forEach((s, j) => this.escrever(s, x + 8, this.y + 5 + j * LINE, larguras[i] - 16, { bold: rotulo }));
          x += larguras[i];
        });
        this.y += altura; offset += quantidade;
        if (offset < total) { this.pagina(); repetir(); }
      }
    }
    this.y += 9;
  }
  campos(linhas, titulo) {
    let normais = [];
    const descarregar = () => {
      if (normais.length) this.tabela([145, this.w - 145], normais, { titulo });
      normais = [];
    };
    for (const [k, v, status] of linhas) {
      const valor = texto(v);
      if (!status && this.linhas(valor, this.w - 145 - 16).length > 8) {
        descarregar();
        // A coluna vazia de rótulo não acompanha várias páginas de prosa.
        // Mantém fonte, entrelinha e margens; somente amplia a largura do texto.
        const alturaTexto = this.linhas(valor, this.w - 16).length * LINE + 10;
        this.espaco(21 + (alturaTexto <= 92 ? alturaTexto : 2 * LINE + 10), () => this.secao(`${titulo} (continuação)`));
        this.tabela([this.w], [[{ valor: k, rotulo: true }], [valor]], { titulo });
      } else normais.push([{ valor: k, rotulo: true }, status ? { valor, status: true } : valor]);
    }
    descarregar();
  }
  pares(esquerda, direita, titulo) {
    const linhas = Array.from({ length: Math.max(esquerda.length, direita.length) }, (_, i) => {
      const a = esquerda[i], b = direita[i];
      const valor = item => item ? item[2] ? { valor: texto(item[1]), status: true } : texto(item[1]) : '';
      return [a ? { valor: a[0], rotulo: true } : '', valor(a), b ? { valor: b[0], rotulo: true } : '', valor(b)];
    });
    this.tabela([113, 151, 118, this.w - 382], linhas, { titulo });
  }
  cartes(itens) {
    const largura = (this.w - 8) / 2;
    for (let i = 0; i < itens.length; i += 2) {
      const par = itens.slice(i, i + 2);
      const valores = par.map(item => this.linhas(item[1], largura - 58, true, 12));
      const total = Math.max(...valores.map(v => v.length));
      for (let offset = 0; offset < total;) {
        this.espaco(Math.max(44, Math.min(total - offset, 2) * 16 + 28), () => this.secao('5. Dados Técnicos (continuação)'));
        const quantidade = Math.min(total - offset, Math.max(1, Math.floor((BOTTOM - this.y - 28) / 16)));
        const altura = Math.max(44, quantidade * 16 + 28);
        par.forEach((item, j) => {
          const x = M + j * (largura + 8);
          this.doc.roundedRect(x, this.y, largura, altura, 4).fillAndStroke(C.pale, C.line);
          this.doc.circle(x + 23, this.y + 25, 14).lineWidth(1.5).strokeColor(C.blue).stroke();
          // Subscritos vetoriais: não dependem de glifos ausentes em Helvetica.
          const formula = item[2];
          if (formula === 'O2' || formula === 'H2S') {
            this.escrever(formula[0], x + 13, this.y + 18, 12, { bold: true, size: 11 });
            this.escrever('2', x + 22, this.y + 24, 7, { bold: true, size: 7 });
            if (formula === 'H2S') this.escrever('S', x + 27, this.y + 18, 10, { bold: true, size: 10 });
          } else this.escrever(formula, x + 10, this.y + 20, 26, { bold: true, size: 9, align: 'center' });
          this.escrever(item[0], x + 47, this.y + 8, largura - 55, { bold: true, size: 9 });
          valores[j].slice(offset, offset + quantidade).forEach((s, k) => this.escrever(s, x + 47, this.y + 25 + k * 16, largura - 55, { bold: true, size: 12 }));
        });
        this.y += altura + 5; offset += quantidade;
      }
    }
  }
  rodapes(geracao) {
    const range = this.doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      this.doc.switchToPage(i);
      this.doc.strokeColor(C.line).lineWidth(0.7).moveTo(M, 791).lineTo(M + this.w, 791).stroke();
      capacete(this.doc, M + 2, 801, 0.48);
      this.escrever('INVENTÁRIO DE', M + 34, 803, 160, { bold: true, size: 8 });
      this.escrever('ESPAÇOS CONFINADOS', M + 34, 814, 165, { bold: true, size: 8 });
      this.escrever('Relatório Técnico • NR-33', M + 34, 825, 160, { size: 6 });
      this.escrever(`Relatório nº ${texto(this.dados.id_relatorio)} • Gerado em ${data(geracao, true)}`, 267, 804, 300, { size: 7, align: 'right' });
      this.escrever(`Página ${i + 1} de ${range.count}`, 367, 818, 200, { bold: true, size: 8, align: 'right' });
    }
  }
}
function identificacao(l, d) {
  const t1 = '1. Identificação e Responsabilidade'; l.secao(t1);
  l.pares([['Número do relatório', d.id_relatorio], ['Status do relatório', d.status_relatorio, true], ['Data de emissão', data(d.data_emissao)],
    ['Usuário responsável', d.responsavel], ['E-mail', d.email_responsavel], ['Perfil', d.perfil_responsavel]],
  [['Responsável técnico', d.nome_responsavel_tecnico], ['CREA', d.crea], ['Número da ART', d.numero_art], ['Data da ART', data(d.data_art)]], t1);
  const t2 = '2. Dados da Campanha'; l.secao(t2);
  l.pares([['Campanha', d.nome_campanha], ['Empresa', d.empresa], ['Responsável pela campanha', d.responsavel_campanha]],
    [['Data de início', data(d.data_inicio)], ['Status', d.status_campanha, true]], t2);
  const t3 = '3. Identificação do Local'; l.secao(t3);
  l.campos([['Local', d.nome_local], ['Setor', d.setor], ['Descrição', d.descricao_local], ['Endereço', d.endereco],
    ['Latitude', d.latitude], ['Longitude', d.longitude], ['Status', d.status_local, true]], t3);
}
function checklistTecnicos(l, d) {
  l.pagina(); const t = '4. Checklist NR-33'; l.secao(t);
  if (d.id_checklist) {
    const itens = [['A', 'Não projetado para ocupação humana contínua', d.criterio_a], ['B', 'Meios limitados de entrada/saída', d.criterio_b],
      ['C', 'Atmosfera perigosa existente OU potencial', d.criterio_c], ['D', 'Acesso controlado', d.acesso_controlado],
      ['E', 'Ventilação adequada', d.ventilacao_adequada], ['F', 'Monitoramento atmosférico', d.monitoramento_atmosferico],
      ['G', 'Procedimento de emergência', d.procedimento_emergencia]];
    l.tabela([56, l.w - 151, 95], itens.map(([a, b, c]) => [{ valor: a, rotulo: true }, b, { valor: texto(c), status: true }]), { cabecalho: ['Critério', 'Descrição', 'Atende'], titulo: t });
    l.campos([['Observações', d.observacoes_checklist], ['Status', d.status_checklist, true]], t);
  } else l.campos([['Checklist', 'Checklist não cadastrado para este local.']], t);
  const tt = '5. Dados Técnicos'; l.secao(tt);
  const unidade = (v, u) => presente(v) ? `${numero(v)} ${u}` : 'Não informado';
  if (d.id_dados) {
    l.cartes([['Pressão atmosférica', numero(d.pressao_atmosferica), 'P'], ['Ventilação', texto(d.ventilacao), 'V'],
      ['Oxigênio', unidade(d.oxigenio, '%'), 'O2'], ['Gás inflamável', unidade(d.gas_inflamavel, '%'), '%'],
      ['Monóxido de carbono', numero(d.monoxido_carbono), 'CO'], ['Sulfeto de hidrogênio', numero(d.sulfeto_hidrogenio), 'H2S'],
      ['Temperatura', unidade(d.temperatura, '°C'), '°C'], ['Umidade', unidade(d.umidade, '%'), '%']]);
    l.campos([['Observações', d.observacoes_dados_tecnicos], ['Status', d.status_dados_tecnicos, true]], tt);
  } else l.campos([['Dados técnicos', 'Dados técnicos não cadastrados para este local.']], tt);
}
function evidencias(l, d, imagens) {
  l.pagina(); const titulo = '6. Evidências'; l.secao(titulo);
  if (!Array.isArray(d.evidencias) || !d.evidencias.length) { l.campos([['Evidências', 'Nenhuma evidência cadastrada.']], titulo); return; }
  d.evidencias.forEach((e, indice) => {
    if (indice > 0) { l.pagina(); l.secao(titulo); }
    l.tabela([l.w - 100, 100], [[{ valor: `EVIDÊNCIA ${String(indice + 1).padStart(2, '0')} • ID ${texto(e.id_evidencia)}`, rotulo: true }, { valor: texto(e.tipo), rotulo: true }]]);
    const imagem = e.tipo === 'FOTO' ? imagens.get(e.id_evidencia) : null;
    if (imagem) {
      let aberta;
      try { aberta = l.doc.openImage(imagem); } catch { /* Preservar metadados de imagem inválida. */ }
      if (aberta) {
        const escala = Math.min(l.w / aberta.width, 345 / aberta.height);
        const w = aberta.width * escala, h = aberta.height * escala;
        l.espaco(h + 10, () => l.secao(titulo));
        let inserida = false;
        try {
          l.doc.image(imagem, M + (l.w - w) / 2, l.y, { width: w, height: h });
          inserida = true;
        } catch { /* Somente a inserção síncrona desta imagem é recuperável. */ }
        if (inserida) l.y += h + 10;
        else l.campos([['Fotografia', 'Não foi possível inserir esta imagem no relatório.']], titulo);
      } else l.campos([['Fotografia', 'Não foi possível inserir esta imagem no relatório.']], titulo);
    } else if (e.caminho_arquivo || e.tipo === 'FOTO') l.campos([['Arquivo', 'Imagem/arquivo indisponível para inclusão segura.']], titulo);
    const campos = [['Descrição', e.descricao]];
    if (presente(e.latitude) || presente(e.longitude)) {
      campos.push(['Localização da evidência', 'Coordenadas registradas'], ['Latitude', numero(e.latitude, 7)], ['Longitude', numero(e.longitude, 7)]);
    } else campos.push(['Localização da evidência', 'Não informada']);
    if (presente(e.origem_coordenadas)) campos.push(['Origem das coordenadas', e.origem_coordenadas]);
    if (e.origem_coordenadas === 'GPS' || presente(e.precisao_gps)) campos.push(['Precisão estimada', presente(e.precisao_gps) ? `${numero(e.precisao_gps)} m` : 'Não informado']);
    if (presente(e.data_captura_gps)) campos.push(['Captura GPS', data(e.data_captura_gps, true)]);
    if (presente(e.data_criacao)) campos.push(['Registro da evidência', data(e.data_criacao, true)]);
    const continuacao = `6. Evidências • ${String(indice + 1).padStart(2, '0')}`;
    if (l.linhas(e.descricao, l.w - 145 - 16).length > 8) {
      l.campos([campos[0]], continuacao);
      // Após prosa extensa, os metadados usam os mesmos quadros em duas
      // colunas da identificação, evitando uma página só para uma data.
      const metadados = campos.slice(1), meio = Math.ceil(metadados.length / 2);
      l.pares(metadados.slice(0, meio), metadados.slice(meio), continuacao);
    } else l.campos(campos, continuacao);
  });
}
// Compatibilidade do consumidor interno legado; nunca imprime o caminho.
function imagensLegadas(dados) {
  const imagens = new Map(), raiz = path.resolve(__dirname, '../../uploads');
  for (const e of dados.evidencias || []) {
    if (e.tipo !== 'FOTO' || typeof e.caminho_arquivo !== 'string') continue;
    const alvo = path.resolve(__dirname, '../../', e.caminho_arquivo), relativo = path.relative(raiz, alvo);
    if (relativo.startsWith('..') || path.isAbsolute(relativo) || !/\.(jpe?g|png)$/i.test(alvo)) continue;
    try {
      if (fs.existsSync(alvo)) imagens.set(e.id_evidencia, fs.readFileSync(alvo));
    } catch (erro) {
      // Apenas falhas locais de leitura da foto. Autorização, erros inesperados
      // e a persistência do PDF continuam propagando fora deste tratamento.
      if (erro.statusCode || erro.status || !['ENOENT', 'EACCES', 'EPERM', 'EISDIR', 'EIO', 'ENOTDIR'].includes(erro.code)) throw erro;
    }
  }
  return imagens;
}
async function gerarPdfRelatorio(dados, opcoes = {}) {
  const somenteBuffer = opcoes.somenteBuffer === true;
  const doc = new PDFDocument({ size: 'A4', margins: { top: TOP, bottom: 55, left: M, right: M }, bufferPages: true,
    info: { Title: `Relatório - ${texto(dados.nome_local)}`, Author: dados.responsavel || 'Inventário de Espaços Confinados', Subject: 'Relatório Técnico de Inventário de Espaço Confinado' } });
  const buffer = await new Promise((resolve, reject) => {
    const partes = [];
    doc.on('data', p => partes.push(p)); doc.on('end', () => resolve(Buffer.concat(partes))); doc.on('error', reject);
    try {
      const geracao = new Date(), layout = new Layout(doc, dados);
      identificacao(layout, dados); checklistTecnicos(layout, dados);
      evidencias(layout, dados, opcoes.imagens || (somenteBuffer ? new Map() : imagensLegadas(dados)));
      layout.rodapes(geracao); doc.end();
    } catch (erro) { doc.destroy(); reject(erro); }
  });
  if (somenteBuffer) return buffer;
  const diretorio = path.resolve(__dirname, '../../uploads/relatorios');
  fs.mkdirSync(diretorio, { recursive: true });
  const nome = `relatorio-${dados.id_relatorio}-${Date.now()}.pdf`, caminhoCompleto = path.join(diretorio, nome);
  fs.writeFileSync(caminhoCompleto, buffer, { flag: 'wx' });
  return { caminhoCompleto, caminhoRelativo: `uploads/relatorios/${nome}`, hash: crypto.createHash('sha256').update(buffer).digest('hex') };
}
module.exports = { gerarPdfRelatorio };
