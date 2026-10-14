
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
    -- A migracao 020 deve ter criado id_ambiente.
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

    -- Nenhuma versao pode ficar sem ambiente.
    IF EXISTS (
        SELECT 1
        FROM public.versao_entidade
        WHERE id_ambiente IS NULL
    ) THEN
        RAISE EXCEPTION
            'Existem registros de versionamento sem ambiente.';
    END IF;

    -- Antes de substituir a unicidade global, garantir
    -- que nao existem registros duplicados.
    IF EXISTS (
        SELECT 1
        FROM public.versao_entidade
        GROUP BY entidade, id_entidade
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Existem identificadores duplicados no versionamento.';
    END IF;
END;
$$;

-- ============================================================
-- 2. UNICIDADE DO VERSIONAMENTO POR AMBIENTE
-- ============================================================

ALTER TABLE public.versao_entidade
DROP CONSTRAINT uq_versao_entidade;

ALTER TABLE public.versao_entidade
ADD CONSTRAINT uq_versao_entidade
UNIQUE (id_ambiente, entidade, id_entidade);

-- ============================================================
-- 3. REGULARIZACAO DA EVIDENCIA LEGADA
-- ============================================================

-- A evidencia ID 2 existe na base legada e nao possui
-- registro de versionamento.
--
-- O ambiente sera obtido pela campanha do local.

INSERT INTO public.versao_entidade (
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
FROM public.evidencia e
JOIN public.local l
    ON l.id_local = e.id_local
JOIN public.campanha c
    ON c.id_campanha = l.id_campanha
WHERE e.id_evidencia = 2
  AND NOT EXISTS (
      SELECT 1
      FROM public.versao_entidade v
      WHERE v.entidade = 'EVIDENCIA'
        AND v.id_entidade = e.id_evidencia
  );

-- ============================================================
-- 4. FUNCAO DE VERSIONAMENTO MULTI-TENANT
-- ============================================================

CREATE OR REPLACE FUNCTION public.atualizar_versao_entidade()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
    v_entidade VARCHAR(50);
    v_id_entidade BIGINT;
    v_id_ambiente UUID;
    v_ambiente_registro UUID;
    v_id_local BIGINT;
BEGIN

    -- --------------------------------------------------------
    -- 4.1 IDENTIFICAR A ENTIDADE E O ID
    -- --------------------------------------------------------

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

    -- --------------------------------------------------------
    -- 4.2 DELETE - REGISTRAR TOMBSTONE
    -- --------------------------------------------------------

    IF TG_OP = 'DELETE' THEN

        -- Identificar o ambiente pela versao existente.
        -- STRICT exige exatamente um registro ativo.

        SELECT v.id_ambiente
        INTO STRICT v_id_ambiente
        FROM public.versao_entidade v
        WHERE v.entidade = v_entidade
          AND v.id_entidade = v_id_entidade
          AND v.excluido = FALSE;

        -- Para campanhas, podemos validar diretamente
        -- o ambiente do registro excluido.

        IF TG_TABLE_NAME = 'campanha' THEN
            v_ambiente_registro := OLD.id_ambiente;

            IF v_ambiente_registro IS DISTINCT FROM v_id_ambiente THEN
                RAISE EXCEPTION
                    'Ambiente inconsistente na exclusao de % ID %.',
                    v_entidade, v_id_entidade;
            END IF;
        END IF;

        -- Em exclusoes em cascata, os registros pais
        -- podem nao estar mais disponiveis para consulta.
        -- Para as demais entidades, utilizamos a versao
        -- existente. A integridade deve ser validada
        -- tambem pelos relacionamentos e pelo backend.

        UPDATE public.versao_entidade
        SET versao = versao + 1,
            excluido = TRUE,
            data_exclusao = CURRENT_TIMESTAMP,
            data_atualizacao = CURRENT_TIMESTAMP
        WHERE id_ambiente = v_id_ambiente
          AND entidade = v_entidade
          AND id_entidade = v_id_entidade
          AND excluido = FALSE;

        RETURN OLD;
    END IF;

    -- --------------------------------------------------------
    -- 4.3 INSERT / UPDATE - IDENTIFICAR AMBIENTE
    -- --------------------------------------------------------

    IF TG_TABLE_NAME = 'campanha' THEN

        v_id_ambiente := NEW.id_ambiente;

    ELSIF TG_TABLE_NAME = 'local' THEN

        SELECT c.id_ambiente
        INTO v_id_ambiente
        FROM public.campanha c
        WHERE c.id_campanha = NEW.id_campanha;

    ELSE

        v_id_local := NEW.id_local;

        SELECT c.id_ambiente
        INTO v_id_ambiente
        FROM public.local l
        JOIN public.campanha c
            ON c.id_campanha = l.id_campanha
        WHERE l.id_local = v_id_local;

    END IF;

    IF v_id_ambiente IS NULL THEN
        RAISE EXCEPTION
            'Ambiente nao encontrado para % ID %.',
            v_entidade, v_id_entidade;
    END IF;

    -- --------------------------------------------------------
    -- 4.4 IMPEDIR MUDANCA DE AMBIENTE
    -- --------------------------------------------------------

    -- Mesmo com a chave unica composta, os IDs das
    -- entidades continuam sendo BIGINT globais.
    --
    -- Nao permitir que o mesmo ID seja associado
    -- a ambientes diferentes no versionamento.

    IF EXISTS (
        SELECT 1
        FROM public.versao_entidade v
        WHERE v.entidade = v_entidade
          AND v.id_entidade = v_id_entidade
          AND v.id_ambiente <> v_id_ambiente
    ) THEN
        RAISE EXCEPTION
            'Mudanca de ambiente nao permitida para % ID %.',
            v_entidade, v_id_entidade;
    END IF;

    -- --------------------------------------------------------
    -- 4.5 INSERT - CRIAR VERSIONAMENTO
    -- --------------------------------------------------------

    IF TG_OP = 'INSERT' THEN

        INSERT INTO public.versao_entidade (
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
        SET versao = versao_entidade.versao + 1,
            excluido = FALSE,
            data_exclusao = NULL,
            data_atualizacao = CURRENT_TIMESTAMP;

        RETURN NEW;
    END IF;

    -- --------------------------------------------------------
    -- 4.6 UPDATE - INCREMENTAR VERSIONAMENTO
    -- --------------------------------------------------------

    IF TG_OP = 'UPDATE' THEN

        INSERT INTO public.versao_entidade (
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

    -- Nenhuma versao pode estar sem ambiente.

    IF EXISTS (
        SELECT 1
        FROM public.versao_entidade
        WHERE id_ambiente IS NULL
    ) THEN
        RAISE EXCEPTION
            'Versionamento sem ambiente apos migracao.';
    END IF;

    -- A evidencia legada ID 2 deve possuir versao ativa.

    IF NOT EXISTS (
        SELECT 1
        FROM public.versao_entidade v
        JOIN public.evidencia e
            ON e.id_evidencia = v.id_entidade
        JOIN public.local l
            ON l.id_local = e.id_local
        JOIN public.campanha c
            ON c.id_campanha = l.id_campanha
        WHERE v.entidade = 'EVIDENCIA'
          AND v.id_entidade = 2
          AND v.id_ambiente = c.id_ambiente
          AND v.excluido = FALSE
    ) THEN
        RAISE EXCEPTION
            'Versionamento valido da evidencia ID 2 nao encontrado.';
    END IF;

END;
$$;

    COMMIT;
