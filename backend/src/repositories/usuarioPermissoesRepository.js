const pool = require('../config/database');
const normalizarId = require('../utils/normalizarIdDominio');
const { perfisConvite, exigir, sqlCapacidade } = require('../utils/permissoes');
const erro = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const colunas = 'id_usuario,nome,email,perfil_acesso,ativo,eh_fundador,id_convite_origem,data_criacao,data_atualizacao';
async function alterar(idAlvo, perfil, identidade) {
  exigir(identidade, 'usuarios.permissoes.alterar');
  if (!perfisConvite.includes(perfil)) throw erro('Perfil de acesso inválido para alteração.', 400);
  let alvoId, atorId;
  try { alvoId = normalizarId(idAlvo); atorId = normalizarId(identidade.id_usuario); } catch { throw erro('Identificador inválido.', 400); }
  const ambienteId = identidade.id_ambiente;
  if (typeof ambienteId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ambienteId)) throw erro('Usuário não autenticado.', 401);
  const c = await pool.connect(); let aberta = false, descartar = false;
  try {
    await c.query('BEGIN'); aberta = true;
    const a = await c.query('SELECT id_ambiente FROM ambiente WHERE id_ambiente=$1 AND ativo=TRUE FOR SHARE', [ambienteId]);
    if (!a.rows[0]) throw erro('Usuário ou ambiente inativo.', 401);
    const r = await c.query(`SELECT ${colunas},id_ambiente FROM usuario WHERE id_ambiente=$1 AND id_usuario=ANY($2::bigint[]) ORDER BY id_usuario FOR UPDATE`, [ambienteId, [atorId, alvoId]]);
    const ator = r.rows.find(u => normalizarId(u.id_usuario) === atorId);
    if (!ator || !ator.ativo) throw erro('Usuário ou ambiente inativo.', 401);
    exigir(ator, 'usuarios.permissoes.alterar');
    const alvo = r.rows.find(u => normalizarId(u.id_usuario) === alvoId);
    if (!alvo) throw erro('Usuário não encontrado.', 404);
    if (alvo.eh_fundador) throw erro('O perfil do fundador não pode ser alterado.', 409);
    if (!alvo.id_convite_origem) throw erro('Origem de convite não comprovada para este usuário.', 409);
    const origem = await c.query('SELECT id_convite FROM convite WHERE id_convite=$1 AND id_ambiente=$2 AND data_aceite IS NOT NULL FOR SHARE', [alvo.id_convite_origem, ambienteId]);
    if (!origem.rows[0]) throw erro('Origem de convite não comprovada para este usuário.', 409);
    // Contexto local da transacao, utilizado pelos triggers de protecao/auditoria.
    await c.query("SELECT set_config('nr33.usuario_responsavel',$1,true)", [String(atorId)]);
    const atualizado = await c.query(`UPDATE usuario alvo SET perfil_acesso=$3,data_atualizacao=CURRENT_TIMESTAMP
      WHERE alvo.id_usuario=$1 AND alvo.id_ambiente=$2 AND NOT alvo.eh_fundador AND alvo.id_convite_origem=$5
      AND EXISTS(SELECT 1 FROM usuario u JOIN ambiente a USING(id_ambiente) WHERE u.id_usuario=$4 AND u.id_ambiente=$2
        AND u.ativo AND a.ativo AND u.eh_fundador AND u.perfil_acesso='ADMINISTRADOR')
      RETURNING ${colunas}`, [alvoId, ambienteId, perfil, atorId, alvo.id_convite_origem]);
    if (!atualizado.rows[0]) throw erro('Não foi possível concluir a alteração.', 409);
    await c.query('COMMIT'); aberta = false;
    return atualizado.rows[0];
  } catch (e) {
    if (aberta) { try { await c.query('ROLLBACK'); } catch { descartar = true; } } else descartar = true;
    throw e;
  } finally { c.release(descartar || undefined); }
}
async function listarAuditoria(identidade) {
  exigir(identidade, 'usuarios.auditoria.consultar');
  const r = await pool.query(`SELECT h.id_auditoria,h.id_usuario_responsavel,h.id_usuario_afetado,h.perfil_anterior,h.perfil_novo,h.data_hora
    FROM auditoria_perfil_usuario h WHERE h.id_ambiente=$1 AND EXISTS(SELECT 1 FROM usuario u JOIN ambiente a USING(id_ambiente)
    WHERE u.id_usuario=$2 AND u.id_ambiente=h.id_ambiente AND u.ativo AND a.ativo AND u.eh_fundador AND u.perfil_acesso='ADMINISTRADOR')
    ORDER BY h.data_hora DESC,h.id_auditoria DESC LIMIT 200`, [identidade.id_ambiente, normalizarId(identidade.id_usuario)]);
  return r.rows;
}
async function listarHistorico(identidade) {
  exigir(identidade, 'auditoria.consultar');
  const r = await pool.query(`SELECT v.entidade,v.id_entidade,v.versao,v.excluido,v.data_atualizacao,v.data_exclusao
    FROM versao_entidade v WHERE v.id_ambiente=$1 AND EXISTS(SELECT 1 FROM usuario u JOIN ambiente a USING(id_ambiente)
      WHERE u.id_usuario=$2 AND u.id_ambiente=v.id_ambiente AND u.ativo AND a.ativo AND ${sqlCapacidade('u','auditoria.consultar')})
    ORDER BY v.data_atualizacao DESC,v.id_versao DESC LIMIT 200`, [identidade.id_ambiente, normalizarId(identidade.id_usuario)]);
  return r.rows;
}
module.exports = { alterar, listarAuditoria, listarHistorico };
