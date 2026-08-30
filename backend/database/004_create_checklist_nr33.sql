CREATE TABLE checklist_nr33 (
    id_checklist BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    id_local BIGINT NOT NULL UNIQUE,

    identificacao_espaco VARCHAR(10) NOT NULL
        CHECK (identificacao_espaco IN ('A', 'B', 'C')),

    acesso_controlado VARCHAR(3) NOT NULL
        CHECK (acesso_controlado IN ('SIM', 'NAO')),

    ventilacao_adequada VARCHAR(3) NOT NULL
        CHECK (ventilacao_adequada IN ('SIM', 'NAO')),

    monitoramento_atmosferico VARCHAR(3) NOT NULL
        CHECK (monitoramento_atmosferico IN ('SIM', 'NAO')),

    procedimento_emergencia VARCHAR(3) NOT NULL
        CHECK (procedimento_emergencia IN ('SIM', 'NAO')),

    observacoes TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE'
        CHECK (
            status IN (
                'PENDENTE',
                'CONCLUIDO'
            )
        ),

    id_usuario BIGINT NOT NULL,

    data_criacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_checklist_local
        FOREIGN KEY (id_local)
        REFERENCES local(id_local)
        ON DELETE CASCADE,

    CONSTRAINT fk_checklist_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario)
);