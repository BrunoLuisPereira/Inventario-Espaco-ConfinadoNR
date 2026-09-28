-- ============================================================
-- Migration 017
-- Padronização dos status de Local
-- ============================================================

BEGIN;

-- Locais anteriormente marcados como CONCLUIDO
-- permanecem cadastrados e passam a ser considerados ATIVOS.
UPDATE local
SET status = 'ATIVO'
WHERE status = 'CONCLUIDO';

-- Remove a regra anterior.
ALTER TABLE local
DROP CONSTRAINT IF EXISTS local_status_check;

-- Local representa a situação cadastral do espaço confinado.
-- Portanto, passa a aceitar somente ATIVO ou INATIVO.
ALTER TABLE local
ADD CONSTRAINT local_status_check
CHECK (
    status IN (
        'ATIVO',
        'INATIVO'
    )
);

COMMIT;