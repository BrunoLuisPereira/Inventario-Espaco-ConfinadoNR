-- ======================================================
-- Resolução manual de conflitos de sincronização
-- ======================================================

ALTER TABLE sincronizacao
ADD COLUMN resolucao VARCHAR(20)
    CHECK (
        resolucao IN (
            'CLIENTE',
            'SERVIDOR',
            'MESCLADO'
        )
    );


ALTER TABLE sincronizacao
ADD COLUMN dados_resolvidos JSONB;


ALTER TABLE sincronizacao
ADD COLUMN id_usuario_resolucao BIGINT;


ALTER TABLE sincronizacao
ADD COLUMN data_resolucao TIMESTAMPTZ;


ALTER TABLE sincronizacao
ADD CONSTRAINT fk_sincronizacao_usuario_resolucao
    FOREIGN KEY (id_usuario_resolucao)
    REFERENCES usuario(id_usuario);