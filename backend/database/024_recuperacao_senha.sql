-- Proposta: executar manualmente somente após revisão e autorização.
-- Aplicação supervisionada por migrar-recuperacao-024.cjs; nunca no startup.
BEGIN;

ALTER TABLE public.usuario ADD COLUMN sessao_versao INTEGER NOT NULL DEFAULT 0
    CHECK (sessao_versao >= 0);

CREATE TABLE public.recuperacao_senha (
    token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    id_usuario BIGINT NOT NULL,
    id_ambiente UUID NOT NULL,
    email TEXT NOT NULL,
    sessao_versao INTEGER NOT NULL CHECK (sessao_versao >= 0),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expira_em TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + INTERVAL '30 minutes'),
    ativado_em TIMESTAMPTZ,
    consumido_em TIMESTAMPTZ,
    invalidado_em TIMESTAMPTZ,
    FOREIGN KEY (id_usuario, id_ambiente) REFERENCES public.usuario (id_usuario, id_ambiente),
    CHECK (expira_em > criado_em),
    CHECK (consumido_em IS NULL OR ativado_em IS NOT NULL),
    CHECK (consumido_em IS NULL OR invalidado_em IS NULL)
);
CREATE UNIQUE INDEX uq_recuperacao_senha_pendente ON public.recuperacao_senha (id_usuario)
    WHERE consumido_em IS NULL AND invalidado_em IS NULL;
CREATE INDEX idx_recuperacao_senha_expira ON public.recuperacao_senha (expira_em);

CREATE TABLE public.recuperacao_limite (
    chave_hash TEXT PRIMARY KEY CHECK (chave_hash ~ '^[0-9a-f]{64}$'),
    inicio_janela TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    requisicoes INTEGER NOT NULL DEFAULT 1 CHECK (requisicoes > 0)
);
CREATE INDEX idx_recuperacao_limite_janela ON public.recuperacao_limite (inicio_janela);

-- Toda solicitação válida entra na mesma fila, inclusive e-mails inexistentes.
-- O HTTP não consulta a conta nem aguarda SMTP. Tokens originais nunca entram na fila.
CREATE TABLE public.recuperacao_envio (
    id_envio UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(180) NOT NULL CHECK (email = lower(btrim(email)) AND length(email) > 0),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    reservado_ate TIMESTAMPTZ,
    reserva UUID,
    tentativas INTEGER NOT NULL DEFAULT 0 CHECK (tentativas BETWEEN 0 AND 3),
    concluido_em TIMESTAMPTZ,
    CHECK ((reserva IS NULL) = (reservado_ate IS NULL))
);
CREATE INDEX idx_recuperacao_envio_pendente ON public.recuperacao_envio (criado_em)
    WHERE concluido_em IS NULL;
CREATE INDEX idx_recuperacao_envio_email ON public.recuperacao_envio (email)
    WHERE concluido_em IS NULL;

REVOKE ALL ON public.recuperacao_senha, public.recuperacao_limite, public.recuperacao_envio FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recuperacao_senha, public.recuperacao_limite, public.recuperacao_envio TO nr33_dev_app;

COMMIT;
