const relatorioRepository = require("../repositories/relatorioRepository");
const localRepository = require("../repositories/localRepository");
const campanhaRepository = require("../repositories/campanhaRepository");
const pdfService = require("./pdfService");

const STATUS_VALIDOS = ["RASCUNHO", "GERADO"];

function validarUsuarioAutenticado(usuarioAutenticado) {
  if (
    !usuarioAutenticado ||
    typeof usuarioAutenticado !== "object"
  ) {
    const erro = new Error(
      "Usuário autenticado inválido."
    );
    erro.statusCode = 401;
    throw erro;
  }

  const idUsuario = Number(
    usuarioAutenticado.id_usuario
  );

  const perfisPermitidos = [
    "ADMINISTRADOR",
    "ENGENHEIRO_SEGURANCA",
  ];

  if (
    !Number.isInteger(idUsuario) ||
    idUsuario <= 0 ||
    !perfisPermitidos.includes(
      usuarioAutenticado.perfil_acesso
    )
  ) {
    const erro = new Error(
      "Usuário autenticado inválido."
    );
    erro.statusCode = 401;
    throw erro;
  }

  return {
    id_usuario: idUsuario,
    perfil_acesso:
      usuarioAutenticado.perfil_acesso,
  };
}

async function validarPermissaoLocal(
  idLocal,
  usuarioAutenticado
) {
  usuarioAutenticado =
    validarUsuarioAutenticado(
      usuarioAutenticado
    );

  const local =
    await localRepository.buscarPorId(idLocal);

  if (!local) {
    const erro = new Error(
      "Local não encontrado."
    );
    erro.statusCode = 404;
    throw erro;
  }

  const campanha =
    await campanhaRepository.buscarPorId(
      local.id_campanha
    );

  if (!campanha) {
    const erro = new Error(
      "Campanha não encontrada."
    );
    erro.statusCode = 404;
    throw erro;
  }

  const ehAdministrador =
    usuarioAutenticado.perfil_acesso ===
    "ADMINISTRADOR";

  const ehResponsavel =
    Number(campanha.id_usuario) ===
    Number(usuarioAutenticado.id_usuario);

  if (!ehAdministrador && !ehResponsavel) {
    const erro = new Error(
      "Você não possui permissão para acessar o relatório deste local."
    );
    erro.statusCode = 403;
    throw erro;
  }

  return local;
}

function validarId(id, nomeCampo) {
  const numero = Number(id);

  if (!Number.isInteger(numero) || numero <= 0) {
    const erro = new Error(
      `${nomeCampo} inválido.`
    );
    erro.statusCode = 400;
    throw erro;
  }

  return numero;
}

function validarStatus(status) {
  if (
    status &&
    !STATUS_VALIDOS.includes(status)
  ) {
    const erro = new Error(
      "Status inválido. Use RASCUNHO ou GERADO."
    );
    erro.statusCode = 400;
    throw erro;
  }
}

function normalizarTextoOpcional(valor) {
  if (
    valor === undefined ||
    valor === null
  ) {
    return null;
  }

  const texto = String(valor).trim();

  return texto || null;
}

function normalizarDataOpcional(valor) {
  if (
    valor === undefined ||
    valor === null ||
    valor === ""
  ) {
    return null;
  }

  const texto = String(valor).trim();

  const formatoValido =
    /^\d{4}-\d{2}-\d{2}$/.test(texto);

  if (!formatoValido) {
    const erro = new Error(
      "Data da ART inválida. Use o formato AAAA-MM-DD."
    );
    erro.statusCode = 400;
    throw erro;
  }

  return texto;
}

async function criarRelatorio(
  dados,
  usuarioAutenticado
) {
  usuarioAutenticado =
    validarUsuarioAutenticado(
      usuarioAutenticado
    );

  const idLocal = validarId(
    dados.id_local,
    "ID do local"
  );

  await validarPermissaoLocal(
    idLocal,
    usuarioAutenticado
  );

  const existente =
    await relatorioRepository.buscarPorLocal(
      idLocal
    );

  if (existente) {
    const erro = new Error(
      "Este local já possui um relatório cadastrado."
    );
    erro.statusCode = 409;
    throw erro;
  }

  const status =
    dados.status ?? "RASCUNHO";

  validarStatus(status);

  return relatorioRepository.criar({
    id_local: idLocal,

    // O usuário responsável vem da autenticação.
    id_usuario_responsavel:
      usuarioAutenticado.id_usuario,

    // Dados do responsável técnico.
    nome_responsavel_tecnico:
      normalizarTextoOpcional(
        dados.nome_responsavel_tecnico
      ),

    crea:
      normalizarTextoOpcional(
        dados.crea
      ),

    numero_art:
      normalizarTextoOpcional(
        dados.numero_art
      ),

    data_art:
      normalizarDataOpcional(
        dados.data_art
      ),

    caminho_pdf: null,
    hash_pdf: null,
    status,
    data_emissao: null,
  });
}

async function listarRelatorios(
  usuarioAutenticado
) {
  usuarioAutenticado =
    validarUsuarioAutenticado(
      usuarioAutenticado
    );

  const ehAdministrador =
    usuarioAutenticado.perfil_acesso ===
    "ADMINISTRADOR";

  if (ehAdministrador) {
    return relatorioRepository.listarTodos();
  }

  return relatorioRepository
    .listarPorUsuarioResponsavel(
      usuarioAutenticado.id_usuario
    );
}

async function buscarRelatorioPorId(
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
    const erro = new Error(
      "Relatório não encontrado."
    );
    erro.statusCode = 404;
    throw erro;
  }

  await validarPermissaoLocal(
    relatorio.id_local,
    usuarioAutenticado
  );

  return relatorio;
}

async function buscarRelatorioPorLocal(
  idLocal,
  usuarioAutenticado
) {
  const id = validarId(
    idLocal,
    "ID do local"
  );

  await validarPermissaoLocal(
    id,
    usuarioAutenticado
  );

  const relatorio =
    await relatorioRepository.buscarPorLocal(
      id
    );

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
  const id = validarId(
    idRelatorio,
    "ID do relatório"
  );

  const relatorioAtual =
    await relatorioRepository.buscarPorId(id);

  if (!relatorioAtual) {
    const erro = new Error(
      "Relatório não encontrado."
    );
    erro.statusCode = 404;
    throw erro;
  }

  await validarPermissaoLocal(
    relatorioAtual.id_local,
    usuarioAutenticado
  );

  const status =
    dados.status ??
    relatorioAtual.status;

  validarStatus(status);

  /*
   * Se determinado campo não vier no PUT,
   * preservamos o valor que já existe.
   *
   * Se vier como string vazia, ele será
   * transformado em NULL.
   */

  const nomeResponsavelTecnico =
    dados.nome_responsavel_tecnico !==
    undefined
      ? normalizarTextoOpcional(
          dados.nome_responsavel_tecnico
        )
      : relatorioAtual.nome_responsavel_tecnico;

  const crea =
    dados.crea !== undefined
      ? normalizarTextoOpcional(
          dados.crea
        )
      : relatorioAtual.crea;

  const numeroArt =
    dados.numero_art !== undefined
      ? normalizarTextoOpcional(
          dados.numero_art
        )
      : relatorioAtual.numero_art;

  const dataArt =
    dados.data_art !== undefined
      ? normalizarDataOpcional(
          dados.data_art
        )
      : relatorioAtual.data_art;

  return relatorioRepository.atualizar(
    id,
    {
      nome_responsavel_tecnico:
        nomeResponsavelTecnico,

      crea,

      numero_art:
        numeroArt,

      data_art:
        dataArt,

      // Estes campos continuam controlados
      // pelo fluxo de geração do relatório.
      caminho_pdf:
        relatorioAtual.caminho_pdf,

      hash_pdf:
        relatorioAtual.hash_pdf,

      status,

      data_emissao:
        relatorioAtual.data_emissao,
    }
  );
}

async function excluirRelatorio(
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
    const erro = new Error(
      "Relatório não encontrado."
    );
    erro.statusCode = 404;
    throw erro;
  }

  await validarPermissaoLocal(
    relatorio.id_local,
    usuarioAutenticado
  );

  return relatorioRepository.excluir(id);
}

async function buscarRelatorioCompleto(
  idRelatorio,
  usuarioAutenticado
) {
  const id = validarId(
    idRelatorio,
    "ID do relatório"
  );

  /*
   * Primeiro buscamos o registro básico para
   * descobrir o local e validar a permissão.
   */
  const relatorioAtual =
    await relatorioRepository.buscarPorId(id);

  if (!relatorioAtual) {
    const erro = new Error(
      "Relatório não encontrado."
    );
    erro.statusCode = 404;
    throw erro;
  }

  await validarPermissaoLocal(
    relatorioAtual.id_local,
    usuarioAutenticado
  );

  const relatorio =
    await relatorioRepository
      .buscarDadosCompletos(id);

  if (!relatorio) {
    const erro = new Error(
      "Relatório não encontrado."
    );
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
    const erro = new Error(
      "Relatório não encontrado."
    );
    erro.statusCode = 404;
    throw erro;
  }

  await validarPermissaoLocal(
    relatorioAtual.id_local,
    usuarioAutenticado
  );

  const dadosCompletos =
    await relatorioRepository
      .buscarDadosCompletos(id);

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

  /*
   * Importante:
   * ao atualizar caminho/hash/status do PDF,
   * preservamos também os dados técnicos.
   */
  const relatorioAtualizado =
    await relatorioRepository.atualizar(
      id,
      {
        nome_responsavel_tecnico:
          relatorioAtual.nome_responsavel_tecnico,

        crea:
          relatorioAtual.crea,

        numero_art:
          relatorioAtual.numero_art,

        data_art:
          relatorioAtual.data_art,

        caminho_pdf:
          resultadoPdf.caminhoRelativo,

        hash_pdf:
          resultadoPdf.hash,

        status: "GERADO",

        data_emissao:
          dataEmissao,
      }
    );

  return {
    relatorio:
      relatorioAtualizado,

    arquivo: {
      caminho:
        resultadoPdf.caminhoRelativo,

      hash_sha256:
        resultadoPdf.hash,
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
    const erro = new Error(
      "Relatório não encontrado."
    );
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