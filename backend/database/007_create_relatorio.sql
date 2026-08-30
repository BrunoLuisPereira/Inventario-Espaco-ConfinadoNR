CREATE TABLE relatorio (
    id_relatorio BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_local BIGINT NOT NULL UNIQUE,
    id_usuario_responsavel BIGINT NOT NULL,

    numero_art VARCHAR(100),
    caminho_pdf VARCHAR(500),
    hash_pdf VARCHAR(255),

    status VARCHAR(20) NOT NULL DEFAULT 'RASCUNHO'
        CHECK (status IN ('RASCUNHO', 'GERADO')),

    data_emissao TIMESTAMPTZ,

    data_criacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_relatorio_local
        FOREIGN KEY (id_local)
        REFERENCES local(id_local)
        ON DELETE CASCADE,

    CONSTRAINT fk_relatorio_usuario
        FOREIGN KEY (id_usuario_responsavel)
        REFERENCES usuario(id_usuario)
);