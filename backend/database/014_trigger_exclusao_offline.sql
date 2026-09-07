-- =====================================================
-- Migration 014
-- Adiciona suporte a DELETE no versionamento automático
-- =====================================================

CREATE OR REPLACE FUNCTION atualizar_versao_entidade()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_entidade VARCHAR(50);
    v_id_entidade BIGINT;
BEGIN
    CASE TG_TABLE_NAME
        WHEN 'campanha' THEN
            v_entidade := 'CAMPANHA';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_campanha;
            ELSE
                v_id_entidade := NEW.id_campanha;
            END IF;

        WHEN 'local' THEN
            v_entidade := 'LOCAL';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_local;
            ELSE
                v_id_entidade := NEW.id_local;
            END IF;

        WHEN 'checklist_nr33' THEN
            v_entidade := 'CHECKLIST_NR33';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_checklist;
            ELSE
                v_id_entidade := NEW.id_checklist;
            END IF;

        WHEN 'evidencia' THEN
            v_entidade := 'EVIDENCIA';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_evidencia;
            ELSE
                v_id_entidade := NEW.id_evidencia;
            END IF;

        WHEN 'dados_tecnicos' THEN
            v_entidade := 'DADOS_TECNICOS';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_dados;
            ELSE
                v_id_entidade := NEW.id_dados;
            END IF;

        ELSE
            RAISE EXCEPTION
                'Tabela % não configurada para versionamento.',
                TG_TABLE_NAME;
    END CASE;


    -- ==================================================
    -- INSERT
    -- ==================================================

    IF TG_OP = 'INSERT' THEN
        INSERT INTO versao_entidade (
            entidade,
            id_entidade,
            versao,
            excluido,
            data_exclusao,
            data_atualizacao
        )
        VALUES (
            v_entidade,
            v_id_entidade,
            1,
            FALSE,
            NULL,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (entidade, id_entidade)
        DO UPDATE
        SET
            excluido = FALSE,
            data_exclusao = NULL,
            data_atualizacao = CURRENT_TIMESTAMP;

        RETURN NEW;
    END IF;


    -- ==================================================
    -- UPDATE
    -- ==================================================

    IF TG_OP = 'UPDATE' THEN
        INSERT INTO versao_entidade (
            entidade,
            id_entidade,
            versao,
            excluido,
            data_exclusao,
            data_atualizacao
        )
        VALUES (
            v_entidade,
            v_id_entidade,
            2,
            FALSE,
            NULL,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (entidade, id_entidade)
        DO UPDATE
        SET
            versao = versao_entidade.versao + 1,
            excluido = FALSE,
            data_exclusao = NULL,
            data_atualizacao = CURRENT_TIMESTAMP;

        RETURN NEW;
    END IF;


    -- ==================================================
    -- DELETE
    -- ==================================================

    IF TG_OP = 'DELETE' THEN
        INSERT INTO versao_entidade (
            entidade,
            id_entidade,
            versao,
            excluido,
            data_exclusao,
            data_atualizacao
        )
        VALUES (
            v_entidade,
            v_id_entidade,
            2,
            TRUE,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (entidade, id_entidade)
        DO UPDATE
        SET
            versao = versao_entidade.versao + 1,
            excluido = TRUE,
            data_exclusao = CURRENT_TIMESTAMP,
            data_atualizacao = CURRENT_TIMESTAMP;

        RETURN OLD;
    END IF;


    RETURN NULL;
END;
$$;


-- =====================================================
-- Recriar triggers incluindo DELETE
-- =====================================================

DROP TRIGGER IF EXISTS trg_versionar_campanha ON campanha;

CREATE TRIGGER trg_versionar_campanha
AFTER INSERT OR UPDATE OR DELETE ON campanha
FOR EACH ROW
EXECUTE FUNCTION atualizar_versao_entidade();


DROP TRIGGER IF EXISTS trg_versionar_local ON local;

CREATE TRIGGER trg_versionar_local
AFTER INSERT OR UPDATE OR DELETE ON local
FOR EACH ROW
EXECUTE FUNCTION atualizar_versao_entidade();


DROP TRIGGER IF EXISTS trg_versionar_checklist_nr33 ON checklist_nr33;

CREATE TRIGGER trg_versionar_checklist_nr33
AFTER INSERT OR UPDATE OR DELETE ON checklist_nr33
FOR EACH ROW
EXECUTE FUNCTION atualizar_versao_entidade();


DROP TRIGGER IF EXISTS trg_versionar_evidencia ON evidencia;

CREATE TRIGGER trg_versionar_evidencia
AFTER INSERT OR UPDATE OR DELETE ON evidencia
FOR EACH ROW
EXECUTE FUNCTION atualizar_versao_entidade();


DROP TRIGGER IF EXISTS trg_versionar_dados_tecnicos ON dados_tecnicos;

CREATE TRIGGER trg_versionar_dados_tecnicos
AFTER INSERT OR UPDATE OR DELETE ON dados_tecnicos
FOR EACH ROW
EXECUTE FUNCTION atualizar_versao_entidade();