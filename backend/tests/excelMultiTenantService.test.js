const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const localService = require("../src/services/localMultiTenantService");
const excelService = require("../src/services/excelMultiTenantService");
const excelLegado = require("../src/services/excelService");
const localRepositoryLegado = require("../src/repositories/localRepository");
const pool = require("../src/config/database");

const AMBIENTE_A = "11111111-1111-4111-8111-111111111111";
const AMBIENTE_B = "22222222-2222-4222-8222-222222222222";
const USUARIO_A = { id_usuario: 10, id_ambiente: AMBIENTE_A };
const USUARIO_B = { id_usuario: 20, id_ambiente: AMBIENTE_B };
const CABECALHOS = [
  "Campanha", "Local", "Setor", "Endereço", "Latitude do Local",
  "Longitude do Local", "Status", "Foto", "Latitude Foto",
  "Longitude Foto", "Origem", "Precisão",
];

function registro(alteracoes = {}) {
  return {
    nome_campanha: "Campanha A",
    id_local: 40,
    nome_local: "Mesmo nome",
    setor: "Setor do local 40",
    endereco: "Endereço A",
    latitude_local: "-23.5000000",
    longitude_local: "-46.6000000",
    status: "ATIVO",
    id_evidencia: 100,
    tipo_evidencia: "FOTO",
    descricao_evidencia: "Evidência simulada",
    latitude_foto: "-23.5100000",
    longitude_foto: "-46.6100000",
    origem_coordenadas: "GPS",
    precisao_gps: "3.25",
    ...alteracoes,
  };
}

function simularFontes(t, resposta) {
  const guardas = [];
  function bloquear(objeto, metodo) {
    guardas.push(t.mock.method(objeto, metodo, async () => {
      throw new Error(`Chamada proibida neste teste: ${metodo}`);
    }));
  }

  bloquear(pool, "query");
  bloquear(pool, "connect");
  bloquear(excelLegado, "gerarExcelLocais");
  for (const metodo of [
    "criar", "listarTodos", "listarParaExportacao", "buscarPorId",
    "atualizar", "atualizarStatus",
  ]) {
    bloquear(localRepositoryLegado, metodo);
  }
  for (const metodo of [
    "criarLocal", "listarLocais", "buscarLocalPorId", "atualizarLocal", "alterarStatusLocal",
  ]) {
    bloquear(localService, metodo);
  }

  const consulta = t.mock.method(
    localService,
    "listarLocaisParaExportacao",
    async (usuario) => typeof resposta === "function" ? resposta(usuario) : resposta
  );
  t.after(() => {
    for (const guarda of guardas) {
      assert.equal(guarda.mock.callCount(), 0);
    }
  });
  return consulta;
}

async function abrir(buffer) {
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 0);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.equal(workbook.worksheets.length, 1);
  const worksheet = workbook.getWorksheet("Locais");
  assert.ok(worksheet);
  return worksheet;
}

function valoresLinha(worksheet, numero) {
  return Array.from({ length: 12 }, (_, indice) => worksheet.getRow(numero).getCell(indice + 1).value);
}

function linhasDeDados(worksheet) {
  return Array.from({ length: worksheet.rowCount - 1 }, (_, indice) => valoresLinha(worksheet, indice + 2));
}

test("Obtém registros exclusivamente de listarLocaisParaExportacao", async (t) => {
  const consulta = simularFontes(t, [registro()]);
  const worksheet = await abrir(await excelService.gerarExcelLocais(USUARIO_A));
  assert.equal(consulta.mock.callCount(), 1);
  assert.deepEqual(consulta.mock.calls[0].arguments, [USUARIO_A]);
  assert.equal(worksheet.rowCount, 2);
});

test("Encaminha a mesma instância da identidade autenticada original", async (t) => {
  const usuario = { ...USUARIO_A, eh_fundador: false, perfil_acesso: "ENGENHEIRO_SEGURANCA" };
  const consulta = simularFontes(t, (recebido) => {
    assert.strictEqual(recebido, usuario);
    return [];
  });
  await abrir(await excelService.gerarExcelLocais(usuario));
  assert.equal(consulta.mock.callCount(), 1);
  assert.strictEqual(consulta.mock.calls[0].arguments[0], usuario);
});

test("Identidade forjada nos registros não substitui a identidade da consulta nem vira coluna", async (t) => {
  const consulta = simularFontes(t, [registro({
    id_usuario: 999,
    id_ambiente: AMBIENTE_B,
    eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
  })]);
  const worksheet = await abrir(await excelService.gerarExcelLocais(USUARIO_A));
  assert.equal(consulta.mock.callCount(), 1);
  assert.strictEqual(consulta.mock.calls[0].arguments[0], USUARIO_A);
  assert.equal(worksheet.columnCount, 12);
  assert.deepEqual(valoresLinha(worksheet, 1), CABECALHOS);
  const conteudo = JSON.stringify(linhasDeDados(worksheet));
  assert.equal(conteudo.includes(AMBIENTE_B), false);
  assert.equal(conteudo.includes("ADMINISTRADOR"), false);
  assert.equal(conteudo.includes("999"), false);
});

test("Gera buffer XLSX válido que pode ser reaberto pelo ExcelJS", async (t) => {
  simularFontes(t, [registro()]);
  const buffer = await excelService.gerarExcelLocais(USUARIO_A);
  assert.equal(buffer.subarray(0, 2).toString("ascii"), "PK");
  const worksheet = await abrir(buffer);
  assert.equal(worksheet.getCell("A2").value, "Campanha A");
  assert.equal(worksheet.getCell("B2").value, "Mesmo nome");
});

test("Preserva as doze colunas e os cabeçalhos da exportação legada", async (t) => {
  simularFontes(t, [registro()]);
  const worksheet = await abrir(await excelService.gerarExcelLocais(USUARIO_A));
  assert.equal(worksheet.columnCount, 12);
  assert.deepEqual(valoresLinha(worksheet, 1), CABECALHOS);
  assert.equal(worksheet.getColumn(5).numFmt, "0.0000000");
  assert.equal(worksheet.getColumn(12).numFmt, '0.00 "m"');
});

test("Preserva valores reais de campanha, local, endereço, coordenadas e evidência", async (t) => {
  simularFontes(t, [registro()]);
  const worksheet = await abrir(await excelService.gerarExcelLocais(USUARIO_A));
  assert.deepEqual(valoresLinha(worksheet, 2), [
    "Campanha A", "Mesmo nome", "Setor do local 40", "Endereço A",
    -23.5, -46.6, "ATIVO", 1, -23.51, -46.61, "GPS", 3.25,
  ]);
});

test("Inclui locais sem evidências e preserva coordenadas de valor zero", async (t) => {
  simularFontes(t, [registro({
    id_evidencia: null,
    latitude_local: "0",
    longitude_local: 0,
    latitude_foto: null,
    longitude_foto: null,
    origem_coordenadas: null,
    precisao_gps: null,
  })]);
  const worksheet = await abrir(await excelService.gerarExcelLocais(USUARIO_A));
  assert.equal(worksheet.rowCount, 2);
  assert.equal(worksheet.getCell("B2").value, "Mesmo nome");
  assert.equal(worksheet.getCell("E2").value, 0);
  assert.equal(worksheet.getCell("F2").value, 0);
  for (const coluna of [8, 9, 10, 11, 12]) {
    assert.ok([null, ""].includes(worksheet.getRow(2).getCell(coluna).value));
  }
});

test("Agrupa por id_local sem misturar locais com nomes e campanhas iguais", async (t) => {
  simularFontes(t, [
    registro({ id_local: 40, id_evidencia: 103 }),
    registro({ id_local: 40, id_evidencia: 101 }),
    registro({ id_local: 50, setor: "Setor do local 50", id_evidencia: 102 }),
    registro({ id_local: 50, setor: "Setor do local 50", id_evidencia: 100 }),
  ]);
  const worksheet = await abrir(await excelService.gerarExcelLocais(USUARIO_A));
  const linhas = linhasDeDados(worksheet);
  assert.ok(linhas.every((linha) => linha[1] === "Mesmo nome"));
  assert.deepEqual(linhas.map((linha) => [linha[2], linha[7]]), [
    ["Setor do local 40", 1], ["Setor do local 40", 2],
    ["Setor do local 50", 1], ["Setor do local 50", 2],
  ]);
});

test("Agrupa registros intercalados por local sem depender dos IDs das evidências", async (t) => {
  simularFontes(t, [
    registro({ id_local: 40, id_evidencia: 900, latitude_foto: "1" }),
    registro({ id_local: 50, setor: "Setor do local 50", id_evidencia: 100, latitude_foto: "2" }),
    registro({ id_local: "40", id_evidencia: 300, latitude_foto: "3" }),
    registro({ id_local: 50, setor: "Setor do local 50", id_evidencia: 200, latitude_foto: "4" }),
  ]);
  const worksheet = await abrir(await excelService.gerarExcelLocais(USUARIO_A));
  assert.deepEqual(linhasDeDados(worksheet).map((linha) => [linha[2], linha[7], linha[8]]), [
    ["Setor do local 40", 1, 1], ["Setor do local 40", 2, 3],
    ["Setor do local 50", 1, 2], ["Setor do local 50", 2, 4],
  ]);
});

test("Reinicia numeração das fotos para cada local e não conta linhas sem evidência", async (t) => {
  simularFontes(t, [
    registro({ id_local: 40, id_evidencia: 1 }),
    registro({ id_local: 40, id_evidencia: 2 }),
    registro({ id_local: 60, setor: "Sem fotos", id_evidencia: null }),
    registro({ id_local: 50, setor: "Setor do local 50", id_evidencia: 3 }),
  ]);
  const worksheet = await abrir(await excelService.gerarExcelLocais(USUARIO_A));
  assert.equal(worksheet.getCell("H2").value, 1);
  assert.equal(worksheet.getCell("H3").value, 2);
  assert.ok([null, ""].includes(worksheet.getCell("H4").value));
  assert.equal(worksheet.getCell("H5").value, 1);
});

test("Gera planilha válida com somente cabeçalho quando a lista é vazia", async (t) => {
  simularFontes(t, []);
  const worksheet = await abrir(await excelService.gerarExcelLocais(USUARIO_A));
  assert.equal(worksheet.rowCount, 1);
  assert.equal(worksheet.columnCount, 12);
  assert.deepEqual(valoresLinha(worksheet, 1), CABECALHOS);
  assert.deepEqual(linhasDeDados(worksheet), []);
});

test("Não executa SQL direto, conexões ou chamadas aos componentes legados", async (t) => {
  const consulta = simularFontes(t, [registro()]);
  await abrir(await excelService.gerarExcelLocais(USUARIO_A));
  assert.equal(consulta.mock.callCount(), 1);
  // O encerramento do teste verifica todas as guardas instaladas.
});

test("Planilhas dos ambientes A e B contêm somente os registros de cada consulta", async (t) => {
  const registrosA = [registro({ nome_campanha: "Exclusiva A", endereco: "Endereço exclusivo A" })];
  const registrosB = [registro({
    id_local: 50, nome_campanha: "Exclusiva B", endereco: "Endereço exclusivo B",
  })];
  const consulta = simularFontes(t, (usuario) => {
    assert.ok(usuario === USUARIO_A || usuario === USUARIO_B);
    return usuario === USUARIO_A ? registrosA : registrosB;
  });

  for (const [indice, usuario] of [USUARIO_A, USUARIO_B].entries()) {
    const worksheet = await abrir(await excelService.gerarExcelLocais(usuario));
    const letra = indice === 0 ? "A" : "B";
    assert.equal(worksheet.rowCount, 2);
    assert.equal(worksheet.getCell("A2").value, `Exclusiva ${letra}`);
    assert.equal(worksheet.getCell("D2").value, `Endereço exclusivo ${letra}`);
    assert.strictEqual(consulta.mock.calls[indice].arguments[0], usuario);
  }
  assert.equal(consulta.mock.callCount(), 2);
});

test("Não adiciona registros de outro ambiente nem reaproveita dados entre exportações", async (t) => {
  const registroB = registro({ id_local: 50, nome_campanha: "MARCADOR_AMBIENTE_B" });
  const consulta = simularFontes(t, (usuario) => {
    if (usuario === USUARIO_B) return [registroB];
    assert.strictEqual(usuario, USUARIO_A);
    return [];
  });
  const planilhaB = await abrir(await excelService.gerarExcelLocais(USUARIO_B));
  assert.equal(planilhaB.getCell("A2").value, "MARCADOR_AMBIENTE_B");
  const planilhaA = await abrir(await excelService.gerarExcelLocais(USUARIO_A));
  assert.equal(planilhaA.rowCount, 1);
  assert.equal(JSON.stringify(linhasDeDados(planilhaA)).includes("MARCADOR_AMBIENTE_B"), false);
  assert.equal(consulta.mock.callCount(), 2);
});

test("Propaga a mesma instância de erro do serviço de locais", async (t) => {
  const erro = new Error("Falha simulada no serviço de locais");
  erro.statusCode = 401;
  const consulta = simularFontes(t, async () => { throw erro; });
  await assert.rejects(excelService.gerarExcelLocais(USUARIO_A), (recebido) => {
    assert.strictEqual(recebido, erro);
    assert.equal(recebido.statusCode, 401);
    return true;
  });
  assert.equal(consulta.mock.callCount(), 1);
});

test("Propaga erros durante a geração do buffer XLSX", async (t) => {
  const consulta = simularFontes(t, [registro()]);
  const erro = new Error("Falha simulada na geração XLSX");
  const prototipoXlsx = Object.getPrototypeOf(new ExcelJS.Workbook().xlsx);
  const gerarBuffer = t.mock.method(prototipoXlsx, "writeBuffer", async () => {
    throw erro;
  });
  await assert.rejects(excelService.gerarExcelLocais(USUARIO_A), (recebido) => {
    assert.strictEqual(recebido, erro);
    return true;
  });
  assert.equal(consulta.mock.callCount(), 1);
  assert.equal(gerarBuffer.mock.callCount(), 1);
});
