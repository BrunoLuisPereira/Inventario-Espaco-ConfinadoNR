CREATE TABLE dados_tecnicos (
    id_dados BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    id_local BIGINT NOT NULL UNIQUE,

    pressao_atmosferica NUMERIC(10, 2),

    ventilacao VARCHAR(30)
        CHECK (
            ventilacao IN (
                'NATURAL',
                'MECANICA',
                'FORCADA',
                'NAO_INFORMADA'
            )
        ),

    oxigenio NUMERIC(5, 2),

    gas_inflamavel NUMERIC(8, 2),

    monoxido_carbono NUMERIC(8, 2),

    sulfeto_hidrogenio NUMERIC(8, 2),

    temperatura NUMERIC(6, 2),

    umidade NUMERIC(6, 2),

    observacoes TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE'
        CHECK (
            status IN (
                'PENDENTE',
                'CONCLUIDO'
            )
        ),

    id_usuario BIGINT NOT NULL,

    data_criacao TIMESTAMPTZ NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    data_atualizacao TIMESTAMPTZ NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_dados_tecnicos_local
        FOREIGN KEY (id_local)
        REFERENCES local(id_local)
        ON DELETE CASCADE,

    CONSTRAINT fk_dados_tecnicos_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario)
);