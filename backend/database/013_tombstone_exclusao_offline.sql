-- =====================================================
-- Migration 013
-- Controle de exclusão para sincronização offline
-- =====================================================

ALTER TABLE versao_entidade
ADD COLUMN excluido BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE versao_entidade
ADD COLUMN data_exclusao TIMESTAMPTZ;