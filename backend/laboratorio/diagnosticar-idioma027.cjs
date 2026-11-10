// Somente leitura. Destino fixo; senha exclusivamente por stdin, nunca argv/env/log.
const { Client } = require('pg');

async function diagnosticar(db) {
  let transacao = false;
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transacao = true;
    const { rows: [destino] } = await db.query(`SELECT current_database() AS banco,
      current_user AS usuario, session_user AS usuario_sessao,
      host(inet_server_addr()) AS host, inet_server_port() AS porta,
      current_setting('transaction_read_only') AS somente_leitura,
      r.rolsuper AS superusuario FROM pg_catalog.pg_roles r WHERE r.rolname = current_user`);
    if (!destino || destino.banco !== 'inventario_nr33_multitenant_dev' ||
        destino.usuario !== 'nr33_dev_app' || destino.usuario_sessao !== 'nr33_dev_app' ||
        destino.host !== '127.0.0.1' || destino.porta !== 5432 ||
        destino.somente_leitura !== 'on' || destino.superusuario !== false) {
      throw new Error('DESTINO_INVALIDO');
    }
    const { rows: [tabela] } = await db.query("SELECT to_regclass('public.usuario') IS NOT NULL AS existe");
    if (!tabela?.existe) throw new Error('TABELA_USUARIO_AUSENTE');
    const { rows: [propriedade] } = await db.query(`SELECT
      pg_catalog.pg_get_userbyid(c.relowner) AS proprietario,
      pg_catalog.pg_get_userbyid(c.relowner) = current_user AS proprietario_direto,
      pg_catalog.pg_has_role(current_user, c.relowner, 'MEMBER') AS membro_da_funcao_proprietaria,
      pg_catalog.pg_has_role(current_user, c.relowner, 'USAGE') AS privilegios_proprietario_efetivos,
      pg_catalog.pg_has_role(current_user, c.relowner, 'SET') AS pode_assumir_funcao_proprietaria,
      pg_catalog.has_schema_privilege(current_user, c.relnamespace, 'USAGE') AS uso_schema
      FROM pg_catalog.pg_class c WHERE c.oid = 'public.usuario'::regclass`);
    if (!propriedade) throw new Error('TABELA_USUARIO_AUSENTE');
    const autorizacao = { ...propriedade,
      autorizado_na_sessao_atual: propriedade.privilegios_proprietario_efetivos === true && propriedade.uso_schema === true };
    const { rows: [coluna] } = await db.query(`SELECT
      a.attname AS coluna, pg_catalog.format_type(a.atttypid, a.atttypmod) AS tipo,
      a.attnotnull AS nao_nulo, pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS valor_padrao,
      a.attidentity AS identidade, a.attgenerated AS gerada
      FROM pg_catalog.pg_attribute a
      LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = 'public.usuario'::regclass AND a.attname = 'idioma'
        AND a.attnum > 0 AND NOT a.attisdropped`);
    let restricoes = [];
    if (coluna) {
      ({ rows: restricoes } = await db.query(`SELECT c.conname AS nome, c.contype AS tipo,
        c.convalidated AS validada, pg_catalog.pg_get_constraintdef(c.oid, true) AS definicao
        FROM pg_catalog.pg_constraint c
        JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'public.usuario'::regclass AND a.attname = 'idioma'
          AND NOT a.attisdropped ORDER BY c.conname`));
    }
    return { destino, tabela: 'public.usuario', autorizacao, coluna_existe: Boolean(coluna),
      estado: coluna ? 'COLUNA_JA_EXISTE_CONFERIR_METADADOS' : 'MIGRATION_027_PENDENTE_COLUNA_AUSENTE',
      coluna: coluna || null, restricoes };
  } finally {
    if (transacao) await db.query('ROLLBACK');
  }
}

async function main() {
  const partes = [];
  let entrada, senha, db;
  try {
    let tamanho = 0;
    for await (const parte of process.stdin) {
      partes.push(parte);
      tamanho += parte.length;
      if (tamanho > 16384) throw new Error('CANAL_INVALIDO');
    }
    entrada = Buffer.concat(partes);
    if (!entrada.length) throw new Error('CANAL_INVALIDO');
    senha = entrada.toString('utf8');
    db = new Client({ host: '127.0.0.1', port: 5432,
      database: 'inventario_nr33_multitenant_dev', user: 'nr33_dev_app', password: senha,
      ssl: false, connectionTimeoutMillis: 5000, query_timeout: 7000,
      application_name: 'nr33_diagnostico_idioma027',
      options: '-c default_transaction_read_only=on -c statement_timeout=5000',
    });
    senha = null;
    entrada.fill(0);
    partes.forEach(parte => parte.fill(0));
    await db.connect();
    const resultado = await diagnosticar(db);
    process.stdout.write(JSON.stringify(resultado));
  } finally {
    senha = null;
    if (entrada) entrada.fill(0);
    partes.forEach(parte => parte.fill(0));
    if (db) {
      try { await db.end(); } finally {
        db.password = null;
        db.connectionParameters.password = null;
      }
    }
  }
}
if (require.main === module) main().catch(erro => {
  const seguros = ['DESTINO_INVALIDO', 'TABELA_USUARIO_AUSENTE', 'CANAL_INVALIDO'];
  process.stderr.write(seguros.includes(erro.message) ? erro.message : 'DIAGNOSTICO_027_INDISPONIVEL');
  process.exitCode = 1;
});
module.exports = { diagnosticar };
