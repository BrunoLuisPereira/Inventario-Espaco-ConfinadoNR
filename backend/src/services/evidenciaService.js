const evidenciaArquivoUtils = require(
  "../utils/evidenciaArquivoUtils"
);

const evidenciaRepository = require(
  "../repositories/evidenciaRepository"
);
const localRepository = require(
  "../repositories/localRepository"
);
const campanhaRepository = require(
  "../repositories/campanhaRepository"
);

const TIPOS_VALIDOS = [
  "FOTO",
  "TEXTO",
  "DOCUMENTO",
];

/**
 * Verifica se o usuário autenticado possui permissão
 * para acessar evidências de determinado local.
 *
 * Administrador: pode acessar qualquer evidência.
 * Engenheiro: somente evidências de locais pertencentes
 * às campanhas pelas quais ele é responsável.
 */
async function validarPermissaoLocal(
  idLocal,
  usuarioAutenticado
) {
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
      "Você não possui permissão para acessar evidências deste local."
    );

    erro.statusCode = 403;
    throw erro;
  }

  return local;
}

/**
 * Cria uma nova evidência.
 *
 * Quando id_operacao_cliente é informado,
 * a operação se torna idempotente.
 */
async function criarEvidencia(
  dados,
  usuarioAutenticado
) {
  const {
    id_local,
    tipo,
    caminho_arquivo,
    descricao,
    id_operacao_cliente,
  } = dados;

  if (!id_local) {
    const erro = new Error(
      "O campo id_local é obrigatório."
    );

    erro.statusCode = 400;
    throw erro;
  }

  if (!TIPOS_VALIDOS.includes(tipo)) {
    const erro = new Error(
      "Tipo inválido. Use FOTO, TEXTO ou DOCUMENTO."
    );

    erro.statusCode = 400;
    throw erro;
  }

  await validarPermissaoLocal(
    id_local,
    usuarioAutenticado
  );

  if (id_operacao_cliente) {
    const evidenciaExistente =
      await evidenciaRepository
        .buscarPorIdOperacaoCliente(
          id_operacao_cliente
        );

    if (evidenciaExistente) {
      return evidenciaExistente;
    }
  }

  try {
    return await evidenciaRepository.criar({
      id_local,
      tipo,
      caminho_arquivo,
      descricao,
      id_usuario:
        usuarioAutenticado.id_usuario,
      id_operacao_cliente:
        id_operacao_cliente || null,
    });
  } catch (erro) {
    if (
      erro.code === "23505" &&
      id_operacao_cliente
    ) {
      const evidenciaExistente =
        await evidenciaRepository
          .buscarPorIdOperacaoCliente(
            id_operacao_cliente
          );

      if (evidenciaExistente) {
        return evidenciaExistente;
      }
    }

    throw erro;
  }
}

/**
 * Lista as evidências que o usuário autenticado
 * possui permissão para visualizar.
 */
async function listarEvidencias(
  usuarioAutenticado
) {
  const ehAdministrador =
    usuarioAutenticado.perfil_acesso ===
    "ADMINISTRADOR";

  if (ehAdministrador) {
    return evidenciaRepository.listarTodos();
  }

  return evidenciaRepository
    .listarPorUsuarioResponsavel(
      usuarioAutenticado.id_usuario
    );
}

/**
 * Busca uma evidência pelo ID respeitando
 * as permissões do usuário autenticado.
 */
async function buscarEvidenciaPorId(
  idEvidencia,
  usuarioAutenticado
) {
  const id = Number(idEvidencia);

  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error(
      "ID da evidência inválido."
    );

    erro.statusCode = 400;
    throw erro;
  }

  const evidencia =
    await evidenciaRepository.buscarPorId(id);

  if (!evidencia) {
    const erro = new Error(
      "Evidência não encontrada."
    );

    erro.statusCode = 404;
    throw erro;
  }

  await validarPermissaoLocal(
    evidencia.id_local,
    usuarioAutenticado
  );

  return evidencia;
}

/**
 * Lista as evidências de determinado local
 * respeitando as permissões do usuário.
 */
async function listarEvidenciasPorLocal(
  idLocal,
  usuarioAutenticado
) {
  const id = Number(idLocal);

  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error(
      "ID do local inválido."
    );

    erro.statusCode = 400;
    throw erro;
  }

  await validarPermissaoLocal(
    id,
    usuarioAutenticado
  );

  return evidenciaRepository.listarPorLocal(
    id
  );
}

/**
 * Atualiza uma evidência.
 */
async function atualizarEvidencia(
  idEvidencia,
  dados,
  usuarioAutenticado
) {
  const id = Number(idEvidencia);

  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error(
      "ID da evidência inválido."
    );

    erro.statusCode = 400;
    throw erro;
  }

  const evidencia =
    await evidenciaRepository.buscarPorId(id);

  if (!evidencia) {
    const erro = new Error(
      "Evidência não encontrada."
    );

    erro.statusCode = 404;
    throw erro;
  }

  await validarPermissaoLocal(
    evidencia.id_local,
    usuarioAutenticado
  );

  const tipo =
    dados.tipo ?? evidencia.tipo;

  const caminho_arquivo =
    dados.caminho_arquivo ??
    evidencia.caminho_arquivo;

  const descricao =
    dados.descricao ??
    evidencia.descricao;

  if (!TIPOS_VALIDOS.includes(tipo)) {
    const erro = new Error(
      "Tipo inválido. Use FOTO, TEXTO ou DOCUMENTO."
    );

    erro.statusCode = 400;
    throw erro;
  }

  return evidenciaRepository.atualizar(
    id,
    {
      tipo,
      caminho_arquivo,
      descricao,
    }
  );
}

/**
 * Exclui uma evidência.
 */
async function excluirEvidencia(
  idEvidencia,
  usuarioAutenticado
) {
  const id = Number(idEvidencia);

  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error(
      "ID da evidência inválido."
    );

    erro.statusCode = 400;
    throw erro;
  }

  const evidencia =
    await evidenciaRepository.buscarPorId(id);

  if (!evidencia) {
    const erro = new Error(
      "Evidência não encontrada."
    );

    erro.statusCode = 404;
    throw erro;
  }

  await validarPermissaoLocal(
    evidencia.id_local,
    usuarioAutenticado
  );

  const evidenciaExcluida =
    await evidenciaRepository.excluir(id);

  if (evidencia.caminho_arquivo) {
    await evidenciaArquivoUtils.removerArquivo(
      evidencia.caminho_arquivo
    );
  }

  return evidenciaExcluida;
}

module.exports = {
  criarEvidencia,
  listarEvidencias,
  buscarEvidenciaPorId,
  listarEvidenciasPorLocal,
  atualizarEvidencia,
  excluirEvidencia,
};