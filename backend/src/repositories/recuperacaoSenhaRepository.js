const pool = require('../config/database');

function criarRepository(banco = pool) {
  async function transacao(operacao) {
    const client = await banco.connect();
    let descartar = false;
    try {
      await client.query('BEGIN');
      const resultado = await operacao(client);
      await client.query('COMMIT');
      return resultado;
    } catch (erro) {
      try { await client.query('ROLLBACK'); } catch { descartar = true; }
      // Falhas de COMMIT também tornam o estado da conexão incerto.
      descartar = true;
      throw erro;
    } finally { client.release(descartar); }
  }
  return {
    async enfileirar(email) {
      await banco.query('INSERT INTO recuperacao_envio (email) VALUES ($1)', [email]);
    },
    async reivindicar() {
      const r = await banco.query(`UPDATE recuperacao_envio SET reserva = gen_random_uuid(),
        reservado_ate = clock_timestamp() + INTERVAL '2 minutes', tentativas = tentativas + 1
        WHERE id_envio = (SELECT id_envio FROM recuperacao_envio
          WHERE concluido_em IS NULL AND tentativas < 3 AND criado_em > clock_timestamp() - INTERVAL '30 minutes'
            AND (reservado_ate IS NULL OR reservado_ate < clock_timestamp())
          ORDER BY criado_em FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING id_envio, email, reserva`);
      return r.rows[0] || null;
    },
    async finalizar(idEnvio, reserva) {
      await banco.query(`UPDATE recuperacao_envio SET concluido_em = clock_timestamp()
        WHERE id_envio = $1 AND reserva = $2`, [idEnvio, reserva]);
    },
    async limpar() {
      // Retenção curta, em lotes; nenhum segredo original é persistido.
      await banco.query(`DELETE FROM recuperacao_envio WHERE criado_em < clock_timestamp() - INTERVAL '1 day'
        AND id_envio IN (SELECT id_envio FROM recuperacao_envio WHERE criado_em < clock_timestamp() - INTERVAL '1 day' LIMIT 100)`);
      await banco.query(`DELETE FROM recuperacao_senha WHERE expira_em < clock_timestamp() - INTERVAL '1 day'
        AND token_hash IN (SELECT token_hash FROM recuperacao_senha WHERE expira_em < clock_timestamp() - INTERVAL '1 day' LIMIT 100)`);
    },
    async limitar(chave, maximo) {
      // Limpeza limitada; não depende de timers/processo único.
      await banco.query(`DELETE FROM recuperacao_limite WHERE inicio_janela < clock_timestamp() - INTERVAL '1 day' AND chave_hash IN
        (SELECT chave_hash FROM recuperacao_limite
         WHERE inicio_janela < clock_timestamp() - INTERVAL '1 day' LIMIT 100)`);
      const r = await banco.query(`INSERT INTO recuperacao_limite AS l (chave_hash) VALUES ($1)
        ON CONFLICT (chave_hash) DO UPDATE SET
          inicio_janela = CASE WHEN l.inicio_janela <= clock_timestamp() - INTERVAL '15 minutes'
            THEN clock_timestamp() ELSE l.inicio_janela END,
          requisicoes = CASE WHEN l.inicio_janela <= clock_timestamp() - INTERVAL '15 minutes'
            THEN 1 ELSE l.requisicoes + 1 END
        WHERE l.inicio_janela <= clock_timestamp() - INTERVAL '15 minutes' OR l.requisicoes < $2
        RETURNING chave_hash`, [chave, maximo]);
      return r.rows.length === 1;
    },
    async emitir(email, tokenHash) {
      return transacao(async client => {
        // Mesma ordem do domínio: ambiente -> usuário -> tokens.
        const referencia = await client.query(`SELECT u.id_usuario, u.id_ambiente FROM usuario u
          JOIN ambiente a ON a.id_ambiente = u.id_ambiente
          WHERE LOWER(BTRIM(u.email)) = $1 AND u.ativo = TRUE AND a.ativo = TRUE`, [email]);
        const ref = referencia.rows[0];
        if (!ref) return null;
        const ambiente = await client.query('SELECT id_ambiente FROM ambiente WHERE id_ambiente = $1 AND ativo = TRUE FOR SHARE', [ref.id_ambiente]);
        if (!ambiente.rows.length) return null;
        const usuario = await client.query(`SELECT id_usuario, id_ambiente, email, sessao_versao FROM usuario
          WHERE id_usuario = $1 AND id_ambiente = $2 AND LOWER(BTRIM(email)) = $3 AND ativo = TRUE FOR UPDATE`,
        [ref.id_usuario, ref.id_ambiente, email]);
        const u = usuario.rows[0];
        if (!u) return null;
        await client.query(`UPDATE recuperacao_senha SET invalidado_em = clock_timestamp()
          WHERE id_usuario = $1 AND consumido_em IS NULL AND invalidado_em IS NULL`, [u.id_usuario]);
        await client.query(`INSERT INTO recuperacao_senha (token_hash, id_usuario, id_ambiente, email, sessao_versao)
          VALUES ($1, $2, $3, $4, $5)`, [tokenHash, u.id_usuario, u.id_ambiente, email, u.sessao_versao]);
        return { email: u.email };
      });
    },
    async invalidar(tokenHash) {
      await banco.query(`UPDATE recuperacao_senha SET invalidado_em = clock_timestamp()
        WHERE token_hash = $1 AND consumido_em IS NULL AND invalidado_em IS NULL`, [tokenHash]);
    },
    async ativar(tokenHash, idEnvio, reserva) {
      return transacao(async client => {
        const referencia = await client.query('SELECT id_usuario, id_ambiente FROM recuperacao_senha WHERE token_hash = $1', [tokenHash]);
        const ref = referencia.rows[0];
        if (!ref) return false;
        const ambiente = await client.query('SELECT id_ambiente FROM ambiente WHERE id_ambiente = $1 AND ativo = TRUE FOR SHARE', [ref.id_ambiente]);
        if (!ambiente.rows.length) return false;
        const usuario = await client.query(`SELECT id_usuario, email, sessao_versao FROM usuario
          WHERE id_usuario = $1 AND id_ambiente = $2 AND ativo = TRUE FOR UPDATE`, [ref.id_usuario, ref.id_ambiente]);
        const u = usuario.rows[0];
        if (!u) return false;
        const r = await client.query(`UPDATE recuperacao_senha SET ativado_em = clock_timestamp()
          WHERE token_hash = $1 AND email = $2 AND sessao_versao = $3 AND ativado_em IS NULL
            AND consumido_em IS NULL AND invalidado_em IS NULL AND expira_em > clock_timestamp()
            AND EXISTS (SELECT 1 FROM recuperacao_envio WHERE id_envio = $4 AND reserva = $5
              AND concluido_em IS NULL AND reservado_ate > clock_timestamp())
          RETURNING token_hash`, [tokenHash, u.email.trim().toLowerCase(), u.sessao_versao, idEnvio, reserva]);
        return r.rows.length === 1;
      });
    },
    async consumir(tokenHash, prepararSenha) {
      return transacao(async client => {
        const referencia = await client.query('SELECT id_usuario, id_ambiente FROM recuperacao_senha WHERE token_hash = $1', [tokenHash]);
        const ref = referencia.rows[0];
        if (!ref) return false;
        const ambiente = await client.query('SELECT id_ambiente FROM ambiente WHERE id_ambiente = $1 AND ativo = TRUE FOR SHARE', [ref.id_ambiente]);
        if (!ambiente.rows.length) return false;
        const usuario = await client.query(`SELECT id_usuario, email, sessao_versao FROM usuario
          WHERE id_usuario = $1 AND id_ambiente = $2 AND ativo = TRUE FOR UPDATE`, [ref.id_usuario, ref.id_ambiente]);
        const u = usuario.rows[0];
        if (!u) return false;
        const candidato = await client.query(`SELECT token_hash FROM recuperacao_senha
          WHERE token_hash = $1 AND id_usuario = $2 AND id_ambiente = $3
            AND email = $4 AND sessao_versao = $5 AND expira_em > clock_timestamp()
            AND ativado_em IS NOT NULL AND consumido_em IS NULL AND invalidado_em IS NULL FOR UPDATE`,
        [tokenHash, ref.id_usuario, ref.id_ambiente, u.email.trim().toLowerCase(), u.sessao_versao]);
        if (!candidato.rows.length) return false;
        // Somente tokens válidos causam trabalho bcrypt. Locks permanecem ativos.
        const senhaHash = await prepararSenha();
        const consumido = await client.query(`UPDATE recuperacao_senha SET consumido_em = clock_timestamp()
          WHERE token_hash = $1 AND ativado_em IS NOT NULL AND consumido_em IS NULL AND invalidado_em IS NULL
            AND expira_em > clock_timestamp() RETURNING token_hash`, [tokenHash]);
        if (!consumido.rows.length) return false;
        const atualizado = await client.query(`UPDATE usuario SET senha_hash = $3,
          sessao_versao = sessao_versao + 1, data_atualizacao = clock_timestamp()
          WHERE id_usuario = $1 AND id_ambiente = $2 AND ativo = TRUE RETURNING id_usuario`,
        [ref.id_usuario, ref.id_ambiente, senhaHash]);
        if (!atualizado.rows.length) throw new Error('Atualização de senha não concluída.');
        await client.query(`UPDATE recuperacao_senha SET invalidado_em = clock_timestamp()
          WHERE id_usuario = $1 AND consumido_em IS NULL AND invalidado_em IS NULL`, [ref.id_usuario]);
        await client.query(`UPDATE recuperacao_envio SET concluido_em = clock_timestamp()
          WHERE email = $1 AND concluido_em IS NULL`, [u.email.trim().toLowerCase()]);
        return true;
      });
    },
  };
}
module.exports = { criarRepository, repository: criarRepository() };
