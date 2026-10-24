// Modelo determinístico de transações/locks. Não conecta ao PostgreSQL e não
// comprova execução do SQL; a homologação real é documentada separadamente.
const assert = require('node:assert/strict');
function criarBanco() {
  const estado = new Map(), filas = new Map(), consultas = [], liberacoes = [];
  let agora = 0;
  const falhas = {};
  const pool = { async connect() {
    if (falhas.conexao) throw Error('CREDENCIAL_INTERNA_NAO_PUBLICAR');
    let chave, registro, soltar;
    return {
      async query(sql, params = []) {
        consultas.push({ sql, params });
        if (falhas.sql && sql.includes(falhas.sql)) throw Error('SQL_INTERNO_NAO_PUBLICAR');
        if (sql === 'BEGIN' || sql.startsWith('SET LOCAL')) return { rows: [] };
        if (sql === 'COMMIT') {
          if (falhas.commit || falhas.commitTipo === registro?.tipo) throw Error('COMMIT_INTERNO_NAO_PUBLICAR');
          if (chave) estado.set(chave, structuredClone(registro));
          soltar?.(); soltar = null;
          return { rows: [] };
        }
        if (sql === 'ROLLBACK') {
          soltar?.(); soltar = null;
          if (falhas.rollback) throw Error('ROLLBACK_INTERNO_NAO_PUBLICAR');
          return { rows: [] };
        }
        if (sql.includes('login:lock')) {
          assert.equal(chave, undefined);
          chave = params.join(':');
          const anterior = filas.get(chave) || Promise.resolve();
          const atual = new Promise(resolve => { soltar = resolve; });
          filas.set(chave, anterior.then(() => atual));
          await anterior;
          registro = structuredClone(estado.get(chave) || { tipo: params[0], falhas: [], inicio: agora, requisicoes: 0, restrito: null });
          return { rows: [] };
        }
        assert.ok(chave, 'Query deve ocorrer sob lock');
        if (sql.includes('login:estado')) return { rows: [{ restrito: registro.restrito !== null && registro.restrito > agora }] };
        if (sql.includes('login:ip')) {
          if (registro.inicio <= agora - 900000 || (registro.restrito !== null && registro.restrito <= agora)) {
            registro.inicio = agora; registro.requisicoes = 1; registro.restrito = null;
          } else if (registro.requisicoes >= 100) registro.restrito = agora + 900000;
          else registro.requisicoes++;
          return { rows: [{ permitido: registro.restrito === null }] };
        }
        if (sql.includes('login:sucesso')) {
          registro.falhas = []; registro.restrito = null;
          return { rows: [] };
        }
        if (sql.includes('login:falha')) {
          registro.falhas = registro.falhas.filter(f => f > agora - 900000).concat(agora);
          registro.restrito = registro.falhas.length >= 5 ? agora + 900000 : null;
          return { rows: [{ restrito: registro.restrito !== null }] };
        }
        throw Error('Query desconhecida no simulador');
      },
      release(descartar) { soltar?.(); liberacoes.push(descartar); },
    };
  } };
  return { pool, estado, consultas, liberacoes, falhas, avancar(ms) { agora += ms; } };
}
module.exports = { criarBanco };
