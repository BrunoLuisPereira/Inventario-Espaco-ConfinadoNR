// Somente catálogos e privilégios; não lê registros de usuários nem escreve SQL.
const { perfis } = require('../src/utils/permissoes');
function recusar(codigo) {
  const erro = Error(`Inicio local recusado [${codigo}]. Confira os pre-requisitos isolados.`);
  erro.codigoPreflight = codigo;
  return erro;
}
function exigir(condicao, codigo) { if (!condicao) throw recusar(codigo); }
const foraLiterais = (s,fn) => String(s ?? '').split(/('(?:''|[^'])*')/g)
  .map((parte,i)=>i%2 ? parte : fn(parte)).join('');
const normalizar = s => foraLiterais(s,p=>p.replace(/\s+/g,'').toLowerCase());
// Apenas CHECKs simples (uma comparação) usam esta forma. Os CHECKs booleanos
// compostos da 023 conservam todos os parênteses na comparação estrita abaixo.
const simples = s => foraLiterais(normalizar(s),p=>p.replace(/::charactervarying|::text\[\]|::text/g,'').replace(/[()]/g,''));

const colunas023 = [
  ['tipo', 'text', true, null], ['chave_hash', 'text', true, null],
  ['falhas', 'timestamp with time zone[]', true, "'{}'::timestamp with time zone[]"],
  ['inicio_janela', 'timestamp with time zone', true, 'clock_timestamp()'],
  ['requisicoes', 'integer', true, '0'], ['restrito_ate', 'timestamp with time zone', false, null],
  ['atualizado_em', 'timestamp with time zone', true, 'clock_timestamp()'],
];
const checks023 = [
  "CHECK ((tipo = ANY (ARRAY['identificador'::text, 'ip'::text])))",
  "CHECK ((chave_hash ~ '^[0-9a-f]{64}$'::text))",
  'CHECK (((requisicoes >= 0) AND (requisicoes <= 100)))',
  'CHECK ((cardinality(falhas) <= 5))',
  'CHECK ((array_position(falhas, NULL::timestamp with time zone) IS NULL))',
  "CHECK ((((tipo = 'ip'::text) AND (cardinality(falhas) = 0)) OR ((tipo = 'identificador'::text) AND (requisicoes = 0))))",
];

async function identidade(client) {
  const { rows: [r] } = await client.query(`/* preflight:identidade */
    SELECT current_database() AS banco, current_user AS papel, session_user AS sessao,
      current_setting('server_version_num')::int / 10000 AS versao,
      host(inet_server_addr()) AS host, inet_server_port() AS porta,
      (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
        FROM pg_catalog.pg_roles WHERE rolname = current_user) AS privilegiado`);
  return r;
}

async function inspecionar(client, nome) {
  const { rows: [tabela] } = await client.query(`/* preflight:tabela */
    SELECT c.oid, c.relkind, c.relpersistence, c.relrowsecurity, c.relforcerowsecurity,
      c.relispartition, EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t
        WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS triggers
    FROM pg_catalog.pg_class c WHERE c.oid=pg_catalog.to_regclass($1)`, [nome]);
  if (!tabela) throw recusar(nome === 'public.login_tentativa' ? 'TABELA_023_AUSENTE' : 'AUTENTICACAO_AUSENTE');
  const { rows: colunas } = await client.query(`/* preflight:colunas */
    SELECT a.attname AS nome, pg_catalog.format_type(a.atttypid,a.atttypmod) AS tipo,
      a.attnotnull AS obrigatoria, pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS padrao,
      a.attidentity AS identidade, a.attgenerated AS gerada
    FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d
      ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=$1 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, [tabela.oid]);
  const { rows: constraints } = await client.query(`/* preflight:constraints */
    SELECT c.conname AS nome, c.contype AS tipo, c.convalidated AS validada,
      c.condeferrable AS diferivel, c.condeferred AS diferida,
      pg_catalog.pg_get_constraintdef(c.oid,false) AS definicao,
      c.confrelid::regclass::text AS referencia,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n,ord)
        JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.ord) AS colunas,
      ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n,ord)
        JOIN pg_catalog.pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.ord) AS colunas_ref
    FROM pg_catalog.pg_constraint c WHERE c.conrelid=$1`, [tabela.oid]);
  const { rows: indices } = await client.query(`/* preflight:indices */
    SELECT c.relname AS nome, i.indisprimary AS primaria, i.indisunique AS unico,
      i.indisvalid AS valido, i.indisready AS pronto, i.indimmediate AS imediato,
      am.amname AS metodo, i.indnkeyatts AS chaves, i.indnatts AS atributos,
      pg_catalog.pg_get_expr(i.indexprs,i.indrelid) AS expressao,
      pg_catalog.pg_get_expr(i.indpred,i.indrelid) AS predicado,
      i.indoption::text AS opcoes,
      ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,ord)
        LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.ord) AS colunas
    FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
      JOIN pg_catalog.pg_am am ON am.oid=c.relam WHERE i.indrelid=$1`, [tabela.oid]);
  return { tabela, colunas, constraints, indices };
}

function validar023(s) {
  const t = s.tabela;
  exigir(t.relkind === 'r' && t.relpersistence === 'p' && t.relrowsecurity===false &&
    t.relforcerowsecurity===false && t.relispartition===false && t.triggers===false, 'TABELA_023_INCOMPATIVEL');
  exigir(s.colunas.length === colunas023.length && colunas023.every(([nome,tipo,obrigatoria,padrao], i) => {
    const c=s.colunas[i];
    return c.nome===nome && c.tipo===tipo && c.obrigatoria===obrigatoria &&
      normalizar(c.padrao)===normalizar(padrao) && c.identidade==='' && c.gerada==='';
  }), 'COLUNAS_023_INCOMPATIVEIS');
  exigir(s.constraints.length === 7 && s.constraints.every(c => c.validada===true && c.diferivel===false && c.diferida===false) &&
    s.constraints.filter(c=>c.tipo==='p' && normalizar(c.definicao)==='primarykey(tipo,chave_hash)').length===1 &&
    checks023.every(def => s.constraints.filter(c=>c.tipo==='c' && normalizar(c.definicao)===normalizar(def)).length===1),
  'CONSTRAINTS_023_INCOMPATIVEIS');
  const indice = (i,nome,colunas,primaria) => i.nome===nome && i.primaria===primaria && i.unico===primaria &&
    i.valido && i.pronto && i.imediato && i.metodo==='btree' && i.chaves===colunas.length &&
    i.atributos===colunas.length && i.expressao===null && i.predicado===null &&
    i.opcoes===colunas.map(()=>0).join(' ') && JSON.stringify(i.colunas)===JSON.stringify(colunas);
  exigir(s.indices.length === 2 && s.indices.some(i=>indice(i,'login_tentativa_pkey',['tipo','chave_hash'],true)) &&
    s.indices.some(i=>indice(i,'idx_login_tentativa_limpeza',['atualizado_em'],false)), 'INDICES_023_INCOMPATIVEIS');
}

function validarAutenticacao(usuario, ambiente) {
  for (const s of [usuario,ambiente]) exigir(s.tabela.relkind==='r' && s.tabela.relpersistence==='p', 'ESTRUTURA_AUTENTICACAO');
  const campos = (s, esperados) => esperados.every(([nome,tipo]) => s.colunas.some(c=>c.nome===nome && c.tipo===tipo && c.obrigatoria));
  exigir(campos(usuario,[['id_usuario','bigint'],['id_ambiente','uuid'],['nome','character varying(120)'],
    ['email','character varying(180)'],['senha_hash','character varying(255)'],['perfil_acesso','character varying(30)'],
    ['eh_fundador','boolean'],['ativo','boolean']]) && campos(ambiente,[['id_ambiente','uuid'],['ativo','boolean']]), 'COLUNAS_AUTENTICACAO');
  exigir(usuario.constraints.some(c=>c.tipo==='f' && c.validada && !c.diferivel &&
    ['ambiente','public.ambiente'].includes(c.referencia) && JSON.stringify(c.colunas)==='["id_ambiente"]' &&
    JSON.stringify(c.colunas_ref)==='["id_ambiente"]'), 'VINCULO_USUARIO_AMBIENTE');
  const lista=perfis.map(p=>`'${p}'`).join(',');
  exigir(usuario.constraints.some(c=>c.tipo==='c' && c.validada && !c.diferivel &&
    simples(c.definicao)===`checkperfil_acesso=anyarray[${lista}]`), 'RBAC_SETE_PERFIS');
  exigir(usuario.constraints.some(c=>c.tipo==='c' && c.validada && !c.diferivel &&
    simples(c.definicao)==="checkeh_fundador=perfil_acesso='ADMINISTRADOR'"), 'RBAC_FUNDADOR');
  exigir(usuario.constraints.some(c=>c.tipo==='p' && c.validada && JSON.stringify(c.colunas)==='["id_usuario"]') &&
    ambiente.constraints.some(c=>c.tipo==='p' && c.validada && JSON.stringify(c.colunas)==='["id_ambiente"]'), 'IDENTIDADE_AUTENTICACAO');
  exigir(usuario.indices.some(i=>i.nome==='uq_usuario_email_normalizado' && i.unico && i.valido && i.pronto &&
    i.imediato && i.predicado===null && simples(i.expressao)==='lowerbtrimemail'), 'UNICIDADE_EMAIL');
  exigir(usuario.indices.some(i=>i.nome==='uq_usuario_fundador_ambiente' && i.unico && i.valido && i.pronto &&
    i.imediato && JSON.stringify(i.colunas)==='["id_ambiente"]' && simples(i.predicado)==='eh_fundador'), 'UNICIDADE_FUNDADOR');
}

async function validarPreflight(client,d) {
  const r=await identidade(client);
  exigir(r?.banco===d.banco && r.versao===17 && r.host===d.host && r.porta===d.porta, 'DESTINO_POSTGRESQL');
  exigir(r.papel===d.papel && r.sessao===d.papel && r.privilegiado===false, 'PAPEL_APLICACAO');
  validar023(await inspecionar(client,'public.login_tentativa'));
  validarAutenticacao(await inspecionar(client,'public.usuario'),await inspecionar(client,'public.ambiente'));
  const { rows:[p] }=await client.query(`/* preflight:permissoes */
    SELECT has_database_privilege(current_user,current_database(),'CONNECT') AS conectar,
      has_schema_privilege(current_user,'public','USAGE') AS schema,
      has_table_privilege(current_user,'public.login_tentativa','SELECT') AS selecionar,
      has_table_privilege(current_user,'public.login_tentativa','INSERT') AS inserir,
      has_table_privilege(current_user,'public.login_tentativa','UPDATE') AS atualizar,
      has_table_privilege(current_user,'public.usuario','SELECT') AS usuario,
      has_table_privilege(current_user,'public.ambiente','SELECT') AS ambiente,
      (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public'
        AND table_type='BASE TABLE' AND table_name IN ('ambiente','convite','usuario','campanha','local',
        'checklist_nr33','dados_tecnicos','evidencia','relatorio','sincronizacao','versao_entidade')) AS tabelas,
      EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass('public.campanha')
        AND conname='fk_campanha_usuario_ambiente' AND convalidated) AS vinculo,
      EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass('public.versao_entidade')
        AND conname='uq_versao_entidade' AND cardinality(conkey)=3 AND convalidated) AS versionamento`);
  exigir(p && ['conectar','schema','selecionar','inserir','atualizar','usuario','ambiente'].every(k=>p[k]===true), 'PERMISSOES_LOGIN');
  exigir(p.tabelas===11 && p.vinculo===true && p.versionamento===true,'BASE_MULTI_TENANT');
}
module.exports={ validarPreflight, identidade, recusar };
