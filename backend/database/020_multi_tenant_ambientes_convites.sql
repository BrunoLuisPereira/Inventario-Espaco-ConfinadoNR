
-- ============================================================
-- MIGRATION 020 - MULTI-TENANT
-- Inventario de Espacos Confinados NR-33
--
-- EM CONSTRUCAO - NAO EXECUTAR
-- ============================================================

BEGIN;

-- ============================================================
-- 1. AMBIENTES
-- ============================================================

CREATE TABLE ambiente (
    id_ambiente UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    nome VARCHAR(180) NOT NULL,

    ativo BOOLEAN NOT NULL DEFAULT TRUE,

    data_criacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    data_atualizacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_ambiente_nome_nao_vazio
        CHECK (LENGTH(TRIM(nome)) > 0)
);

-- ============================================================
-- 2. CONVITES
-- ============================================================

CREATE TABLE convite (
    id_convite UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_ambiente UUID NOT NULL
        REFERENCES ambiente(id_ambiente),

    email VARCHAR(180) NOT NULL,

    perfil_acesso VARCHAR(30) NOT NULL,

    token_hash VARCHAR(64) NOT NULL UNIQUE,

    id_usuario_convite BIGINT NOT NULL
        REFERENCES usuario(id_usuario),

    data_expiracao TIMESTAMPTZ NOT NULL,

    data_aceite TIMESTAMPTZ,

    data_cancelamento TIMESTAMPTZ,

    data_criacao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_convite_email_nao_vazio
        CHECK (LENGTH(TRIM(email)) > 0),

    CONSTRAINT ck_convite_perfil
        CHECK (
            perfil_acesso IN (
                'ADMINISTRADOR',
                'ENGENHEIRO_SEGURANCA'
            )
        ),

    CONSTRAINT ck_convite_estado
        CHECK (
            NOT (
                data_aceite IS NOT NULL
                AND data_cancelamento IS NOT NULL
            )
        ),

    CONSTRAINT ck_convite_expiracao
        CHECK (data_expiracao > data_criacao)
);

-- Consultas de convites por ambiente.
CREATE INDEX idx_convite_ambiente
    ON convite (id_ambiente);

-- Consultas por email normalizado.
CREATE INDEX idx_convite_email_normalizado
    ON convite (LOWER(BTRIM(email)));

-- As regras de reserva de email e concorrencia serao
-- implementadas em conjunto com o cadastro e aceite.
--

-- ============================================================
-- 3. VINCULO DOS USUARIOS COM AMBIENTES
-- ============================================================

ALTER TABLE usuario
ADD COLUMN id_ambiente UUID;

-- Criar o ambiente que recebera os dados legados.
-- Seu nome podera ser alterado posteriormente.
INSERT INTO ambiente (nome)
VALUES ('Ambiente Principal - Inventario NR-33');

-- Associar todos os usuarios existentes ao ambiente legado.
-- A migracao pressupoe que existe somente um ambiente
-- neste momento, criado pelo INSERT acima.
UPDATE usuario
SET id_ambiente = (
    SELECT id_ambiente
    FROM ambiente
    WHERE nome = 'Ambiente Principal - Inventario NR-33'
);

-- Impedir usuarios sem ambiente.
ALTER TABLE usuario
ALTER COLUMN id_ambiente SET NOT NULL;

-- Garantir a existencia do ambiente referenciado.
ALTER TABLE usuario
ADD CONSTRAINT fk_usuario_ambiente
FOREIGN KEY (id_ambiente)
REFERENCES ambiente(id_ambiente);

-- Garantir unicidade de email independentemente de
-- letras maiusculas, minusculas e espacos externos.
CREATE UNIQUE INDEX uq_usuario_email_normalizado
ON usuario (LOWER(BTRIM(email)));

-- Facilitar consultas dos usuarios por ambiente.
CREATE INDEX idx_usuario_ambiente
ON usuario (id_ambiente);

-- ============================================================

-- ============================================================
-- 4. VINCULO DAS CAMPANHAS COM AMBIENTES
-- ============================================================

ALTER TABLE campanha
ADD COLUMN id_ambiente UUID;

UPDATE campanha c
SET id_ambiente = u.id_ambiente
FROM usuario u
WHERE u.id_usuario = c.id_usuario;

ALTER TABLE campanha
ALTER COLUMN id_ambiente SET NOT NULL;

ALTER TABLE campanha
ADD CONSTRAINT fk_campanha_ambiente
FOREIGN KEY (id_ambiente)
REFERENCES ambiente(id_ambiente);

CREATE INDEX idx_campanha_ambiente
ON campanha (id_ambiente);


-- ============================================================
-- 5. VINCULO DAS SINCRONIZACOES COM AMBIENTES
-- ============================================================

ALTER TABLE sincronizacao
ADD COLUMN id_ambiente UUID;

UPDATE sincronizacao s
SET id_ambiente = u.id_ambiente
FROM usuario u
WHERE u.id_usuario = s.id_usuario;

ALTER TABLE sincronizacao
ALTER COLUMN id_ambiente SET NOT NULL;

ALTER TABLE sincronizacao
ADD CONSTRAINT fk_sincronizacao_ambiente
FOREIGN KEY (id_ambiente)
REFERENCES ambiente(id_ambiente);

CREATE INDEX idx_sincronizacao_ambiente
ON sincronizacao (id_ambiente);


-- ============================================================
-- 6. VINCULO DO VERSIONAMENTO COM AMBIENTES
-- ============================================================

ALTER TABLE versao_entidade
ADD COLUMN id_ambiente UUID;

-- Nesta migracao inicial, todos os registros de versionamento,
-- inclusive os tombstones, pertencem ao ambiente legado.
UPDATE versao_entidade
SET id_ambiente = (
    SELECT id_ambiente
    FROM ambiente
    WHERE nome = 'Ambiente Principal - Inventario NR-33'
);

ALTER TABLE versao_entidade
ALTER COLUMN id_ambiente SET NOT NULL;

ALTER TABLE versao_entidade
ADD CONSTRAINT fk_versao_entidade_ambiente
FOREIGN KEY (id_ambiente)
REFERENCES ambiente(id_ambiente);

CREATE INDEX idx_versao_entidade_ambiente
ON versao_entidade (id_ambiente);


-- ============================================================

-- ============================================================
-- 7. INTEGRIDADE ENTRE USUARIOS E AMBIENTES
-- ============================================================

-- As chaves compostas permitem validar que o usuario
-- referenciado pertence ao mesmo ambiente do registro.

ALTER TABLE usuario
ADD CONSTRAINT uq_usuario_id_ambiente
UNIQUE (id_usuario, id_ambiente);

-- Uma campanha deve pertencer ao mesmo ambiente
-- de seu usuario responsavel.

ALTER TABLE campanha
ADD CONSTRAINT fk_campanha_usuario_ambiente
FOREIGN KEY (id_usuario, id_ambiente)
REFERENCES usuario (id_usuario, id_ambiente);

-- O usuario que iniciou uma sincronizacao deve
-- pertencer ao ambiente da sincronizacao.

ALTER TABLE sincronizacao
ADD CONSTRAINT fk_sincronizacao_usuario_ambiente
FOREIGN KEY (id_usuario, id_ambiente)
REFERENCES usuario (id_usuario, id_ambiente);

-- Se houver usuario responsavel pela resolucao
-- de um conflito, ele tambem deve pertencer
-- ao mesmo ambiente.

ALTER TABLE sincronizacao
ADD CONSTRAINT fk_sincronizacao_resolucao_ambiente
FOREIGN KEY (id_usuario_resolucao, id_ambiente)
REFERENCES usuario (id_usuario, id_ambiente);

-- O administrador que enviou um convite deve
-- pertencer ao ambiente de destino.

ALTER TABLE convite
ADD CONSTRAINT fk_convite_usuario_ambiente
FOREIGN KEY (id_usuario_convite, id_ambiente)
REFERENCES usuario (id_usuario, id_ambiente);


-- ============================================================
-- 8. IDEMPOTENCIA POR AMBIENTE
-- ============================================================

-- Substituir os indices globais de sincronizacao
-- por indices que considerem o ambiente.

DROP INDEX uq_sincronizacao_operacao_cliente;

CREATE UNIQUE INDEX uq_sincronizacao_operacao_cliente
ON sincronizacao (id_ambiente, id_operacao_cliente)
WHERE id_operacao_cliente IS NOT NULL;

DROP INDEX uq_sincronizacao_registro_cliente_criar;

CREATE UNIQUE INDEX uq_sincronizacao_registro_cliente_criar
ON sincronizacao (id_ambiente, entidade, id_registro_cliente)
WHERE id_registro_cliente IS NOT NULL
  AND operacao = 'CRIAR';


-- ============================================================

-- ============================================================
-- 9. VALIDACAO DE AMBIENTE DOS RESPONSAVEIS
-- ============================================================

CREATE OR REPLACE FUNCTION public.validar_ambiente_responsavel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id_ambiente_registro UUID;
    v_id_ambiente_usuario UUID;
    v_id_usuario BIGINT;
BEGIN
    IF TG_TABLE_NAME = 'relatorio' THEN
        v_id_usuario := NEW.id_usuario_responsavel;
    ELSE
        v_id_usuario := NEW.id_usuario;
    END IF;

    SELECT c.id_ambiente
      INTO v_id_ambiente_registro
    FROM local l
    JOIN campanha c ON c.id_campanha = l.id_campanha
    WHERE l.id_local = NEW.id_local;

    SELECT u.id_ambiente
      INTO v_id_ambiente_usuario
    FROM usuario u
    WHERE u.id_usuario = v_id_usuario;

    IF v_id_ambiente_registro IS NULL
       OR v_id_ambiente_usuario IS NULL
       OR v_id_ambiente_registro <> v_id_ambiente_usuario
    THEN
        RAISE EXCEPTION
            'Usuario % nao pertence ao ambiente do local %.',
            v_id_usuario, NEW.id_local;
    END IF;

    RETURN NEW;
END;
$function$;


CREATE TRIGGER trg_checklist_validar_ambiente
BEFORE INSERT OR UPDATE OF id_local, id_usuario
ON checklist_nr33
FOR EACH ROW
EXECUTE FUNCTION public.validar_ambiente_responsavel();


CREATE TRIGGER trg_dados_tecnicos_validar_ambiente
BEFORE INSERT OR UPDATE OF id_local, id_usuario
ON dados_tecnicos
FOR EACH ROW
EXECUTE FUNCTION public.validar_ambiente_responsavel();


CREATE TRIGGER trg_evidencia_validar_ambiente
BEFORE INSERT OR UPDATE OF id_local, id_usuario
ON evidencia
FOR EACH ROW
EXECUTE FUNCTION public.validar_ambiente_responsavel();


CREATE TRIGGER trg_relatorio_validar_ambiente
BEFORE INSERT OR UPDATE OF id_local, id_usuario_responsavel
ON relatorio
FOR EACH ROW
EXECUTE FUNCTION public.validar_ambiente_responsavel();




