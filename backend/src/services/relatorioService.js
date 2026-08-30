const relatorioRepository = require("../repositories/relatorioRepository");
const localRepository = require("../repositories/localRepository");
const campanhaRepository = require("../repositories/campanhaRepository");
const pdfService = require("./pdfService");

const STATUS_VALIDOS = ["RASCUNHO", "GERADO"];

async function validarPermissaoLocal(idLocal, usuarioAutenticado) {
  const local = await localRepository.buscarPorId(idLocal);

  if (!local) {
    const erro = new Error("Local não encontrado.");
    erro.statusCode = 404;
    throw erro;
  }

  const campanha = await campanhaRepository.buscarPorId(local.id_campanha);

  if (!campanha) {
    const erro = new Error("Campanha não encontrada.");
    erro.statusCode = 404;
    throw erro;
  }

  const ehAdministrador =
    usuarioAutenticado.perfil_acesso === "ADMINISTRADOR";

  const ehResponsavel =
    Number(campanha.id_usuario) ===
    Number(usuarioAutenticado.id_usuario);

  if (!ehAdministrador && !ehResponsavel) {
    const erro = new Error(
      "Você não possui permissão para alterar o relatório deste local."
    );
    erro.statusCode = 403;
    throw erro;
  }

  return local;
}

function validarId(id, nomeCampo) {
  const numero = Number(id);

  if (!Number.isInteger(numero) || numero <= 0) {
    const erro = new Error(`${nomeCampo} inválido.`);
    erro.statusCode = 400;
    throw erro;
  }

  return numero;
}

function validarStatus(status) {
  if (status && !STATUS_VALIDOS.includes(status)) {
    const erro = new Error(
      "Status inválido. Use RASCUNHO ou GERADO."
    );
    erro.statusCode = 400;
    throw erro;
  }
}

async function criarRelatorio(dados, usuarioAutenticado) {
  const idLocal = validarId(dados.id_local, "ID do local");

  await validarPermissaoLocal(idLocal, usuarioAutenticado);

  const existente = await relatorioRepository.buscarPorLocal(idLocal);

  if (existente) {
    const erro = new Error(
      "Este local já possui um relatório cadastrado."
    );
    erro.statusCode = 409;
    throw erro;
  }

  const status = dados.status ?? "RASCUNHO";

  validarStatus(status);

  return relatorioRepository.criar({
    id_local: idLocal,
    id_usuario_responsavel:
      usuarioAutenticado.id_usuario,
    numero_art: dados.numero_art ?? null,
    caminho_pdf: null,
    hash_pdf: null,
    status,
    data_emissao: null,
  });
}

async function listarRelatorios() {
  return relatorioRepository.listarTodos();
}

async function buscarRelatorioPorId(idRelatorio) {
  const id = validarId(idRelatorio, "ID do relatório");

  const relatorio = await relatorioRepository.buscarPorId(id);

  if (!relatorio) {
    const erro = new Error("Relatório não encontrado.");
    erro.statusCode = 404;
    throw erro;
  }

  return relatorio;
}

async function buscarRelatorioPorLocal(idLocal) {
  const id = validarId(idLocal, "ID do local");

  const local = await localRepository.buscarPorId(id);

  if (!local) {
    const erro = new Error("Local não encontrado.");
    erro.statusCode = 404;
    throw erro;
  }

  const relatorio = await relatorioRepository.buscarPorLocal(id);

  if (!relatorio) {
    const erro = new Error(
      "Relatório não encontrado para este local."
    );
    erro.statusCode = 404;
    throw erro;
  }

  return relatorio;
}

async function atualizarRelatorio(
  idRelatorio,
  dados,
  usuarioAutenticado
) {
  const id = validarId(idRelatorio, "ID do relatório");

  const relatorioAtual =
    await relatorioRepository.buscarPorId(id);

  if (!relatorioAtual) {
    const erro = new Error("Relatório não encontrado.");
    erro.statusCode = 404;
    throw erro;
  }

  await validarPermissaoLocal(
    relatorioAtual.id_local,
    usuarioAutenticado
  );

  const status =
    dados.status ?? relatorioAtual.status;

  validarStatus(status);

  return relatorioRepository.atualizar(id, {
    numero_art:
      dados.numero_art ?? relatorioAtual.numero_art,
    caminho_pdf:
      relatorioAtual.caminho_pdf,
    hash_pdf:
      relatorioAtual.hash_pdf,
    status,
    data_emissao:
      relatorioAtual.data_emissao,
  });
}

async function excluirRelatorio(
  idRelatorio,
  usuarioAutenticado
) {
  const id = validarId(idRelatorio, "ID do relatório");

  const relatorio =
    await relatorioRepository.buscarPorId(id);

  if (!relatorio) {
    const erro = new Error("Relatório não encontrado.");
    erro.statusCode = 404;
    throw erro;
  }

  await validarPermissaoLocal(
    relatorio.id_local,
    usuarioAutenticado
  );

  return relatorioRepository.excluir(id);
}
async function buscarRelatorioCompleto(idRelatorio) {
  const id = validarId(
    idRelatorio,
    "ID do relatório"
  );

  const relatorio =
    await relatorioRepository.buscarDadosCompletos(id);

  if (!relatorio) {
    const erro = new Error("Relatório não encontrado.");
    erro.statusCode = 404;
    throw erro;
  }

  return relatorio;
}
async function gerarPdfRelatorio(
  idRelatorio,
  usuarioAutenticado
) {
  const id = validarId(
    idRelatorio,
    "ID do relatório"
  );

  const relatorioAtual =
    await relatorioRepository.buscarPorId(id);

  if (!relatorioAtual) {
    const erro = new Error("Relatório não encontrado.");
    erro.statusCode = 404;
    throw erro;
  }

  await validarPermissaoLocal(
    relatorioAtual.id_local,
    usuarioAutenticado
  );

  const dadosCompletos =
    await relatorioRepository.buscarDadosCompletos(id);

  if (!dadosCompletos) {
    const erro = new Error(
      "Não foi possível carregar os dados do relatório."
    );
    erro.statusCode = 404;
    throw erro;
  }

  const resultadoPdf =
    await pdfService.gerarPdfRelatorio(
      dadosCompletos
    );

  const dataEmissao = new Date();

  const relatorioAtualizado =
    await relatorioRepository.atualizar(id, {
      numero_art: relatorioAtual.numero_art,
      caminho_pdf: resultadoPdf.caminhoRelativo,
      hash_pdf: resultadoPdf.hash,
      status: "GERADO",
      data_emissao: dataEmissao,
    });

  return {
    relatorio: relatorioAtualizado,
    arquivo: {
      caminho: resultadoPdf.caminhoRelativo,
      hash_sha256: resultadoPdf.hash,
    },
  };
}
async function obterPdfParaDownload(
  idRelatorio,
  usuarioAutenticado
) {
  const id = validarId(
    idRelatorio,
    "ID do relatório"
  );

  const relatorio =
    await relatorioRepository.buscarPorId(id);

  if (!relatorio) {
    const erro = new Error("Relatório não encontrado.");
    erro.statusCode = 404;
    throw erro;
  }

  await validarPermissaoLocal(
    relatorio.id_local,
    usuarioAutenticado
  );

  if (!relatorio.caminho_pdf) {
    const erro = new Error(
      "Este relatório ainda não possui PDF gerado."
    );
    erro.statusCode = 404;
    throw erro;
  }

  return relatorio;
}
module.exports = {
  criarRelatorio,
  listarRelatorios,
  buscarRelatorioPorId,
  buscarRelatorioPorLocal,
  atualizarRelatorio,
  excluirRelatorio,
  buscarRelatorioCompleto, 
  gerarPdfRelatorio,
  obterPdfParaDownload,
};