const pool = require('../config/database');
const emailLockRepository = require('./emailLockRepository');
const conviteRepository = require('./conviteRepository');

const colunas = 'u.id_usuario, u.nome, u.email, u.perfil_acesso, u.eh_fundador, u.ativo, u.data_criacao, u.data_atualizacao';
const { perfis, sqlCapacidade } = require('../utils/permissoes');
function erroConta(message, statusCode) {
  return Object.assign(new Error(message), { statusCode, publicoConta: true });
}
function validarIdentidade(usuario) {
  if (!Number.isSafeInteger(usuario?.id_usuario) || usuario.id_usuario <= 0 ||
      typeof usuario.id_ambiente !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usuario.id_ambiente)) {
    throw erroConta('Usuário não autenticado.', 401);
  }
  return [usuario.id_usuario, usuario.id_ambiente];
}
function indisponivel() {
  return erroConta('Usuário ou ambiente inválido ou desativado. Realize o login novamente.', 401);
}

async function buscarPerfil(usuario) {
  const parametros = validarIdentidade(usuario);
  const resultado = await pool.query(`
    SELECT ${colunas}, u.id_ambiente,
      CASE WHEN to_jsonb(u)->>'idioma' = 'en' THEN 'en' ELSE 'pt-BR' END AS idioma,
      a.nome AS nome_ambiente FROM usuario AS u
    INNER JOIN ambiente AS a ON a.id_ambiente = u.id_ambiente
    WHERE u.id_usuario = $1 AND u.id_ambiente = $2
      AND u.ativo = TRUE AND a.ativo = TRUE
  `, parametros);
  const registro = resultado.rows[0];
  if (!registro) throw indisponivel();
  if (!perfis.includes(registro.perfil_acesso)) throw erroConta('Perfil de acesso inválido.', 403);
  return registro;
}

// Ordem compartilhada com as escritas administrativas: e-mail, ambiente,
// usuário. O callback de senha verifica o hash obtido SOB o lock da linha.
async function escrever(usuario, dados, prepararSenha) {
  const parametros = validarIdentidade(usuario);
  const client = await pool.connect();
  let iniciada = false;
  let descartar = false;
  try {
    await client.query('BEGIN');
    iniciada = true;
    if (!prepararSenha && dados.temEmail) await emailLockRepository.bloquearEmail(client, dados.email);
    const ambiente = await client.query(`
      SELECT id_ambiente FROM ambiente WHERE id_ambiente = $1 AND ativo = TRUE FOR SHARE
    `, [parametros[1]]);
    if (!ambiente.rows[0]) throw indisponivel();
    const resultado = await client.query(`
      SELECT ${colunas}, u.id_ambiente, u.senha_hash FROM usuario AS u
      WHERE u.id_usuario = $1 AND u.id_ambiente = $2 FOR UPDATE
    `, parametros);
    const atual = resultado.rows[0];
    if (!atual || atual.ativo !== true || atual.id_ambiente !== parametros[1]) throw indisponivel();
    if (!perfis.includes(atual.perfil_acesso)) throw erroConta('Perfil de acesso inválido.', 403);

    let sql;
    let valores;
    if (prepararSenha) {
      const hash = await prepararSenha(atual.senha_hash);
      sql = 'senha_hash = $3, sessao_versao = sessao_versao + 1';
      valores = [...parametros, hash];
    } else if (dados.idioma !== undefined) {
      sql = 'idioma = $3';
      valores = [...parametros, dados.idioma];
    } else {
      if (dados.temEmail) {
        const duplicado = await client.query(`
          SELECT 1 FROM usuario WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1))
            AND id_usuario <> $2 LIMIT 1
        `, [dados.email, parametros[0]]);
        if (duplicado.rows.length) throw erroConta('Já existe outro usuário com este e-mail.', 409);
        if (dados.email !== atual.email.trim().toLowerCase() &&
            await conviteRepository.existeConvitePendente(client, dados.email)) {
          throw erroConta('Este e-mail não está disponível para alteração.', 409);
        }
      }
      // Nunca escreve perfil, ambiente, identidade ou status; nem seus snapshots.
      sql = 'nome = CASE WHEN $3 THEN $4 ELSE u.nome END, email = CASE WHEN $5 THEN $6 ELSE u.email END';
      valores = [...parametros, dados.temNome, dados.nome, dados.temEmail, dados.email];
    }
    const atualizado = await client.query(`
      UPDATE usuario AS u SET ${sql}, data_atualizacao = CURRENT_TIMESTAMP
      WHERE u.id_usuario = $1 AND u.id_ambiente = $2 AND u.ativo = TRUE
        AND ${sqlCapacidade('u', 'conta.propria')}
        AND EXISTS (SELECT 1 FROM ambiente AS a WHERE a.id_ambiente = u.id_ambiente AND a.ativo = TRUE)
      RETURNING ${dados.idioma !== undefined ? 'u.id_usuario, u.id_ambiente, u.idioma' : colunas}
    `, valores);
    if (!atualizado.rows[0]) throw new Error('Escrita autorizada de conta sem resultado.');
    if (prepararSenha) {
      await client.query(`UPDATE recuperacao_senha SET invalidado_em = clock_timestamp()
        WHERE id_usuario = $1 AND id_ambiente = $2 AND consumido_em IS NULL AND invalidado_em IS NULL`, parametros);
      await client.query(`UPDATE recuperacao_envio SET concluido_em = clock_timestamp()
        WHERE email = $1 AND concluido_em IS NULL`, [atual.email.trim().toLowerCase()]);
    }
    await client.query('COMMIT');
    iniciada = false;
    return atualizado.rows[0];
  } catch (erro) {
    if (iniciada) {
      try { await client.query('ROLLBACK'); } catch { descartar = true; }
    } else descartar = true;
    if (dados.idioma !== undefined && erro?.code === '42703') {
      throw erroConta('Preferência de idioma indisponível. Solicite a aplicação manual da migration 027.', 503);
    }
    // Somente o índice normalizado confirmado na migração 020 representa
    // este conflito. Outras violações não viram respostas de negócio falsas.
    if (!prepararSenha && erro?.code === '23505' && erro.constraint === 'uq_usuario_email_normalizado') {
      throw erroConta('Já existe outro usuário com este e-mail.', 409);
    }
    throw erro;
  } finally {
    if (descartar) client.release(true); else client.release();
  }
}

async function atualizarNomeAmbiente(usuario, nome) {
  const parametros = validarIdentidade(usuario);
  const client = await pool.connect();
  let iniciada = false;
  let descartar = false;
  try {
    await client.query('BEGIN');
    iniciada = true;
    // Mesma ordem das outras escritas: ambiente antes do usuário.
    const ambiente = await client.query(`
      SELECT id_ambiente FROM ambiente WHERE id_ambiente = $1 AND ativo = TRUE FOR UPDATE
    `, [parametros[1]]);
    if (!ambiente.rows[0]) throw indisponivel();
    const fundador = await client.query(`
      SELECT u.id_usuario FROM usuario AS u
      WHERE u.id_usuario = $1 AND u.id_ambiente = $2 AND u.ativo = TRUE
        AND u.perfil_acesso = 'ADMINISTRADOR' AND u.eh_fundador = TRUE
      FOR SHARE OF u
    `, parametros);
    if (!fundador.rows[0]) throw erroConta('Somente o administrador fundador pode alterar o nome do ambiente.', 403);
    const resultado = await client.query(`
      UPDATE ambiente SET nome = $3
      WHERE id_ambiente = $2 AND ativo = TRUE
        AND EXISTS (SELECT 1 FROM usuario AS u
          WHERE u.id_usuario = $1 AND u.id_ambiente = ambiente.id_ambiente
            AND u.ativo = TRUE AND u.perfil_acesso = 'ADMINISTRADOR' AND u.eh_fundador = TRUE)
      RETURNING nome AS nome_ambiente
    `, [...parametros, nome]);
    if (!resultado.rows[0]) throw indisponivel();
    await client.query('COMMIT');
    iniciada = false;
    return resultado.rows[0];
  } catch (erro) {
    if (iniciada) {
      try { await client.query('ROLLBACK'); } catch { descartar = true; }
    } else descartar = true;
    throw erro;
  } finally {
    if (descartar) client.release(true); else client.release();
  }
}

module.exports = {
  atualizarIdioma: (usuario, idioma) => escrever(usuario, { idioma }),
  atualizarNomeAmbiente,
  erroConta, validarIdentidade, buscarPerfil,
  atualizarPerfil: (usuario, dados) => escrever(usuario, dados),
  alterarSenha: (usuario, prepararSenha) => escrever(usuario, {}, prepararSenha),
};
