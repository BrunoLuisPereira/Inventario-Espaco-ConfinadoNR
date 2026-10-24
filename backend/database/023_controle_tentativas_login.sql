-- Proposta: executar somente após revisão, em PostgreSQL isolado.
-- Independente de 021; não altera usuários, sessões ou regras de autorização.
BEGIN;

CREATE TABLE public.login_tentativa (
    tipo TEXT NOT NULL CHECK (tipo IN ('identificador', 'ip')),
    chave_hash TEXT NOT NULL CHECK (chave_hash ~ '^[0-9a-f]{64}$'),
    falhas TIMESTAMPTZ[] NOT NULL DEFAULT '{}',
    inicio_janela TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    requisicoes INTEGER NOT NULL DEFAULT 0 CHECK (requisicoes BETWEEN 0 AND 100),
    restrito_ate TIMESTAMPTZ,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tipo, chave_hash),
    CHECK (cardinality(falhas) <= 5),
    CHECK (array_position(falhas, NULL) IS NULL),
    CHECK ((tipo = 'ip' AND cardinality(falhas) = 0)
        OR (tipo = 'identificador' AND requisicoes = 0))
);

CREATE INDEX idx_login_tentativa_limpeza ON public.login_tentativa (atualizado_em);

COMMIT;
