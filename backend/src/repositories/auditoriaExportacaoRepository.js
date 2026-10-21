const pool = require('../config/database');
const normalizarId = require('../utils/normalizarIdDominio');
const { exigir } = require('../utils/permissoes');

// O cursor retém o snapshot da consulta. READ COMMITTED permite às consultas
// separadas de autorização enxergar revogações confirmadas durante a leitura.
async function* exportar(identidade, { signal, validarSessao }) {
  exigir(identidade, 'usuarios.auditoria.consultar');
  const id = normalizarId(identidade.id_usuario);
  const ambiente = identidade.id_ambiente;
  if (typeof ambiente !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ambiente)) {
    throw Object.assign(new Error('Usuário não autenticado.'), { statusCode: 401 });
  }
  function verificar() {
    if (signal.aborted) throw new Error('Exportação interrompida.');
    validarSessao();
  }
  verificar();
  const c = await pool.connect();
  let aberta = false, descartar = false;
  async function autorizar() {
    verificar();
    const r = await c.query(`SELECT u.perfil_acesso,u.eh_fundador FROM usuario u
      JOIN ambiente a ON a.id_ambiente=u.id_ambiente
      WHERE u.id_usuario=$1 AND u.id_ambiente=$2 AND u.ativo AND a.ativo`, [id, ambiente]);
    if (!r.rows[0]) throw Object.assign(new Error('Usuário ou ambiente inativo.'), { statusCode: 401 });
    exigir(r.rows[0], 'usuarios.auditoria.consultar');
  }
  try {
    await c.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY'); aberta = true;
    await c.query("SET LOCAL statement_timeout = '15s'");
    await c.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");
    await autorizar();
    await c.query(`DECLARE nr33_auditoria_exportacao INSENSITIVE NO SCROLL CURSOR WITHOUT HOLD FOR
      SELECT h.id_auditoria,h.id_usuario_afetado,h.id_usuario_responsavel,
        h.perfil_anterior,h.perfil_novo,h.data_hora,
        afetado.nome AS nome_usuario,responsavel.nome AS nome_responsavel
      FROM auditoria_perfil_usuario h
      LEFT JOIN usuario afetado ON afetado.id_usuario=h.id_usuario_afetado AND afetado.id_ambiente=h.id_ambiente
      LEFT JOIN usuario responsavel ON responsavel.id_usuario=h.id_usuario_responsavel AND responsavel.id_ambiente=h.id_ambiente
      WHERE h.id_ambiente=$1 AND EXISTS(SELECT 1 FROM usuario u JOIN ambiente a USING(id_ambiente)
        WHERE u.id_usuario=$2 AND u.id_ambiente=h.id_ambiente AND u.ativo AND a.ativo
          AND u.eh_fundador AND u.perfil_acesso='ADMINISTRADOR')
      ORDER BY h.data_hora DESC,h.id_auditoria DESC`, [ambiente, id]);
    while (true) {
      await autorizar();
      const r = await c.query('FETCH FORWARD 500 FROM nr33_auditoria_exportacao');
      await autorizar();
      if (!r.rows.length) break;
      yield r.rows;
    }
    await c.query('CLOSE nr33_auditoria_exportacao');
    await autorizar();
    await c.query('COMMIT'); aberta = false;
  } catch (e) {
    if (!aberta) descartar = true;
    throw e;
  } finally {
    if (aberta) {
      try { await c.query('ROLLBACK'); } catch { descartar = true; }
    }
    c.release(descartar || undefined);
  }
}
module.exports = { exportar };
