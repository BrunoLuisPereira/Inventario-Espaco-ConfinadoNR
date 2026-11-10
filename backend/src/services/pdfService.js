const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { criarIdiomaPdf } = require('../utils/idiomaPdf');
const { determinarAplicabilidade } = require('../utils/regrasCaracterizacaoNr33');
const { reconstruirAvaliacaoEspecifica } = require('../utils/adaptadorCamposNr33');

// Recursos visuais vetoriais locais. No fluxo multi-tenant somente os buffers
// previamente autorizados podem fornecer fotografias.
const C = { navy: '#073451', blue: '#07517B', yellow: '#FFCD16', ink: '#102C46',
  line: '#D6E0E9', pale: '#EFF4F8', white: '#FFFFFF' };
const M = 28, TOP = 119, BOTTOM = 776, LINE = 11;
const presente = v => v !== null && v !== undefined && v !== '';
function corStatus(v) {
  const s = String(v).toUpperCase();
  if (['SIM', 'ATIVO', 'CONCLUIDO', 'CONCLUÍDO', 'GERADO'].includes(s)) return ['#C7F1D2', '#123D28'];
  if (['NAO', 'NÃO', 'INATIVO', 'INATIVA', 'CANCELADO'].includes(s)) return ['#FFD5D2', '#852320'];
  if (s === 'RASCUNHO') return [C.yellow, C.ink];
  if (['EM ANDAMENTO', 'EM_ANDAMENTO'].includes(s)) return ['#D0EDFF', C.blue];
  if (['NÃO AVALIADO', 'NÃO APLICÁVEL'].includes(s)) return ['#F2F4F7', '#475467'];
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
function criarRenderizador(contexto) {
  const { t, texto, numero, data, rotulo } = contexto;
  const medida = (v, unidade) => presente(v) ? `${numero(v, 2)} ${unidade}` : texto(v);
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
      this.escrever(t("INVENTÁRIO DE"), M + 70, 29, 330, { bold: true, size: 19, color: C.white });
      this.escrever(t("ESPAÇOS CONFINADOS"), M + 70, 52, 345, { bold: true, size: 19, color: C.yellow });
      this.escrever(t("Relatório Técnico • NR-33"), M + 70, 78, 310, { size: 12, color: C.white });
      d.strokeColor('#9BB4C8').lineWidth(0.6).moveTo(470, 29).lineTo(470, 88).stroke();
      this.escrever(t("Relatório nº"), 477, 27, 85, { size: 9, color: C.white, align: 'center' });
      const id = texto(this.dados.id_relatorio);
      this.escrever(id, 475, 44, 88, { bold: true, size: Math.min(25, 130 / id.length), color: C.white, align: 'center' });
      const status = rotulo(this.dados.status_relatorio);
      d.roundedRect(477, 77, 82, 17, 3).fill(corStatus(this.dados.status_relatorio)[0]);
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
      const repetir = () => { if (titulo) this.secao(`${titulo} ${t('(continuação)')}`); if (cabecalho) desenharCabecalho(); };
      const desenharCabecalho = () => {
        let x = M;
        cabecalho.forEach((c, i) => {
          this.doc.rect(x, this.y, larguras[i], 25).fillAndStroke('#DDE8F1', C.line);
          this.escrever(c, x + 8, this.y + 7, larguras[i] - 16, { bold: true }); x += larguras[i];
        }); this.y += 25;
      };
      if (cabecalho) { this.espaco(51, titulo ? () => this.secao(`${titulo} ${t('(continuação)')}`) : undefined); desenharCabecalho(); }
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
              const [fundo, cor] = corStatus(v.codigo ?? v.valor);
              const larguraTexto = this.doc.font('Helvetica-Bold').fontSize(9).widthOfString(texto(v.valor));
              const bw = Math.min(larguras[i] - 16, Math.max(54, larguraTexto + 18));
              const tamanhoStatus = Math.min(9, 9 * (bw - 6) / Math.max(1, larguraTexto));
              this.doc.roundedRect(x + 8, this.y + 2, bw, 17, 3).fill(fundo);
              this.escrever(texto(v.valor), x + 10, this.y + 5, bw - 4, { bold: true, size: tamanhoStatus, color: cor, align: 'center' });
            } else celulas[i].slice(offset, offset + quantidade).forEach((s, j) => this.escrever(s, x + 8, this.y + 5 + j * LINE, larguras[i] - 16, { bold: rotulo }));
            x += larguras[i];
          });
          this.y += altura; offset += quantidade;
          if (offset < total) { this.pagina(); repetir(); }
        }
      }
      this.y += 9;
    }
    campos(linhas, titulo, { larguraRotulo = 145 } = {}) {
      let normais = [];
      const descarregar = () => {
        if (normais.length) this.tabela([larguraRotulo, this.w - larguraRotulo], normais, { titulo });
        normais = [];
      };
      for (const [k, v, status] of linhas) {
        const valor = texto(v);
        if (!status && this.linhas(valor, this.w - larguraRotulo - 16).length > 8) {
          descarregar();
          // A coluna vazia de rótulo não acompanha várias páginas de prosa.
          // Mantém fonte, entrelinha e margens; somente amplia a largura do texto.
          const alturaTexto = this.linhas(valor, this.w - 16).length * LINE + 10;
          this.espaco(21 + (alturaTexto <= 92 ? alturaTexto : 2 * LINE + 10), () => this.secao(`${titulo} ${t('(continuação)')}`));
          this.tabela([this.w], [[{ valor: k, rotulo: true }], [valor]], { titulo });
        } else normais.push([{ valor: k, rotulo: true }, status ? { valor: rotulo(v), status: true, codigo: v } : valor]);
      }
      descarregar();
    }
    pares(esquerda, direita, titulo, { agrupar = false } = {}) {
      const linhas = Array.from({ length: Math.max(esquerda.length, direita.length) }, (_, i) => {
        const a = esquerda[i], b = direita[i];
        const valor = item => item ? item[2] ? { valor: rotulo(item[1]), status: true, codigo: item[1] } : texto(item[1]) : '';
        return [a ? { valor: a[0], rotulo: true } : '', valor(a), b ? { valor: b[0], rotulo: true } : '', valor(b)];
      });
      const larguras = [113, 151, 118, this.w - 382];
      if (agrupar) {
        // Mesmas larguras, fontes, entrelinha e preenchimento de tabela().
        // O espaço final de 9 pontos não contém conteúdo e não precisa caber.
        const alturas = linhas.map(linha => Math.max(...linha.map((v, i) =>
          this.linhas(v?.valor ?? v, larguras[i] - 16, v?.rotulo === true).length)) * LINE + 10);
        const altura = 37 + alturas.reduce((total, h) => total + h, 0);
        // Se exceder uma página, preservar a continuação e reservar apenas o
        // título com a primeira linha (ou o primeiro fragmento de linha longa).
        this.espaco(altura <= BOTTOM - TOP ? altura : 37 + (alturas[0] <= 92 ? alturas[0] : 2 * LINE + 10));
        this.secao(titulo);
      }
      this.tabela(larguras, linhas, { titulo });
    }
    cartes(itens) {
      const largura = (this.w - 8) / 2;
      for (let i = 0; i < itens.length; i += 2) {
        const par = itens.slice(i, i + 2);
        const valores = par.map(item => this.linhas(item[1], largura - 58, true, 12));
        const total = Math.max(...valores.map(v => v.length));
        for (let offset = 0; offset < total;) {
          this.espaco(Math.max(44, Math.min(total - offset, 2) * 16 + 28), () => this.secao(t("4. Dados Técnicos (continuação)")));
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
        this.escrever(t("INVENTÁRIO DE"), M + 34, 803, 160, { bold: true, size: 8 });
        this.escrever(t("ESPAÇOS CONFINADOS"), M + 34, 814, 165, { bold: true, size: 8 });
        this.escrever(t("Relatório Técnico • NR-33"), M + 34, 825, 160, { size: 6 });
        this.escrever(t('Relatório nº {{id}} • Gerado em {{data}}', { id: texto(this.dados.id_relatorio), data: data(geracao, true) }), 267, 804, 300, { size: 7, align: 'right' });
        this.escrever(t('Página {{pagina}} de {{total}}', { pagina: i + 1, total: range.count }), 367, 818, 200, { bold: true, size: 8, align: 'right' });
      }
    }
  }
  function identificacao(l, d) {
    const t1 = t("6. Identificação e Responsabilidade");
    l.pares([[t("Número do relatório"), d.id_relatorio], [t("Status do relatório"), d.status_relatorio, true], [t("Data de emissão"), data(d.data_emissao)],
      [t("Usuário responsável"), d.responsavel], [t("E-mail"), d.email_responsavel], [t("Perfil"), rotulo(d.perfil_responsavel)]],
    [[t("Responsável técnico"), d.nome_responsavel_tecnico], [t("CREA"), d.crea], [t("Número da ART"), d.numero_art], [t("Data da ART"), data(d.data_art)]], t1, { agrupar: true });
  }
  function campanhaLocal(l, d, indicador) {
    const t2 = t("1. Dados da Campanha"); l.secao(t2);
    l.pares([[t("Campanha"), d.nome_campanha], [t("Empresa"), d.empresa], [t("Responsável pela campanha"), d.responsavel_campanha]],
      [[t("Data de início"), data(d.data_inicio)], [t("Status"), d.status_campanha, true]], t2);
    const t3 = t("2. Identificação do Local"); l.secao(t3);
    l.campos([[t("Local"), d.nome_local], [t("Setor"), d.setor], [t("Descrição"), d.descricao_local], [t("Endereço"), d.endereco],
      [t("Latitude"), numero(d.latitude)], [t("Longitude"), numero(d.longitude)], [t("Status"), d.status_local, true],
      [t("Espaço Confinado?"), indicador.texto.toLocaleUpperCase('pt-BR'), true]], t3);
  }
  function volumeEspaco(valor) {
    if (!presente(valor)) return texto(valor);
    // NUMERIC(18,6) chega como string: não perder casas ao converter para Number.
    return numero(String(valor).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''), 0);
  }
  function caracterizacao(l, d) {
    const titulo = t("Caracterização do Espaço Confinado");
    const contexto = `${t('3. Checklist NR-33')} • ${titulo}`;
    const campos = [
      [t("Código de identificação / rastreio"), d.codigo_identificacao],
      [t("Volume do espaço (m³)"), volumeEspaco(d.volume_m3)],
      [t("Quantidade de aberturas e bocas de visita"), d.quantidade_aberturas],
      [t("Dimensões das aberturas e bocas de visita"), d.dimensoes_aberturas],
      [t("Formas de acesso e respectivas dimensões"), d.formas_acesso],
      [t("Geometria do espaço confinado"), d.geometria],
      [t("Utilização do espaço / produto armazenado"), d.utilizacao_produto],
      [t("Possíveis perigos antes da liberação de entrada"), d.perigos_antes_liberacao],
    ];
    const larguraRotulo = 214;
    const primeiraAltura = Math.max(l.linhas(campos[0][0], larguraRotulo - 16, true).length,
      l.linhas(texto(campos[0][1]), l.w - larguraRotulo - 16).length) * LINE + 10;
    // Reservar o título junto à primeira linha real, inclusive quando o código
    // exigir quebra. O restante usa a paginação e continuação de campos().
    l.espaco(37 + primeiraAltura, () => l.secao(t("3. Checklist NR-33 (continuação)")));
    l.secao(titulo);
    l.campos(campos, contexto, { larguraRotulo });
  }
  function checklistTecnicos(l, d) {
    l.pagina(); const tituloChecklist = t("3. Checklist NR-33"); l.secao(tituloChecklist);
    if (d.id_checklist) {
      const aplicabilidade = determinarAplicabilidade({ ...d, avaliacao_especifica: reconstruirAvaliacaoEspecifica(d) });
      const respostaDependente = (valor, aplicavel) => aplicavel === false ? 'NÃO APLICÁVEL'
        : aplicavel !== true ? 'NÃO AVALIADO'
        : valor === true ? 'SIM' : valor === false ? 'NÃO' : 'NÃO AVALIADO';
      const atmosfera = d.criterio_c == null ? null : aplicabilidade.atmosfera;
      const placa = aplicabilidade.classificacao.resultado === 'PENDENTE' ? null : aplicabilidade.placa;
      const itens = [['A', t("Não projetado para ocupação humana contínua"), d.criterio_a], ['B', t("Meios limitados de entrada/saída"), d.criterio_b],
        ['C', t("Atmosfera perigosa existente OU potencial"), d.criterio_c],
        ['C-1', t("Deficiência ou enriquecimento de oxigênio"), respostaDependente(d.atmosfera_oxigenio, atmosfera)],
        ['C-2', t("Presença de contaminantes"), respostaDependente(d.atmosfera_contaminantes, atmosfera)],
        ['C-3', t("Atmosfera explosiva"), respostaDependente(d.atmosfera_explosiva, atmosfera)],
        ['', t("Possui placa de identificação?"), respostaDependente(d.possui_placa_identificacao, placa)],
        ['D', t("Acesso controlado"), d.acesso_controlado], ['E', t("Ventilação adequada"), d.ventilacao_adequada],
        ['F', t("Monitoramento atmosférico"), d.monitoramento_atmosferico], ['G', t("Procedimento de emergência"), d.procedimento_emergencia]];
      l.tabela([56, l.w - 151, 95], itens.map(([a, b, c]) => [{ valor: a, rotulo: true }, b, { valor: rotulo(c), status: true, codigo: c }]), { cabecalho: [t("Critério"), t("Descrição"), t("Atende")], titulo: tituloChecklist });
      caracterizacao(l, d);
      l.campos([[t("Observações"), d.observacoes_checklist], [t("Status"), d.status_checklist, true]], tituloChecklist);
    } else l.campos([[t("Checklist"), t("Checklist não cadastrado para este local.")]], tituloChecklist);
    const tt = t("4. Dados Técnicos");
    l.espaco(37 + (d.id_dados ? 44 : 21));
    l.secao(tt);
    if (d.id_dados) {
      l.cartes([[t("Pressão atmosférica"), numero(d.pressao_atmosferica), 'P'], [t("Ventilação"), rotulo(d.ventilacao), 'V'],
        [t("Oxigênio"), medida(d.oxigenio, '%'), 'O2'], [t("Gás inflamável"), numero(d.gas_inflamavel), 'GI'],
        [t("Monóxido de carbono"), numero(d.monoxido_carbono), 'CO'], [t("Sulfeto de hidrogênio"), numero(d.sulfeto_hidrogenio), 'H2S'],
        [t("Temperatura"), medida(d.temperatura, '°C'), 'T'], [t("Umidade"), medida(d.umidade, '%'), 'U']]);
      l.campos([[t("Unidades de medida"), t("Oxigênio e umidade: %. Temperatura: °C. Demais unidades não registradas no cadastro; sem conversão.")]], tt);
      l.campos([[t("Observações"), d.observacoes_dados_tecnicos], [t("Status"), d.status_dados_tecnicos, true]], tt);
    } else l.campos([[t("Dados técnicos"), t("Dados técnicos não cadastrados para este local.")]], tt);
  }
  function evidencias(l, d, imagens) {
    l.pagina(); const titulo = t("5. Evidências"); l.secao(titulo);
    if (!Array.isArray(d.evidencias) || !d.evidencias.length) { l.campos([[t("Evidências"), t("Nenhuma evidência cadastrada.")]], titulo); return; }
    d.evidencias.forEach((e, indice) => {
      if (indice > 0) { l.pagina(); l.secao(titulo); }
      l.tabela([l.w - 100, 100], [[{ valor: `${t('EVIDÊNCIA')} ${String(indice + 1).padStart(2, '0')} • ID ${texto(e.id_evidencia)}`, rotulo: true }, { valor: rotulo(e.tipo), rotulo: true }]]);
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
          else l.campos([[t("Fotografia"), t("Não foi possível inserir esta imagem no relatório.")]], titulo);
        } else l.campos([[t("Fotografia"), t("Não foi possível inserir esta imagem no relatório.")]], titulo);
      } else if (e.caminho_arquivo || e.tipo === 'FOTO') l.campos([[t("Arquivo"), t("Imagem/arquivo indisponível para inclusão segura.")]], titulo);
      const campos = [[t("Descrição"), e.descricao]];
      if (presente(e.latitude) || presente(e.longitude)) {
        campos.push([t("Localização da evidência"), t("Coordenadas registradas")], [t("Latitude"), numero(e.latitude, 7)], [t("Longitude"), numero(e.longitude, 7)]);
      } else campos.push([t("Localização da evidência"), t("Não informada")]);
      if (presente(e.origem_coordenadas)) campos.push([t("Origem das coordenadas"), rotulo(e.origem_coordenadas)]);
      if (e.origem_coordenadas === 'GPS' || presente(e.precisao_gps)) campos.push([t("Precisão estimada"), presente(e.precisao_gps) ? `${numero(e.precisao_gps)} m` : t("Não informado")]);
      if (presente(e.data_captura_gps)) campos.push([t("Captura GPS"), data(e.data_captura_gps, true)]);
      if (presente(e.data_criacao)) campos.push([t("Registro da evidência"), data(e.data_criacao, true)]);
      const continuacao = `${t('5. Evidências')} • ${String(indice + 1).padStart(2, '0')}`;
      if (l.linhas(e.descricao, l.w - 145 - 16).length > 8) {
        l.campos([campos[0]], continuacao);
        // Após prosa extensa, os metadados usam os mesmos quadros em duas
        // colunas da identificação, evitando uma página só para uma data.
        const metadados = campos.slice(1), meio = Math.ceil(metadados.length / 2);
        l.pares(metadados.slice(0, meio), metadados.slice(meio), continuacao);
      } else l.campos(campos, continuacao);
    });
  }

  return { Layout, campanhaLocal, checklistTecnicos, evidencias, identificacao };
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
  const { espacoConfinado } = await import('../../../shared/espacoConfinado.mjs');
  const contexto = criarIdiomaPdf(opcoes.idioma);
  const { t, texto } = contexto;
  const { Layout, campanhaLocal, checklistTecnicos, evidencias, identificacao } = criarRenderizador(contexto);
  const somenteBuffer = opcoes.somenteBuffer === true;
  const doc = new PDFDocument({ size: 'A4', margins: { top: TOP, bottom: 55, left: M, right: M }, bufferPages: true, lang: contexto.idioma,
    info: { Title: `${t('Relatório')} - ${texto(dados.nome_local)}`, Author: dados.responsavel || t('Inventário de Espaços Confinados'), Subject: t('Relatório Técnico de Inventário de Espaço Confinado') } });
  const buffer = await new Promise((resolve, reject) => {
    const partes = [];
    doc.on('data', p => partes.push(p)); doc.on('end', () => resolve(Buffer.concat(partes))); doc.on('error', reject);
    try {
      const geracao = new Date(), layout = new Layout(doc, dados);
      campanhaLocal(layout, dados, espacoConfinado(dados)); checklistTecnicos(layout, dados);
      evidencias(layout, dados, opcoes.imagens || (somenteBuffer ? new Map() : imagensLegadas(dados)));
      identificacao(layout, dados);
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
