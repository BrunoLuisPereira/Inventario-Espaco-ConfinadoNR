const pool = require("../config/database");


// ======================================================
// Criar sincronização
// ======================================================
async function criar(dados) {
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
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13
    )
    RETURNING *;
  `;

  const valores = [
    dados.entidade,
    dados.id_entidade ?? null,
    dados.id_operacao_cliente ?? null,
    dados.id_registro_cliente ?? null,
    dados.operacao,
    dados.versao_cliente,
    dados.versao_servidor ?? null,
    dados.status,
    dados.dados_cliente ?? null,
    dados.dados_servidor ?? null,
    dados.mensagem_erro ?? null,
    dados.id_usuario,
    dados.data_sincronizacao ?? null,
  ];

  const resultado =
    await pool.query(
      query,
      valores
    );

  return resultado.rows[0];
}


// ======================================================
// Buscar por ID da operação do cliente
// ======================================================

async function buscarPorOperacaoCliente(
  idOperacaoCliente
) {
  const query = `
    SELECT *
    FROM sincronizacao
    WHERE id_operacao_cliente = $1;
  `;

  const resultado =
    await pool.query(
      query,
      [idOperacaoCliente]
    );

  return resultado.rows[0] || null;
}


// ======================================================
// Listar todas
// ======================================================

async function listarTodos() {
  const query = `
    SELECT *
    FROM sincronizacao
    ORDER BY id_sincronizacao DESC;
  `;

  const resultado =
    await pool.query(query);

  return resultado.rows;
}


// ======================================================
// Buscar por ID
// ======================================================

async function buscarPorId(
  idSincronizacao
) {
  const query = `
    SELECT *
    FROM sincronizacao
    WHERE id_sincronizacao = $1;
  `;

  const resultado =
    await pool.query(
      query,
      [idSincronizacao]
    );

  return resultado.rows[0] || null;
}


// ======================================================
// Buscar por entidade
// ======================================================

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

  const resultado =
    await pool.query(
      query,
      [
        entidade,
        idEntidade,
      ]
    );

  return resultado.rows;
}
// ======================================================
// Buscar pendentes por usuário
// ======================================================

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

  const resultado =
    await pool.query(
      query,
      [idUsuario]
    );

  return resultado.rows;
}


// ======================================================
// Buscar conflitos por usuário
// ======================================================

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

  const resultado =
    await pool.query(
      query,
      [idUsuario]
    );

  return resultado.rows;
}


// ======================================================
// Buscar todas as pendentes
// Uso administrativo
// ======================================================

async function buscarPendentesTodos() {
  const query = `
    SELECT *
    FROM sincronizacao
    WHERE status = 'PENDENTE'
    ORDER BY data_criacao ASC;
  `;

  const resultado =
    await pool.query(query);

  return resultado.rows;
}


// ======================================================
// Buscar todos os conflitos
// Uso administrativo
// ======================================================

async function buscarConflitosTodos() {
  const query = `
    SELECT *
    FROM sincronizacao
    WHERE status = 'CONFLITO'
    ORDER BY data_criacao DESC;
  `;

  const resultado =
    await pool.query(query);

  return resultado.rows;
}


// ======================================================
// Atualizar status
// ======================================================

async function atualizarStatus(
  idSincronizacao,
  dados
) {
  const query = `
    UPDATE sincronizacao
    SET
      status =
        COALESCE(
          $1,
          status
        ),

      versao_servidor =
        COALESCE(
          $2,
          versao_servidor
        ),

      dados_servidor =
        COALESCE(
          $3,
          dados_servidor
        ),

      mensagem_erro =
        $4,

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

  const resultado =
    await pool.query(
      query,
      [
        dados.status ?? null,
        dados.versao_servidor ?? null,
        dados.dados_servidor ?? null,
        dados.mensagem_erro ?? null,
        dados.data_sincronizacao ?? null,
        idSincronizacao,
      ]
    );

  return resultado.rows[0] || null;
}
// ======================================================
// Excluir registro de sincronização
// ======================================================

async function excluir(
  idSincronizacao
) {
  const query = `
    DELETE FROM sincronizacao
    WHERE id_sincronizacao = $1
    RETURNING *;
  `;

  const resultado =
    await pool.query(
      query,
      [idSincronizacao]
    );

  return resultado.rows[0] || null;
}


// ======================================================
// Resolver conflito
// ======================================================

async function resolverConflito(
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
    await pool.query(
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
// Exportações
// ======================================================

module.exports = {
  criar,
  buscarPorOperacaoCliente,
  listarTodos,
  buscarPorId,
  buscarPorEntidade,
  buscarPendentesPorUsuario,
  buscarConflitosPorUsuario,
  buscarPendentesTodos,
  buscarConflitosTodos,
  atualizarStatus,
  excluir,
  resolverConflito,
};