-- EM CONSTRUCAO - SOMENTE LABORATORIO APROVADO. Todos os registros abaixo sao sinteticos.
-- ROLLBACK remove os registros; sequences podem avancar, comportamento normal do PostgreSQL.
BEGIN;
DO $seguranca$
BEGIN
  IF current_database() !~ '^nr33_lab_[0-9]{8}_[a-f0-9]{6}$'
    OR current_setting('nr33.laboratorio', true) IS DISTINCT FROM 'passo702' THEN
    RAISE EXCEPTION 'Destino de laboratorio obrigatorio.';
  END IF;
END;
$seguranca$;
DO $provas$
DECLARE
  ambiente_a UUID;
  ambiente_b UUID;
  usuario_a BIGINT;
  usuario_b BIGINT;
  campanha_a BIGINT;
  local_a BIGINT;
  evidencia_a BIGINT;
  recusado BOOLEAN;
BEGIN
  INSERT INTO ambiente(nome) VALUES ('Validacao sintetica A') RETURNING id_ambiente INTO ambiente_a;
  INSERT INTO ambiente(nome) VALUES ('Validacao sintetica B') RETURNING id_ambiente INTO ambiente_b;
  INSERT INTO usuario(id_ambiente,nome,email,senha_hash,perfil_acesso)
    VALUES (ambiente_a,'Pessoa sintetica A',gen_random_uuid()::text || '@lab.invalid','hash-ficticio-nao-usar-login','ADMINISTRADOR') RETURNING id_usuario INTO usuario_a;
  INSERT INTO usuario(id_ambiente,nome,email,senha_hash,perfil_acesso)
    VALUES (ambiente_b,'Pessoa sintetica B',gen_random_uuid()::text || '@lab.invalid','hash-ficticio-nao-usar-login','ADMINISTRADOR') RETURNING id_usuario INTO usuario_b;
  INSERT INTO campanha(id_ambiente,id_usuario,nome_campanha,empresa,responsavel,data_inicio)
    VALUES (ambiente_a,usuario_a,'Campanha sintetica','Empresa ficticia','Pessoa sintetica',CURRENT_DATE) RETURNING id_campanha INTO campanha_a;
  IF (SELECT status FROM campanha WHERE id_campanha = campanha_a) <> 'EM ANDAMENTO' THEN RAISE EXCEPTION 'Default de campanha invalido.'; END IF;
  INSERT INTO local(id_campanha,nome_local) VALUES (campanha_a,'Local sintetico') RETURNING id_local INTO local_a;
  INSERT INTO evidencia(id_local,id_usuario,tipo,descricao) VALUES(local_a,usuario_a,'TEXTO','Sintetico') RETURNING id_evidencia INTO evidencia_a;
  IF NOT EXISTS (SELECT 1 FROM versao_entidade WHERE entidade = 'EVIDENCIA' AND id_entidade = evidencia_a AND id_ambiente = ambiente_a AND versao = 1 AND NOT excluido) THEN
    RAISE EXCEPTION 'INSERT nao gerou versao inicial autorizada.';
  END IF;
  UPDATE evidencia SET descricao = 'Atualizacao sintetica' WHERE id_evidencia = evidencia_a;
  IF (SELECT versao FROM versao_entidade WHERE entidade = 'EVIDENCIA' AND id_entidade = evidencia_a AND id_ambiente = ambiente_a) <> 2 THEN
    RAISE EXCEPTION 'UPDATE nao incrementou versao corretamente.';
  END IF;
  recusado := FALSE;
  BEGIN
    INSERT INTO evidencia(id_local,id_usuario,tipo) VALUES(local_a,usuario_b,'TEXTO');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> format('Usuario %s nao pertence ao ambiente do local %s.',usuario_b,local_a) THEN RAISE; END IF;
    recusado := TRUE;
  END;
  IF NOT recusado THEN RAISE EXCEPTION 'Escrita cruzada de evidencia permitida.'; END IF;
  recusado := FALSE;
  BEGIN
    INSERT INTO campanha(id_ambiente,id_usuario,nome_campanha,empresa,responsavel,data_inicio)
      VALUES(ambiente_b,usuario_a,'Invalida','Sintetica','Sintetico',CURRENT_DATE);
  EXCEPTION WHEN foreign_key_violation THEN recusado := TRUE;
  END;
  IF NOT recusado THEN RAISE EXCEPTION 'FK composta nao impediu responsavel externo.'; END IF;
  DELETE FROM campanha WHERE id_campanha = campanha_a;
  IF EXISTS (SELECT 1 FROM local WHERE id_local = local_a) OR EXISTS (SELECT 1 FROM evidencia WHERE id_evidencia = evidencia_a) THEN
    RAISE EXCEPTION 'Cascata incompleta.';
  END IF;
  IF (SELECT count(*) FROM versao_entidade WHERE id_ambiente = ambiente_a AND excluido AND data_exclusao IS NOT NULL AND
      ((entidade = 'CAMPANHA' AND id_entidade = campanha_a) OR (entidade = 'LOCAL' AND id_entidade = local_a) OR (entidade = 'EVIDENCIA' AND id_entidade = evidencia_a))) <> 3 THEN
    RAISE EXCEPTION 'Tombstones de cascata incompletos ou ambiente divergente.';
  END IF;
END;
$provas$;
ROLLBACK;
SELECT 'Validacoes sinteticas concluidas; registros revertidos.' AS resultado;
