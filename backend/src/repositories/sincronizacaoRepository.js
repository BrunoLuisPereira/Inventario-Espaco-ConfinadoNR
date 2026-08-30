const pool = require("../config/database");

async function criar(dados) {
  const {
    entidade,
    id_entidade,
    id_operacao_cliente,
    id_registro_cliente,
    operacao,
    versao_cliente,
    versao_servidor,
    status,
    dados_cliente,
    dados_servidor,
    mensagem_erro,
    id_usuario,
    data_sincronizacao,
  } = dados;

  const query = `
    INSERT INTO sincronizacao (
      entidade,
      id_entidade,
      id_operacao_cliente,
      id_registro_cliente,
      operacao,
      versao_cliente,
      versao_servidor,
      status,
      dados_cliente,
      dados_servidor,
      mensagem_erro,
      id_usuario,
      data_sincronizacao
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13
    )
    RETURNING *;
  `;

  const valores = [
    entidade,
    id_entidade ?? null,
    id_operacao_cliente ?? null,
    id_registro_cliente ?? null,
    operacao,
    versao_cliente ?? 1,
    versao_servidor ?? 1,
    status ?? "PENDENTE",
    dados_cliente ?? null,
    dados_servidor ?? null,
    mensagem_erro ?? null,
    id_usuario,
    data_sincronizacao ?? null,
  ];

  const resultado = await pool.query(
    query,
    valores
  );

  return resultado.rows[0];
}


async function buscarPorOperacaoCliente(
  idOperacaoCliente
) {
  const query = `
    SELECT *
    FROM sincronizacao
    WHERE id_operacao_cliente = $1;
  `;

  const resultado = await pool.query(
    query,
    [idOperacaoCliente]
  );

  return resultado.rows[0] || null;
}


async function listarTodos() {
  const query = `
    SELECT *
    FROM sincronizacao
    ORDER BY id_sincronizacao DESC;
  `;

  const resultado = await pool.query(query);

  return resultado.rows;
}


async function buscarPorId(
  idSincronizacao
) {
  const query = `
    SELECT *
    FROM sincronizacao
    WHERE id_sincronizacao = $1;
  `;

  const resultado = await pool.query(
    query,
    [idSincronizacao]
  );

  return resultado.rows[0] || null;
}


async function buscarPorEntidade(
  entidade,
  idEntidade
) {
  const query = `
    SELECT *
    FROM sincronizacao
    WHERE entidade = $1
      AND id_entidade = $2
    ORDER BY id_sincronizacao DESC;
  `;

  const resultado = await pool.query(
    query,
    [entidade, idEntidade]
  );

  return resultado.rows;
}


async function buscarPendentesPorUsuario(
  idUsuario
) {
  const query = `
    SELECT *
    FROM sincronizacao
    WHERE id_usuario = $1
      AND status = 'PENDENTE'
    ORDER BY data_criacao ASC;
  `;

  const resultado = await pool.query(
    query,
    [idUsuario]
  );

  return resultado.rows;
}


async function buscarConflitosPorUsuario(
  idUsuario
) {
  const query = `
    SELECT *
    FROM sincronizacao
    WHERE id_usuario = $1
      AND status = 'CONFLITO'
    ORDER BY data_criacao DESC;
  `;

  const resultado = await pool.query(
    query,
    [idUsuario]
  );

  return resultado.rows;
}


async function atualizarStatus(
  idSincronizacao,
  dados
) {
  const {
    status,
    versao_servidor,
    dados_servidor,
    mensagem_erro,
    data_sincronizacao,
  } = dados;

  const query = `
    UPDATE sincronizacao
    SET
      status = COALESCE($1, status),

      versao_servidor =
        COALESCE($2, versao_servidor),

      dados_servidor =
        COALESCE($3, dados_servidor),

      mensagem_erro = $4,

      data_sincronizacao =
        COALESCE(
          $5,
          data_sincronizacao
        ),

      data_atualizacao =
        CURRENT_TIMESTAMP

    WHERE id_sincronizacao = $6

    RETURNING *;
  `;

  const valores = [
    status ?? null,
    versao_servidor ?? null,
    dados_servidor ?? null,
    mensagem_erro ?? null,
    data_sincronizacao ?? null,
    idSincronizacao,
  ];

  const resultado = await pool.query(
    query,
    valores
  );

  return resultado.rows[0] || null;
}


async function excluir(
  idSincronizacao
) {
  const query = `
    DELETE FROM sincronizacao
    WHERE id_sincronizacao = $1
    RETURNING *;
  `;

  const resultado = await pool.query(
    query,
    [idSincronizacao]
  );

  return resultado.rows[0] || null;
}

async function resolverConflito(
  idSincronizacao,
  dados
) {
  const {
    resolucao,
    dados_resolvidos,
    id_usuario_resolucao,
    versao_servidor,
  } = dados;

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

  const valores = [
    resolucao,
    dados_resolvidos ?? null,
    id_usuario_resolucao,
    versao_servidor,
    idSincronizacao,
  ];

  const resultado = await pool.query(
    query,
    valores
  );

  return resultado.rows[0] || null;
}
module.exports = {
  criar,
  buscarPorOperacaoCliente,
  listarTodos,
  buscarPorId,
  buscarPorEntidade,
  buscarPendentesPorUsuario,
  buscarConflitosPorUsuario,
  atualizarStatus,
  excluir,
  resolverConflito,
};