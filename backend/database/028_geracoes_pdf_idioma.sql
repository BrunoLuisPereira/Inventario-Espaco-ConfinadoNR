-- Aplicação MANUAL após revisão. Não executada pela aplicação.
-- Aditiva: nenhum backfill nem alteração de caminhos/hashes legados.
BEGIN;
CREATE TABLE public.relatorio_pdf_geracao (
    id_geracao UUID PRIMARY KEY,
    id_relatorio BIGINT NOT NULL CHECK (id_relatorio > 0),
    id_ambiente UUID NOT NULL REFERENCES public.ambiente(id_ambiente),
    id_solicitante BIGINT NOT NULL CHECK (id_solicitante > 0),
    idioma VARCHAR(5) NOT NULL CHECK (idioma IN ('pt-BR', 'en')),
    caminho_pdf VARCHAR(500) NOT NULL UNIQUE,
    hash_pdf CHAR(64) NOT NULL CHECK (hash_pdf ~ '^[a-f0-9]{64}$'),
    -- Momento da inserção, não o início de uma transação que aguardou locks.
    data_geracao TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    versao_template VARCHAR(40) NOT NULL
);
CREATE INDEX relatorio_pdf_geracao_consulta_idx
    ON public.relatorio_pdf_geracao (id_ambiente, id_relatorio, idioma, data_geracao DESC);
-- IDs históricos de relatório/solicitante são snapshots deliberadamente sem FK:
-- exclusões autorizadas existentes continuam possíveis, sem apagar o histórico.
-- Toda leitura revalida o relatório vivo, seus pais e o solicitante autenticado.
-- Conceder manualmente apenas SELECT/INSERT à função da aplicação, se necessário.
COMMIT;
