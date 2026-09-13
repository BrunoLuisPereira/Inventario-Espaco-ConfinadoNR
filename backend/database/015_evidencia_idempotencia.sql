-- ============================================================
-- Migration 015
-- Idempotência no upload de evidências
-- ============================================================

ALTER TABLE evidencia
ADD COLUMN id_operacao_cliente UUID;

CREATE UNIQUE INDEX uq_evidencia_id_operacao_cliente
ON evidencia (id_operacao_cliente)
WHERE id_operacao_cliente IS NOT NULL;