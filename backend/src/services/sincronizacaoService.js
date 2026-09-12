const sincronizacaoRepository = require(
  "../repositories/sincronizacaoRepository"
);

const versaoEntidadeRepository = require(
  "../repositories/versaoEntidadeRepository"
);

const sincronizacaoAplicacaoRepository = require(
  "../repositories/sincronizacaoAplicacaoRepository"
);


// ======================================================
// Constantes
// ======================================================

const STATUS_VALIDOS = [
  "PENDENTE",
  "SINCRONIZADO",
  "CONFLITO",
  "ERRO",
];

const OPERACOES_VALIDAS = [
  "CRIAR",
  "ATUALIZAR",
  "EXCLUIR",
];

const ENTIDADES_VALIDAS = [
  "CAMPANHA",
  "LOCAL",
  "CHECKLIST_NR33",
  "EVIDENCIA",
  "DADOS_TECNICOS",
];


// ======================================================
// Funções auxiliares
// ======================================================

function criarErro(
  mensagem,
  statusCode
) {
  const erro =
    new Error(mensagem);

  erro.statusCode =
    statusCode;

  return erro;
}


function usuarioEhAdministrador(
  usuarioAutenticado
) {
  return (
    usuarioAutenticado &&
    usuarioAutenticado
      .perfil_acesso ===
      "ADMINISTRADOR"
  );
}


function usuarioEhProprietario(
  registro,
  usuarioAutenticado
) {
  return (
    registro &&
    usuarioAutenticado &&
    Number(
      registro.id_usuario
    ) ===
      Number(
        usuarioAutenticado
          .id_usuario
      )
  );
}


function validarPermissaoSincronizacao(
  registro,
  usuarioAutenticado
) {
  const ehAdministrador =
    usuarioEhAdministrador(
      usuarioAutenticado
    );

  const ehProprietario =
    usuarioEhProprietario(
      registro,
      usuarioAutenticado
    );

  if (
    !ehAdministrador &&
    !ehProprietario
  ) {
    throw criarErro(
      "Você não possui permissão para acessar esta sincronização.",
      403
    );
  }
}


function validarId(
  valor,
  nomeCampo
) {
  const numero =
    Number(valor);

  if (
    !Number.isInteger(numero) ||
    numero <= 0
  ) {
    throw criarErro(
      `${nomeCampo} inválido.`,
      400
    );
  }

  return numero;
}


function validarStatus(
  status
) {
  if (
    !STATUS_VALIDOS.includes(
      status
    )
  ) {
    throw criarErro(
      `Status inválido. Valores permitidos: ${STATUS_VALIDOS.join(
        ", "
      )}.`,
      400
    );
  }
}


function validarOperacao(
  operacao
) {
  if (
    !OPERACOES_VALIDAS.includes(
      operacao
    )
  ) {
    throw criarErro(
      `Operação inválida. Valores permitidos: ${OPERACOES_VALIDAS.join(
        ", "
      )}.`,
      400
    );
  }
}


function validarEntidade(
  entidade
) {
  if (
    !entidade ||
    typeof entidade !== "string" ||
    !entidade.trim()
  ) {
    throw criarErro(
      "A entidade é obrigatória.",
      400
    );
  }

  const entidadeNormalizada =
    entidade
      .trim()
      .toUpperCase();

  if (
    !ENTIDADES_VALIDAS.includes(
      entidadeNormalizada
    )
  ) {
    throw criarErro(
      `Entidade inválida. Valores permitidos: ${ENTIDADES_VALIDAS.join(
        ", "
      )}.`,
      400
    );
  }

  return entidadeNormalizada;
}


function validarVersao(
  valor,
  nomeCampo
) {
  const numero =
    Number(valor);

  if (
    !Number.isInteger(numero) ||
    numero <= 0
  ) {
    throw criarErro(
      `${nomeCampo} deve ser um número inteiro maior que zero.`,
      400
    );
  }

  return numero;
}


function validarUuidOpcional(
  valor,
  nomeCampo
) {
  if (
    valor === undefined ||
    valor === null
  ) {
    return null;
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (
    typeof valor !== "string" ||
    !uuidRegex.test(valor)
  ) {
    throw criarErro(
      `${nomeCampo} deve ser um UUID válido.`,
      400
    );
  }

  return valor;
}
// ======================================================
// Criar sincronização
// ======================================================

async function criarSincronizacao(
  dados,
  usuarioAutenticado
) {
  const entidade =
    validarEntidade(
      dados.entidade
    );

  validarOperacao(
    dados.operacao
  );

  const versaoCliente =
    validarVersao(
      dados.versao_cliente ?? 1,
      "Versão do cliente"
    );

  const idOperacaoCliente =
    validarUuidOpcional(
      dados.id_operacao_cliente,
      "ID da operação do cliente"
    );

  const idRegistroCliente =
    validarUuidOpcional(
      dados.id_registro_cliente,
      "ID do registro do cliente"
    );


  // ==================================================
  // Idempotência
  // ==================================================

  if (idOperacaoCliente) {
    const existente =
      await sincronizacaoRepository
        .buscarPorOperacaoCliente(
          idOperacaoCliente
        );

    if (existente) {
      validarPermissaoSincronizacao(
        existente,
        usuarioAutenticado
      );

      return existente;
    }
  }


  // ==================================================
  // Operação CRIAR
  // ==================================================

  if (
    dados.operacao === "CRIAR"
  ) {
    if (!idRegistroCliente) {
      throw criarErro(
        "O ID do registro do cliente é obrigatório para a operação CRIAR.",
        400
      );
    }

    const idEntidade =
      dados.id_entidade
        ? validarId(
            dados.id_entidade,
            "ID da entidade"
          )
        : null;

    return sincronizacaoRepository
      .criar({
        entidade,

        id_entidade:
          idEntidade,

        id_operacao_cliente:
          idOperacaoCliente,

        id_registro_cliente:
          idRegistroCliente,

        operacao:
          "CRIAR",

        versao_cliente:
          versaoCliente,

        versao_servidor:
          1,

        status:
          "PENDENTE",

        dados_cliente:
          dados.dados_cliente ??
          null,

        dados_servidor:
          null,

        mensagem_erro:
          null,

        id_usuario:
          usuarioAutenticado
            .id_usuario,

        data_sincronizacao:
          null,
      });
  }


  // ==================================================
  // ATUALIZAR / EXCLUIR exigem ID da entidade
  // ==================================================

  const idEntidade =
    validarId(
      dados.id_entidade,
      "ID da entidade"
    );


  // ==================================================
  // Versão oficial do servidor
  // ==================================================

  const controleVersao =
    await versaoEntidadeRepository
      .obterVersaoExistente(
        entidade,
        idEntidade
      );

  if (!controleVersao) {
    throw criarErro(
      "Controle de versão da entidade não encontrado.",
      404
    );
  }

  const versaoServidor =
    Number(
      controleVersao.versao
    );


  // ==================================================
  // Detecção de conflito
  // ==================================================

  let status =
    "PENDENTE";

  let mensagemErro =
    null;

  let dadosServidor =
    null;

  if (
    versaoCliente !==
    versaoServidor
  ) {
    status =
      "CONFLITO";

    mensagemErro =
      "Conflito de versão detectado. O registro do servidor foi alterado desde a última sincronização do cliente.";

    dadosServidor =
      await sincronizacaoAplicacaoRepository
        .buscarDadosAtuaisServidor(
          entidade,
          idEntidade,
          usuarioAutenticado
        );
  }

  return sincronizacaoRepository
    .criar({
      entidade,

      id_entidade:
        idEntidade,

      id_operacao_cliente:
        idOperacaoCliente,

      id_registro_cliente:
        idRegistroCliente,

      operacao:
        dados.operacao,

      versao_cliente:
        versaoCliente,

      versao_servidor:
        versaoServidor,

      status,

      dados_cliente:
        dados.dados_cliente ??
        null,

      dados_servidor:
        dadosServidor,

      mensagem_erro:
        mensagemErro,

      id_usuario:
        usuarioAutenticado
          .id_usuario,

      data_sincronizacao:
        null,
    });
}


// ======================================================
// Listar sincronizações
// ======================================================

async function listarSincronizacoes(
  usuarioAutenticado
) {
  const sincronizacoes =
    await sincronizacaoRepository
      .listarTodos();

  if (
    usuarioEhAdministrador(
      usuarioAutenticado
    )
  ) {
    return sincronizacoes;
  }

  return sincronizacoes.filter(
    (registro) =>
      Number(
        registro.id_usuario
      ) ===
      Number(
        usuarioAutenticado
          .id_usuario
      )
  );
}


// ======================================================
// Buscar sincronização por ID
// ======================================================

async function buscarSincronizacaoPorId(
  idSincronizacao,
  usuarioAutenticado
) {
  const id =
    validarId(
      idSincronizacao,
      "ID da sincronização"
    );

  const registro =
    await sincronizacaoRepository
      .buscarPorId(id);

  if (!registro) {
    throw criarErro(
      "Registro de sincronização não encontrado.",
      404
    );
  }

  validarPermissaoSincronizacao(
    registro,
    usuarioAutenticado
  );

  return registro;
}


// ======================================================
// Buscar sincronizações por entidade
// ======================================================

async function buscarPorEntidade(
  entidade,
  idEntidade,
  usuarioAutenticado
) {
  const entidadeValidada =
    validarEntidade(
      entidade
    );

  const id =
    validarId(
      idEntidade,
      "ID da entidade"
    );

  const sincronizacoes =
    await sincronizacaoRepository
      .buscarPorEntidade(
        entidadeValidada,
        id
      );

  if (
    usuarioEhAdministrador(
      usuarioAutenticado
    )
  ) {
    return sincronizacoes;
  }

  return sincronizacoes.filter(
    (registro) =>
      Number(
        registro.id_usuario
      ) ===
      Number(
        usuarioAutenticado
          .id_usuario
      )
  );
}
// ======================================================
// Buscar pendentes
// ======================================================

async function buscarPendentes(
  usuarioAutenticado
) {
  if (
    usuarioEhAdministrador(
      usuarioAutenticado
    )
  ) {
    return sincronizacaoRepository
      .buscarPendentesTodos();
  }

  return sincronizacaoRepository
    .buscarPendentesPorUsuario(
      usuarioAutenticado
        .id_usuario
    );
}


// ======================================================
// Buscar conflitos
// ======================================================

async function buscarConflitos(
  usuarioAutenticado
) {
  if (
    usuarioEhAdministrador(
      usuarioAutenticado
    )
  ) {
    return sincronizacaoRepository
      .buscarConflitosTodos();
  }

  return sincronizacaoRepository
    .buscarConflitosPorUsuario(
      usuarioAutenticado
        .id_usuario
    );
}


// ======================================================
// Atualizar status manualmente
// ======================================================

async function atualizarStatus(
  idSincronizacao,
  dados,
  usuarioAutenticado
) {
  const id =
    validarId(
      idSincronizacao,
      "ID da sincronização"
    );

  const registroAtual =
    await sincronizacaoRepository
      .buscarPorId(id);

  if (!registroAtual) {
    throw criarErro(
      "Registro de sincronização não encontrado.",
      404
    );
  }

  validarPermissaoSincronizacao(
    registroAtual,
    usuarioAutenticado
  );

  if (dados.status) {
    validarStatus(
      dados.status
    );
  }

  let dataSincronizacao =
    dados.data_sincronizacao ??
    null;

  if (
    dados.status ===
    "SINCRONIZADO"
  ) {
    dataSincronizacao =
      new Date();
  }

  return sincronizacaoRepository
    .atualizarStatus(
      id,
      {
        status:
          dados.status ??
          null,

        versao_servidor:
          dados.versao_servidor ??
          null,

        dados_servidor:
          dados.dados_servidor ??
          null,

        mensagem_erro:
          dados.mensagem_erro ??
          null,

        data_sincronizacao:
          dataSincronizacao,
      }
    );
}


// ======================================================
// Excluir sincronização
// ======================================================

async function excluirSincronizacao(
  idSincronizacao,
  usuarioAutenticado
) {
  const id =
    validarId(
      idSincronizacao,
      "ID da sincronização"
    );

  const registro =
    await sincronizacaoRepository
      .buscarPorId(id);

  if (!registro) {
    throw criarErro(
      "Registro de sincronização não encontrado.",
      404
    );
  }

  validarPermissaoSincronizacao(
    registro,
    usuarioAutenticado
  );

  const excluido =
    await sincronizacaoRepository
      .excluir(id);

  if (!excluido) {
    throw criarErro(
      "Registro de sincronização não encontrado.",
      404
    );
  }

  return excluido;
}
// ======================================================
// Resolver conflito
// ======================================================

async function resolverConflito(
  idSincronizacao,
  dados,
  usuarioAutenticado
) {
  const id =
    validarId(
      idSincronizacao,
      "ID da sincronização"
    );

  const resolucoesValidas = [
    "CLIENTE",
    "SERVIDOR",
    "MESCLADO",
  ];

  if (
    !dados.resolucao ||
    !resolucoesValidas.includes(
      dados.resolucao
    )
  ) {
    throw criarErro(
      "Resolução inválida. Valores permitidos: CLIENTE, SERVIDOR ou MESCLADO.",
      400
    );
  }

  const sincronizacao =
    await sincronizacaoRepository
      .buscarPorId(id);

  if (!sincronizacao) {
    throw criarErro(
      "Registro de sincronização não encontrado.",
      404
    );
  }
  if (
    sincronizacao.status !==
    "CONFLITO"
  ) {
    throw criarErro(
      "Esta sincronização não possui um conflito pendente.",
      409
    );
  }
   // ==================================================
  // Conflitos de exclusão possuem regras próprias
  // ==================================================

  validarPermissaoSincronizacao(
    sincronizacao,
    usuarioAutenticado
  );

  if (
    sincronizacao.operacao ===
    "EXCLUIR"
  ) {
    if (
      dados.resolucao ===
      "MESCLADO"
    ) {
      throw criarErro(
        "A resolução MESCLADO não é permitida para conflitos de exclusão.",
        400
      );
    }

    return sincronizacaoAplicacaoRepository
      .resolverConflitoExclusao({
        sincronizacao,

        resolucao:
          dados.resolucao,

        idUsuarioResolucao:
          usuarioAutenticado
            .id_usuario,
      });
  }

  const parametros = {
    sincronizacao,

    resolucao:
      dados.resolucao,

    dadosResolvidos:
      dados.dados_resolvidos ??
      null,

    idUsuarioResolucao:
      usuarioAutenticado
        .id_usuario,
  };

  switch (
    sincronizacao.entidade
  ) {
    case "LOCAL":
      return sincronizacaoAplicacaoRepository
        .resolverConflitoLocal(
          parametros
        );

    case "CAMPANHA":
      return sincronizacaoAplicacaoRepository
        .resolverConflitoCampanha(
          parametros
        );

    case "CHECKLIST_NR33":
      return sincronizacaoAplicacaoRepository
        .resolverConflitoChecklist(
          parametros
        );

    case "DADOS_TECNICOS":
      return sincronizacaoAplicacaoRepository
        .resolverConflitoDadosTecnicos(
          parametros
        );

    default:
      throw criarErro(
        "A resolução manual desta entidade ainda não foi implementada.",
        400
      );
  }
}


// ======================================================
// Processar sincronização pendente
// ======================================================

async function processarSincronizacao(
  idSincronizacao,
  usuarioAutenticado
) {
  const id =
    validarId(
      idSincronizacao,
      "ID da sincronização"
    );

  const sincronizacao =
    await sincronizacaoRepository
      .buscarPorId(id);

  if (!sincronizacao) {
    throw criarErro(
      "Registro de sincronização não encontrado.",
      404
    );
  }

  if (
    sincronizacao.status !==
    "PENDENTE"
  ) {
    throw criarErro(
      "A sincronização não está pendente.",
      409
    );
  }

  validarPermissaoSincronizacao(
    sincronizacao,
    usuarioAutenticado
  );

  return sincronizacaoAplicacaoRepository
    .processarSincronizacaoPendente(
      sincronizacao
    );
}


// ======================================================
// Exportações
// ======================================================

module.exports = {
  criarSincronizacao,
  listarSincronizacoes,
  buscarSincronizacaoPorId,
  buscarPorEntidade,
  buscarPendentes,
  buscarConflitos,
  atualizarStatus,
  excluirSincronizacao,
  resolverConflito,
  processarSincronizacao,
};