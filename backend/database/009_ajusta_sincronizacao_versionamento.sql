-- ======================================================
-- Ajustes do módulo de sincronização offline
-- ======================================================


-- ------------------------------------------------------
-- 1. Identificador único da operação realizada no cliente
--
-- Evita duplicação caso o celular/computador envie
-- a mesma operação mais de uma vez após uma falha de rede.
-- ------------------------------------------------------

ALTER TABLE sincronizacao
ADD COLUMN id_operacao_cliente UUID;


CREATE UNIQUE INDEX uq_sincronizacao_operacao_cliente
ON sincronizacao (id_operacao_cliente)
WHERE id_operacao_cliente IS NOT NULL;


-- ------------------------------------------------------
-- 2. Identificador local do registro
--
-- Quando um registro é criado offline, ele ainda não possui
-- um id_entidade gerado pelo PostgreSQL.
--
-- O frontend poderá utilizar crypto.randomUUID().
-- ------------------------------------------------------

ALTER TABLE sincronizacao
ADD COLUMN id_registro_cliente UUID;


-- ------------------------------------------------------
-- 3. Permitir id_entidade nulo
--
-- Necessário para registros criados totalmente offline.
-- O id_entidade será preenchido depois que o servidor
-- criar o registro definitivo.
-- ------------------------------------------------------

ALTER TABLE sincronizacao
ALTER COLUMN id_entidade DROP NOT NULL;


-- ======================================================
-- 4. Controle oficial de versão no servidor
-- ======================================================

CREATE TABLE versao_entidade (
    id_versao BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    entidade VARCHAR(50) NOT NULL,

    id_entidade BIGINT NOT NULL,

    versao INTEGER NOT NULL DEFAULT 1
        CHECK (versao > 0),

    data_atualizacao TIMESTAMPTZ
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_versao_entidade
        UNIQUE (entidade, id_entidade)
);