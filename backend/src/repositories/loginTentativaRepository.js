// SQL parametrizado. Nenhuma senha, token, e-mail ou IP em claro nesta tabela.
const pool = require('../config/database');
const INVALIDO = 'E-mail ou senha inválidos.';
const ESPERA = 'Muitas tentativas de login. Aguarde antes de tentar novamente.';
function erroPublico(statusCode) {
  return Object.assign(new Error(statusCode === 429 ? ESPERA : INVALIDO), { statusCode });
}

async function transacao(operacao) {
  const client = await pool.connect();
  let descartar = false;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
    const resultado = await operacao(client);
    await client.query('COMMIT');
    return resultado;
  } catch (erro) {
    try { await client.query('ROLLBACK'); } catch { descartar = true; }
    throw erro;
  } finally {
    client.release(descartar);
  }
}

async function bloquear(client, tipo, chave) {
  // UPSERT adquire o lock inclusive na criação concorrente. Não há lacuna
  // INSERT DO NOTHING / SELECT vulnerável à remoção pela limpeza.
  await client.query(`/* login:lock */
    INSERT INTO public.login_tentativa AS t (tipo, chave_hash)
    VALUES ($1, $2)
    ON CONFLICT (tipo, chave_hash) DO UPDATE SET atualizado_em = clock_timestamp()
  `, [tipo, chave]);
  // Relógio lido DEPOIS de adquirir o lock, não no começo da espera.
  const { rows } = await client.query(`/* login:estado */
    SELECT restrito_ate > clock_timestamp() AS restrito
    FROM public.login_tentativa WHERE tipo = $1 AND chave_hash = $2
  `, [tipo, chave]);
  if (rows.length !== 1) throw new Error('Estado de limitação indisponível.');
  return rows[0].restrito === true;
}

async function limitarIp(chave) {
  const permitido = await transacao(async client => {
    if (await bloquear(client, 'ip', chave)) return false;
    const { rows } = await client.query(`/* login:ip */
      WITH agora AS MATERIALIZED (SELECT clock_timestamp() AS instante)
      UPDATE public.login_tentativa AS t SET
        requisicoes = CASE WHEN inicio_janela <= agora.instante - INTERVAL '15 minutes'
          OR restrito_ate <= agora.instante THEN 1 ELSE LEAST(requisicoes + 1, 100) END,
        inicio_janela = CASE WHEN inicio_janela <= agora.instante - INTERVAL '15 minutes'
          OR restrito_ate <= agora.instante THEN agora.instante ELSE inicio_janela END,
        restrito_ate = CASE WHEN inicio_janela > agora.instante - INTERVAL '15 minutes'
          AND (restrito_ate IS NULL OR restrito_ate > agora.instante)
          AND requisicoes >= 100 THEN agora.instante + INTERVAL '15 minutes' ELSE NULL END,
        atualizado_em = agora.instante
      FROM agora WHERE tipo = 'ip' AND chave_hash = $1
      RETURNING restrito_ate IS NULL AS permitido
    `, [chave]);
    return rows[0].permitido;
  });
  if (!permitido) throw erroPublico(429);
}

async function autenticar(chave, verificar) {
  const resultado = await transacao(async client => {
    if (await bloquear(client, 'identificador', chave)) return { status: 429 };
    try {
      // Lock por identificador permanece durante bcrypt e revalidação.
      const dados = await verificar(client);
      await client.query(`/* login:sucesso */
        UPDATE public.login_tentativa SET falhas = '{}', restrito_ate = NULL,
          atualizado_em = clock_timestamp()
        WHERE tipo = 'identificador' AND chave_hash = $1
      `, [chave]);
      return { dados };
    } catch (erro) {
      if (erro.statusCode !== 401) throw erro;
      const { rows } = await client.query(`/* login:falha */
        WITH agora AS MATERIALIZED (SELECT clock_timestamp() AS instante),
        recentes AS (
          SELECT ARRAY(SELECT f FROM unnest(t.falhas) AS f
            WHERE f > agora.instante - INTERVAL '15 minutes' ORDER BY f)
            || ARRAY[agora.instante] AS falhas, agora.instante
          FROM public.login_tentativa t CROSS JOIN agora
          WHERE tipo = 'identificador' AND chave_hash = $1
        )
        UPDATE public.login_tentativa t SET falhas = recentes.falhas,
          restrito_ate = CASE WHEN cardinality(recentes.falhas) >= 5
            THEN recentes.instante + INTERVAL '15 minutes' ELSE NULL END,
          atualizado_em = recentes.instante
        FROM recentes WHERE tipo = 'identificador' AND chave_hash = $1
        RETURNING restrito_ate IS NOT NULL AS restrito
      `, [chave]);
      return { status: rows[0].restrito ? 429 : 401 };
    }
  });
  // Erros de autenticação só são lançados após COMMIT do contador.
  // O token só sai deste módulo após COMMIT da limpeza em um sucesso.
  if (resultado.status) throw erroPublico(resultado.status);
  return resultado.dados;
}

module.exports = { limitarIp, autenticar };
