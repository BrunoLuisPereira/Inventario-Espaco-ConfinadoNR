CREATE TABLE evidencia (
    id_evidencia BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    id_local BIGINT NOT NULL,

    tipo VARCHAR(20) NOT NULL
        CHECK (
            tipo IN (
                'FOTO',
                'TEXTO',
                'DOCUMENTO'
            )
        ),

    caminho_arquivo VARCHAR(500),

    descricao TEXT,

    id_usuario BIGINT NOT NULL,

    data_criacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_evidencia_local
        FOREIGN KEY (id_local)
        REFERENCES local(id_local)
        ON DELETE CASCADE,

    CONSTRAINT fk_evidencia_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario)
);