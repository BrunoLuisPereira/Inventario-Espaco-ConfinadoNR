const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ==========================================================
// CONFIGURAÇÕES VISUAIS
// ==========================================================

const CORES = {
  primaria: "#1F4E78",
  primariaClara: "#DCE6F1",
  secundaria: "#5B6573",
  texto: "#222222",
  textoClaro: "#666666",
  borda: "#D9DEE5",
  fundo: "#F5F7FA",
  branco: "#FFFFFF",

  sucesso: "#2E7D32",
  sucessoFundo: "#E8F5E9",

  alerta: "#ED6C02",
  alertaFundo: "#FFF4E5",

  perigo: "#C62828",
  perigoFundo: "#FDECEC",

  neutro: "#616161",
  neutroFundo: "#EEEEEE",
};

const PAGINA = {
  margemEsquerda: 50,
  margemDireita: 50,
  margemSuperior: 75,
  margemInferior: 55,
};

// ==========================================================
// UTILITÁRIOS
// ==========================================================

function valorOuNaoInformado(valor) {
  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {
    return "Não informado";
  }

  return String(valor);
}

function formatarNumero(valor, casas = 2) {
  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {
    return "Não informado";
  }

  const numero = Number(valor);

  if (Number.isNaN(numero)) {
    return String(valor);
  }

  return numero.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function formatarData(valor) {
  if (!valor) {
    return "Não informado";
  }

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return String(valor);
  }

  return data.toLocaleDateString("pt-BR");
}

function formatarDataHora(valor = new Date()) {
  const data =
    valor instanceof Date
      ? valor
      : new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return "Não informado";
  }

  return data.toLocaleString("pt-BR");
}

function larguraUtil(doc) {
  return (
    doc.page.width -
    PAGINA.margemEsquerda -
    PAGINA.margemDireita
  );
}

function limiteInferior(doc) {
  return doc.page.height - PAGINA.margemInferior;
}

// ==========================================================
// DIRETÓRIO
// ==========================================================

function garantirDiretorio() {
  const diretorio = path.join(
    __dirname,
    "../../uploads/relatorios"
  );

  if (!fs.existsSync(diretorio)) {
    fs.mkdirSync(diretorio, {
      recursive: true,
    });
  }

  return diretorio;
}

// ==========================================================
// EVIDÊNCIAS / SEGURANÇA
// ==========================================================

function obterCaminhoSeguroEvidencia(caminhoArquivo) {
  if (
    !caminhoArquivo ||
    typeof caminhoArquivo !== "string"
  ) {
    return null;
  }

  const diretorioUploads = path.resolve(
    __dirname,
    "../../uploads"
  );

  const caminhoCompleto = path.resolve(
    __dirname,
    "../../",
    caminhoArquivo
  );

  const caminhoRelativo = path.relative(
    diretorioUploads,
    caminhoCompleto
  );

  if (
    caminhoRelativo.startsWith("..") ||
    path.isAbsolute(caminhoRelativo)
  ) {
    return null;
  }

  return caminhoCompleto;
}

function obterImagemEvidencia(evidencia) {
  if (
    !evidencia ||
    evidencia.tipo !== "FOTO"
  ) {
    return null;
  }

  const caminhoCompleto =
    obterCaminhoSeguroEvidencia(
      evidencia.caminho_arquivo
    );

  if (
    !caminhoCompleto ||
    !fs.existsSync(caminhoCompleto)
  ) {
    return null;
  }

  const extensao = path
    .extname(caminhoCompleto)
    .toLowerCase();

  const extensoesPermitidas = [
    ".jpg",
    ".jpeg",
    ".png",
  ];

  if (!extensoesPermitidas.includes(extensao)) {
    return null;
  }

  return caminhoCompleto;
}

// ==========================================================
// CONTROLE DE PÁGINA
// ==========================================================

function garantirEspaco(
  doc,
  alturaNecessaria,
  dados
) {
  if (
    doc.y + alturaNecessaria >
    limiteInferior(doc)
  ) {
    doc.addPage();
    adicionarCabecalhoPagina(doc, dados);
  }
}

// ==========================================================
// CABEÇALHO
// ==========================================================

function adicionarCabecalhoPagina(doc, dados) {
  const largura = larguraUtil(doc);

  doc
    .save()
    .rect(
      PAGINA.margemEsquerda,
      30,
      largura,
      38
    )
    .fill(CORES.primaria);

  doc
    .fillColor(CORES.branco)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(
      "INVENTÁRIO DE ESPAÇOS CONFINADOS",
      PAGINA.margemEsquerda + 12,
      39,
      {
        width: largura - 24,
      }
    );

  doc
    .font("Helvetica")
    .fontSize(8)
    .text(
      "Relatório Técnico • NR-33",
      PAGINA.margemEsquerda + 12,
      55,
      {
        width: largura - 24,
      }
    );

  doc.restore();

  doc.y = PAGINA.margemSuperior;

  if (dados && dados.id_relatorio) {
    doc
      .fillColor(CORES.textoClaro)
      .font("Helvetica")
      .fontSize(8)
      .text(
        `Relatório nº ${dados.id_relatorio}`,
        PAGINA.margemEsquerda,
        69,
        {
          align: "right",
          width: largura,
        }
      );
  }

  doc.y = 82;
}

// ==========================================================
// RODAPÉ
// ==========================================================

function adicionarRodapes(doc, dados, dataGeracao) {
  const range = doc.bufferedPageRange();

  for (
    let i = range.start;
    i < range.start + range.count;
    i++
  ) {
    doc.switchToPage(i);

    const largura = larguraUtil(doc);
    const yLinha = doc.page.height - 42;

    doc
      .save()
      .strokeColor(CORES.borda)
      .lineWidth(0.5)
      .moveTo(
        PAGINA.margemEsquerda,
        yLinha
      )
      .lineTo(
        doc.page.width -
          PAGINA.margemDireita,
        yLinha
      )
      .stroke();

    doc
      .fillColor(CORES.textoClaro)
      .font("Helvetica")
      .fontSize(7.5)
      .text(
        `Relatório nº ${valorOuNaoInformado(
          dados.id_relatorio
        )} • Gerado em ${formatarDataHora(
          dataGeracao
        )}`,
        PAGINA.margemEsquerda,
        yLinha + 7,
        {
          width: largura / 1.5,
          lineBreak: false,
        }
      );

    doc
      .font("Helvetica-Bold")
      .text(
        `Página ${i + 1} de ${range.count}`,
        PAGINA.margemEsquerda,
        yLinha + 7,
        {
          width: largura,
          align: "right",
          lineBreak: false,
        }
      );

    doc.restore();
  }
}

// ==========================================================
// TÍTULOS DAS SEÇÕES
// ==========================================================

function adicionarTitulo(
  doc,
  texto,
  dados
) {
  garantirEspaco(doc, 45, dados);

  doc.moveDown(0.6);

  const largura = larguraUtil(doc);
  const y = doc.y;

  doc
    .save()
    .roundedRect(
      PAGINA.margemEsquerda,
      y,
      largura,
      27,
      4
    )
    .fill(CORES.primariaClara);

  doc
    .fillColor(CORES.primaria)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(
      texto,
      PAGINA.margemEsquerda + 10,
      y + 8,
      {
        width: largura - 20,
        lineBreak: false,
      }
    );

  doc.restore();

  doc.y = y + 36;
}

// ==========================================================
// CAMPOS
// ==========================================================

function adicionarCampo(
  doc,
  titulo,
  valor,
  dados
) {
  garantirEspaco(doc, 22, dados);

  const larguraTitulo = 165;
  const largura = larguraUtil(doc);
  const y = doc.y;

  const textoValor =
    valorOuNaoInformado(valor);

  const alturaTitulo = doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .heightOfString(titulo, {
      width: larguraTitulo,
    });

  const alturaValor = doc
    .font("Helvetica")
    .fontSize(9)
    .heightOfString(textoValor, {
      width:
        largura -
        larguraTitulo -
        15,
    });

  const altura =
    Math.max(
      alturaTitulo,
      alturaValor
    ) + 7;

  garantirEspaco(
    doc,
    altura + 2,
    dados
  );

  doc
    .fillColor(CORES.textoClaro)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(
      titulo,
      PAGINA.margemEsquerda,
      doc.y,
      {
        width: larguraTitulo,
      }
    );

  doc
    .fillColor(CORES.texto)
    .font("Helvetica")
    .fontSize(9)
    .text(
      textoValor,
      PAGINA.margemEsquerda +
        larguraTitulo,
      y,
      {
        width:
          largura -
          larguraTitulo,
      }
    );

  doc.y = y + altura;

  doc
    .strokeColor("#ECEFF3")
    .lineWidth(0.3)
    .moveTo(
      PAGINA.margemEsquerda,
      doc.y
    )
    .lineTo(
      doc.page.width -
        PAGINA.margemDireita,
      doc.y
    )
    .stroke();

  doc.y += 4;
}

// ==========================================================
// STATUS
// ==========================================================

function obterCorStatus(status) {
  const valor = String(
    status || ""
  ).toUpperCase();

  if (
    [
      "CONCLUIDO",
      "CONCLUÍDO",
      "ATIVA",
      "ATIVO",
      "SIM",
    ].includes(valor)
  ) {
    return {
      fundo: CORES.sucessoFundo,
      texto: CORES.sucesso,
    };
  }

  if (
    [
      "PENDENTE",
      "EM ANDAMENTO",
      "ALERTA",
    ].includes(valor)
  ) {
    return {
      fundo: CORES.alertaFundo,
      texto: CORES.alerta,
    };
  }

  if (
    [
      "INATIVA",
      "INATIVO",
      "CANCELADO",
      "NÃO",
      "NAO",
    ].includes(valor)
  ) {
    return {
      fundo: CORES.perigoFundo,
      texto: CORES.perigo,
    };
  }

  return {
    fundo: CORES.neutroFundo,
    texto: CORES.neutro,
  };
}

function adicionarStatus(
  doc,
  titulo,
  status,
  dados
) {
  garantirEspaco(doc, 28, dados);

  const y = doc.y;
  const largura = larguraUtil(doc);
  const larguraTitulo = 165;

  const texto =
    valorOuNaoInformado(status);

  const cores =
    obterCorStatus(status);

  doc
    .fillColor(CORES.textoClaro)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(
      titulo,
      PAGINA.margemEsquerda,
      y + 4,
      {
        width: larguraTitulo,
      }
    );

  const larguraBadge = Math.min(
    Math.max(
      doc.widthOfString(texto) + 22,
      70
    ),
    180
  );

  doc
    .save()
    .roundedRect(
      PAGINA.margemEsquerda +
        larguraTitulo,
      y,
      larguraBadge,
      20,
      5
    )
    .fill(cores.fundo);

  doc
    .fillColor(cores.texto)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(
      texto,
      PAGINA.margemEsquerda +
        larguraTitulo +
        10,
      y + 6,
      {
        width: larguraBadge - 20,
        align: "center",
        lineBreak: false,
      }
    );

  doc.restore();

  doc.y = y + 27;

  doc
    .strokeColor("#ECEFF3")
    .lineWidth(0.3)
    .moveTo(
      PAGINA.margemEsquerda,
      doc.y
    )
    .lineTo(
      PAGINA.margemEsquerda + largura,
      doc.y
    )
    .stroke();

  doc.y += 4;
}

// ==========================================================
// MENSAGEM INFORMATIVA
// ==========================================================

function adicionarMensagem(
  doc,
  texto,
  dados
) {
  garantirEspaco(doc, 45, dados);

  const largura = larguraUtil(doc);
  const y = doc.y;

  const alturaTexto = doc
    .font("Helvetica")
    .fontSize(9)
    .heightOfString(texto, {
      width: largura - 24,
    });

  const altura = alturaTexto + 20;

  doc
    .save()
    .roundedRect(
      PAGINA.margemEsquerda,
      y,
      largura,
      altura,
      4
    )
    .fill(CORES.fundo);

  doc
    .fillColor(CORES.textoClaro)
    .font("Helvetica")
    .fontSize(9)
    .text(
      texto,
      PAGINA.margemEsquerda + 12,
      y + 10,
      {
        width: largura - 24,
      }
    );

  doc.restore();

  doc.y = y + altura + 8;
}

// ==========================================================
// DADOS TÉCNICOS
// ==========================================================

function adicionarDadosTecnicos(
  doc,
  dados
) {
  const itens = [
    {
      titulo: "Pressão atmosférica",
      valor: formatarNumero(
        dados.pressao_atmosferica
      ),
    },
    {
      titulo: "Ventilação",
      valor: valorOuNaoInformado(
        dados.ventilacao
      ),
    },
    {
      titulo: "Oxigênio",
      valor:
        dados.oxigenio !== null &&
        dados.oxigenio !== undefined &&
        dados.oxigenio !== ""
          ? `${formatarNumero(
              dados.oxigenio
            )} %`
          : "Não informado",
    },
    {
      titulo: "Gás inflamável",
      valor:
        dados.gas_inflamavel !== null &&
        dados.gas_inflamavel !== undefined &&
        dados.gas_inflamavel !== ""
          ? `${formatarNumero(
              dados.gas_inflamavel
            )} %`
          : "Não informado",
    },
    {
      titulo: "Monóxido de carbono",
      valor: formatarNumero(
        dados.monoxido_carbono
      ),
    },
    {
      titulo: "Sulfeto de hidrogênio",
      valor: formatarNumero(
        dados.sulfeto_hidrogenio
      ),
    },
    {
      titulo: "Temperatura",
      valor:
        dados.temperatura !== null &&
        dados.temperatura !== undefined &&
        dados.temperatura !== ""
          ? `${formatarNumero(
              dados.temperatura
            )} °C`
          : "Não informado",
    },
    {
      titulo: "Umidade",
      valor:
        dados.umidade !== null &&
        dados.umidade !== undefined &&
        dados.umidade !== ""
          ? `${formatarNumero(
              dados.umidade
            )} %`
          : "Não informado",
    },
  ];

  const largura = larguraUtil(doc);
  const espaco = 10;
  const larguraColuna =
    (largura - espaco) / 2;

  itens.forEach((item, indice) => {
    if (indice % 2 === 0) {
      garantirEspaco(doc, 50, dados);

      const y = doc.y;

      desenharCardTecnico(
        doc,
        item,
        PAGINA.margemEsquerda,
        y,
        larguraColuna
      );

      const proximo =
        itens[indice + 1];

      if (proximo) {
        desenharCardTecnico(
          doc,
          proximo,
          PAGINA.margemEsquerda +
            larguraColuna +
            espaco,
          y,
          larguraColuna
        );
      }

      doc.y = y + 47;
    }
  });

  doc.y += 4;

  adicionarCampo(
    doc,
    "Observações",
    dados.observacoes_dados_tecnicos,
    dados
  );

  adicionarStatus(
    doc,
    "Status",
    dados.status_dados_tecnicos,
    dados
  );
}

function desenharCardTecnico(
  doc,
  item,
  x,
  y,
  largura
) {
  doc
    .save()
    .roundedRect(
      x,
      y,
      largura,
      39,
      4
    )
    .fillAndStroke(
      CORES.fundo,
      CORES.borda
    );

  doc
    .fillColor(CORES.textoClaro)
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .text(
      item.titulo,
      x + 9,
      y + 7,
      {
        width: largura - 18,
        lineBreak: false,
      }
    );

  doc
    .fillColor(CORES.texto)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(
      item.valor,
      x + 9,
      y + 21,
      {
        width: largura - 18,
        lineBreak: false,
      }
    );

  doc.restore();
}

// ==========================================================
// EVIDÊNCIAS
// ==========================================================

function adicionarEvidencia(
  doc,
  evidencia,
  indice,
  dados
) {
  const caminhoImagem =
    obterImagemEvidencia(evidencia);

  // Cada evidência fica agrupada.
  // Se não houver espaço suficiente,
  // começa em uma nova página.
  garantirEspaco(
    doc,
    caminhoImagem ? 330 : 105,
    dados
  );

  const largura = larguraUtil(doc);
  const x = PAGINA.margemEsquerda;
  const yInicial = doc.y;

  // Cabeçalho da evidência
  doc
    .save()
    .roundedRect(
      x,
      yInicial,
      largura,
      28,
      4
    )
    .fill(CORES.fundo);

  doc
    .fillColor(CORES.primaria)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(
      `EVIDÊNCIA ${String(
        indice + 1
      ).padStart(2, "0")}`,
      x + 10,
      yInicial + 9,
      {
        width: largura / 2,
        lineBreak: false,
      }
    );

  const tipo =
    valorOuNaoInformado(
      evidencia.tipo
    );

  doc
    .fillColor(CORES.textoClaro)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(
      tipo,
      x + largura / 2,
      yInicial + 9,
      {
        width:
          largura / 2 - 10,
        align: "right",
        lineBreak: false,
      }
    );

  doc.restore();

  doc.y = yInicial + 38;

  // Imagem
  if (caminhoImagem) {
    try {
      const imagem = doc.openImage(
        caminhoImagem
      );

      const maxLargura = 420;
      const maxAltura = 235;

      const escala = Math.min(
        maxLargura / imagem.width,
        maxAltura / imagem.height,
        1
      );

      const larguraImagem =
        imagem.width * escala;

      const alturaImagem =
        imagem.height * escala;

      garantirEspaco(
        doc,
        alturaImagem + 85,
        dados
      );

      const xImagem =
        x +
        (largura - larguraImagem) /
          2;

      doc.image(
        caminhoImagem,
        xImagem,
        doc.y,
        {
          width: larguraImagem,
          height: alturaImagem,
        }
      );

      doc.y += alturaImagem + 12;
    } catch (erro) {
      adicionarMensagem(
        doc,
        "Não foi possível inserir esta imagem no relatório.",
        dados
      );
    }
  } else if (evidencia.caminho_arquivo) {
    adicionarCampo(
      doc,
      "Arquivo",
      evidencia.caminho_arquivo,
      dados
    );
  }

  // Descrição abaixo da imagem
  const descricao =
    valorOuNaoInformado(
      evidencia.descricao
    );

  const alturaDescricao = doc
    .font("Helvetica")
    .fontSize(9)
    .heightOfString(descricao, {
      width: largura - 100,
    });

  garantirEspaco(
    doc,
    alturaDescricao + 35,
    dados
  );

  const yDescricao = doc.y;

  doc
    .fillColor(CORES.textoClaro)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(
      "Descrição",
      x,
      yDescricao,
      {
        width: 85,
      }
    );

  doc
    .fillColor(CORES.texto)
    .font("Helvetica")
    .fontSize(9)
    .text(
      descricao,
      x + 85,
      yDescricao,
      {
        width: largura - 85,
      }
    );

  doc.y =
    yDescricao +
    Math.max(
      alturaDescricao,
      12
    ) +
    13;

  doc
    .strokeColor(CORES.borda)
    .lineWidth(0.5)
    .moveTo(x, doc.y)
    .lineTo(x + largura, doc.y)
    .stroke();

  doc.y += 14;
}

// ==========================================================
// GERAÇÃO DO PDF
// ==========================================================

async function gerarPdfRelatorio(dados) {
  return new Promise((resolve, reject) => {
    try {
      const diretorio =
        garantirDiretorio();

      const nomeArquivo =
        `relatorio-${dados.id_relatorio}-${Date.now()}.pdf`;

      const caminhoCompleto =
        path.join(
          diretorio,
          nomeArquivo
        );

      const caminhoRelativo = path
        .join(
          "uploads",
          "relatorios",
          nomeArquivo
        )
        .replace(/\\/g, "/");

      const dataGeracao = new Date();

      const doc = new PDFDocument({
        size: "A4",

        margins: {
          top: PAGINA.margemSuperior,
          bottom:
            PAGINA.margemInferior,
          left: PAGINA.margemEsquerda,
          right:
            PAGINA.margemDireita,
        },

        bufferPages: true,

        info: {
          Title: `Relatório - ${valorOuNaoInformado(
            dados.nome_local
          )}`,

          Author:
            dados.responsavel ||
            "Inventário de Espaços Confinados",

          Subject:
            "Relatório Técnico de Inventário de Espaço Confinado",
        },
      });

      const stream =
        fs.createWriteStream(
          caminhoCompleto
        );

      doc.pipe(stream);

      // ==================================================
      // CABEÇALHO INICIAL
      // ==================================================

      adicionarCabecalhoPagina(
        doc,
        dados
      );

      // ==================================================
      // 1. IDENTIFICAÇÃO DO RELATÓRIO
      // ==================================================

      adicionarTitulo(
        doc,
        "1. Identificação do Relatório",
        dados
      );

      adicionarCampo(
        doc,
        "Número do relatório",
        dados.id_relatorio,
        dados
      );

      adicionarCampo(
        doc,
        "Número ART",
        dados.numero_art,
        dados
      );

      adicionarCampo(
        doc,
        "Responsável",
        dados.responsavel,
        dados
      );

      adicionarCampo(
        doc,
        "E-mail",
        dados.email_responsavel,
        dados
      );

      // ==================================================
      // 2. CAMPANHA
      // ==================================================

      adicionarTitulo(
        doc,
        "2. Dados da Campanha",
        dados
      );

      adicionarCampo(
        doc,
        "Campanha",
        dados.nome_campanha,
        dados
      );

      adicionarCampo(
        doc,
        "Empresa",
        dados.empresa,
        dados
      );

      adicionarCampo(
        doc,
        "Responsável pela campanha",
        dados.responsavel_campanha,
        dados
      );

      adicionarCampo(
        doc,
        "Data de início",
        formatarData(
          dados.data_inicio
        ),
        dados
      );

      adicionarStatus(
        doc,
        "Status",
        dados.status_campanha,
        dados
      );

      // ==================================================
      // 3. LOCAL
      // ==================================================

      adicionarTitulo(
        doc,
        "3. Identificação do Local",
        dados
      );

      adicionarCampo(
        doc,
        "Local",
        dados.nome_local,
        dados
      );

      adicionarCampo(
        doc,
        "Setor",
        dados.setor,
        dados
      );

      adicionarCampo(
        doc,
        "Descrição",
        dados.descricao_local,
        dados
      );

      adicionarCampo(
        doc,
        "Endereço",
        dados.endereco,
        dados
      );

      adicionarCampo(
        doc,
        "Latitude",
        dados.latitude,
        dados
      );

      adicionarCampo(
        doc,
        "Longitude",
        dados.longitude,
        dados
      );

      adicionarStatus(
        doc,
        "Status",
        dados.status_local,
        dados
      );

      // ==================================================
      // 4. CHECKLIST NR-33
      // ==================================================

      adicionarTitulo(
        doc,
        "4. Checklist NR-33",
        dados
      );

      if (dados.id_checklist) {
        adicionarCampo(
          doc,
          "Identificação do espaço",
          dados.identificacao_espaco,
          dados
        );

        adicionarCampo(
          doc,
          "Acesso controlado",
          dados.acesso_controlado,
          dados
        );

        adicionarCampo(
          doc,
          "Ventilação adequada",
          dados.ventilacao_adequada,
          dados
        );

        adicionarCampo(
          doc,
          "Monitoramento atmosférico",
          dados.monitoramento_atmosferico,
          dados
        );

        adicionarCampo(
          doc,
          "Procedimento de emergência",
          dados.procedimento_emergencia,
          dados
        );

        adicionarCampo(
          doc,
          "Observações",
          dados.observacoes_checklist,
          dados
        );

        adicionarStatus(
          doc,
          "Status",
          dados.status_checklist,
          dados
        );
      } else {
        adicionarMensagem(
          doc,
          "Checklist não cadastrado para este local.",
          dados
        );
      }

      // ==================================================
      // 5. DADOS TÉCNICOS
      // ==================================================

      adicionarTitulo(
        doc,
        "5. Dados Técnicos",
        dados
      );

      if (dados.id_dados) {
        adicionarDadosTecnicos(
          doc,
          dados
        );
      } else {
        adicionarMensagem(
          doc,
          "Dados técnicos não cadastrados para este local.",
          dados
        );
      }

      // ==================================================
      // 6. EVIDÊNCIAS
      // ==================================================

      adicionarTitulo(
        doc,
        "6. Evidências",
        dados
      );

      if (
        Array.isArray(
          dados.evidencias
        ) &&
        dados.evidencias.length > 0
      ) {
        dados.evidencias.forEach(
          (evidencia, indice) => {
            adicionarEvidencia(
              doc,
              evidencia,
              indice,
              dados
            );
          }
        );
      } else {
        adicionarMensagem(
          doc,
          "Nenhuma evidência cadastrada.",
          dados
        );
      }

      // ==================================================
      // RODAPÉS
      // ==================================================

      adicionarRodapes(
        doc,
        dados,
        dataGeracao
      );

      doc.end();

      // ==================================================
      // FINALIZAÇÃO / HASH
      // ==================================================

      stream.on("finish", () => {
        try {
          const arquivo =
            fs.readFileSync(
              caminhoCompleto
            );

          const hash = crypto
            .createHash("sha256")
            .update(arquivo)
            .digest("hex");

          resolve({
            caminhoCompleto,
            caminhoRelativo,
            hash,
          });
        } catch (erro) {
          reject(erro);
        }
      });

      stream.on(
        "error",
        reject
      );
    } catch (erro) {
      reject(erro);
    }
  });
}

module.exports = {
  gerarPdfRelatorio,
};