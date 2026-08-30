CREATE TABLE sincronizacao (
    id_sincronizacao BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    entidade VARCHAR(50) NOT NULL,

    id_entidade BIGINT NOT NULL,

    operacao VARCHAR(20) NOT NULL
        CHECK (operacao IN ('CRIAR', 'ATUALIZAR', 'EXCLUIR')),

    versao_cliente INTEGER NOT NULL DEFAULT 1,

    versao_servidor INTEGER NOT NULL DEFAULT 1,

    status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE'
        CHECK (
            status IN (
                'PENDENTE',
                'SINCRONIZADO',
                'CONFLITO',
                'ERRO'
            )
        ),

    dados_cliente JSONB,

    dados_servidor JSONB,

    mensagem_erro TEXT,

    id_usuario BIGINT NOT NULL,

    data_criacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    data_atualizacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    data_sincronizacao TIMESTAMPTZ,

    CONSTRAINT fk_sincronizacao_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario)
);