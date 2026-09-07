-- ======================================================
-- Versionamento automático das entidades sincronizáveis
-- ======================================================
--
-- Objetivo:
-- Garantir que alterações realizadas tanto pela API online
-- quanto pelo módulo de sincronização offline atualizem
-- automaticamente a tabela versao_entidade.
--
-- INSERT  -> versão inicial = 1
-- UPDATE  -> versão + 1
--
-- DELETE será tratado posteriormente com estratégia própria
-- para sincronização de exclusões/tombstones.
-- ======================================================


-- ------------------------------------------------------
-- 1. Função responsável por controlar a versão
-- ------------------------------------------------------

CREATE OR REPLACE FUNCTION atualizar_versao_entidade()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_entidade VARCHAR(50);
    v_id_entidade BIGINT;
BEGIN

    -- --------------------------------------------------
    -- Identifica a entidade e seu respectivo ID
    -- --------------------------------------------------

    CASE TG_TABLE_NAME

        WHEN 'campanha' THEN
            v_entidade := 'CAMPANHA';
            v_id_entidade := NEW.id_campanha;

        WHEN 'local' THEN
            v_entidade := 'LOCAL';
            v_id_entidade := NEW.id_local;

        WHEN 'checklist_nr33' THEN
            v_entidade := 'CHECKLIST_NR33';
            v_id_entidade := NEW.id_checklist;

        WHEN 'evidencia' THEN
            v_entidade := 'EVIDENCIA';
            v_id_entidade := NEW.id_evidencia;

        WHEN 'dados_tecnicos' THEN
            v_entidade := 'DADOS_TECNICOS';
            v_id_entidade := NEW.id_dados;

        ELSE
            RAISE EXCEPTION
                'Tabela % não configurada para versionamento.',
                TG_TABLE_NAME;

    END CASE;


    -- --------------------------------------------------
    -- INSERT
    --
    -- Registro novo começa na versão 1.
    --
    -- ON CONFLICT evita erro caso uma versão já tenha sido
    -- criada anteriormente por dados legados/testes.
    -- --------------------------------------------------

    IF TG_OP = 'INSERT' THEN

        INSERT INTO versao_entidade (
            entidade,
            id_entidade,
            versao,
            data_atualizacao
        )
        VALUES (
            v_entidade,
            v_id_entidade,
            1,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (entidade, id_entidade)
        DO NOTHING;

        RETURN NEW;

    END IF;


    -- --------------------------------------------------
    -- UPDATE
    --
    -- Se o controle já existe:
    --      versão = versão + 1
    --
    -- Se não existir:
    --      consideramos o registro existente como versão 1
    --      e essa primeira alteração passa para versão 2.
    -- --------------------------------------------------

    IF TG_OP = 'UPDATE' THEN

        INSERT INTO versao_entidade (
            entidade,
            id_entidade,
            versao,
            data_atualizacao
        )
        VALUES (
            v_entidade,
            v_id_entidade,
            2,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (entidade, id_entidade)
        DO UPDATE
        SET
            versao = versao_entidade.versao + 1,
            data_atualizacao = CURRENT_TIMESTAMP;

        RETURN NEW;

    END IF;


    RETURN NEW;

END;
$$;


-- ======================================================
-- 2. Triggers
-- ======================================================


-- ------------------------------------------------------
-- CAMPANHA
-- ------------------------------------------------------

DROP TRIGGER IF EXISTS trg_versionar_campanha
ON campanha;

CREATE TRIGGER trg_versionar_campanha
AFTER INSERT OR UPDATE
ON campanha
FOR EACH ROW
EXECUTE FUNCTION atualizar_versao_entidade();


-- ------------------------------------------------------
-- LOCAL
-- ------------------------------------------------------

DROP TRIGGER IF EXISTS trg_versionar_local
ON local;

CREATE TRIGGER trg_versionar_local
AFTER INSERT OR UPDATE
ON local
FOR EACH ROW
EXECUTE FUNCTION atualizar_versao_entidade();


-- ------------------------------------------------------
-- CHECKLIST NR-33
-- ------------------------------------------------------

DROP TRIGGER IF EXISTS trg_versionar_checklist_nr33
ON checklist_nr33;

CREATE TRIGGER trg_versionar_checklist_nr33
AFTER INSERT OR UPDATE
ON checklist_nr33
FOR EACH ROW
EXECUTE FUNCTION atualizar_versao_entidade();


-- ------------------------------------------------------
-- EVIDÊNCIA
-- ------------------------------------------------------

DROP TRIGGER IF EXISTS trg_versionar_evidencia
ON evidencia;

CREATE TRIGGER trg_versionar_evidencia
AFTER INSERT OR UPDATE
ON evidencia
FOR EACH ROW
EXECUTE FUNCTION atualizar_versao_entidade();


-- ------------------------------------------------------
-- DADOS TÉCNICOS
-- ------------------------------------------------------

DROP TRIGGER IF EXISTS trg_versionar_dados_tecnicos
ON dados_tecnicos;

CREATE TRIGGER trg_versionar_dados_tecnicos
AFTER INSERT OR UPDATE
ON dados_tecnicos
FOR EACH ROW
EXECUTE FUNCTION atualizar_versao_entidade();