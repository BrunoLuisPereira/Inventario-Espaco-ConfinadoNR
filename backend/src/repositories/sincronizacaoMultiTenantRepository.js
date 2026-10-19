const pool = require('../config/database');
const erro = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const ausente = () => erro('Registro de sincronização ou entidade não encontrado.', 404);
const conflito = () => erro('Conflito de sincronização. Verifique a operação e tente novamente.', 409);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESPECIFICACOES = Object.freeze({
  CAMPANHA: { tabela: 'campanha', chave: 'id_campanha', campos: ['nome_campanha', 'empresa', 'responsavel', 'data_inicio', 'status'], status: ['EM ANDAMENTO', 'CONCLUIDO', 'CANCELADA'] },
  LOCAL: { tabela: 'local', chave: 'id_local', campos: ['nome_local', 'setor', 'descricao', 'endereco', 'latitude', 'longitude', 'status'], status: ['ATIVO', 'INATIVO'] },
  CHECKLIST_NR33: { tabela: 'checklist_nr33', chave: 'id_checklist', campos: ['criterio_a', 'criterio_b', 'criterio_c', 'identificacao_espaco', 'acesso_controlado', 'ventilacao_adequada', 'monitoramento_atmosferico', 'procedimento_emergencia', 'observacoes', 'status'], status: ['PENDENTE', 'CONCLUIDO'] },
  DADOS_TECNICOS: { tabela: 'dados_tecnicos', chave: 'id_dados', campos: ['pressao_atmosferica', 'ventilacao', 'oxigenio', 'gas_inflamavel', 'monoxido_carbono', 'sulfeto_hidrogenio', 'temperatura', 'umidade', 'observacoes', 'status'], status: ['PENDENTE', 'CONCLUIDO'] },
  EVIDENCIA: { tabela: 'evidencia', chave: 'id_evidencia' }
});
function id(v, status = 400) { if (!['number', 'string'].includes(typeof v) || !Number.isSafeInteger(Number(v)) || Number(v) <= 0) throw erro('Identificador inválido.', status); return Number(v); }
function identidade(u) {
  if (!u || typeof u !== 'object' || Array.isArray(u) || typeof u.id_ambiente !== 'string' || !UUID.test(u.id_ambiente)) throw erro('Usuário não autenticado.', 401);
  return { id_usuario: id(u.id_usuario, 401), id_ambiente: u.id_ambiente.toLowerCase() };
}
function especificacao(e) { if (!Object.hasOwn(ESPECIFICACOES, e)) throw erro('Entidade inválida.', 400); return ESPECIFICACOES[e]; }
function objeto(d) { if (!d || typeof d !== 'object' || Array.isArray(d)) throw erro('Dados da entidade inválidos.', 400); return d; }
function contexto(e) {
  const s = especificacao(e);
  const campanha = e === 'CAMPANHA' ? 'e' : 'c';
  const local = e === 'CAMPANHA' ? null : e === 'LOCAL' ? 'e' : 'l';
  const joins = e === 'CAMPANHA' ? '' : e === 'LOCAL' ? 'JOIN campanha c ON c.id_campanha = e.id_campanha'
    : 'JOIN local l ON l.id_local = e.id_local JOIN campanha c ON c.id_campanha = l.id_campanha';
  return { ...s, campanha, local, from: `${s.tabela} e ${joins}`,
    permissao: `${campanha}.id_ambiente = $1 AND EXISTS (
      SELECT 1 FROM usuario solicitante JOIN ambiente a ON a.id_ambiente = solicitante.id_ambiente
      WHERE solicitante.id_usuario = $2 AND solicitante.id_ambiente = $1 AND solicitante.ativo = TRUE AND a.ativo = TRUE
      AND (solicitante.perfil_acesso = 'ADMINISTRADOR' OR ${campanha}.id_usuario = solicitante.id_usuario))` };
}
const PERMISSAO_SYNC = `s.id_ambiente = $1 AND EXISTS (
  SELECT 1 FROM usuario solicitante JOIN ambiente a ON a.id_ambiente = solicitante.id_ambiente
  WHERE solicitante.id_usuario = $2 AND solicitante.id_ambiente = s.id_ambiente
    AND solicitante.ativo = TRUE AND a.ativo = TRUE
    AND (solicitante.perfil_acesso = 'ADMINISTRADOR' OR s.id_usuario = solicitante.id_usuario))`;
// Snapshots de servidor não são visíveis após perder acesso ao recurso.
const VISIBILIDADE = `(s.operacao = 'CRIAR' AND s.id_entidade IS NULL OR ${Object.keys(ESPECIFICACOES).map(e => {
  const c = contexto(e); return `(s.entidade = '${e}' AND EXISTS (SELECT 1 FROM ${c.from} WHERE e.${c.chave} = s.id_entidade AND ${c.permissao}))`;
}).join(' OR ')} OR (s.operacao = 'EXCLUIR' AND EXISTS (
  SELECT 1 FROM versao_entidade v JOIN usuario administrador ON administrador.id_usuario = $2
  WHERE v.id_ambiente = $1 AND v.entidade = s.entidade AND v.id_entidade = s.id_entidade AND v.excluido = TRUE
    AND administrador.id_ambiente = $1 AND administrador.ativo = TRUE AND administrador.perfil_acesso = 'ADMINISTRADOR'))) `;

async function transacao(usuario, executar) {
  const u = identidade(usuario); const client = await pool.connect(); let aberta = false, descartar;
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED'); aberta = true;
    for (const alias of ['a', 'u']) {
      const r = await client.query(`SELECT u.id_usuario, u.perfil_acesso FROM ambiente a JOIN usuario u ON u.id_ambiente = a.id_ambiente
        WHERE a.id_ambiente = $1 AND u.id_usuario = $2 AND u.ativo = TRUE AND a.ativo = TRUE FOR SHARE OF ${alias}`, [u.id_ambiente, u.id_usuario]);
      if (!r.rows[0]) throw erro('Usuário ou ambiente inválido ou desativado.', 401);
      if (!['ADMINISTRADOR', 'ENGENHEIRO_SEGURANCA'].includes(r.rows[0].perfil_acesso)) throw erro('Usuário não autorizado.', 403);
      u.perfil_acesso = r.rows[0].perfil_acesso;
    }
    const resultado = await executar(client, u);
    await client.query('COMMIT'); aberta = false; return resultado;
  } catch (falha) {
    if (aberta) { try { await client.query('ROLLBACK'); } catch (rollback) { descartar = rollback; } }
    else descartar = falha;
    throw falha;
  } finally { if (descartar) client.release(descartar); else client.release(); }
}
async function bloquearEntidade(client, e, valor, u) {
  const c = contexto(e), alvo = id(valor), aliases = [...new Set([c.campanha, c.local, 'e'].filter(Boolean))]; let pais, registro;
  for (const alias of aliases) {
    const valores = [u.id_ambiente, u.id_usuario, alvo];
    if (pais) valores.push(pais._campanha, ...(c.local ? [pais._local] : []));
    const r = await client.query(`SELECT e.*, ${c.campanha}.id_campanha AS _campanha, ${c.local ? `${c.local}.id_local` : 'NULL::bigint'} AS _local
      FROM ${c.from} WHERE e.${c.chave} = $3 AND ${c.permissao}
      ${pais ? `AND ${c.campanha}.id_campanha = $4 ${c.local ? `AND ${c.local}.id_local = $5` : ''}` : ''}
      FOR UPDATE OF ${alias}`, valores);
    if (!r.rows[0]) throw ausente(); pais = r.rows[0]; registro = { ...pais };
  }
  delete registro._campanha; delete registro._local; return registro;
}
async function versao(client, e, valor, u, bloquear = false) {
  const r = await client.query(`SELECT v.* FROM versao_entidade v WHERE v.id_ambiente = $1 AND v.entidade = $2 AND v.id_entidade = $3 ${bloquear ? 'FOR UPDATE OF v' : ''}`, [u.id_ambiente, e, id(valor)]);
  if (!r.rows[0]) throw erro('Controle de versão da entidade não encontrado.', 404);
  id(r.rows[0].versao); return r.rows[0];
}
async function carregar(client, valor, u, bloquear = false) {
  const r = await client.query(`SELECT s.* FROM sincronizacao s WHERE ${PERMISSAO_SYNC} AND s.id_sincronizacao = $3
    ${bloquear ? 'FOR UPDATE OF s' : `AND ${VISIBILIDADE}`}`, [u.id_ambiente, u.id_usuario, id(valor)]);
  if (!r.rows[0]) throw ausente(); return r.rows[0];
}
async function contextoRegistro(client, s, u) {
  if (s.operacao === 'CRIAR' && s.id_entidade == null) return resolverPai(client, s.entidade, s.dados_cliente, u, false, s.id_usuario);
  // Não se infere responsabilidade a partir de tombstone sem ancestralidade.
  // Somente administrador do ambiente pode confirmar uma exclusão já consumada.
  if (s.operacao === 'EXCLUIR' && u.perfil_acesso === 'ADMINISTRADOR') {
    const v = await versao(client, s.entidade, s.id_entidade, u);
    if (v.excluido) return { excluido: true };
  }
  return bloquearEntidade(client, s.entidade, s.id_entidade, u);
}
async function resolverPai(client, e, dados, u, aplicar, autor = u.id_usuario) {
  if (e === 'CAMPANHA') return null;
  const d = objeto(dados), entidadePai = e === 'LOCAL' ? 'CAMPANHA' : 'LOCAL';
  const coluna = e === 'LOCAL' ? 'id_campanha' : 'id_local'; let pai = d[coluna];
  if (pai == null && d[`${coluna}_cliente`] != null) {
    const chave = d[`${coluna}_cliente`]; if (typeof chave !== 'string' || !UUID.test(chave)) throw erro('Identificador do registro pai inválido.', 400);
    const r = await client.query(`SELECT s.id_entidade, s.status FROM sincronizacao s WHERE s.id_ambiente = $1 AND s.id_usuario = $2
      AND s.entidade = $3 AND s.operacao = 'CRIAR' AND s.id_registro_cliente = $4
      AND s.status IN ('PENDENTE', 'SINCRONIZADO') FOR SHARE OF s`, [u.id_ambiente, id(autor), entidadePai, chave]);
    if (!r.rows[0] || r.rows[0].status !== 'SINCRONIZADO' || r.rows[0].id_entidade == null) {
      if (!aplicar && r.rows[0]?.status === 'PENDENTE') return { pendente: true };
      throw erro('O registro pai criado offline ainda não foi sincronizado.', 409);
    }
    pai = r.rows[0].id_entidade;
  }
  if (pai == null) throw erro(`Informe ${coluna} ou ${coluna}_cliente.`, 400);
  await bloquearEntidade(client, entidadePai, id(pai), u); return { coluna, id: id(pai) };
}
function canonico(v) {
  if (Array.isArray(v)) return v.map(canonico);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonico(v[k])]));
  return v;
}
function mesmaOperacao(s, d, u) {
  return s.id_ambiente === u.id_ambiente && Number(s.id_usuario) === u.id_usuario && s.entidade === d.entidade && s.operacao === d.operacao &&
    (d.operacao === 'CRIAR' || Number(s.id_entidade) === Number(d.id_entidade)) && Number(s.versao_cliente) === d.versao_cliente &&
    (s.id_registro_cliente ?? null) === d.id_registro_cliente && (s.id_operacao_cliente ?? null) === d.id_operacao_cliente &&
    JSON.stringify(canonico(s.dados_cliente ?? null)) === JSON.stringify(canonico(d.dados_cliente ?? null));
}
async function repeticao(client, d, u) {
  if (!d.id_operacao_cliente && !(d.operacao === 'CRIAR' && d.id_registro_cliente)) return null;
  const r = await client.query(`SELECT s.* FROM sincronizacao s WHERE s.id_ambiente = $1 AND s.id_usuario = $2
    AND (s.id_operacao_cliente = $3 OR (s.entidade = $4 AND s.operacao = 'CRIAR' AND s.id_registro_cliente = $5))`,
  [u.id_ambiente, u.id_usuario, d.id_operacao_cliente, d.entidade, d.operacao === 'CRIAR' ? d.id_registro_cliente : null]);
  if (!r.rows.length) return null;
  if (r.rows.length !== 1 || !mesmaOperacao(r.rows[0], d, u)) throw conflito();
  await contextoRegistro(client, r.rows[0], u); return r.rows[0];
}
async function registrar(d, usuario) {
  // Também valida a entrada no limite do repositório; corpo não define identidade.
  especificacao(d.entidade); if (!['CRIAR', 'ATUALIZAR', 'EXCLUIR'].includes(d.operacao)) throw erro('Operação inválida.', 400);
  id(d.versao_cliente); if (d.operacao !== 'CRIAR') id(d.id_entidade);
  if (Number(d.versao_cliente) > 2147483647) throw erro('Versão do cliente inválida.', 400);
  for (const chave of [d.id_operacao_cliente, d.id_registro_cliente]) if (chave != null && (typeof chave !== 'string' || !UUID.test(chave))) throw erro('Identificador UUID inválido.', 400);
  if (d.operacao === 'CRIAR' && !d.id_registro_cliente) throw erro('ID do registro do cliente obrigatório.', 400);
  try {
    return await transacao(usuario, async (client, u) => {
      let v = { versao: 1 }, servidor = null;
      if (d.operacao === 'CRIAR') await resolverPai(client, d.entidade, d.dados_cliente, u, false);
      else { servidor = await contextoRegistro(client, d, u); v = await versao(client, d.entidade, d.id_entidade, u, true); }
      const antiga = await repeticao(client, d, u); if (antiga) return antiga;
      const divergiu = d.operacao !== 'CRIAR' && Number(v.versao) !== d.versao_cliente;
      await client.query('SAVEPOINT registrar_sync');
      try {
        const r = await client.query(`INSERT INTO sincronizacao (id_ambiente, id_usuario, entidade, id_entidade, id_operacao_cliente,
          id_registro_cliente, operacao, versao_cliente, versao_servidor, status, dados_cliente, dados_servidor, mensagem_erro)
          SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13
          FROM usuario u JOIN ambiente a ON a.id_ambiente = u.id_ambiente
          WHERE u.id_usuario = $2 AND u.id_ambiente = $1 AND u.ativo = TRUE AND a.ativo = TRUE RETURNING *`,
        [u.id_ambiente, u.id_usuario, d.entidade, d.id_entidade, d.id_operacao_cliente, d.id_registro_cliente, d.operacao, d.versao_cliente, Number(v.versao),
          divergiu ? 'CONFLITO' : 'PENDENTE', JSON.stringify(d.dados_cliente ?? null), divergiu ? JSON.stringify(v.excluido ? null : servidor) : null,
          divergiu ? 'Conflito de versão detectado. O registro do servidor foi alterado desde a última sincronização do cliente.' : null]);
        if (!r.rows[0]) throw erro('Falha interna ao registrar sincronização.', 500);
        await client.query('RELEASE SAVEPOINT registrar_sync'); return r.rows[0];
      } catch (falha) {
        if (falha.code !== '23505' || !['uq_sincronizacao_operacao_cliente', 'uq_sincronizacao_registro_cliente_criar'].includes(falha.constraint)) throw falha;
        await client.query('ROLLBACK TO SAVEPOINT registrar_sync');
        const existente = await repeticao(client, d, u); if (!existente) throw conflito();
        await client.query('RELEASE SAVEPOINT registrar_sync'); return existente;
      }
    });
  } catch (falha) { throw falha; }
}
async function listar(filtros, usuario) {
  const u = identidade(usuario), valores = [u.id_ambiente, u.id_usuario], predicados = [];
  for (const campo of ['status', 'entidade', 'id_entidade']) if (filtros[campo] !== undefined) { valores.push(filtros[campo]); predicados.push(`s.${campo} = $${valores.length}`); }
  const r = await pool.query(`SELECT s.* FROM sincronizacao s WHERE ${PERMISSAO_SYNC} AND ${VISIBILIDADE}
    ${predicados.map(p => `AND ${p}`).join(' ')} ORDER BY ${filtros.status === 'PENDENTE' ? 's.data_criacao ASC' : filtros.status === 'CONFLITO' ? 's.data_criacao DESC' : 's.id_sincronizacao DESC'}`, valores);
  return r.rows;
}
async function buscar(valor, usuario) { const u = identidade(usuario); return carregar(pool, valor, u); }
async function excluir(valor, usuario) {
  return transacao(usuario, async (client, u) => {
    const s = await carregar(client, valor, u, true); await contextoRegistro(client, s, u);
    if (s.status === 'SINCRONIZADO') throw erro('O comprovante de uma sincronização aplicada deve ser preservado.', 409);
    const r = await client.query(`DELETE FROM sincronizacao s WHERE ${PERMISSAO_SYNC} AND s.id_sincronizacao = $3 RETURNING s.*`, [u.id_ambiente, u.id_usuario, id(valor)]);
    if (!r.rows[0]) throw erro('Falha interna ao excluir sincronização.', 500); return r.rows[0];
  });
}
async function atualizarStatus(valor, dados, usuario) {
  objeto(dados);
  return transacao(usuario, async (client, u) => {
    const s = await carregar(client, valor, u, true); await contextoRegistro(client, s, u);
    if (dados.status === 'SINCRONIZADO') throw erro('A conclusão da sincronização exige processamento da operação.', 409);
    if (dados.status != null && !['PENDENTE', 'CONFLITO', 'ERRO'].includes(dados.status)) throw erro('Status inválido.', 400);
    if (s.status === 'SINCRONIZADO') throw conflito(); // Não reabre operação já aplicada.
    // Snapshots, versão oficial e data de aplicação pertencem ao servidor.
    const r = await client.query(`UPDATE sincronizacao s SET status = COALESCE($4, s.status), mensagem_erro = $5,
      data_atualizacao = CURRENT_TIMESTAMP WHERE ${PERMISSAO_SYNC} AND s.id_sincronizacao = $3 RETURNING s.*`,
    [u.id_ambiente, u.id_usuario, id(valor), dados.status ?? null, typeof dados.mensagem_erro === 'string' ? dados.mensagem_erro : null]);
    if (!r.rows[0]) throw erro('Falha interna ao atualizar sincronização.', 500); return r.rows[0];
  });
}

function campos(e, dados, criar) {
  const d = { ...objeto(dados) }, s = especificacao(e); if (!s.campos) throw erro('Processamento automático ainda não implementado para esta entidade.', 400);
  if (e === 'CHECKLIST_NR33' && d.identificacao_espaco != null) {
    if (!['A', 'B', 'C'].includes(d.identificacao_espaco)) throw erro('Identificação do espaço inválida.', 400);
    for (const letra of ['a', 'b', 'c']) if (!Object.hasOwn(d, `criterio_${letra}`)) d[`criterio_${letra}`] = d.identificacao_espaco === letra.toUpperCase() ? 'SIM' : 'NAO';
  }
  const r = Object.fromEntries(s.campos.filter(c => Object.hasOwn(d, c) && d[c] !== undefined).map(c => [c, d[c]]));
  if (criar) {
    r.status ??= s.status[0];
    if (e === 'CAMPANHA') for (const c of ['nome_campanha', 'empresa', 'responsavel', 'data_inicio']) if (!d[c]) throw erro(`O campo ${c} é obrigatório.`, 400);
    if (e === 'LOCAL' && !d.nome_local) throw erro('O nome do local é obrigatório.', 400);
    if (e === 'CHECKLIST_NR33') for (const c of s.campos.filter(c => c !== 'identificacao_espaco' && !['observacoes', 'status'].includes(c))) if (!['SIM', 'NAO'].includes(d[c])) throw erro(`O campo ${c} deve ser SIM ou NAO.`, 400);
    if (e === 'DADOS_TECNICOS') r.ventilacao ??= 'NAO_INFORMADA';
  }
  if (r.status != null && !s.status.includes(r.status)) throw erro('Status da entidade inválido.', 400);
  for (const c of ['nome_campanha', 'empresa', 'responsavel', 'nome_local']) if (Object.hasOwn(r, c)) {
    if (typeof r[c] !== 'string' || !r[c].trim()) throw erro(`O campo ${c} é obrigatório.`, 400); r[c] = r[c].trim();
  }
  for (const c of ['latitude', 'longitude', 'pressao_atmosferica', 'oxigenio', 'gas_inflamavel', 'monoxido_carbono', 'sulfeto_hidrogenio', 'temperatura', 'umidade']) if (r[c] != null) {
    if (!['number', 'string'].includes(typeof r[c]) || typeof r[c] === 'string' && !r[c].trim() || !Number.isFinite(Number(r[c]))) throw erro(`O campo ${c} deve ser numérico.`, 400);
  }
  for (const c of ['criterio_a', 'criterio_b', 'criterio_c', 'acesso_controlado', 'ventilacao_adequada', 'monitoramento_atmosferico', 'procedimento_emergencia']) if (Object.hasOwn(r, c) && !['SIM', 'NAO'].includes(r[c])) throw erro(`O campo ${c} deve ser SIM ou NAO.`, 400);
  if (r.ventilacao != null && !['NATURAL', 'MECANICA', 'FORCADA', 'NAO_INFORMADA'].includes(r.ventilacao)) throw erro('Ventilação inválida.', 400);
  return r;
}
async function aplicar(client, s, dados, u) {
  const c = contexto(s.entidade), criar = s.operacao === 'CRIAR';
  if (s.entidade === 'EVIDENCIA') throw erro('Processamento automático ainda não implementado para esta entidade.', 400);
  if (criar) {
    const pai = await resolverPai(client, s.entidade, dados, u, true, s.id_usuario), selecionados = campos(s.entidade, dados, true);
    if (pai) selecionados[pai.coluna] = pai.id;
    if (s.entidade === 'CAMPANHA') selecionados.id_ambiente = u.id_ambiente;
    if (s.entidade !== 'LOCAL') selecionados.id_usuario = id(s.id_usuario);
    const autor = await client.query(`SELECT id_usuario FROM usuario WHERE id_usuario = $1 AND id_ambiente = $2 AND ativo = TRUE FOR SHARE`, [id(s.id_usuario), u.id_ambiente]);
    if (!autor.rows[0]) throw erro('Autor da operação inativo ou indisponível.', 401);
    const nomes = Object.keys(selecionados), valores = [u.id_ambiente, u.id_usuario, ...(pai ? [pai.id] : []), ...Object.values(selecionados)];
    const inicio = pai ? 4 : 3;
    const origem = pai ? contexto(s.entidade === 'LOCAL' ? 'CAMPANHA' : 'LOCAL') : null;
    const r = await client.query(`INSERT INTO ${c.tabela} (${nomes.join(', ')}) SELECT ${nomes.map((_, i) => `$${inicio + i}`).join(', ')}
      FROM ${origem ? origem.from : 'usuario e JOIN ambiente a ON a.id_ambiente = e.id_ambiente'}
      WHERE ${origem ? `e.${origem.chave} = $3 AND ${origem.permissao}` : 'e.id_usuario = $2 AND e.id_ambiente = $1 AND e.ativo = TRUE AND a.ativo = TRUE'} RETURNING *`, valores);
    if (!r.rows[0]) throw erro('Falha interna ao aplicar sincronização.', 500); return r.rows[0];
  }
  if (s.operacao === 'EXCLUIR') {
    const r = await client.query(`DELETE FROM ${c.tabela} alvo USING ${c.from}
      WHERE alvo.${c.chave} = e.${c.chave} AND e.${c.chave} = $3 AND ${c.permissao} RETURNING alvo.*`, [u.id_ambiente, u.id_usuario, id(s.id_entidade)]);
    if (!r.rows[0]) throw erro('Falha interna ao aplicar exclusão.', 500); return null;
  }
  const selecionados = campos(s.entidade, dados, false), nomes = Object.keys(selecionados);
  if (!nomes.length) throw erro('Nenhum campo válido foi informado para atualização.', 400);
  const r = await client.query(`UPDATE ${c.tabela} alvo SET ${nomes.map((nome, i) => `${nome} = $${i + 4}`).join(', ')}, data_atualizacao = CURRENT_TIMESTAMP
    FROM ${c.from} WHERE alvo.${c.chave} = e.${c.chave} AND e.${c.chave} = $3 AND ${c.permissao} RETURNING alvo.*`,
  [u.id_ambiente, u.id_usuario, id(s.id_entidade), ...Object.values(selecionados)]);
  if (!r.rows[0]) throw erro('Falha interna ao aplicar atualização.', 500); return r.rows[0];
}
async function finalizar(client, s, u, dados) {
  const r = await client.query(`UPDATE sincronizacao s SET status = $4::varchar(20), id_entidade = COALESCE($5, s.id_entidade), versao_servidor = $6,
    dados_servidor = $7::jsonb, mensagem_erro = $8, data_sincronizacao = CASE WHEN $4::varchar(20) = 'SINCRONIZADO' THEN CURRENT_TIMESTAMP ELSE s.data_sincronizacao END,
    resolucao = COALESCE($9::text, s.resolucao), dados_resolvidos = CASE WHEN $9::text IS NOT NULL THEN $7::jsonb ELSE s.dados_resolvidos END,
    id_usuario_resolucao = CASE WHEN $9::text IS NOT NULL THEN $2 ELSE s.id_usuario_resolucao END,
    data_resolucao = CASE WHEN $9::text IS NOT NULL THEN CURRENT_TIMESTAMP ELSE s.data_resolucao END, data_atualizacao = CURRENT_TIMESTAMP
    WHERE ${PERMISSAO_SYNC} AND s.id_sincronizacao = $3 AND s.status = $10 RETURNING s.*`,
  [u.id_ambiente, u.id_usuario, id(s.id_sincronizacao), dados.status, dados.id ?? null, dados.versao, dados.servidor == null ? null : JSON.stringify(dados.servidor), dados.mensagem ?? null, dados.resolucao ?? null, s.status]);
  if (!r.rows[0]) throw erro('Falha interna ao finalizar sincronização.', 500); return r.rows[0];
}
async function processar(valor, usuario) {
  return transacao(usuario, async (client, u) => {
    const s = await carregar(client, valor, u, true); await contextoRegistro(client, s, u);
    if (s.status !== 'PENDENTE') throw erro('A sincronização não está pendente.', 409);
    if (s.entidade === 'EVIDENCIA') throw erro('Processamento automático ainda não implementado para esta entidade.', 400);
    if (s.operacao !== 'CRIAR') {
      const v = await versao(client, s.entidade, s.id_entidade, u, true);
      if (s.operacao === 'EXCLUIR' && v.excluido) return finalizar(client, s, u, { status: 'SINCRONIZADO', versao: Number(v.versao), servidor: null });
      const servidor = await bloquearEntidade(client, s.entidade, s.id_entidade, u);
      if (Number(v.versao) !== Number(s.versao_cliente)) return finalizar(client, s, u, { status: 'CONFLITO', versao: Number(v.versao), servidor,
        mensagem: 'Conflito de versão detectado durante o processamento da sincronização.' });
    }
    const servidor = await aplicar(client, s, s.dados_cliente, u);
    const alvo = s.operacao === 'CRIAR' ? id(servidor[especificacao(s.entidade).chave]) : id(s.id_entidade);
    const v = await versao(client, s.entidade, alvo, u);
    return finalizar(client, s, u, { status: 'SINCRONIZADO', id: alvo, versao: Number(v.versao), servidor });
  });
}
async function resolver(valor, dados, usuario) {
  return transacao(usuario, async (client, u) => {
    const s = await carregar(client, valor, u, true); const atual = await contextoRegistro(client, s, u);
    if (s.status !== 'CONFLITO') throw erro('Esta sincronização não possui um conflito pendente.', 409);
    if (!['CLIENTE', 'SERVIDOR', 'MESCLADO'].includes(dados.resolucao)) throw erro('Resolução inválida.', 400);
    if (s.entidade === 'EVIDENCIA' || s.operacao === 'CRIAR') throw erro('A resolução manual desta operação ainda não foi implementada.', 400);
    if (s.operacao === 'EXCLUIR' && dados.resolucao === 'MESCLADO') throw erro('A resolução MESCLADO não é permitida para conflitos de exclusão.', 400);
    let v = await versao(client, s.entidade, s.id_entidade, u, true), servidor;
    if (dados.resolucao === 'SERVIDOR') {
      if (v.excluido) throw ausente(); servidor = atual;
    } else {
      if (Number(v.versao) !== Number(s.versao_servidor) || v.excluido) throw erro('O estado do servidor mudou após o conflito. Atualize os dados antes de resolver.', 409);
      servidor = await aplicar(client, s, dados.resolucao === 'MESCLADO' ? dados.dados_resolvidos : s.dados_cliente, u);
      v = await versao(client, s.entidade, s.id_entidade, u);
    }
    return finalizar(client, s, u, { status: 'SINCRONIZADO', versao: Number(v.versao), servidor, resolucao: dados.resolucao });
  });
}
module.exports = { registrar, listar, buscar, excluir, atualizarStatus, processar, resolver };
