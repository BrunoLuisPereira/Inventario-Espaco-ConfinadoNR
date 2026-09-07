const pool = require("../config/database");


// ======================================================
// Função auxiliar para criação de erros
// ======================================================

function criarErro(
  mensagem,
  statusCode
) {
  const erro = new Error(mensagem);
  erro.statusCode = statusCode;

  return erro;
}


// ======================================================
// Obter versão oficial atual da entidade
// ======================================================

async function obterVersaoAtual(
  client,
  entidade,
  idEntidade
) {
  const resultado =
    await client.query(
      `
        SELECT versao
        FROM versao_entidade
        WHERE entidade = $1
          AND id_entidade = $2;
      `,
      [
        entidade,
        idEntidade,
      ]
    );

  if (resultado.rowCount === 0) {
    throw criarErro(
      "Controle de versão da entidade não encontrado.",
      404
    );
  }

  return Number(
    resultado.rows[0].versao
  );
}


// ======================================================
// Finalizar conflito
// ======================================================

async function finalizarConflito(
  client,
  idSincronizacao,
  dados
) {
  const query = `
    UPDATE sincronizacao
    SET
      status = 'SINCRONIZADO',
      resolucao = $1,
      dados_resolvidos = $2,
      id_usuario_resolucao = $3,
      versao_servidor = $4,
      mensagem_erro = NULL,
      data_resolucao = CURRENT_TIMESTAMP,
      data_sincronizacao = CURRENT_TIMESTAMP,
      data_atualizacao = CURRENT_TIMESTAMP
    WHERE id_sincronizacao = $5
      AND status = 'CONFLITO'
    RETURNING *;
  `;

  const resultado =
    await client.query(
      query,
      [
        dados.resolucao,
        dados.dados_resolvidos ?? null,
        dados.id_usuario_resolucao,
        dados.versao_servidor,
        idSincronizacao,
      ]
    );

  return resultado.rows[0] || null;
}


// ======================================================
// Buscar sincronização e bloquear para resolução
// ======================================================

async function buscarSincronizacaoComBloqueio(
  client,
  idSincronizacao
) {
  const resultado =
    await client.query(
      `
        SELECT *
        FROM sincronizacao
        WHERE id_sincronizacao = $1
        FOR UPDATE;
      `,
      [idSincronizacao]
    );

  const registro =
    resultado.rows[0];

  if (!registro) {
    throw criarErro(
      "Registro de sincronização não encontrado.",
      404
    );
  }

  if (
    registro.status !==
    "CONFLITO"
  ) {
    throw criarErro(
      "Esta sincronização não possui um conflito pendente.",
      409
    );
  }

  return registro;
}

// ======================================================
// Criar LOCAL através da sincronização offline
// ======================================================

async function criarLocal(
  client,
  dados,
  idUsuario
) {
  if (
    !dados ||
    typeof dados !== "object" ||
    Array.isArray(dados)
  ) {
    throw criarErro(
      "Os dados do local são obrigatórios.",
      400
    );
  }

  if (
    !dados.nome_local ||
    typeof dados.nome_local !== "string" ||
    !dados.nome_local.trim()
  ) {
    throw criarErro(
      "O nome do local é obrigatório.",
      400
    );
  }


  // ==================================================
  // Resolver campanha
  // ==================================================

  let idCampanha = null;


  // Caso 1: campanha já existe no servidor
  if (dados.id_campanha) {
    const numero =
      Number(dados.id_campanha);

    if (
      !Number.isInteger(numero) ||
      numero <= 0
    ) {
      throw criarErro(
        "ID da campanha inválido.",
        400
      );
    }

    idCampanha = numero;
  }


  // Caso 2: campanha também foi criada offline
  else if (
    dados.id_campanha_cliente
  ) {
    const resultadoMapeamento =
      await client.query(
        `
          SELECT id_entidade
          FROM sincronizacao
          WHERE entidade = 'CAMPANHA'
            AND operacao = 'CRIAR'
            AND id_registro_cliente = $1
            AND status = 'SINCRONIZADO'
            AND id_entidade IS NOT NULL
          ORDER BY id_sincronizacao DESC
          LIMIT 1;
        `,
        [
          dados.id_campanha_cliente,
        ]
      );

    if (
      resultadoMapeamento.rows.length === 0
    ) {
      throw criarErro(
        "A campanha criada offline ainda não foi sincronizada.",
        409
      );
    }

    idCampanha =
      Number(
        resultadoMapeamento
          .rows[0]
          .id_entidade
      );
  }


  else {
    throw criarErro(
      "Informe id_campanha ou id_campanha_cliente.",
      400
    );
  }


  // ==================================================
  // Conferir existência e propriedade da campanha
  // ==================================================

  const campanha =
    await client.query(
      `
        SELECT
          id_campanha,
          id_usuario
        FROM campanha
        WHERE id_campanha = $1;
      `,
      [
        idCampanha,
      ]
    );

  if (
    campanha.rows.length === 0
  ) {
    throw criarErro(
      "Campanha não encontrada.",
      404
    );
  }

  const idDonoCampanha =
    Number(
      campanha.rows[0].id_usuario
    );

  if (
    idDonoCampanha !==
    Number(idUsuario)
  ) {
    throw criarErro(
      "Você não possui permissão para criar um local nesta campanha.",
      403
    );
  }


  // ==================================================
  // Criar local
  // ==================================================

  const resultado =
    await client.query(
      `
        INSERT INTO local (
          nome_local,
          setor,
          descricao,
          endereco,
          latitude,
          longitude,
          status,
          id_campanha
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8
        )
        RETURNING *;
      `,
      [
        dados.nome_local.trim(),
        dados.setor ?? null,
        dados.descricao ?? null,
        dados.endereco ?? null,
        dados.latitude ?? null,
        dados.longitude ?? null,
        dados.status ?? "ATIVO",
        idCampanha,
      ]
    );

  return resultado.rows[0];
}
// ======================================================
// LOCAL
// ======================================================

async function buscarLocal(
  client,
  idEntidade
) {
  const resultado =
    await client.query(
      `
        SELECT *
        FROM local
        WHERE id_local = $1;
      `,
      [idEntidade]
    );

  return resultado.rows[0] || null;
}


async function atualizarLocal(
  client,
  idEntidade,
  dados
) {
  const camposPermitidos = {
    nome_local: "nome_local",
    setor: "setor",
    descricao: "descricao",
    endereco: "endereco",
    latitude: "latitude",
    longitude: "longitude",
    status: "status",
  };

  const sets = [];
  const valores = [];

  for (
    const [campo, coluna]
    of Object.entries(
      camposPermitidos
    )
  ) {
    if (
      Object.prototype.hasOwnProperty.call(
        dados,
        campo
      )
    ) {
      valores.push(
        dados[campo]
      );

      sets.push(
        `${coluna} = $${valores.length}`
      );
    }
  }

  if (
    sets.length === 0
  ) {
    throw criarErro(
      "Nenhum campo válido foi informado para atualização do local.",
      400
    );
  }

  valores.push(
    idEntidade
  );

  const resultado =
    await client.query(
      `
        UPDATE local
        SET
          ${sets.join(", ")},
          data_atualizacao = CURRENT_TIMESTAMP
        WHERE id_local = $${valores.length}
        RETURNING *;
      `,
      valores
    );

  return resultado.rows[0] || null;
}


// ======================================================
// Resolver conflito de LOCAL
// ======================================================

async function resolverConflitoLocal({
  sincronizacao,
  resolucao,
  dadosResolvidos,
  idUsuarioResolucao,
}) {
  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");

    const registroAtual =
      await buscarSincronizacaoComBloqueio(
        client,
        sincronizacao.id_sincronizacao
      );

    const idEntidade =
      Number(
        registroAtual.id_entidade
      );

    let dadosFinais = null;

    let versaoFinal =
      Number(
        registroAtual.versao_servidor
      );


    if (
      resolucao === "SERVIDOR"
    ) {
      dadosFinais =
        await buscarLocal(
          client,
          idEntidade
        );

      if (!dadosFinais) {
        throw criarErro(
          "Local não encontrado no servidor.",
          404
        );
      }
    }


    if (
      resolucao === "CLIENTE"
    ) {
      if (
        !registroAtual.dados_cliente ||
        typeof registroAtual.dados_cliente !==
          "object"
      ) {
        throw criarErro(
          "Não existem dados do cliente para aplicar.",
          400
        );
      }

      dadosFinais =
        await atualizarLocal(
          client,
          idEntidade,
          registroAtual.dados_cliente
        );

      if (!dadosFinais) {
        throw criarErro(
          "Local não encontrado.",
          404
        );
      }

      versaoFinal =
        await obterVersaoAtual(
          client,
          registroAtual.entidade,
          idEntidade
        );
    }


    if (
      resolucao === "MESCLADO"
    ) {
      if (
        !dadosResolvidos ||
        typeof dadosResolvidos !==
          "object" ||
        Array.isArray(
          dadosResolvidos
        )
      ) {
        throw criarErro(
          "Os dados resolvidos são obrigatórios para resolução MESCLADO.",
          400
        );
      }

      dadosFinais =
        await atualizarLocal(
          client,
          idEntidade,
          dadosResolvidos
        );

      if (!dadosFinais) {
        throw criarErro(
          "Local não encontrado.",
          404
        );
      }

      versaoFinal =
        await obterVersaoAtual(
          client,
          registroAtual.entidade,
          idEntidade
        );
    }


    const sincronizacaoResolvida =
      await finalizarConflito(
        client,
        registroAtual.id_sincronizacao,
        {
          resolucao,
          dados_resolvidos:
            dadosFinais,
          id_usuario_resolucao:
            idUsuarioResolucao,
          versao_servidor:
            versaoFinal,
        }
      );

    await client.query(
      "COMMIT"
    );

    return sincronizacaoResolvida;
  } catch (erro) {
    await client.query(
      "ROLLBACK"
    );

    throw erro;
  } finally {
    client.release();
  }
}
// ======================================================
// Criar CAMPANHA através da sincronização offline
// ======================================================

async function criarCampanha(
  client,
  dados,
  idUsuario
) {
  if (
    !dados ||
    typeof dados !== "object" ||
    Array.isArray(dados)
  ) {
    throw criarErro(
      "Os dados da campanha são obrigatórios.",
      400
    );
  }

  if (
    !dados.nome_campanha ||
    typeof dados.nome_campanha !== "string" ||
    !dados.nome_campanha.trim()
  ) {
    throw criarErro(
      "O nome da campanha é obrigatório.",
      400
    );
  }

  if (
    !dados.empresa ||
    typeof dados.empresa !== "string" ||
    !dados.empresa.trim()
  ) {
    throw criarErro(
      "A empresa é obrigatória.",
      400
    );
  }

  if (
    !dados.responsavel ||
    typeof dados.responsavel !== "string" ||
    !dados.responsavel.trim()
  ) {
    throw criarErro(
      "O responsável é obrigatório.",
      400
    );
  }

  if (!dados.data_inicio) {
    throw criarErro(
      "A data de início é obrigatória.",
      400
    );
  }

  const resultado =
    await client.query(
      `
        INSERT INTO campanha (
          nome_campanha,
          empresa,
          responsavel,
          data_inicio,
          status,
          id_usuario
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6
        )
        RETURNING *;
      `,
      [
        dados.nome_campanha.trim(),
        dados.empresa.trim(),
        dados.responsavel.trim(),
        dados.data_inicio,
        dados.status ?? "ATIVA",
        idUsuario,
      ]
    );

  return resultado.rows[0];
}

// ======================================================
// CAMPANHA
// ======================================================

async function buscarCampanha(
  client,
  idEntidade
) {
  const resultado =
    await client.query(
      `
        SELECT *
        FROM campanha
        WHERE id_campanha = $1;
      `,
      [idEntidade]
    );

  return resultado.rows[0] || null;
}


async function atualizarCampanha(
  client,
  idEntidade,
  dados
) {
  const camposPermitidos = {
    nome_campanha:
      "nome_campanha",

    empresa:
      "empresa",

    responsavel:
      "responsavel",

    data_inicio:
      "data_inicio",

    status:
      "status",
  };

  const sets = [];
  const valores = [];

  for (
    const [campo, coluna]
    of Object.entries(
      camposPermitidos
    )
  ) {
    if (
      Object.prototype.hasOwnProperty.call(
        dados,
        campo
      )
    ) {
      valores.push(
        dados[campo]
      );

      sets.push(
        `${coluna} = $${valores.length}`
      );
    }
  }

  if (
    sets.length === 0
  ) {
    throw criarErro(
      "Nenhum campo válido foi informado para atualização da campanha.",
      400
    );
  }

  valores.push(
    idEntidade
  );

  const resultado =
    await client.query(
      `
        UPDATE campanha
        SET
          ${sets.join(", ")},
          data_atualizacao = CURRENT_TIMESTAMP
        WHERE id_campanha = $${valores.length}
        RETURNING *;
      `,
      valores
    );

  return resultado.rows[0] || null;
}


// ======================================================
// Resolver conflito de CAMPANHA
// ======================================================

async function resolverConflitoCampanha({
  sincronizacao,
  resolucao,
  dadosResolvidos,
  idUsuarioResolucao,
}) {
  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    const registroAtual =
      await buscarSincronizacaoComBloqueio(
        client,
        sincronizacao.id_sincronizacao
      );

    const idEntidade =
      Number(
        registroAtual.id_entidade
      );

    let dadosFinais = null;

    let versaoFinal =
      Number(
        registroAtual.versao_servidor
      );


    if (
      resolucao === "SERVIDOR"
    ) {
      dadosFinais =
        await buscarCampanha(
          client,
          idEntidade
        );

      if (!dadosFinais) {
        throw criarErro(
          "Campanha não encontrada no servidor.",
          404
        );
      }
    }


    if (
      resolucao === "CLIENTE"
    ) {
      if (
        !registroAtual.dados_cliente ||
        typeof registroAtual.dados_cliente !==
          "object"
      ) {
        throw criarErro(
          "Não existem dados do cliente para aplicar.",
          400
        );
      }

      dadosFinais =
        await atualizarCampanha(
          client,
          idEntidade,
          registroAtual.dados_cliente
        );

      if (!dadosFinais) {
        throw criarErro(
          "Campanha não encontrada.",
          404
        );
      }

      versaoFinal =
        await obterVersaoAtual(
          client,
          registroAtual.entidade,
          idEntidade
        );
    }


    if (
      resolucao === "MESCLADO"
    ) {
      if (
        !dadosResolvidos ||
        typeof dadosResolvidos !==
          "object" ||
        Array.isArray(
          dadosResolvidos
        )
      ) {
        throw criarErro(
          "Os dados resolvidos são obrigatórios para resolução MESCLADO.",
          400
        );
      }

      dadosFinais =
        await atualizarCampanha(
          client,
          idEntidade,
          dadosResolvidos
        );

      if (!dadosFinais) {
        throw criarErro(
          "Campanha não encontrada.",
          404
        );
      }

      versaoFinal =
        await obterVersaoAtual(
          client,
          registroAtual.entidade,
          idEntidade
        );
    }


    const sincronizacaoResolvida =
      await finalizarConflito(
        client,
        registroAtual.id_sincronizacao,
        {
          resolucao,
          dados_resolvidos:
            dadosFinais,
          id_usuario_resolucao:
            idUsuarioResolucao,
          versao_servidor:
            versaoFinal,
        }
      );

    await client.query(
      "COMMIT"
    );

    return sincronizacaoResolvida;
  } catch (erro) {
    await client.query(
      "ROLLBACK"
    );

    throw erro;
  } finally {
    client.release();
  }
}

// ======================================================
// Criar CHECKLIST NR-33 através da sincronização offline
// ======================================================

async function criarChecklist(
  client,
  dados,
  idUsuario
) {
  if (
    !dados ||
    typeof dados !== "object" ||
    Array.isArray(dados)
  ) {
    throw criarErro(
      "Os dados do checklist são obrigatórios.",
      400
    );
  }


  // ==================================================
  // Resolver LOCAL
  // ==================================================

  let idLocal = null;


  // Caso 1: local já existe no servidor
  if (dados.id_local) {
    const numero =
      Number(dados.id_local);

    if (
      !Number.isInteger(numero) ||
      numero <= 0
    ) {
      throw criarErro(
        "ID do local inválido.",
        400
      );
    }

    idLocal = numero;
  }


  // Caso 2: local também foi criado offline
  else if (
    dados.id_local_cliente
  ) {
    const resultadoMapeamento =
      await client.query(
        `
          SELECT id_entidade
          FROM sincronizacao
          WHERE entidade = 'LOCAL'
            AND operacao = 'CRIAR'
            AND id_registro_cliente = $1
            AND status = 'SINCRONIZADO'
            AND id_entidade IS NOT NULL
          ORDER BY id_sincronizacao DESC
          LIMIT 1;
        `,
        [
          dados.id_local_cliente,
        ]
      );

    if (
      resultadoMapeamento.rows.length === 0
    ) {
      throw criarErro(
        "O local criado offline ainda não foi sincronizado.",
        409
      );
    }

    idLocal =
      Number(
        resultadoMapeamento
          .rows[0]
          .id_entidade
      );
  }


  else {
    throw criarErro(
      "Informe id_local ou id_local_cliente.",
      400
    );
  }


  // ==================================================
  // Conferir existência e propriedade
  // ==================================================

  const localResultado =
    await client.query(
      `
        SELECT
          l.id_local,
          c.id_usuario
        FROM local l
        INNER JOIN campanha c
          ON c.id_campanha =
             l.id_campanha
        WHERE l.id_local = $1;
      `,
      [idLocal]
    );

  if (
    localResultado.rows.length === 0
  ) {
    throw criarErro(
      "Local não encontrado.",
      404
    );
  }

  const idDonoCampanha =
    Number(
      localResultado
        .rows[0]
        .id_usuario
    );

  if (
    idDonoCampanha !==
    Number(idUsuario)
  ) {
    throw criarErro(
      "Você não possui permissão para criar um checklist neste local.",
      403
    );
  }


  // ==================================================
  // Criar checklist
  // ==================================================

  const resultado =
    await client.query(
      `
        INSERT INTO checklist_nr33 (
          id_local,
          identificacao_espaco,
          acesso_controlado,
          ventilacao_adequada,
          monitoramento_atmosferico,
          procedimento_emergencia,
          observacoes,
          status,
          id_usuario
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9
        )
        RETURNING *;
      `,
      [
        idLocal,
        dados.identificacao_espaco,
        dados.acesso_controlado,
        dados.ventilacao_adequada,
        dados.monitoramento_atmosferico,
        dados.procedimento_emergencia,
        dados.observacoes ?? null,
        dados.status ?? "PENDENTE",
        idUsuario,
      ]
    );

  return resultado.rows[0];
}
// ======================================================
// CHECKLIST NR-33
// ======================================================

async function buscarChecklist(
  client,
  idEntidade
) {
  const resultado =
    await client.query(
      `
        SELECT *
        FROM checklist_nr33
        WHERE id_checklist = $1;
      `,
      [idEntidade]
    );

  return resultado.rows[0] || null;
}


async function atualizarChecklist(
  client,
  idEntidade,
  dados
) {
  const camposPermitidos = {
    identificacao_espaco:
      "identificacao_espaco",

    acesso_controlado:
      "acesso_controlado",

    ventilacao_adequada:
      "ventilacao_adequada",

    monitoramento_atmosferico:
      "monitoramento_atmosferico",

    procedimento_emergencia:
      "procedimento_emergencia",

    observacoes:
      "observacoes",

    status:
      "status",
  };

  const sets = [];
  const valores = [];

  for (
    const [campo, coluna]
    of Object.entries(
      camposPermitidos
    )
  ) {
    if (
      Object.prototype.hasOwnProperty.call(
        dados,
        campo
      )
    ) {
      valores.push(
        dados[campo]
      );

      sets.push(
        `${coluna} = $${valores.length}`
      );
    }
  }

  if (
    sets.length === 0
  ) {
    throw criarErro(
      "Nenhum campo válido foi informado para atualização do checklist.",
      400
    );
  }

  valores.push(
    idEntidade
  );

  const resultado =
    await client.query(
      `
        UPDATE checklist_nr33
        SET
          ${sets.join(", ")},
          data_atualizacao = CURRENT_TIMESTAMP
        WHERE id_checklist = $${valores.length}
        RETURNING *;
      `,
      valores
    );

  return resultado.rows[0] || null;
}


// ======================================================
// Resolver conflito de CHECKLIST_NR33
// ======================================================

async function resolverConflitoChecklist({
  sincronizacao,
  resolucao,
  dadosResolvidos,
  idUsuarioResolucao,
}) {
  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    const registroAtual =
      await buscarSincronizacaoComBloqueio(
        client,
        sincronizacao.id_sincronizacao
      );

    const idEntidade =
      Number(
        registroAtual.id_entidade
      );

    let dadosFinais = null;

    let versaoFinal =
      Number(
        registroAtual.versao_servidor
      );


    // ==================================================
    // SERVIDOR
    // ==================================================

    if (
      resolucao === "SERVIDOR"
    ) {
      dadosFinais =
        await buscarChecklist(
          client,
          idEntidade
        );

      if (!dadosFinais) {
        throw criarErro(
          "Checklist não encontrado no servidor.",
          404
        );
      }
    }


    // ==================================================
    // CLIENTE
    // ==================================================

    if (
      resolucao === "CLIENTE"
    ) {
      if (
        !registroAtual.dados_cliente ||
        typeof registroAtual.dados_cliente !==
          "object"
      ) {
        throw criarErro(
          "Não existem dados do cliente para aplicar.",
          400
        );
      }

      dadosFinais =
        await atualizarChecklist(
          client,
          idEntidade,
          registroAtual.dados_cliente
        );

      if (!dadosFinais) {
        throw criarErro(
          "Checklist não encontrado.",
          404
        );
      }

      versaoFinal =
        await obterVersaoAtual(
          client,
          registroAtual.entidade,
          idEntidade
        );
    }


    // ==================================================
    // MESCLADO
    // ==================================================

    if (
      resolucao === "MESCLADO"
    ) {
      if (
        !dadosResolvidos ||
        typeof dadosResolvidos !==
          "object" ||
        Array.isArray(
          dadosResolvidos
        )
      ) {
        throw criarErro(
          "Os dados resolvidos são obrigatórios para resolução MESCLADO.",
          400
        );
      }

      dadosFinais =
        await atualizarChecklist(
          client,
          idEntidade,
          dadosResolvidos
        );

      if (!dadosFinais) {
        throw criarErro(
          "Checklist não encontrado.",
          404
        );
      }

      versaoFinal =
        await obterVersaoAtual(
          client,
          registroAtual.entidade,
          idEntidade
        );
    }


    const sincronizacaoResolvida =
      await finalizarConflito(
        client,
        registroAtual.id_sincronizacao,
        {
          resolucao,

          dados_resolvidos:
            dadosFinais,

          id_usuario_resolucao:
            idUsuarioResolucao,

          versao_servidor:
            versaoFinal,
        }
      );

    await client.query(
      "COMMIT"
    );

    return sincronizacaoResolvida;
  } catch (erro) {
    await client.query(
      "ROLLBACK"
    );

    throw erro;
  } finally {
    client.release();
  }
}


// ======================================================
// Criar DADOS TÉCNICOS através da sincronização offline
// ======================================================

async function criarDadosTecnicos(
  client,
  dados,
  idUsuario
) {
  if (
    !dados ||
    typeof dados !== "object" ||
    Array.isArray(dados)
  ) {
    throw criarErro(
      "Os dados técnicos são obrigatórios.",
      400
    );
  }

  // ==================================================
  // Resolver LOCAL
  // ==================================================

  let idLocal = null;

  // Caso 1: local já existe no servidor
  if (dados.id_local) {
    const numero = Number(dados.id_local);

    if (
      !Number.isInteger(numero) ||
      numero <= 0
    ) {
      throw criarErro(
        "ID do local inválido.",
        400
      );
    }

    idLocal = numero;
  }

  // Caso 2: local foi criado offline
  else if (dados.id_local_cliente) {
    const resultadoMapeamento =
      await client.query(
        `
          SELECT id_entidade
          FROM sincronizacao
          WHERE entidade = 'LOCAL'
            AND operacao = 'CRIAR'
            AND id_registro_cliente = $1
            AND status = 'SINCRONIZADO'
            AND id_entidade IS NOT NULL
          ORDER BY id_sincronizacao DESC
          LIMIT 1;
        `,
        [
          dados.id_local_cliente,
        ]
      );

    if (
      resultadoMapeamento.rows.length === 0
    ) {
      throw criarErro(
        "O local criado offline ainda não foi sincronizado.",
        409
      );
    }

    idLocal =
      Number(
        resultadoMapeamento
          .rows[0]
          .id_entidade
      );
  }

  else {
    throw criarErro(
      "Informe id_local ou id_local_cliente.",
      400
    );
  }

  // ==================================================
  // Conferir existência e propriedade do LOCAL
  // ==================================================

  const localResultado =
    await client.query(
      `
        SELECT
          l.id_local,
          c.id_usuario
        FROM local l
        INNER JOIN campanha c
          ON c.id_campanha = l.id_campanha
        WHERE l.id_local = $1;
      `,
      [idLocal]
    );

  if (
    localResultado.rows.length === 0
  ) {
    throw criarErro(
      "Local não encontrado.",
      404
    );
  }

  const idDonoCampanha =
    Number(
      localResultado
        .rows[0]
        .id_usuario
    );

  if (
    idDonoCampanha !==
    Number(idUsuario)
  ) {
    throw criarErro(
      "Você não possui permissão para criar dados técnicos neste local.",
      403
    );
  }

  // ==================================================
  // Criar DADOS TÉCNICOS
  // ==================================================

  const resultado =
    await client.query(
      `
        INSERT INTO dados_tecnicos (
          id_local,
          pressao_atmosferica,
          ventilacao,
          oxigenio,
          gas_inflamavel,
          monoxido_carbono,
          sulfeto_hidrogenio,
          temperatura,
          umidade,
          observacoes,
          status,
          id_usuario
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12
        )
        RETURNING *;
      `,
      [
        idLocal,
        dados.pressao_atmosferica ?? null,
        dados.ventilacao ?? "NAO_INFORMADA",
        dados.oxigenio ?? null,
        dados.gas_inflamavel ?? null,
        dados.monoxido_carbono ?? null,
        dados.sulfeto_hidrogenio ?? null,
        dados.temperatura ?? null,
        dados.umidade ?? null,
        dados.observacoes ?? null,
        dados.status ?? "PENDENTE",
        idUsuario,
      ]
    );

  return resultado.rows[0];
}
async function buscarDadosTecnicos(
  client,
  idEntidade
) {
  const resultado =
    await client.query(
      `
        SELECT *
        FROM dados_tecnicos
        WHERE id_dados = $1;
      `,
      [idEntidade]
    );

  return resultado.rows[0] || null;
}


async function atualizarDadosTecnicos(
  client,
  idEntidade,
  dados
) {
  const camposPermitidos = {
    pressao_atmosferica:
      "pressao_atmosferica",

    ventilacao:
      "ventilacao",

    oxigenio:
      "oxigenio",

    gas_inflamavel:
      "gas_inflamavel",

    monoxido_carbono:
      "monoxido_carbono",

    sulfeto_hidrogenio:
      "sulfeto_hidrogenio",

    temperatura:
      "temperatura",

    umidade:
      "umidade",

    observacoes:
      "observacoes",

    status:
      "status",
  };

  const sets = [];
  const valores = [];

  for (
    const [campo, coluna]
    of Object.entries(
      camposPermitidos
    )
  ) {
    if (
      Object.prototype.hasOwnProperty.call(
        dados,
        campo
      )
    ) {
      valores.push(
        dados[campo]
      );

      sets.push(
        `${coluna} = $${valores.length}`
      );
    }
  }

  if (
    sets.length === 0
  ) {
    throw criarErro(
      "Nenhum campo válido foi informado para atualização dos dados técnicos.",
      400
    );
  }

  valores.push(
    idEntidade
  );

  const resultado =
    await client.query(
      `
        UPDATE dados_tecnicos
        SET
          ${sets.join(", ")},
          data_atualizacao = CURRENT_TIMESTAMP
        WHERE id_dados = $${valores.length}
        RETURNING *;
      `,
      valores
    );

  return resultado.rows[0] || null;
}


// ======================================================
// Resolver conflito de DADOS_TECNICOS
// ======================================================

async function resolverConflitoDadosTecnicos({
  sincronizacao,
  resolucao,
  dadosResolvidos,
  idUsuarioResolucao,
}) {
  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    const registroAtual =
      await buscarSincronizacaoComBloqueio(
        client,
        sincronizacao.id_sincronizacao
      );

    const idEntidade =
      Number(
        registroAtual.id_entidade
      );

    let dadosFinais = null;

    let versaoFinal =
      Number(
        registroAtual.versao_servidor
      );


    // ==================================================
    // SERVIDOR
    // ==================================================

    if (
      resolucao === "SERVIDOR"
    ) {
      dadosFinais =
        await buscarDadosTecnicos(
          client,
          idEntidade
        );

      if (!dadosFinais) {
        throw criarErro(
          "Dados técnicos não encontrados no servidor.",
          404
        );
      }
    }


    // ==================================================
    // CLIENTE
    // ==================================================

    if (
      resolucao === "CLIENTE"
    ) {
      if (
        !registroAtual.dados_cliente ||
        typeof registroAtual.dados_cliente !==
          "object"
      ) {
        throw criarErro(
          "Não existem dados do cliente para aplicar.",
          400
        );
      }

      dadosFinais =
        await atualizarDadosTecnicos(
          client,
          idEntidade,
          registroAtual.dados_cliente
        );

      if (!dadosFinais) {
        throw criarErro(
          "Dados técnicos não encontrados.",
          404
        );
      }

      versaoFinal =
        await obterVersaoAtual(
          client,
          registroAtual.entidade,
          idEntidade
        );
    }


    // ==================================================
    // MESCLADO
    // ==================================================

    if (
      resolucao === "MESCLADO"
    ) {
      if (
        !dadosResolvidos ||
        typeof dadosResolvidos !==
          "object" ||
        Array.isArray(
          dadosResolvidos
        )
      ) {
        throw criarErro(
          "Os dados resolvidos são obrigatórios para resolução MESCLADO.",
          400
        );
      }

      dadosFinais =
        await atualizarDadosTecnicos(
          client,
          idEntidade,
          dadosResolvidos
        );

      if (!dadosFinais) {
        throw criarErro(
          "Dados técnicos não encontrados.",
          404
        );
      }

      versaoFinal =
        await obterVersaoAtual(
          client,
          registroAtual.entidade,
          idEntidade
        );
    }


    const sincronizacaoResolvida =
      await finalizarConflito(
        client,
        registroAtual.id_sincronizacao,
        {
          resolucao,

          dados_resolvidos:
            dadosFinais,

          id_usuario_resolucao:
            idUsuarioResolucao,

          versao_servidor:
            versaoFinal,
        }
      );

    await client.query(
      "COMMIT"
    );

    return sincronizacaoResolvida;
  } catch (erro) {
    await client.query(
      "ROLLBACK"
    );

    throw erro;
  } finally {
    client.release();
  }
}
// ======================================================
// Excluir CAMPANHA através da sincronização offline
// ======================================================

async function excluirCampanha(
  client,
  idEntidade,
  idUsuario
) {
  const resultado =
    await client.query(
      `
        SELECT
          id_campanha,
          id_usuario
        FROM campanha
        WHERE id_campanha = $1;
      `,
      [idEntidade]
    );

  if (resultado.rows.length === 0) {
    throw criarErro(
      "Campanha não encontrada.",
      404
    );
  }

  const idDonoCampanha =
    Number(
      resultado.rows[0].id_usuario
    );

  if (
    idDonoCampanha !==
    Number(idUsuario)
  ) {
    throw criarErro(
      "Você não possui permissão para excluir esta campanha.",
      403
    );
  }

  const exclusao =
    await client.query(
      `
        DELETE FROM campanha
        WHERE id_campanha = $1
        RETURNING *;
      `,
      [idEntidade]
    );

  return exclusao.rows[0] || null;
}
// ======================================================
// Excluir LOCAL através da sincronização offline
// ======================================================

async function excluirLocal(
  client,
  idEntidade,
  idUsuario
) {
  const resultado =
    await client.query(
      `
        SELECT
          l.id_local,
          l.id_campanha,
          c.id_usuario
        FROM local l
        INNER JOIN campanha c
          ON c.id_campanha = l.id_campanha
        WHERE l.id_local = $1;
      `,
      [idEntidade]
    );

  if (resultado.rows.length === 0) {
    throw criarErro(
      "Local não encontrado.",
      404
    );
  }

  const idDonoCampanha =
    Number(
      resultado.rows[0].id_usuario
    );

  if (
    idDonoCampanha !==
    Number(idUsuario)
  ) {
    throw criarErro(
      "Você não possui permissão para excluir este local.",
      403
    );
  }

  const exclusao =
    await client.query(
      `
        DELETE FROM local
        WHERE id_local = $1
        RETURNING *;
      `,
      [idEntidade]
    );

  return exclusao.rows[0] || null;
}
// ======================================================
// Excluir CHECKLIST NR-33 através da sincronização offline
// ======================================================

async function excluirChecklist(
  client,
  idEntidade,
  idUsuario
) {
  const resultado =
    await client.query(
      `
        SELECT
          ch.id_checklist,
          ch.id_local,
          c.id_usuario
        FROM checklist_nr33 ch
        INNER JOIN local l
          ON l.id_local = ch.id_local
        INNER JOIN campanha c
          ON c.id_campanha = l.id_campanha
        WHERE ch.id_checklist = $1;
      `,
      [idEntidade]
    );

  if (resultado.rows.length === 0) {
    throw criarErro(
      "Checklist não encontrado.",
      404
    );
  }

  const idDonoCampanha =
    Number(
      resultado.rows[0].id_usuario
    );

  if (
    idDonoCampanha !==
    Number(idUsuario)
  ) {
    throw criarErro(
      "Você não possui permissão para excluir este checklist.",
      403
    );
  }

  const exclusao =
    await client.query(
      `
        DELETE FROM checklist_nr33
        WHERE id_checklist = $1
        RETURNING *;
      `,
      [idEntidade]
    );

  return exclusao.rows[0] || null;
}
// ======================================================
// Excluir DADOS TÉCNICOS através da sincronização offline
// ======================================================

async function excluirDadosTecnicos(
  client,
  idEntidade,
  idUsuario
) {
  const resultado =
    await client.query(
      `
        SELECT
          dt.id_dados,
          dt.id_local,
          c.id_usuario
        FROM dados_tecnicos dt
        INNER JOIN local l
          ON l.id_local = dt.id_local
        INNER JOIN campanha c
          ON c.id_campanha = l.id_campanha
        WHERE dt.id_dados = $1;
      `,
      [idEntidade]
    );

  if (resultado.rows.length === 0) {
    throw criarErro(
      "Dados técnicos não encontrados.",
      404
    );
  }

  const idDonoCampanha =
    Number(
      resultado.rows[0].id_usuario
    );

  if (
    idDonoCampanha !==
    Number(idUsuario)
  ) {
    throw criarErro(
      "Você não possui permissão para excluir estes dados técnicos.",
      403
    );
  }

  const exclusao =
    await client.query(
      `
        DELETE FROM dados_tecnicos
        WHERE id_dados = $1
        RETURNING *;
      `,
      [idEntidade]
    );

  return exclusao.rows[0] || null;
}

async function processarSincronizacaoPendente(
  sincronizacao
) {
  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");


    // ==================================================
    // Bloquear registro de sincronização
    // ==================================================

    const resultado =
      await client.query(
        `
          SELECT *
          FROM sincronizacao
          WHERE id_sincronizacao = $1
          FOR UPDATE;
        `,
        [
          sincronizacao.id_sincronizacao,
        ]
      );

    const registro =
      resultado.rows[0];

    if (!registro) {
      throw criarErro(
        "Registro de sincronização não encontrado.",
        404
      );
    }

    if (
      registro.status !== "PENDENTE"
    ) {
      throw criarErro(
        "A sincronização não está pendente.",
        409
      );
    }


    // ==================================================
    // OPERAÇÃO CRIAR
    // ==================================================

    if (
      registro.operacao === "CRIAR"
    ) {

      if (
        !registro.dados_cliente ||
        typeof registro.dados_cliente !==
          "object" ||
        Array.isArray(
          registro.dados_cliente
        )
      ) {
        throw criarErro(
          "Os dados do cliente são obrigatórios para a operação CRIAR.",
          400
        );
      }
// ================================================
// CRIAR CAMPANHA
// ================================================

if (
  registro.entidade ===
  "CAMPANHA"
) {
  const dadosCriados =
    await criarCampanha(
      client,
      registro.dados_cliente,
      registro.id_usuario
    );

  if (!dadosCriados) {
    throw criarErro(
      "Não foi possível criar a campanha.",
      500
    );
  }

  const idEntidade =
    Number(
      dadosCriados.id_campanha
    );

  const versaoFinal =
    await obterVersaoAtual(
      client,
      registro.entidade,
      idEntidade
    );

  const resultadoSync =
    await client.query(
      `
        UPDATE sincronizacao
        SET
          id_entidade = $1,
          versao_servidor = $2,
          status = 'SINCRONIZADO',
          dados_servidor = $3,
          mensagem_erro = NULL,
          data_sincronizacao = CURRENT_TIMESTAMP,
          data_atualizacao = CURRENT_TIMESTAMP
        WHERE id_sincronizacao = $4
        RETURNING *;
      `,
      [
        idEntidade,
        versaoFinal,
        dadosCriados,
        registro.id_sincronizacao,
      ]
    );

  await client.query("COMMIT");

  return resultadoSync.rows[0];
}

// ================================================
// CRIAR LOCAL
// ================================================

if (
  registro.entidade ===
  "LOCAL"
) {
  const dadosCriados =
    await criarLocal(
      client,
      registro.dados_cliente,
      registro.id_usuario
    );

  if (!dadosCriados) {
    throw criarErro(
      "Não foi possível criar o local.",
      500
    );
  }

  const idEntidade =
    Number(
      dadosCriados.id_local
    );

  const versaoFinal =
    await obterVersaoAtual(
      client,
      registro.entidade,
      idEntidade
    );

  const resultadoSync =
    await client.query(
      `
        UPDATE sincronizacao
        SET
          id_entidade = $1,
          versao_servidor = $2,
          status = 'SINCRONIZADO',
          dados_servidor = $3,
          mensagem_erro = NULL,
          data_sincronizacao = CURRENT_TIMESTAMP,
          data_atualizacao = CURRENT_TIMESTAMP
        WHERE id_sincronizacao = $4
        RETURNING *;
      `,
      [
        idEntidade,
        versaoFinal,
        dadosCriados,
        registro.id_sincronizacao,
      ]
    );

  await client.query("COMMIT");

  return resultadoSync.rows[0];
}
// ================================================
// CRIAR CHECKLIST NR-33
// ================================================

if (
  registro.entidade ===
  "CHECKLIST_NR33"
) {
  const dadosCriados =
    await criarChecklist(
      client,
      registro.dados_cliente,
      registro.id_usuario
    );

  if (!dadosCriados) {
    throw criarErro(
      "Não foi possível criar o checklist NR-33.",
      500
    );
  }

  const idEntidade =
    Number(
      dadosCriados.id_checklist
    );

  const versaoFinal =
    await obterVersaoAtual(
      client,
      registro.entidade,
      idEntidade
    );

  const resultadoSync =
    await client.query(
      `
        UPDATE sincronizacao
        SET
          id_entidade = $1,
          versao_servidor = $2,
          status = 'SINCRONIZADO',
          dados_servidor = $3,
          mensagem_erro = NULL,
          data_sincronizacao = CURRENT_TIMESTAMP,
          data_atualizacao = CURRENT_TIMESTAMP
        WHERE id_sincronizacao = $4
        RETURNING *;
      `,
      [
        idEntidade,
        versaoFinal,
        dadosCriados,
        registro.id_sincronizacao,
      ]
    );

  await client.query("COMMIT");

  return resultadoSync.rows[0];
}
      // ================================================
      // CRIAR DADOS_TECNICOS
      // ================================================

      if (
        registro.entidade ===
        "DADOS_TECNICOS"
      ) {
        const dadosCriados =
          await criarDadosTecnicos(
            client,
            registro.dados_cliente,
            registro.id_usuario
          );

        if (!dadosCriados) {
          throw criarErro(
            "Não foi possível criar os dados técnicos.",
            500
          );
        }


        // PostgreSQL gerou o ID real
        const idEntidade =
          Number(
            dadosCriados.id_dados
          );


        // A trigger criou automaticamente
        // a versão inicial da entidade
        const versaoFinal =
          await obterVersaoAtual(
            client,
            registro.entidade,
            idEntidade
          );


        // Atualizar a sincronização com
        // o ID real criado no servidor
        const resultadoSync =
          await client.query(
            `
              UPDATE sincronizacao
              SET
                id_entidade = $1,
                versao_servidor = $2,
                status = 'SINCRONIZADO',
                dados_servidor = $3,
                mensagem_erro = NULL,
                data_sincronizacao =
                  CURRENT_TIMESTAMP,
                data_atualizacao =
                  CURRENT_TIMESTAMP
              WHERE id_sincronizacao = $4
              RETURNING *;
            `,
            [
              idEntidade,
              versaoFinal,
              dadosCriados,
              registro.id_sincronizacao,
            ]
          );

        await client.query(
          "COMMIT"
        );

        return resultadoSync.rows[0];
      }


      // ================================================
      // Outras entidades ainda não implementadas
      // ================================================

      throw criarErro(
        "A operação CRIAR ainda não foi implementada para esta entidade.",
        400
      );
    }

// ==================================================
// OPERAÇÃO EXCLUIR
// ==================================================

if (
  registro.operacao ===
  "EXCLUIR"
) {
  const idEntidade =
    Number(
      registro.id_entidade
    );

  if (
    !Number.isInteger(
      idEntidade
    ) ||
    idEntidade <= 0
  ) {
    throw criarErro(
      "ID da entidade inválido.",
      400
    );
  }


  // ==================================================
  // Consultar versão OFICIAL atual
  // ==================================================

  const resultadoVersao =
    await client.query(
      `
        SELECT *
        FROM versao_entidade
        WHERE entidade = $1
          AND id_entidade = $2
        FOR UPDATE;
      `,
      [
        registro.entidade,
        idEntidade,
      ]
    );

  const controleVersao =
    resultadoVersao.rows[0];

  if (!controleVersao) {
    throw criarErro(
      "Controle de versão da entidade não encontrado.",
      404
    );
  }


  const versaoAtualServidor =
    Number(
      controleVersao.versao
    );

  const versaoCliente =
    Number(
      registro.versao_cliente
    );


  // ==================================================
  // Registro já excluído
  // ==================================================

  if (
    controleVersao.excluido === true
  ) {
    const resultadoJaExcluido =
      await client.query(
        `
          UPDATE sincronizacao
          SET
            status = 'SINCRONIZADO',
            versao_servidor = $1,
            dados_servidor = NULL,
            mensagem_erro = NULL,
            data_sincronizacao = CURRENT_TIMESTAMP,
            data_atualizacao = CURRENT_TIMESTAMP
          WHERE id_sincronizacao = $2
          RETURNING *;
        `,
        [
          versaoAtualServidor,
          registro.id_sincronizacao,
        ]
      );

    await client.query("COMMIT");

    return resultadoJaExcluido.rows[0];
  }


  // ==================================================
  // Conferir conflito de versão
  // ==================================================

  if (
    versaoCliente !==
    versaoAtualServidor
  ) {
    let dadosAtuaisServidor =
      null;

    if (
      registro.entidade ===
      "DADOS_TECNICOS"
    ) {
      dadosAtuaisServidor =
        await buscarDadosTecnicos(
          client,
          idEntidade
        );
    }

    const resultadoConflito =
      await client.query(
        `
          UPDATE sincronizacao
          SET
            status = 'CONFLITO',
            versao_servidor = $1,
            dados_servidor = $2,
            mensagem_erro = $3,
            data_atualizacao = CURRENT_TIMESTAMP
          WHERE id_sincronizacao = $4
          RETURNING *;
        `,
        [
          versaoAtualServidor,
          dadosAtuaisServidor,
          "Conflito de versão detectado durante a exclusão.",
          registro.id_sincronizacao,
        ]
      );

    await client.query("COMMIT");

    return resultadoConflito.rows[0];
  }


  // ==================================================
  // Executar exclusão
  // ==================================================

 let dadosExcluidos = null;


// ==================================================
// CAMPANHA
// ==================================================

if (
  registro.entidade ===
  "CAMPANHA"
) {
  dadosExcluidos =
    await excluirCampanha(
      client,
      idEntidade,
      registro.id_usuario
    );
}


// ==================================================
// LOCAL
// ==================================================

else if (
  registro.entidade ===
  "LOCAL"
) {
  dadosExcluidos =
    await excluirLocal(
      client,
      idEntidade,
      registro.id_usuario
    );
}


// ==================================================
// CHECKLIST NR-33
// ==================================================

else if (
  registro.entidade ===
  "CHECKLIST_NR33"
) {
  dadosExcluidos =
    await excluirChecklist(
      client,
      idEntidade,
      registro.id_usuario
    );
}


// ==================================================
// DADOS TÉCNICOS
// ==================================================

else if (
  registro.entidade ===
  "DADOS_TECNICOS"
) {
  dadosExcluidos =
    await excluirDadosTecnicos(
      client,
      idEntidade,
      registro.id_usuario
    );
}


else {
  throw criarErro(
    "A operação EXCLUIR ainda não foi implementada para esta entidade.",
    400
  );
}


  if (!dadosExcluidos) {
    throw criarErro(
      "Registro não encontrado para exclusão.",
      404
    );
  }


  // ==================================================
  // Consultar versão gerada pela trigger DELETE
  // ==================================================

  const versaoFinal =
    await obterVersaoAtual(
      client,
      registro.entidade,
      idEntidade
    );


  // ==================================================
  // Finalizar sincronização
  // ==================================================

  const resultadoSync =
    await client.query(
      `
        UPDATE sincronizacao
        SET
          status = 'SINCRONIZADO',
          versao_servidor = $1,
          dados_servidor = NULL,
          mensagem_erro = NULL,
          data_sincronizacao = CURRENT_TIMESTAMP,
          data_atualizacao = CURRENT_TIMESTAMP
        WHERE id_sincronizacao = $2
        RETURNING *;
      `,
      [
        versaoFinal,
        registro.id_sincronizacao,
      ]
    );

  await client.query("COMMIT");

  return resultadoSync.rows[0];
}
    // ==================================================
    // OPERAÇÃO ATUALIZAR
    // ==================================================

    if (
      registro.operacao !==
      "ATUALIZAR"
    ) {
      throw criarErro(
        "Operação de sincronização não suportada.",
        400
      );
    }


    const idEntidade =
      Number(
        registro.id_entidade
      );

    if (
      !Number.isInteger(
        idEntidade
      ) ||
      idEntidade <= 0
    ) {
      throw criarErro(
        "ID da entidade inválido.",
        400
      );
    }


    // ==================================================
    // Consultar versão OFICIAL atual
    // ==================================================

    const resultadoVersao =
      await client.query(
        `
          SELECT *
          FROM versao_entidade
          WHERE entidade = $1
            AND id_entidade = $2
          FOR UPDATE;
        `,
        [
          registro.entidade,
          idEntidade,
        ]
      );

    const controleVersao =
      resultadoVersao.rows[0];

    if (!controleVersao) {
      throw criarErro(
        "Controle de versão da entidade não encontrado.",
        404
      );
    }

    const versaoAtualServidor =
      Number(
        controleVersao.versao
      );

    const versaoCliente =
      Number(
        registro.versao_cliente
      );


    // ==================================================
    // Buscar estado atual do servidor
    // ==================================================

    let dadosAtuaisServidor =
      null;


    if (
      registro.entidade ===
      "LOCAL"
    ) {
      dadosAtuaisServidor =
        await buscarLocal(
          client,
          idEntidade
        );
    }


    else if (
      registro.entidade ===
      "CAMPANHA"
    ) {
      dadosAtuaisServidor =
        await buscarCampanha(
          client,
          idEntidade
        );
    }


    else if (
      registro.entidade ===
      "CHECKLIST_NR33"
    ) {
      dadosAtuaisServidor =
        await buscarChecklist(
          client,
          idEntidade
        );
    }


    else if (
      registro.entidade ===
      "DADOS_TECNICOS"
    ) {
      dadosAtuaisServidor =
        await buscarDadosTecnicos(
          client,
          idEntidade
        );
    }


    else {
      throw criarErro(
        "Processamento automático ainda não implementado para esta entidade.",
        400
      );
    }


    if (!dadosAtuaisServidor) {
      throw criarErro(
        "Registro da entidade não encontrado no servidor.",
        404
      );
    }


    // ==================================================
    // Conferir conflito ANTES de aplicar
    // ==================================================

    if (
      versaoCliente !==
      versaoAtualServidor
    ) {
      const resultadoConflito =
        await client.query(
          `
            UPDATE sincronizacao
            SET
              status = 'CONFLITO',
              versao_servidor = $1,
              dados_servidor = $2,
              mensagem_erro = $3,
              data_atualizacao =
                CURRENT_TIMESTAMP
            WHERE id_sincronizacao = $4
            RETURNING *;
          `,
          [
            versaoAtualServidor,
            dadosAtuaisServidor,
            "Conflito de versão detectado durante o processamento da sincronização.",
            registro.id_sincronizacao,
          ]
        );

      await client.query(
        "COMMIT"
      );

      return resultadoConflito.rows[0];
    }


    // ==================================================
    // Aplicar dados do cliente
    // ==================================================

    let dadosAtualizados = null;


    if (
      registro.entidade ===
      "LOCAL"
    ) {
      dadosAtualizados =
        await atualizarLocal(
          client,
          idEntidade,
          registro.dados_cliente
        );
    }


    else if (
      registro.entidade ===
      "CAMPANHA"
    ) {
      dadosAtualizados =
        await atualizarCampanha(
          client,
          idEntidade,
          registro.dados_cliente
        );
    }


    else if (
      registro.entidade ===
      "CHECKLIST_NR33"
    ) {
      dadosAtualizados =
        await atualizarChecklist(
          client,
          idEntidade,
          registro.dados_cliente
        );
    }


    else if (
      registro.entidade ===
      "DADOS_TECNICOS"
    ) {
      dadosAtualizados =
        await atualizarDadosTecnicos(
          client,
          idEntidade,
          registro.dados_cliente
        );
    }


    if (!dadosAtualizados) {
      throw criarErro(
        "Registro da entidade não encontrado.",
        404
      );
    }


    // ==================================================
    // Consultar versão gerada automaticamente
    // pela trigger do PostgreSQL
    // ==================================================

    const versaoFinal =
      await obterVersaoAtual(
        client,
        registro.entidade,
        idEntidade
      );


    // ==================================================
    // Finalizar como SINCRONIZADO
    // ==================================================

    const resultadoSync =
      await client.query(
        `
          UPDATE sincronizacao
          SET
            status = 'SINCRONIZADO',
            versao_servidor = $1,
            dados_servidor = $2,
            mensagem_erro = NULL,
            data_sincronizacao =
              CURRENT_TIMESTAMP,
            data_atualizacao =
              CURRENT_TIMESTAMP
          WHERE id_sincronizacao = $3
          RETURNING *;
        `,
        [
          versaoFinal,
          dadosAtualizados,
          registro.id_sincronizacao,
        ]
      );

    await client.query(
      "COMMIT"
    );

    return resultadoSync.rows[0];

  } catch (erro) {

    await client.query(
      "ROLLBACK"
    );

    throw erro;

  } finally {

    client.release();

  }
}


// ======================================================
// Exportações
// ======================================================

module.exports = {
  resolverConflitoLocal,
  resolverConflitoCampanha,
  resolverConflitoChecklist,
  resolverConflitoDadosTecnicos,
  processarSincronizacaoPendente,
};