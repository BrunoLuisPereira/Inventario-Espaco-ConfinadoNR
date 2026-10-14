
-- ============================================================
-- MIGRATION 021 - VERSIONAMENTO MULTI-TENANT
-- Inventario de Espacos Confinados NR-33
--
-- EM CONSTRUCAO - NAO EXECUTAR
-- ============================================================

BEGIN;

-- ============================================================
-- 1. VALIDACOES INICIAIS
-- ============================================================

DO $$
BEGIN
    -- A migracao 020 deve ter criado a coluna id_ambiente.
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'versao_entidade'
          AND column_name = 'id_ambiente'
    ) THEN
        RAISE EXCEPTION
            'A migracao 020 deve ser aplicada antes da 021.';
    END IF;

    -- Nenhuma versao pode estar sem ambiente.
    IF EXISTS (
        SELECT 1
        FROM versao_entidade
        WHERE id_ambiente IS NULL
    ) THEN
        RAISE EXCEPTION
            'Existem registros de versionamento sem ambiente.';
    END IF;
END;
$$;


-- ============================================================
-- 2. UNICIDADE DO VERSIONAMENTO POR AMBIENTE
-- ============================================================

-- Esta alteracao deve ser coordenada com a atualizacao
-- da funcao atualizar_versao_entidade().

ALTER TABLE versao_entidade
DROP CONSTRAINT uq_versao_entidade;

ALTER TABLE versao_entidade
ADD CONSTRAINT uq_versao_entidade
UNIQUE (id_ambiente, entidade, id_entidade);


-- ============================================================
-- 3. REGULARIZACAO DA EVIDENCIA LEGADA
-- ============================================================

-- A evidencia ID 2 existe, mas nao possui versionamento.
-- Sua versao inicial sera registrada como 1.
-- O ambiente sera obtido pela campanha vinculada.

INSERT INTO versao_entidade (
    id_ambiente,
    entidade,
    id_entidade,
    versao,
    excluido,
    data_exclusao,
    data_atualizacao
)
SELECT
    c.id_ambiente,
    'EVIDENCIA',
    e.id_evidencia,
    1,
    FALSE,
    NULL,
    CURRENT_TIMESTAMP
FROM evidencia e
JOIN local l
    ON l.id_local = e.id_local
JOIN campanha c
    ON c.id_campanha = l.id_campanha
WHERE e.id_evidencia = 2
  AND NOT EXISTS (
      SELECT 1
      FROM versao_entidade v
      WHERE v.id_ambiente = c.id_ambiente
        AND v.entidade = 'EVIDENCIA'
        AND v.id_entidade = e.id_evidencia
  );


-- ============================================================

-- ============================================================
-- 4. FUNCAO DE VERSIONAMENTO MULTI-TENANT
-- ============================================================

CREATE OR REPLACE FUNCTION public.atualizar_versao_entidade()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_entidade VARCHAR(50);
    v_id_entidade BIGINT;
    v_id_ambiente UUID;
    v_id_local BIGINT;
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

        WHEN 'dados_tecnicos' THEN
            v_entidade := 'DADOS_TECNICOS';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_dados;
            ELSE
                v_id_entidade := NEW.id_dados;
            END IF;

        WHEN 'evidencia' THEN
            v_entidade := 'EVIDENCIA';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_evidencia;
            ELSE
                v_id_entidade := NEW.id_evidencia;
            END IF;

        ELSE
            RAISE EXCEPTION
                'Tabela % nao configurada para versionamento.',
                TG_TABLE_NAME;
    END CASE;

    -- DELETE: utilizar a versao existente.
    -- Isso evita depender de registros excluidos em cascata.

    IF TG_OP = 'DELETE' THEN
        SELECT id_ambiente
        INTO v_id_ambiente
        FROM versao_entidade
        WHERE entidade = v_entidade
          AND id_entidade = v_id_entidade;

        IF v_id_ambiente IS NULL THEN
            RAISE EXCEPTION
                'Ambiente nao encontrado para exclusao de % ID %.',
                v_entidade, v_id_entidade;
        END IF;

        UPDATE versao_entidade
        SET versao = versao + 1,
            excluido = TRUE,
            data_exclusao = CURRENT_TIMESTAMP,
            data_atualizacao = CURRENT_TIMESTAMP
        WHERE id_ambiente = v_id_ambiente
          AND entidade = v_entidade
          AND id_entidade = v_id_entidade;

        RETURN OLD;
    END IF;

    -- INSERT / UPDATE: identificar ambiente pela campanha.

    IF TG_TABLE_NAME = 'campanha' THEN
        v_id_ambiente := NEW.id_ambiente;

    ELSIF TG_TABLE_NAME = 'local' THEN
        SELECT c.id_ambiente
        INTO v_id_ambiente
        FROM campanha c
        WHERE c.id_campanha = NEW.id_campanha;

    ELSE
        v_id_local := NEW.id_local;

        SELECT c.id_ambiente
        INTO v_id_ambiente
        FROM local l
        JOIN campanha c
          ON c.id_campanha = l.id_campanha
        WHERE l.id_local = v_id_local;
    END IF;

    IF v_id_ambiente IS NULL THEN
        RAISE EXCEPTION
            'Ambiente nao encontrado para % ID %.',
            v_entidade, v_id_entidade;
    END IF;

    -- Impedir mudanca de ambiente de uma entidade existente.

    IF EXISTS (
        SELECT 1
        FROM versao_entidade
        WHERE entidade = v_entidade
          AND id_entidade = v_id_entidade
          AND id_ambiente <> v_id_ambiente
    ) THEN
        RAISE EXCEPTION
            'Mudanca de ambiente nao permitida para % ID %.',
            v_entidade, v_id_entidade;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO versao_entidade (
            id_ambiente,
            entidade,
            id_entidade,
            versao,
            excluido,
            data_exclusao,
            data_atualizacao
        )
        VALUES (
            v_id_ambiente,
            v_entidade,
            v_id_entidade,
            1,
            FALSE,
            NULL,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (id_ambiente, entidade, id_entidade)
        DO UPDATE
        SET excluido = FALSE,
            data_exclusao = NULL,
            data_atualizacao = CURRENT_TIMESTAMP;

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        INSERT INTO versao_entidade (
            id_ambiente,
            entidade,
            id_entidade,
            versao,
            excluido,
            data_exclusao,
            data_atualizacao
        )
        VALUES (
            v_id_ambiente,
            v_entidade,
            v_id_entidade,
            2,
            FALSE,
            NULL,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (id_ambiente, entidade, id_entidade)
        DO UPDATE
        SET versao = versao_entidade.versao + 1,
            excluido = FALSE,
            data_exclusao = NULL,
            data_atualizacao = CURRENT_TIMESTAMP;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$function$;


-- ============================================================
-- 5. VALIDACOES FINAIS
-- ============================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM versao_entidade
        WHERE id_ambiente IS NULL
    ) THEN
        RAISE EXCEPTION
            'Versionamento sem ambiente apos migracao.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM versao_entidade
        WHERE entidade = 'EVIDENCIA'
          AND id_entidade = 2
          AND excluido = FALSE
    ) THEN
        RAISE EXCEPTION
            'Versionamento da evidencia ID 2 nao encontrado.';
    END IF;
END;
$$;

COMMIT;

