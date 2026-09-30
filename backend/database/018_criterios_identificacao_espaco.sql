-- ============================================================
-- Migration 018
-- Critérios independentes para identificação do espaço
-- no Checklist NR-33
-- ============================================================

BEGIN;

-- Adiciona os três critérios independentes.
ALTER TABLE checklist_nr33
ADD COLUMN IF NOT EXISTS criterio_a VARCHAR(3),
ADD COLUMN IF NOT EXISTS criterio_b VARCHAR(3),
ADD COLUMN IF NOT EXISTS criterio_c VARCHAR(3);

-- Converte a identificação utilizada pelo modelo anterior.
UPDATE checklist_nr33
SET
    criterio_a = CASE
        WHEN identificacao_espaco = 'A' THEN 'SIM'
        ELSE 'NAO'
    END,
    criterio_b = CASE
        WHEN identificacao_espaco = 'B' THEN 'SIM'
        ELSE 'NAO'
    END,
    criterio_c = CASE
        WHEN identificacao_espaco = 'C' THEN 'SIM'
        ELSE 'NAO'
    END;

-- Os três critérios passam a ser obrigatórios.
ALTER TABLE checklist_nr33
ALTER COLUMN criterio_a SET NOT NULL,
ALTER COLUMN criterio_b SET NOT NULL,
ALTER COLUMN criterio_c SET NOT NULL;

-- Remove constraints anteriores, caso existam.
ALTER TABLE checklist_nr33
DROP CONSTRAINT IF EXISTS checklist_nr33_criterio_a_check,
DROP CONSTRAINT IF EXISTS checklist_nr33_criterio_b_check,
DROP CONSTRAINT IF EXISTS checklist_nr33_criterio_c_check;

-- Cada critério aceita exclusivamente SIM ou NAO.
ALTER TABLE checklist_nr33
ADD CONSTRAINT checklist_nr33_criterio_a_check
CHECK (criterio_a IN ('SIM', 'NAO')),
ADD CONSTRAINT checklist_nr33_criterio_b_check
CHECK (criterio_b IN ('SIM', 'NAO')),
ADD CONSTRAINT checklist_nr33_criterio_c_check
CHECK (criterio_c IN ('SIM', 'NAO'));
-- O campo antigo permanece temporariamente para compatibilidade
-- com relatório, PDF e sincronização durante a transição.
-- Novos checklists passam a utilizar criterio_a, criterio_b e criterio_c.
ALTER TABLE checklist_nr33
ALTER COLUMN identificacao_espaco DROP NOT NULL;
COMMIT;