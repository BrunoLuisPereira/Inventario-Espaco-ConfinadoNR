const ExcelJS = require("exceljs");
const localMultiTenantService = require("./localMultiTenantService");

// Não utilizar nas rotas antes da homologação multi-tenant.
async function gerarExcelLocais(usuarioAutenticado) {
  const registros = await localMultiTenantService.listarLocaisParaExportacao(
    usuarioAutenticado
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Inventário de Espaços Confinados";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Locais");
  worksheet.columns = [
    { header: "Campanha", key: "campanha", width: 28 },
    { header: "Local", key: "local", width: 28 },
    { header: "Setor", key: "setor", width: 22 },
    { header: "Endereço", key: "endereco", width: 38 },
    { header: "Latitude do Local", key: "latitudeLocal", width: 20 },
    { header: "Longitude do Local", key: "longitudeLocal", width: 20 },
    { header: "Status", key: "status", width: 14 },
    { header: "Foto", key: "foto", width: 12 },
    { header: "Latitude Foto", key: "latitudeFoto", width: 20 },
    { header: "Longitude Foto", key: "longitudeFoto", width: 20 },
    { header: "Origem", key: "origem", width: 15 },
    { header: "Precisão", key: "precisao", width: 15 },
  ];

  // Agrupa pelo identificador, nunca pelos nomes da campanha ou do local.
  // Também mantém as linhas juntas caso a entrada venha intercalada.
  // A ordem de primeira ocorrência e a ordem das evidências são preservadas.
  const registrosPorLocal = new Map();
  for (const registro of registros) {
    const chave = String(registro.id_local);
    if (!registrosPorLocal.has(chave)) {
      registrosPorLocal.set(chave, []);
    }
    registrosPorLocal.get(chave).push(registro);
  }

  for (const registrosDoLocal of registrosPorLocal.values()) {
    let numeroFoto = 0;

    for (const registro of registrosDoLocal) {
      const possuiEvidencia = registro.id_evidencia != null;
      if (possuiEvidencia) {
        numeroFoto += 1;
      }

      worksheet.addRow({
        campanha: registro.nome_campanha,
        local: registro.nome_local,
        setor: registro.setor || "",
        endereco: registro.endereco || "",
        latitudeLocal:
          registro.latitude_local != null ? Number(registro.latitude_local) : "",
        longitudeLocal:
          registro.longitude_local != null ? Number(registro.longitude_local) : "",
        status: registro.status,
        foto: possuiEvidencia ? numeroFoto : "",
        latitudeFoto:
          registro.latitude_foto != null ? Number(registro.latitude_foto) : "",
        longitudeFoto:
          registro.longitude_foto != null ? Number(registro.longitude_foto) : "",
        origem: registro.origem_coordenadas || "",
        precisao:
          registro.precisao_gps != null ? Number(registro.precisao_gps) : "",
      });
    }
  }

  const cabecalho = worksheet.getRow(1);
  cabecalho.font = {
    bold: true,
    color: { argb: "FF172033" },
  };
  cabecalho.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF5B700" },
  };
  cabecalho.alignment = { vertical: "middle", horizontal: "center" };
  cabecalho.height = 24;

  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = { from: "A1", to: "L1" };
  worksheet.getColumn("E").numFmt = "0.0000000";
  worksheet.getColumn("F").numFmt = "0.0000000";
  worksheet.getColumn("I").numFmt = "0.0000000";
  worksheet.getColumn("J").numFmt = "0.0000000";
  worksheet.getColumn("L").numFmt = '0.00 "m"';

  worksheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: "middle" };
    if (rowNumber > 1) {
      row.height = 20;
    }
  });

  // Sem captura: erros de consulta ou geração seguem para o controller.
  return workbook.xlsx.writeBuffer();
}

module.exports = { gerarExcelLocais };
