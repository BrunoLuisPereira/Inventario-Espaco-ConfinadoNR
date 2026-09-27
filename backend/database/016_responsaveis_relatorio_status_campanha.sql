-- ============================================================
-- Migration 016
-- Responsáveis técnicos do relatório e padronização
-- dos status de campanha
-- ============================================================

BEGIN;

-- ============================================================
-- 1. RESPONSÁVEL TÉCNICO DO RELATÓRIO
-- ============================================================

ALTER TABLE relatorio
ADD COLUMN IF NOT EXISTS nome_responsavel_tecnico VARCHAR(150);

ALTER TABLE relatorio
ADD COLUMN IF NOT EXISTS crea VARCHAR(50);

ALTER TABLE relatorio
ADD COLUMN IF NOT EXISTS data_art DATE;

-- numero_art já pertence à estrutura original da tabela relatorio.


-- ============================================================
-- 2. PADRONIZAÇÃO DOS STATUS DE CAMPANHA
-- ============================================================

-- Remove a constraint anterior para permitir a conversão
-- dos valores já existentes.
ALTER TABLE campanha
DROP CONSTRAINT IF EXISTS campanha_status_check;

-- Padrão antigo -> padrão atual.
UPDATE campanha
SET status = 'CONCLUIDO'
WHERE status = 'CONCLUIDA';

UPDATE campanha
SET status = 'EM ANDAMENTO'
WHERE status = 'ATIVA';

-- Cria novamente a constraint com os valores padronizados.
ALTER TABLE campanha
ADD CONSTRAINT campanha_status_check
CHECK (
  status IN (
    'EM ANDAMENTO',
    'CONCLUIDO',
    'CANCELADA'
  )
);

COMMIT;