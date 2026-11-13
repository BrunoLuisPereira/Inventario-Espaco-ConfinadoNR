'use strict';

const { lerMigrations } = require('./ler-migrations.cjs');
const { validarDestino } = require('./config.cjs');
const { gerarPermissoesAplicacao } = require('./permissoes-aplicacao.cjs');
const { validarCorpoSQL } = require('../../laboratorio/validar-corpo-sql.cjs');

function substituirUmaVez(texto, original, substituto, descricao) {
  const partes = texto.split(original);

  if (partes.length !== 2) {
    throw new Error('Adaptacao nao reconhecida: ' + descricao);
  }

  return partes.join(substituto);
}

function montarInstalacao(banco, opcoes = {}) {
  const permitirHomologacao = opcoes.permitirHomologacao === true;
  const tipo = validarDestino(banco, permitirHomologacao);

  const migrations = lerMigrations();

  const guarda = `DO $aws_destino$
BEGIN
  IF current_database() <> '${banco}'
     OR current_setting('server_version_num')::integer / 10000 <> 17 THEN
    RAISE EXCEPTION 'Destino ou versao PostgreSQL nao autorizados.';
  END IF;
END;
$aws_destino$;`;

  const corpos = migrations.map(({ nome, corpo }) => {
    let sql = corpo;

    if (/^(000|020|021)_/.test(nome)) {
      const inicio = sql.indexOf('DO $seguranca$');
      const fim = sql.indexOf('$seguranca$;', inicio);

      if (inicio < 0 || fim < 0) {
        throw new Error('Guarda original nao encontrada: ' + nome);
      }

      sql = sql.slice(0, inicio)
        + guarda
        + sql.slice(fim + '$seguranca$;'.length);
    }

    if (nome.startsWith('022_')) {
      const inicio = sql.indexOf('DO $guarda$');
      const fim = sql.indexOf('$guarda$;', inicio);

      if (inicio < 0 || fim < 0) {
        throw new Error('Guarda 022 nao encontrada.');
      }

      sql = sql.slice(0, inicio)
        + guarda
        + sql.slice(fim + '$guarda$;'.length);

      const inicioIdentidades = sql.indexOf('DO $identidades$');
      const fimIdentidades = sql.indexOf('$identidades$;', inicioIdentidades);

      if (inicioIdentidades < 0 || fimIdentidades < 0) {
        throw new Error('Verificacao historica nao encontrada.');
      }

      const validarVazio = `DO $aws_fundadores$
BEGIN
  IF EXISTS (SELECT 1 FROM public.usuario)
     OR EXISTS (SELECT 1 FROM public.ambiente)
     OR EXISTS (SELECT 1 FROM public.convite) THEN
    RAISE EXCEPTION 'Instalacao limpa exige ausencia de usuarios, ambientes e convites.';
  END IF;
END;
$aws_fundadores$;`;

      sql = sql.slice(0, inicioIdentidades)
        + validarVazio
        + sql.slice(fimIdentidades + '$identidades$;'.length);

      const inicioUpdate = sql.indexOf('UPDATE public.usuario SET eh_fundador=TRUE WHERE');
      const fimUpdate = sql.indexOf(';', inicioUpdate);

      if (inicioUpdate < 0 || fimUpdate < 0) {
        throw new Error('Atualizacao historica nao encontrada.');
      }

      sql = sql.slice(0, inicioUpdate)
        + sql.slice(fimUpdate + 1);
    }

    if (nome.startsWith('022_') || nome.startsWith('024_')) {
      if (!sql.includes('nr33_dev_app')) {
        throw new Error('Permissao original nao encontrada: ' + nome);
      }

      sql = sql.replace(/\bnr33_dev_app\b/g, 'nr33_hml_app');
    }

    validarCorpoSQL(sql);
    return `-- MIGRATION ${nome}\n${sql}`;
  });

  const sql = `BEGIN;
SET LOCAL search_path = public, pg_catalog;
${guarda}
${corpos.join('\n\n')}
${gerarPermissoesAplicacao()}
COMMIT;
`;

  return { banco, tipo, migrations: migrations.length, sql };
}

module.exports = { montarInstalacao };
