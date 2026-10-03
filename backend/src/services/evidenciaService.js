
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

const ORIGENS_COORDENADAS = [
  "GPS",
  "MANUAL",
];

/**
 * Cria um erro HTTP com a mensagem informada.
 */
function criarErro(mensagem, statusCode = 400) {
  const erro = new Error(mensagem);
  erro.statusCode = statusCode;
  return erro;
}

/**
 * Verifica se um campo foi informado.
 *
 * Zero é considerado um valor válido.
 */
function foiInformado(valor) {
  return (
    valor !== undefined &&
    valor !== null &&
    valor !== ""
  );
}

/**
 * Valida os dados de localização da evidência.
 *
 * Permite:
 * - Coordenadas obtidas pelo GPS;
 * - Coordenadas informadas manualmente;
 * - Evidências sem localização.
 *
 * Latitude e longitude devem ser fornecidas juntas.
 */
function validarCoordenadas(dados) {
  const temLatitude = foiInformado(
    dados.latitude
  );

  const temLongitude = foiInformado(
    dados.longitude
  );

  if (temLatitude !== temLongitude) {
    throw criarErro(
      "Informe latitude e longitude juntas."
    );
  }

  const latitude = temLatitude
    ? Number(dados.latitude)
    : null;

  const longitude = temLongitude
    ? Number(dados.longitude)
    : null;

  if (
    temLatitude &&
    (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    )
  ) {
    throw criarErro(
      "Latitude inválida. Informe um valor entre -90 e 90."
    );
  }

  if (
    temLongitude &&
    (
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    )
  ) {
    throw criarErro(
      "Longitude inválida. Informe um valor entre -180 e 180."
    );
  }

  const temPrecisao = foiInformado(
    dados.precisao_gps
  );

  const precisao_gps = temPrecisao
    ? Number(dados.precisao_gps)
    : null;

  if (
    temPrecisao &&
    (
      !Number.isFinite(precisao_gps) ||
      precisao_gps < 0 ||
      precisao_gps > 99999999.99
    )
  ) {
    throw criarErro(
      "Precisão do GPS inválida."
    );
  }

  const origem_coordenadas = foiInformado(
    dados.origem_coordenadas
  )
    ? dados.origem_coordenadas
    : null;

  if (
    origem_coordenadas !== null &&
    !ORIGENS_COORDENADAS.includes(
      origem_coordenadas
    )
  ) {
    throw criarErro(
      "Origem inválida. Utilize GPS ou MANUAL."
    );
  }

  if (
    !temLatitude &&
    (
      temPrecisao ||
      origem_coordenadas !== null ||
      foiInformado(dados.data_captura_gps)
    )
  ) {
    throw criarErro(
      "Informe as coordenadas para registrar os dados de localização."
    );
  }

  if (
    temPrecisao &&
    origem_coordenadas !== "GPS"
  ) {
    throw criarErro(
      "A precisão do GPS exige origem GPS."
    );
  }

  let data_captura_gps = null;

  if (
    foiInformado(dados.data_captura_gps)
  ) {
    if (
      origem_coordenadas !== "GPS"
    ) {
      throw criarErro(
        "A data de captura do GPS exige origem GPS."
      );
    }

    const data = new Date(
      dados.data_captura_gps
    );

    if (
      Number.isNaN(data.getTime())
    ) {
      throw criarErro(
        "Data de captura do GPS inválida."
      );
    }

    data_captura_gps =
      data.toISOString();
  }

  return {
    latitude,
    longitude,
    precisao_gps,
    origem_coordenadas,
    data_captura_gps,
  };
}

/**
 * Valida o usuário autenticado.
 */
function validarUsuarioAutenticado(
  usuarioAutenticado
) {
  if (
    !usuarioAutenticado ||
    typeof usuarioAutenticado !== "object"
  ) {
    throw criarErro(
      "Usuário autenticado inválido.",
      401
    );
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
    throw criarErro(
      "Usuário autenticado inválido.",
      401
    );
  }

  return {
    id_usuario: idUsuario,
    perfil_acesso:
      usuarioAutenticado.perfil_acesso,
  };
}

/**
 * Verifica se o usuário autenticado possui
 * permissão para acessar as evidências do local.
 *
 * Administrador:
 * pode acessar qualquer evidência.
 *
 * Engenheiro:
 * pode acessar evidências das campanhas
 * pelas quais é responsável.
 */
async function validarPermissaoLocal(
  idLocal,
  usuarioAutenticado
) {
  usuarioAutenticado =
    validarUsuarioAutenticado(
      usuarioAutenticado
    );

  const local =
    await localRepository.buscarPorId(
      idLocal
    );

  if (!local) {
    throw criarErro(
      "Local não encontrado.",
      404
    );
  }

  const campanha =
    await campanhaRepository.buscarPorId(
      local.id_campanha
    );

  if (!campanha) {
    throw criarErro(
      "Campanha não encontrada.",
      404
    );
  }

  const ehAdministrador =
    usuarioAutenticado.perfil_acesso ===
    "ADMINISTRADOR";

  const ehResponsavel =
    Number(campanha.id_usuario) ===
    Number(usuarioAutenticado.id_usuario);

  if (
    !ehAdministrador &&
    !ehResponsavel
  ) {
    throw criarErro(
      "Você não possui permissão para acessar evidências deste local.",
      403
    );
  }

  return local;
}

/**
 * Cria uma nova evidência.
 *
 * Aceita coordenadas opcionais.
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
    throw criarErro(
      "O campo id_local é obrigatório."
    );
  }

  if (
    !TIPOS_VALIDOS.includes(tipo)
  ) {
    throw criarErro(
      "Tipo inválido. Use FOTO, TEXTO ou DOCUMENTO."
    );
  }

  usuarioAutenticado =
    validarUsuarioAutenticado(
      usuarioAutenticado
    );

  await validarPermissaoLocal(
    id_local,
    usuarioAutenticado
  );

  /*
   * Verifica primeiro se a operação
   * já foi processada.
   */
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

  /*
   * Valida as coordenadas somente
   * para uma nova operação.
   */
  const coordenadas =
    validarCoordenadas(dados);

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

      ...coordenadas,
    });
  } catch (erro) {
    /*
     * Preserva o tratamento de
     * operações duplicadas.
     */
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
 * Lista as evidências que o usuário
 * autenticado pode visualizar.
 */
async function listarEvidencias(
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
    return evidenciaRepository
      .listarTodos();
  }

  return evidenciaRepository
    .listarPorUsuarioResponsavel(
      usuarioAutenticado.id_usuario
    );
}

/**
 * Busca uma evidência pelo ID,
 * respeitando as permissões.
 */
async function buscarEvidenciaPorId(
  idEvidencia,
  usuarioAutenticado
) {
  const id = Number(idEvidencia);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw criarErro(
      "ID da evidência inválido."
    );
  }

  const evidencia =
    await evidenciaRepository
      .buscarPorId(id);

  if (!evidencia) {
    throw criarErro(
      "Evidência não encontrada.",
      404
    );
  }

  await validarPermissaoLocal(
    evidencia.id_local,
    usuarioAutenticado
  );

  return evidencia;
}

/**
 * Lista as evidências de determinado
 * local respeitando as permissões.
 */
async function listarEvidenciasPorLocal(
  idLocal,
  usuarioAutenticado
) {
  const id = Number(idLocal);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw criarErro(
      "ID do local inválido."
    );
  }

  await validarPermissaoLocal(
    id,
    usuarioAutenticado
  );

  return evidenciaRepository
    .listarPorLocal(id);
}

/**
 * Atualiza uma evidência existente.
 *
 * Mantém os dados anteriores quando
 * os campos não são enviados.
 *
 * Permite atualizar manualmente
 * as coordenadas.
 */
async function atualizarEvidencia(
  idEvidencia,
  dados,
  usuarioAutenticado
) {
  const id = Number(idEvidencia);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw criarErro(
      "ID da evidência inválido."
    );
  }

  const evidencia =
    await evidenciaRepository
      .buscarPorId(id);

  if (!evidencia) {
    throw criarErro(
      "Evidência não encontrada.",
      404
    );
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
    dados.descricao ?? evidencia.descricao;

  if (
    !TIPOS_VALIDOS.includes(tipo)
  ) {
    throw criarErro(
      "Tipo inválido. Use FOTO, TEXTO ou DOCUMENTO."
    );
  }

  /*
   * Identifica se a requisição
   * pretende modificar a localização.
   */
  const camposLocalizacao = [
    "latitude",
    "longitude",
    "precisao_gps",
    "origem_coordenadas",
    "data_captura_gps",
  ];

  const alterouLocalizacao =
    camposLocalizacao.some(
      (campo) =>
        Object.prototype.hasOwnProperty.call(
          dados,
          campo
        )
    );

  let coordenadas = {
    latitude: evidencia.latitude,
    longitude: evidencia.longitude,
    precisao_gps:
      evidencia.precisao_gps,
    origem_coordenadas:
      evidencia.origem_coordenadas,
    data_captura_gps:
      evidencia.data_captura_gps,
  };

  if (alterouLocalizacao) {
    const latitude =
      Object.prototype.hasOwnProperty.call(
        dados,
        "latitude"
      )
        ? dados.latitude
        : evidencia.latitude;

    const longitude =
      Object.prototype.hasOwnProperty.call(
        dados,
        "longitude"
      )
        ? dados.longitude
        : evidencia.longitude;

    const coordenadasForamRemovidas =
      !foiInformado(latitude) &&
      !foiInformado(longitude);

    /*
     * Se ambas as coordenadas forem
     * removidas, os metadados também
     * serão removidos.
     */
    if (coordenadasForamRemovidas) {
      coordenadas =
        validarCoordenadas({
          latitude: null,
          longitude: null,
        });
    } else {
      /*
       * Quando o usuário altera
       * manualmente as coordenadas,
       * a origem passa a ser MANUAL,
       * salvo se outra origem for
       * explicitamente informada.
       */
      const alterouLatitudeLongitude =
        Object.prototype.hasOwnProperty.call(
          dados,
          "latitude"
        ) ||
        Object.prototype.hasOwnProperty.call(
          dados,
          "longitude"
        );

      const origem =
        Object.prototype.hasOwnProperty.call(
          dados,
          "origem_coordenadas"
        )
          ? dados.origem_coordenadas
          : alterouLatitudeLongitude
            ? "MANUAL"
            : evidencia.origem_coordenadas;

      const origemManual =
        origem === "MANUAL";

      coordenadas =
        validarCoordenadas({
          latitude,
          longitude,

          origem_coordenadas: origem,

          precisao_gps:
            origemManual
              ? null
              : (
                  dados.precisao_gps !== undefined
                    ? dados.precisao_gps
                    : evidencia.precisao_gps
                ),

          data_captura_gps:
            origemManual
              ? null
              : (
                  dados.data_captura_gps !== undefined
                    ? dados.data_captura_gps
                    : evidencia.data_captura_gps
                ),
        });
    }
  }

  return evidenciaRepository.atualizar(
    id,
    {
      tipo,
      caminho_arquivo,
      descricao,
      ...coordenadas,
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

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw criarErro(
      "ID da evidência inválido."
    );
  }

  const evidencia =
    await evidenciaRepository
      .buscarPorId(id);

  if (!evidencia) {
    throw criarErro(
      "Evidência não encontrada.",
      404
    );
  }

  await validarPermissaoLocal(
    evidencia.id_local,
    usuarioAutenticado
  );

  const evidenciaExcluida =
    await evidenciaRepository
      .excluir(id);

  if (
    evidencia.caminho_arquivo
  ) {
    await evidenciaArquivoUtils
      .removerArquivo(
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
