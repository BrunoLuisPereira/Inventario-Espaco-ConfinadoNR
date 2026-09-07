-- =====================================================
-- Migration 012
-- Garante unicidade do UUID de registros criados offline
-- =====================================================

CREATE UNIQUE INDEX uq_sincronizacao_registro_cliente_criar
ON sincronizacao (
    entidade,
    id_registro_cliente
)
WHERE id_registro_cliente IS NOT NULL
  AND operacao = 'CRIAR';