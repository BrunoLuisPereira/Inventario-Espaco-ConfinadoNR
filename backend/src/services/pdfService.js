const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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

function adicionarTitulo(doc, texto) {
  doc
    .moveDown(0.5)
    .fontSize(14)
    .font("Helvetica-Bold")
    .text(texto)
    .moveDown(0.5);
}

function adicionarCampo(doc, titulo, valor) {
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .text(`${titulo}: `, {
      continued: true,
    })
    .font("Helvetica")
    .text(
      valor !== null &&
        valor !== undefined &&
        valor !== ""
        ? String(valor)
        : "Não informado"
    );
}

async function gerarPdfRelatorio(dados) {
  return new Promise((resolve, reject) => {
    try {
      const diretorio = garantirDiretorio();

      const nomeArquivo =
        `relatorio-${dados.id_relatorio}-${Date.now()}.pdf`;

      const caminhoCompleto = path.join(
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

      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        info: {
          Title: `Relatório - ${dados.nome_local}`,
          Author:
            dados.responsavel ||
            "Inventário de Espaços Confinados",
        },
      });

      const stream =
        fs.createWriteStream(caminhoCompleto);

      doc.pipe(stream);

      // ==================================================
      // Cabeçalho
      // ==================================================

      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .text(
          "INVENTÁRIO DE ESPAÇO CONFINADO",
          {
            align: "center",
          }
        );

      doc
        .fontSize(12)
        .text(
          "Relatório Técnico",
          {
            align: "center",
          }
        );

      doc.moveDown(1.5);

      // ==================================================
      // Relatório
      // ==================================================

      adicionarTitulo(
        doc,
        "1. Identificação do Relatório"
      );

      adicionarCampo(
        doc,
        "Número do relatório",
        dados.id_relatorio
      );

      adicionarCampo(
        doc,
        "Número ART",
        dados.numero_art
      );

      adicionarCampo(
        doc,
        "Responsável",
        dados.responsavel
      );

      adicionarCampo(
        doc,
        "E-mail",
        dados.email_responsavel
      );

      // ==================================================
      // Campanha
      // ==================================================

      adicionarTitulo(
        doc,
        "2. Dados da Campanha"
      );

      adicionarCampo(
        doc,
        "Campanha",
        dados.nome_campanha
      );

      adicionarCampo(
        doc,
        "Empresa",
        dados.empresa
      );

      adicionarCampo(
        doc,
        "Responsável pela campanha",
        dados.responsavel_campanha
      );

      adicionarCampo(
        doc,
        "Data de início",
        dados.data_inicio
          ? new Date(
              dados.data_inicio
            ).toLocaleDateString("pt-BR")
          : null
      );

      adicionarCampo(
        doc,
        "Status",
        dados.status_campanha
      );

      // ==================================================
      // Local
      // ==================================================

      adicionarTitulo(
        doc,
        "3. Identificação do Local"
      );

      adicionarCampo(
        doc,
        "Local",
        dados.nome_local
      );

      adicionarCampo(
        doc,
        "Setor",
        dados.setor
      );

      adicionarCampo(
        doc,
        "Descrição",
        dados.descricao_local
      );

      adicionarCampo(
        doc,
        "Endereço",
        dados.endereco
      );

      adicionarCampo(
        doc,
        "Latitude",
        dados.latitude
      );

      adicionarCampo(
        doc,
        "Longitude",
        dados.longitude
      );

      adicionarCampo(
        doc,
        "Status",
        dados.status_local
      );

      // ==================================================
      // Checklist
      // ==================================================

      adicionarTitulo(
        doc,
        "4. Checklist NR-33"
      );

      if (dados.id_checklist) {
        adicionarCampo(
          doc,
          "Identificação do espaço",
          dados.identificacao_espaco
        );

        adicionarCampo(
          doc,
          "Acesso controlado",
          dados.acesso_controlado
        );

        adicionarCampo(
          doc,
          "Ventilação adequada",
          dados.ventilacao_adequada
        );

        adicionarCampo(
          doc,
          "Monitoramento atmosférico",
          dados.monitoramento_atmosferico
        );

        adicionarCampo(
          doc,
          "Procedimento de emergência",
          dados.procedimento_emergencia
        );

        adicionarCampo(
          doc,
          "Observações",
          dados.observacoes_checklist
        );

        adicionarCampo(
          doc,
          "Status",
          dados.status_checklist
        );
      } else {
        doc
          .font("Helvetica")
          .fontSize(10)
          .text(
            "Checklist não cadastrado para este local."
          );
      }

      // ==================================================
      // Dados técnicos
      // ==================================================

      adicionarTitulo(
        doc,
        "5. Dados Técnicos"
      );

      if (dados.id_dados) {
        adicionarCampo(
          doc,
          "Pressão atmosférica",
          dados.pressao_atmosferica
        );

        adicionarCampo(
          doc,
          "Ventilação",
          dados.ventilacao
        );

        adicionarCampo(
          doc,
          "Oxigênio",
          dados.oxigenio
        );

        adicionarCampo(
          doc,
          "Gás inflamável",
          dados.gas_inflamavel
        );

        adicionarCampo(
          doc,
          "Monóxido de carbono",
          dados.monoxido_carbono
        );

        adicionarCampo(
          doc,
          "Sulfeto de hidrogênio",
          dados.sulfeto_hidrogenio
        );

        adicionarCampo(
          doc,
          "Temperatura",
          dados.temperatura
        );

        adicionarCampo(
          doc,
          "Umidade",
          dados.umidade
        );

        adicionarCampo(
          doc,
          "Observações",
          dados.observacoes_dados_tecnicos
        );

        adicionarCampo(
          doc,
          "Status",
          dados.status_dados_tecnicos
        );
      } else {
        doc
          .font("Helvetica")
          .fontSize(10)
          .text(
            "Dados técnicos não cadastrados para este local."
          );
      }

      // ==================================================
      // Evidências
      // ==================================================

      adicionarTitulo(
        doc,
        "6. Evidências"
      );

      if (
        Array.isArray(dados.evidencias) &&
        dados.evidencias.length > 0
      ) {
        dados.evidencias.forEach(
          (evidencia, indice) => {
            doc
              .font("Helvetica-Bold")
              .fontSize(10)
              .text(
                `Evidência ${indice + 1}`
              );

            adicionarCampo(
              doc,
              "Tipo",
              evidencia.tipo
            );

            adicionarCampo(
              doc,
              "Descrição",
              evidencia.descricao
            );

            adicionarCampo(
              doc,
              "Arquivo",
              evidencia.caminho_arquivo
            );

            doc.moveDown(0.5);
          }
        );
      } else {
        doc
          .font("Helvetica")
          .fontSize(10)
          .text(
            "Nenhuma evidência cadastrada."
          );
      }

      // ==================================================
      // Rodapé
      // ==================================================

      doc.moveDown(2);

      doc
        .font("Helvetica")
        .fontSize(9)
        .text(
          `Documento gerado em ${new Date().toLocaleString(
            "pt-BR"
          )}`,
          {
            align: "center",
          }
        );

      doc.end();

      stream.on("finish", () => {
        try {
          const arquivo =
            fs.readFileSync(caminhoCompleto);

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

      stream.on("error", reject);
    } catch (erro) {
      reject(erro);
    }
  });
}

module.exports = {
  gerarPdfRelatorio,
};