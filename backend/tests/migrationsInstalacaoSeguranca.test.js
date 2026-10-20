// Regressao de composicao e invariantes DDL; nao executa SQL nem simula PostgreSQL.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validarCorpoSQL } = require('../laboratorio/validar-corpo-sql.cjs');
const { montarSQL, arquivos } = require('../laboratorio/montar-sql.cjs');
const { sqlInstalacaoLocal } = require('../laboratorio/postgresLocal.cjs');
const banco='inventario_nr33_multitenant_dev';
const fontes=arquivos.map(a => fs.readFileSync(path.resolve(__dirname,'../database',a),'utf8'));
for (const comando of ['COMMIT;','COMMIT AND CHAIN;','END;','ROLLBACK;','ABORT;','BEGIN;','START TRANSACTION;','SAVEPOINT x;','RELEASE SAVEPOINT x;','PREPARE TRANSACTION \'x\';']) {
  test('rejeita controle intermediario: '+comando, () => {
    const adulterada=fontes[0].replace('SET LOCAL check_function_bodies = false;', 'SET LOCAL check_function_bodies = false;\n/* comentario */ '+comando);
    assert.throws(() => montarSQL(banco,[adulterada,...fontes.slice(1)]),/transacional/);
    assert.throws(() => sqlInstalacaoLocal(banco,[adulterada,...fontes.slice(1)],'x'.repeat(64)),/transacional/);
  });
}
test('lexer distingue comentarios, literais e corpos PLpgSQL de comandos reais', () => {
  const comandos=validarCorpoSQL("-- COMMIT;\nSELECT 'COMMIT; ''texto'''; /* externo /* interno */ */ DO $teste$ BEGIN RAISE NOTICE 'ROLLBACK;'; END; $teste$;");
  assert.equal(comandos.length,2);
  assert.throws(() => validarCorpoSQL('/* comentario sem fim'));
  assert.throws(() => validarCorpoSQL("SELECT 'sem fim"));
  assert.throws(() => validarCorpoSQL('DO $$ sem fim'));
  assert.throws(() => validarCorpoSQL('SELECT 1'));
});
for (const meta of ['\\connect externo','\\gexec','\\include externo.sql','\\! comando']) {
  test('rejeita metacomando externo: '+meta, () => assert.throws(() => validarCorpoSQL(meta+'\n'),/Metacomando/));
}
test('instalacao final usa destino exato e uma transacao para esquema e papel', () => {
  const sql=sqlInstalacaoLocal(banco,fontes,'x'.repeat(64));
  const comandos=validarCorpoSQL(sql.replace(/^BEGIN;\n/,'').replace(/COMMIT;\n$/,''));
  assert.ok(comandos.length>70);
  assert.equal((sql.match(/^BEGIN;/gm)||[]).length,1);
  assert.equal((sql.match(/^COMMIT;/gm)||[]).length,1);
  assert.ok(sql.indexOf('CREATE TABLE public.usuario')<sql.indexOf('CREATE TABLE ambiente'));
  assert.ok(sql.indexOf('$transicao$')<sql.indexOf('uq_versao_entidade_identidade_global'));
  assert.ok(sql.indexOf('CREATE ROLE nr33_dev_app')>sql.indexOf('$validacao$;'));
  assert.equal((sql.match(/IS DISTINCT FROM 'passo712'/g)||[]).length,3);
  assert.doesNotMatch(sql,/nr33_lab_|passo702|passo710/);
});
test('020 preserva ancestralidade e protege FKs e vinculos tecnicos imutaveis', () => {
  const sql=fontes[1];
  for (const nome of ['fk_usuario_ambiente','fk_campanha_usuario_ambiente','fk_convite_usuario_ambiente','fk_sincronizacao_usuario_ambiente','fk_sincronizacao_resolucao_ambiente']) assert.ok(sql.includes(nome));
  for (const nome of ['trg_checklist_bloquear_local','trg_dados_tecnicos_bloquear_local','trg_evidencia_bloquear_local','trg_relatorio_bloquear_local']) assert.ok(sql.includes(nome));
  assert.match(sql,/OLD\.id_local IS DISTINCT FROM NEW\.id_local/);
  assert.match(sql,/FOR KEY SHARE OF l, c/);
  assert.match(sql,/FOR KEY SHARE OF u/);
  assert.match(sql,/uq_usuario_email_normalizado[\s\S]*LOWER\(BTRIM\(email\)\)/);
  assert.doesNotMatch(sql,/ALTER TABLE (?:public\.)?(?:local|checklist_nr33|dados_tecnicos|evidencia|relatorio)\s+ADD COLUMN id_ambiente/i);
});
test('021 nao revive tombstones nem recria versao ausente em UPDATE', () => {
  const sql=fontes[2];
  const trigger=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.atualizar_versao_entidade()'),sql.indexOf('-- 5. VALIDACOES FINAIS'));
  assert.doesNotMatch(trigger,/ON CONFLICT|excluido = FALSE,/);
  const atualizar=trigger.slice(trigger.indexOf("IF TG_OP = 'UPDATE' THEN"));
  assert.doesNotMatch(atualizar,/INSERT INTO/);
  assert.match(atualizar,/AND excluido = FALSE/);
  assert.match(atualizar,/IF NOT FOUND THEN/);
  const excluir=trigger.slice(trigger.indexOf("IF TG_OP = 'DELETE' THEN"),trigger.indexOf('-- 4.3 INSERT'));
  assert.match(excluir,/INTO STRICT v_id_ambiente/);
  assert.match(excluir,/FOR UPDATE/);
  assert.match(excluir,/excluido = TRUE/);
  assert.match(sql,/CREATE UNIQUE INDEX uq_versao_entidade_identidade_global\s+ON public\.versao_entidade \(entidade, id_entidade\)/);
});
test('preview de revisao nunca grava senha nem habilita login', () => {
  const sql=sqlInstalacaoLocal(banco,fontes,undefined,true);
  assert.match(sql,/CREATE ROLE nr33_dev_app NOLOGIN/);
  assert.doesNotMatch(sql,/LOGIN PASSWORD/);
  assert.throws(() => sqlInstalacaoLocal(banco,fontes,undefined));
});
test('artefato SQL entregue corresponde exatamente ao compositor e fontes atuais', () => {
  const artefato=fs.readFileSync(path.resolve(__dirname,'../laboratorio/instalacao-local-revisao.sql'),'utf8');
  assert.equal(artefato.replace(/\r\n/g,'\n'),sqlInstalacaoLocal(banco,fontes,undefined,true).replace(/\r\n/g,'\n'));
  assert.doesNotMatch(artefato,/LOGIN PASSWORD|nr33_lab_|passo702|passo710/);
});
