-- ARTEFATO DE REVISAO SEM SENHAS: papel NOLOGIN. Instalar pelo postgres-local.ps1 aprovado.
BEGIN;
SET LOCAL nr33.laboratorio = 'passo712';
SET LOCAL search_path = public, pg_catalog;
DO $preflight$
BEGIN
  IF current_database() <> 'inventario_nr33_multitenant_dev' OR current_setting('server_version_num')::int / 10000 <> 17 THEN
    RAISE EXCEPTION 'Banco ou versao PostgreSQL nao autorizados.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='nr33_dev_app') THEN
    RAISE EXCEPTION 'Instalacao exige esquema vazio e papel novo; reutilizacao bloqueada.';
  END IF;
END;
$preflight$;
DO $destino$ BEGIN IF current_database() <> 'inventario_nr33_multitenant_dev' THEN RAISE EXCEPTION 'Banco de destino divergente.'; END IF; END; $destino$;

DO $seguranca$
BEGIN
  IF current_database() <> 'inventario_nr33_multitenant_dev'
     OR current_setting('nr33.laboratorio', true) IS DISTINCT FROM 'passo712' THEN
    RAISE EXCEPTION 'Execucao restrita ao desenvolvimento isolado autorizado.';
  END IF;
END;
$seguranca$;
SET LOCAL check_function_bodies = false;
CREATE TABLE public.campanha (
    id_campanha bigint NOT NULL,
    nome_campanha character varying(150) NOT NULL,
    empresa character varying(150) NOT NULL,
    responsavel character varying(150) NOT NULL,
    data_inicio date NOT NULL,
    status character varying(30) DEFAULT 'EM ANDAMENTO'::character varying NOT NULL,
    id_usuario bigint NOT NULL,
    data_criacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_atualizacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT campanha_status_check CHECK (((status)::text = ANY (ARRAY[('EM ANDAMENTO'::character varying)::text, ('CONCLUIDO'::character varying)::text, ('CANCELADA'::character varying)::text])))
);

CREATE TABLE public.checklist_nr33 (
    id_checklist bigint NOT NULL,
    id_local bigint NOT NULL,
    identificacao_espaco character varying(10),
    acesso_controlado character varying(3) NOT NULL,
    ventilacao_adequada character varying(3) NOT NULL,
    monitoramento_atmosferico character varying(3) NOT NULL,
    procedimento_emergencia character varying(3) NOT NULL,
    observacoes text,
    status character varying(20) DEFAULT 'PENDENTE'::character varying NOT NULL,
    id_usuario bigint NOT NULL,
    data_criacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_atualizacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    criterio_a character varying(3) NOT NULL,
    criterio_b character varying(3) NOT NULL,
    criterio_c character varying(3) NOT NULL,
    CONSTRAINT checklist_nr33_acesso_controlado_check CHECK (((acesso_controlado)::text = ANY (ARRAY[('SIM'::character varying)::text, ('NAO'::character varying)::text]))),
    CONSTRAINT checklist_nr33_criterio_a_check CHECK (((criterio_a)::text = ANY (ARRAY[('SIM'::character varying)::text, ('NAO'::character varying)::text]))),
    CONSTRAINT checklist_nr33_criterio_b_check CHECK (((criterio_b)::text = ANY (ARRAY[('SIM'::character varying)::text, ('NAO'::character varying)::text]))),
    CONSTRAINT checklist_nr33_criterio_c_check CHECK (((criterio_c)::text = ANY (ARRAY[('SIM'::character varying)::text, ('NAO'::character varying)::text]))),
    CONSTRAINT checklist_nr33_identificacao_espaco_check CHECK (((identificacao_espaco)::text = ANY (ARRAY[('A'::character varying)::text, ('B'::character varying)::text, ('C'::character varying)::text]))),
    CONSTRAINT checklist_nr33_monitoramento_atmosferico_check CHECK (((monitoramento_atmosferico)::text = ANY (ARRAY[('SIM'::character varying)::text, ('NAO'::character varying)::text]))),
    CONSTRAINT checklist_nr33_procedimento_emergencia_check CHECK (((procedimento_emergencia)::text = ANY (ARRAY[('SIM'::character varying)::text, ('NAO'::character varying)::text]))),
    CONSTRAINT checklist_nr33_status_check CHECK (((status)::text = ANY (ARRAY[('PENDENTE'::character varying)::text, ('CONCLUIDO'::character varying)::text]))),
    CONSTRAINT checklist_nr33_ventilacao_adequada_check CHECK (((ventilacao_adequada)::text = ANY (ARRAY[('SIM'::character varying)::text, ('NAO'::character varying)::text])))
);

CREATE TABLE public.dados_tecnicos (
    id_dados bigint NOT NULL,
    id_local bigint NOT NULL,
    pressao_atmosferica numeric(10,2),
    ventilacao character varying(30),
    oxigenio numeric(5,2),
    gas_inflamavel numeric(8,2),
    monoxido_carbono numeric(8,2),
    sulfeto_hidrogenio numeric(8,2),
    temperatura numeric(6,2),
    umidade numeric(6,2),
    observacoes text,
    status character varying(20) DEFAULT 'PENDENTE'::character varying NOT NULL,
    id_usuario bigint NOT NULL,
    data_criacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_atualizacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT dados_tecnicos_status_check CHECK (((status)::text = ANY (ARRAY[('PENDENTE'::character varying)::text, ('CONCLUIDO'::character varying)::text]))),
    CONSTRAINT dados_tecnicos_ventilacao_check CHECK (((ventilacao)::text = ANY (ARRAY[('NATURAL'::character varying)::text, ('MECANICA'::character varying)::text, ('FORCADA'::character varying)::text, ('NAO_INFORMADA'::character varying)::text])))
);

CREATE TABLE public.evidencia (
    id_evidencia bigint NOT NULL,
    id_local bigint NOT NULL,
    tipo character varying(20) NOT NULL,
    caminho_arquivo character varying(500),
    descricao text,
    id_usuario bigint NOT NULL,
    data_criacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_atualizacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id_operacao_cliente uuid,
    latitude numeric(10,7),
    longitude numeric(10,7),
    precisao_gps numeric(10,2),
    origem_coordenadas character varying(10),
    data_captura_gps timestamp with time zone,
    CONSTRAINT chk_evidencia_coordenadas CHECK ((((latitude IS NULL) AND (longitude IS NULL)) OR ((latitude IS NOT NULL) AND (longitude IS NOT NULL)))),
    CONSTRAINT chk_evidencia_latitude CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))),
    CONSTRAINT chk_evidencia_longitude CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))),
    CONSTRAINT chk_evidencia_origem CHECK (((origem_coordenadas)::text = ANY (ARRAY[('GPS'::character varying)::text, ('MANUAL'::character varying)::text]))),
    CONSTRAINT chk_evidencia_precisao CHECK ((precisao_gps >= (0)::numeric)),
    CONSTRAINT evidencia_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('FOTO'::character varying)::text, ('TEXTO'::character varying)::text, ('DOCUMENTO'::character varying)::text])))
);

CREATE TABLE public.local (
    id_local bigint NOT NULL,
    nome_local character varying(150) NOT NULL,
    setor character varying(120),
    descricao text,
    endereco character varying(255),
    latitude numeric(10,7),
    longitude numeric(10,7),
    status character varying(30) DEFAULT 'ATIVO'::character varying NOT NULL,
    id_campanha bigint NOT NULL,
    data_criacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_atualizacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT local_status_check CHECK (((status)::text = ANY (ARRAY[('ATIVO'::character varying)::text, ('INATIVO'::character varying)::text])))
);

CREATE TABLE public.relatorio (
    id_relatorio bigint NOT NULL,
    id_local bigint NOT NULL,
    id_usuario_responsavel bigint NOT NULL,
    numero_art character varying(100),
    caminho_pdf character varying(500),
    hash_pdf character varying(255),
    status character varying(20) DEFAULT 'RASCUNHO'::character varying NOT NULL,
    data_emissao timestamp with time zone,
    data_criacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_atualizacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    nome_responsavel_tecnico character varying(150),
    crea character varying(50),
    data_art date,
    CONSTRAINT relatorio_status_check CHECK (((status)::text = ANY (ARRAY[('RASCUNHO'::character varying)::text, ('GERADO'::character varying)::text])))
);

CREATE TABLE public.sincronizacao (
    id_sincronizacao bigint NOT NULL,
    entidade character varying(50) NOT NULL,
    id_entidade bigint,
    operacao character varying(20) NOT NULL,
    versao_cliente integer DEFAULT 1 NOT NULL,
    versao_servidor integer DEFAULT 1 NOT NULL,
    status character varying(20) DEFAULT 'PENDENTE'::character varying NOT NULL,
    dados_cliente jsonb,
    dados_servidor jsonb,
    mensagem_erro text,
    id_usuario bigint NOT NULL,
    data_criacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_atualizacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_sincronizacao timestamp with time zone,
    id_operacao_cliente uuid,
    id_registro_cliente uuid,
    resolucao character varying(20),
    dados_resolvidos jsonb,
    id_usuario_resolucao bigint,
    data_resolucao timestamp with time zone,
    CONSTRAINT sincronizacao_operacao_check CHECK (((operacao)::text = ANY (ARRAY[('CRIAR'::character varying)::text, ('ATUALIZAR'::character varying)::text, ('EXCLUIR'::character varying)::text]))),
    CONSTRAINT sincronizacao_resolucao_check CHECK (((resolucao)::text = ANY (ARRAY[('CLIENTE'::character varying)::text, ('SERVIDOR'::character varying)::text, ('MESCLADO'::character varying)::text]))),
    CONSTRAINT sincronizacao_status_check CHECK (((status)::text = ANY (ARRAY[('PENDENTE'::character varying)::text, ('SINCRONIZADO'::character varying)::text, ('CONFLITO'::character varying)::text, ('ERRO'::character varying)::text])))
);

CREATE TABLE public.usuario (
    id_usuario bigint NOT NULL,
    nome character varying(120) NOT NULL,
    email character varying(180) NOT NULL,
    senha_hash character varying(255) NOT NULL,
    perfil_acesso character varying(30) NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    data_criacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_atualizacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT usuario_perfil_acesso_check CHECK (((perfil_acesso)::text = ANY (ARRAY[('ADMINISTRADOR'::character varying)::text, ('ENGENHEIRO_SEGURANCA'::character varying)::text])))
);

CREATE TABLE public.versao_entidade (
    id_versao bigint NOT NULL,
    entidade character varying(50) NOT NULL,
    id_entidade bigint NOT NULL,
    versao integer DEFAULT 1 NOT NULL,
    data_atualizacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    excluido boolean DEFAULT false NOT NULL,
    data_exclusao timestamp with time zone,
    CONSTRAINT versao_entidade_versao_check CHECK ((versao > 0))
);
ALTER TABLE public.campanha ALTER COLUMN id_campanha ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.campanha_id_campanha_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.checklist_nr33 ALTER COLUMN id_checklist ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.checklist_nr33_id_checklist_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.dados_tecnicos ALTER COLUMN id_dados ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.dados_tecnicos_id_dados_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.evidencia ALTER COLUMN id_evidencia ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.evidencia_id_evidencia_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.local ALTER COLUMN id_local ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.local_id_local_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.relatorio ALTER COLUMN id_relatorio ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.relatorio_id_relatorio_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.sincronizacao ALTER COLUMN id_sincronizacao ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sincronizacao_id_sincronizacao_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.usuario ALTER COLUMN id_usuario ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.usuario_id_usuario_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.versao_entidade ALTER COLUMN id_versao ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.versao_entidade_id_versao_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
ALTER TABLE ONLY public.campanha
    ADD CONSTRAINT campanha_pkey PRIMARY KEY (id_campanha);

ALTER TABLE ONLY public.checklist_nr33
    ADD CONSTRAINT checklist_nr33_id_local_key UNIQUE (id_local);

ALTER TABLE ONLY public.checklist_nr33
    ADD CONSTRAINT checklist_nr33_pkey PRIMARY KEY (id_checklist);

ALTER TABLE ONLY public.dados_tecnicos
    ADD CONSTRAINT dados_tecnicos_id_local_key UNIQUE (id_local);

ALTER TABLE ONLY public.dados_tecnicos
    ADD CONSTRAINT dados_tecnicos_pkey PRIMARY KEY (id_dados);

ALTER TABLE ONLY public.evidencia
    ADD CONSTRAINT evidencia_pkey PRIMARY KEY (id_evidencia);

ALTER TABLE ONLY public.local
    ADD CONSTRAINT local_pkey PRIMARY KEY (id_local);

ALTER TABLE ONLY public.relatorio
    ADD CONSTRAINT relatorio_id_local_key UNIQUE (id_local);

ALTER TABLE ONLY public.relatorio
    ADD CONSTRAINT relatorio_pkey PRIMARY KEY (id_relatorio);

ALTER TABLE ONLY public.sincronizacao
    ADD CONSTRAINT sincronizacao_pkey PRIMARY KEY (id_sincronizacao);

ALTER TABLE ONLY public.versao_entidade
    ADD CONSTRAINT uq_versao_entidade UNIQUE (entidade, id_entidade);

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_email_key UNIQUE (email);

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_pkey PRIMARY KEY (id_usuario);

ALTER TABLE ONLY public.versao_entidade
    ADD CONSTRAINT versao_entidade_pkey PRIMARY KEY (id_versao);

ALTER TABLE ONLY public.campanha
    ADD CONSTRAINT fk_campanha_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);

ALTER TABLE ONLY public.checklist_nr33
    ADD CONSTRAINT fk_checklist_local FOREIGN KEY (id_local) REFERENCES public.local(id_local) ON DELETE CASCADE;

ALTER TABLE ONLY public.checklist_nr33
    ADD CONSTRAINT fk_checklist_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);

ALTER TABLE ONLY public.dados_tecnicos
    ADD CONSTRAINT fk_dados_tecnicos_local FOREIGN KEY (id_local) REFERENCES public.local(id_local) ON DELETE CASCADE;

ALTER TABLE ONLY public.dados_tecnicos
    ADD CONSTRAINT fk_dados_tecnicos_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);

ALTER TABLE ONLY public.evidencia
    ADD CONSTRAINT fk_evidencia_local FOREIGN KEY (id_local) REFERENCES public.local(id_local) ON DELETE CASCADE;

ALTER TABLE ONLY public.evidencia
    ADD CONSTRAINT fk_evidencia_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);

ALTER TABLE ONLY public.local
    ADD CONSTRAINT fk_local_campanha FOREIGN KEY (id_campanha) REFERENCES public.campanha(id_campanha) ON DELETE CASCADE;

ALTER TABLE ONLY public.relatorio
    ADD CONSTRAINT fk_relatorio_local FOREIGN KEY (id_local) REFERENCES public.local(id_local) ON DELETE CASCADE;

ALTER TABLE ONLY public.relatorio
    ADD CONSTRAINT fk_relatorio_usuario FOREIGN KEY (id_usuario_responsavel) REFERENCES public.usuario(id_usuario);

ALTER TABLE ONLY public.sincronizacao
    ADD CONSTRAINT fk_sincronizacao_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);

ALTER TABLE ONLY public.sincronizacao
    ADD CONSTRAINT fk_sincronizacao_usuario_resolucao FOREIGN KEY (id_usuario_resolucao) REFERENCES public.usuario(id_usuario);
CREATE UNIQUE INDEX uq_evidencia_id_operacao_cliente ON public.evidencia USING btree (id_operacao_cliente) WHERE (id_operacao_cliente IS NOT NULL);

CREATE UNIQUE INDEX uq_sincronizacao_operacao_cliente ON public.sincronizacao USING btree (id_operacao_cliente) WHERE (id_operacao_cliente IS NOT NULL);

CREATE UNIQUE INDEX uq_sincronizacao_registro_cliente_criar ON public.sincronizacao USING btree (entidade, id_registro_cliente) WHERE ((id_registro_cliente IS NOT NULL) AND ((operacao)::text = 'CRIAR'::text));
CREATE FUNCTION public.atualizar_versao_entidade() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_entidade VARCHAR(50);
    v_id_entidade BIGINT;
BEGIN
    CASE TG_TABLE_NAME
        WHEN 'campanha' THEN
            v_entidade := 'CAMPANHA';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_campanha;
            ELSE
                v_id_entidade := NEW.id_campanha;
            END IF;

        WHEN 'local' THEN
            v_entidade := 'LOCAL';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_local;
            ELSE
                v_id_entidade := NEW.id_local;
            END IF;

        WHEN 'checklist_nr33' THEN
            v_entidade := 'CHECKLIST_NR33';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_checklist;
            ELSE
                v_id_entidade := NEW.id_checklist;
            END IF;

        WHEN 'evidencia' THEN
            v_entidade := 'EVIDENCIA';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_evidencia;
            ELSE
                v_id_entidade := NEW.id_evidencia;
            END IF;

        WHEN 'dados_tecnicos' THEN
            v_entidade := 'DADOS_TECNICOS';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_dados;
            ELSE
                v_id_entidade := NEW.id_dados;
            END IF;

        ELSE
            RAISE EXCEPTION
                'Tabela % não configurada para versionamento.',
                TG_TABLE_NAME;
    END CASE;


    -- ==================================================
    -- INSERT
    -- ==================================================

    IF TG_OP = 'INSERT' THEN
        INSERT INTO versao_entidade (
            entidade,
            id_entidade,
            versao,
            excluido,
            data_exclusao,
            data_atualizacao
        )
        VALUES (
            v_entidade,
            v_id_entidade,
            1,
            FALSE,
            NULL,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (entidade, id_entidade)
        DO UPDATE
        SET
            excluido = FALSE,
            data_exclusao = NULL,
            data_atualizacao = CURRENT_TIMESTAMP;

        RETURN NEW;
    END IF;


    -- ==================================================
    -- UPDATE
    -- ==================================================

    IF TG_OP = 'UPDATE' THEN
        INSERT INTO versao_entidade (
            entidade,
            id_entidade,
            versao,
            excluido,
            data_exclusao,
            data_atualizacao
        )
        VALUES (
            v_entidade,
            v_id_entidade,
            2,
            FALSE,
            NULL,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (entidade, id_entidade)
        DO UPDATE
        SET
            versao = versao_entidade.versao + 1,
            excluido = FALSE,
            data_exclusao = NULL,
            data_atualizacao = CURRENT_TIMESTAMP;

        RETURN NEW;
    END IF;


    -- ==================================================
    -- DELETE
    -- ==================================================

    IF TG_OP = 'DELETE' THEN
        INSERT INTO versao_entidade (
            entidade,
            id_entidade,
            versao,
            excluido,
            data_exclusao,
            data_atualizacao
        )
        VALUES (
            v_entidade,
            v_id_entidade,
            2,
            TRUE,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (entidade, id_entidade)
        DO UPDATE
        SET
            versao = versao_entidade.versao + 1,
            excluido = TRUE,
            data_exclusao = CURRENT_TIMESTAMP,
            data_atualizacao = CURRENT_TIMESTAMP;

        RETURN OLD;
    END IF;


    RETURN NULL;
END;
$$;
CREATE TRIGGER trg_versionar_campanha AFTER INSERT OR DELETE OR UPDATE ON public.campanha FOR EACH ROW EXECUTE FUNCTION public.atualizar_versao_entidade();

CREATE TRIGGER trg_versionar_checklist_nr33 AFTER INSERT OR DELETE OR UPDATE ON public.checklist_nr33 FOR EACH ROW EXECUTE FUNCTION public.atualizar_versao_entidade();

CREATE TRIGGER trg_versionar_dados_tecnicos AFTER INSERT OR DELETE OR UPDATE ON public.dados_tecnicos FOR EACH ROW EXECUTE FUNCTION public.atualizar_versao_entidade();

CREATE TRIGGER trg_versionar_evidencia AFTER INSERT OR DELETE OR UPDATE ON public.evidencia FOR EACH ROW EXECUTE FUNCTION public.atualizar_versao_entidade();

CREATE TRIGGER trg_versionar_local AFTER INSERT OR DELETE OR UPDATE ON public.local FOR EACH ROW EXECUTE FUNCTION public.atualizar_versao_entidade();


DO $seguranca$
BEGIN
  IF current_database() <> 'inventario_nr33_multitenant_dev'
     OR current_setting('nr33.laboratorio', true) IS DISTINCT FROM 'passo712' THEN
    RAISE EXCEPTION 'Execucao restrita ao desenvolvimento isolado autorizado.';
  END IF;
END;
$seguranca$;
LOCK TABLE public.usuario, public.campanha, public.local, public.checklist_nr33, public.dados_tecnicos, public.evidencia, public.relatorio, public.sincronizacao, public.versao_entidade IN ACCESS EXCLUSIVE MODE;
DO $historico$
BEGIN
  IF EXISTS (SELECT 1 FROM public.usuario) OR EXISTS (SELECT 1 FROM public.campanha)
    OR EXISTS (SELECT 1 FROM public.local) OR EXISTS (SELECT 1 FROM public.checklist_nr33)
    OR EXISTS (SELECT 1 FROM public.evidencia) OR EXISTS (SELECT 1 FROM public.dados_tecnicos)
    OR EXISTS (SELECT 1 FROM public.relatorio) OR EXISTS (SELECT 1 FROM public.sincronizacao)
    OR EXISTS (SELECT 1 FROM public.versao_entidade) THEN
    RAISE EXCEPTION 'Dados legados exigem mapeamento de ambiente aprovado; migracao automatica bloqueada.';
  END IF;
END;
$historico$;
ALTER TABLE public.campanha ALTER COLUMN status SET DEFAULT 'EM ANDAMENTO';

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

-- Cadastro inicial cria ambientes explicitamente; nenhum tenant implicito.

-- Usuarios historicos exigem politica de mapeamento separada.

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

-- Sem UPDATE de campanha: preserva o versionamento durante a transicao.

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

-- Nenhuma sincronizacao recebe ambiente por suposicao.

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

-- Tombstones historicos nao recebem ambiente por suposicao.

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

SET search_path = pg_catalog, public

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

    FROM public.local l

    JOIN public.campanha c ON c.id_campanha = l.id_campanha

    WHERE l.id_local = NEW.id_local
    FOR KEY SHARE OF l, c;

    SELECT u.id_ambiente

      INTO v_id_ambiente_usuario

    FROM public.usuario u

    WHERE u.id_usuario = v_id_usuario
    FOR KEY SHARE OF u;

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

-- ============================================================
-- 10. BLOQUEIO DE TRANSFERENCIA DE AMBIENTE
-- ============================================================

CREATE OR REPLACE FUNCTION public.bloquear_alteracao_ambiente()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    IF OLD.id_ambiente IS DISTINCT FROM NEW.id_ambiente THEN
        RAISE EXCEPTION
            'Nao e permitido alterar o ambiente de um registro existente.';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_usuario_bloquear_alteracao_ambiente
BEFORE UPDATE OF id_ambiente
ON usuario
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_alteracao_ambiente();

CREATE TRIGGER trg_campanha_bloquear_alteracao_ambiente
BEFORE UPDATE OF id_ambiente
ON campanha
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_alteracao_ambiente();

-- ============================================================

-- ============================================================
-- 11. PROTEGER VINCULO DO LOCAL COM A CAMPANHA
-- ============================================================

CREATE OR REPLACE FUNCTION public.bloquear_alteracao_campanha_local()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    IF OLD.id_campanha IS DISTINCT FROM NEW.id_campanha THEN
        RAISE EXCEPTION
            'Nao e permitido transferir um local existente para outra campanha.';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_local_bloquear_alteracao_campanha
BEFORE UPDATE OF id_campanha
ON local
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_alteracao_campanha_local();
-- Services atualizam campos de negocio, nunca transferem registros tecnicos.
-- O ambiente continua derivado de local -> campanha, sem duplicar colunas.
CREATE OR REPLACE FUNCTION public.bloquear_alteracao_local_tecnico()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $vinculo$
BEGIN
    IF OLD.id_local IS DISTINCT FROM NEW.id_local THEN
        RAISE EXCEPTION 'Nao e permitido transferir um registro tecnico para outro local.';
    END IF;
    RETURN NEW;
END;
$vinculo$;

CREATE TRIGGER trg_checklist_bloquear_local BEFORE UPDATE OF id_local ON public.checklist_nr33
FOR EACH ROW EXECUTE FUNCTION public.bloquear_alteracao_local_tecnico();
CREATE TRIGGER trg_dados_tecnicos_bloquear_local BEFORE UPDATE OF id_local ON public.dados_tecnicos
FOR EACH ROW EXECUTE FUNCTION public.bloquear_alteracao_local_tecnico();
CREATE TRIGGER trg_evidencia_bloquear_local BEFORE UPDATE OF id_local ON public.evidencia
FOR EACH ROW EXECUTE FUNCTION public.bloquear_alteracao_local_tecnico();
CREATE TRIGGER trg_relatorio_bloquear_local BEFORE UPDATE OF id_local ON public.relatorio
FOR EACH ROW EXECUTE FUNCTION public.bloquear_alteracao_local_tecnico();
-- ============================================================
-- FIM DA MIGRACAO 020
-- ============================================================

-- Bloqueio fail-closed enquanto a funcao multi-tenant da 021 nao estiver instalada.
CREATE OR REPLACE FUNCTION public.atualizar_versao_entidade()
RETURNS TRIGGER LANGUAGE plpgsql AS $transicao$
BEGIN
  RAISE EXCEPTION 'Versionamento em transicao: concluir migracao 021 antes de escrever.';
END;
$transicao$;


DO $seguranca$
BEGIN
  IF current_database() <> 'inventario_nr33_multitenant_dev'
     OR current_setting('nr33.laboratorio', true) IS DISTINCT FROM 'passo712' THEN
    RAISE EXCEPTION 'Execucao restrita ao desenvolvimento isolado autorizado.';
  END IF;
END;
$seguranca$;
LOCK TABLE public.usuario, public.campanha, public.local, public.checklist_nr33, public.dados_tecnicos, public.evidencia, public.relatorio, public.sincronizacao, public.versao_entidade IN ACCESS EXCLUSIVE MODE;

-- ============================================================
-- 1. VALIDACOES INICIAIS
-- ============================================================

DO $$
BEGIN
    -- A migracao 020 deve ter criado id_ambiente.
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'versao_entidade'
          AND column_name = 'id_ambiente'
    ) THEN
        RAISE EXCEPTION
            'A migracao 020 deve ser aplicada antes da 021.';
    END IF;

    -- Nenhuma versao pode ficar sem ambiente.
    IF EXISTS (
        SELECT 1
        FROM public.versao_entidade
        WHERE id_ambiente IS NULL
    ) THEN
        RAISE EXCEPTION
            'Existem registros de versionamento sem ambiente.';
    END IF;

    -- Antes de substituir a unicidade global, garantir
    -- que nao existem registros duplicados.
    IF EXISTS (
        SELECT 1
        FROM public.versao_entidade
        GROUP BY entidade, id_entidade
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Existem identificadores duplicados no versionamento.';
    END IF;
END;
$$;

-- ============================================================
-- 2. UNICIDADE DO VERSIONAMENTO POR AMBIENTE
-- ============================================================

ALTER TABLE public.versao_entidade
DROP CONSTRAINT uq_versao_entidade;

ALTER TABLE public.versao_entidade
ADD CONSTRAINT uq_versao_entidade
UNIQUE (id_ambiente, entidade, id_entidade);

-- IDs de dominio sao globais por tabela (identity/PK), nao UUIDs offline.
-- Preserva uma unica historia por entidade/ID e fecha a corrida entre ambientes.
CREATE UNIQUE INDEX uq_versao_entidade_identidade_global
ON public.versao_entidade (entidade, id_entidade);

-- ============================================================
-- 3. REGULARIZACAO GERAL POR ANCESTRALIDADE, SEM IDS FIXOS
-- Versoes e tombstones conhecidos nunca sao reiniciados por este backfill.
DO $coerencia$
BEGIN
  IF EXISTS (WITH ativos AS (SELECT 'CAMPANHA'::varchar(50) AS entidade, c.id_campanha AS id_entidade, c.id_ambiente FROM public.campanha c
UNION ALL SELECT 'LOCAL', l.id_local, c.id_ambiente FROM public.local l JOIN public.campanha c USING (id_campanha)
UNION ALL SELECT 'CHECKLIST_NR33', e.id_checklist, c.id_ambiente FROM public.checklist_nr33 e JOIN public.local l USING (id_local) JOIN public.campanha c USING (id_campanha)
UNION ALL SELECT 'DADOS_TECNICOS', e.id_dados, c.id_ambiente FROM public.dados_tecnicos e JOIN public.local l USING (id_local) JOIN public.campanha c USING (id_campanha)
UNION ALL SELECT 'EVIDENCIA', e.id_evidencia, c.id_ambiente FROM public.evidencia e JOIN public.local l USING (id_local) JOIN public.campanha c USING (id_campanha))
    SELECT 1 FROM ativos a JOIN public.versao_entidade v USING (entidade, id_entidade)
    WHERE v.id_ambiente IS DISTINCT FROM a.id_ambiente OR v.excluido) THEN
    RAISE EXCEPTION 'Versionamento inconsistente; revisao explicita obrigatoria.';
  END IF;
END;
$coerencia$;
WITH ativos AS (SELECT 'CAMPANHA'::varchar(50) AS entidade, c.id_campanha AS id_entidade, c.id_ambiente FROM public.campanha c
UNION ALL SELECT 'LOCAL', l.id_local, c.id_ambiente FROM public.local l JOIN public.campanha c USING (id_campanha)
UNION ALL SELECT 'CHECKLIST_NR33', e.id_checklist, c.id_ambiente FROM public.checklist_nr33 e JOIN public.local l USING (id_local) JOIN public.campanha c USING (id_campanha)
UNION ALL SELECT 'DADOS_TECNICOS', e.id_dados, c.id_ambiente FROM public.dados_tecnicos e JOIN public.local l USING (id_local) JOIN public.campanha c USING (id_campanha)
UNION ALL SELECT 'EVIDENCIA', e.id_evidencia, c.id_ambiente FROM public.evidencia e JOIN public.local l USING (id_local) JOIN public.campanha c USING (id_campanha))
INSERT INTO public.versao_entidade (id_ambiente, entidade, id_entidade, versao, excluido, data_exclusao, data_atualizacao)
SELECT a.id_ambiente, a.entidade, a.id_entidade, 1, FALSE, NULL, CURRENT_TIMESTAMP
FROM ativos a WHERE NOT EXISTS (
 SELECT 1 FROM public.versao_entidade v WHERE v.entidade = a.entidade AND v.id_entidade = a.id_entidade
);
-- Versao 1 e inicializacao no laboratorio, nao recuperacao de historico perdido.
-- ============================================================
-- 4. FUNCAO DE VERSIONAMENTO MULTI-TENANT
-- ============================================================

CREATE OR REPLACE FUNCTION public.atualizar_versao_entidade()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_entidade VARCHAR(50);
    v_id_entidade BIGINT;
    v_id_ambiente UUID;
    v_ambiente_registro UUID;
    v_id_local BIGINT;
BEGIN

    -- --------------------------------------------------------
    -- 4.1 IDENTIFICAR A ENTIDADE E O ID
    -- --------------------------------------------------------

    CASE TG_TABLE_NAME

        WHEN 'campanha' THEN
            v_entidade := 'CAMPANHA';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_campanha;
            ELSE
                v_id_entidade := NEW.id_campanha;
            END IF;

        WHEN 'local' THEN
            v_entidade := 'LOCAL';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_local;
            ELSE
                v_id_entidade := NEW.id_local;
            END IF;

        WHEN 'checklist_nr33' THEN
            v_entidade := 'CHECKLIST_NR33';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_checklist;
            ELSE
                v_id_entidade := NEW.id_checklist;
            END IF;

        WHEN 'dados_tecnicos' THEN
            v_entidade := 'DADOS_TECNICOS';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_dados;
            ELSE
                v_id_entidade := NEW.id_dados;
            END IF;

        WHEN 'evidencia' THEN
            v_entidade := 'EVIDENCIA';

            IF TG_OP = 'DELETE' THEN
                v_id_entidade := OLD.id_evidencia;
            ELSE
                v_id_entidade := NEW.id_evidencia;
            END IF;

        ELSE
            RAISE EXCEPTION
                'Tabela % nao configurada para versionamento.',
                TG_TABLE_NAME;
    END CASE;

    -- --------------------------------------------------------
    -- 4.2 DELETE - REGISTRAR TOMBSTONE
    -- --------------------------------------------------------

    IF TG_OP = 'DELETE' THEN

        -- Identificar o ambiente pela versao existente.
        -- STRICT exige exatamente um registro ativo.

        SELECT v.id_ambiente
        INTO STRICT v_id_ambiente
        FROM public.versao_entidade v
        WHERE v.entidade = v_entidade
          AND v.id_entidade = v_id_entidade
          AND v.excluido = FALSE
        FOR UPDATE;

        -- Para campanhas, podemos validar diretamente
        -- o ambiente do registro excluido.

        IF TG_TABLE_NAME = 'campanha' THEN
            v_ambiente_registro := OLD.id_ambiente;

            IF v_ambiente_registro IS DISTINCT FROM v_id_ambiente THEN
                RAISE EXCEPTION
                    'Ambiente inconsistente na exclusao de % ID %.',
                    v_entidade, v_id_entidade;
            END IF;
        END IF;

        -- Em exclusoes em cascata, os registros pais
        -- podem nao estar mais disponiveis para consulta.
        -- Para as demais entidades, utilizamos a versao
        -- existente. A integridade deve ser validada
        -- tambem pelos relacionamentos e pelo backend.

        UPDATE public.versao_entidade
        SET versao = versao + 1,
            excluido = TRUE,
            data_exclusao = CURRENT_TIMESTAMP,
            data_atualizacao = CURRENT_TIMESTAMP
        WHERE id_ambiente = v_id_ambiente
          AND entidade = v_entidade
          AND id_entidade = v_id_entidade
          AND excluido = FALSE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Versionamento ativo ausente na exclusao.';
        END IF;

        RETURN OLD;
    END IF;

    -- --------------------------------------------------------
    -- 4.3 INSERT / UPDATE - IDENTIFICAR AMBIENTE
    -- --------------------------------------------------------

    IF TG_TABLE_NAME = 'campanha' THEN

        v_id_ambiente := NEW.id_ambiente;

    ELSIF TG_TABLE_NAME = 'local' THEN

        SELECT c.id_ambiente
        INTO v_id_ambiente
        FROM public.campanha c
        WHERE c.id_campanha = NEW.id_campanha;

    ELSE

        v_id_local := NEW.id_local;

        SELECT c.id_ambiente
        INTO v_id_ambiente
        FROM public.local l
        JOIN public.campanha c
            ON c.id_campanha = l.id_campanha
        WHERE l.id_local = v_id_local;

    END IF;

    IF v_id_ambiente IS NULL THEN
        RAISE EXCEPTION
            'Ambiente nao encontrado para % ID %.',
            v_entidade, v_id_entidade;
    END IF;

    -- --------------------------------------------------------
    -- 4.4 IMPEDIR MUDANCA DE AMBIENTE
    -- --------------------------------------------------------

    -- Mesmo com a chave unica composta, os IDs das
    -- entidades continuam sendo BIGINT globais.
    --
    -- Nao permitir que o mesmo ID seja associado
    -- a ambientes diferentes no versionamento.

    IF EXISTS (
        SELECT 1
        FROM public.versao_entidade v
        WHERE v.entidade = v_entidade
          AND v.id_entidade = v_id_entidade
          AND v.id_ambiente <> v_id_ambiente
    ) THEN
        RAISE EXCEPTION
            'Mudanca de ambiente nao permitida para % ID %.',
            v_entidade, v_id_entidade;
    END IF;

    -- --------------------------------------------------------
    -- 4.5 INSERT - CRIAR VERSIONAMENTO
    -- --------------------------------------------------------

    IF TG_OP = 'INSERT' THEN

        INSERT INTO public.versao_entidade (
            id_ambiente,
            entidade,
            id_entidade,
            versao,
            excluido,
            data_exclusao,
            data_atualizacao
        )
        VALUES (
            v_id_ambiente,
            v_entidade,
            v_id_entidade,
            1,
            FALSE,
            NULL,
            CURRENT_TIMESTAMP
        );

        RETURN NEW;
    END IF;

    -- --------------------------------------------------------
    -- 4.6 UPDATE - INCREMENTAR VERSIONAMENTO
    -- --------------------------------------------------------

    IF TG_OP = 'UPDATE' THEN

        UPDATE public.versao_entidade
        SET versao = versao + 1,
            data_atualizacao = CURRENT_TIMESTAMP
        WHERE id_ambiente = v_id_ambiente
          AND entidade = v_entidade
          AND id_entidade = v_id_entidade
          AND excluido = FALSE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Versionamento ativo ausente na atualizacao.';
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;

END;
$function$;

-- ============================================================
-- 5. VALIDACOES FINAIS
-- ============================================================

DO $validacao$
BEGIN
  IF EXISTS (SELECT 1 FROM public.versao_entidade WHERE id_ambiente IS NULL) THEN
    RAISE EXCEPTION 'Versionamento sem ambiente apos migracao.';
  END IF;
  IF EXISTS (WITH ativos AS (SELECT 'CAMPANHA'::varchar(50) AS entidade, c.id_campanha AS id_entidade, c.id_ambiente FROM public.campanha c
UNION ALL SELECT 'LOCAL', l.id_local, c.id_ambiente FROM public.local l JOIN public.campanha c USING (id_campanha)
UNION ALL SELECT 'CHECKLIST_NR33', e.id_checklist, c.id_ambiente FROM public.checklist_nr33 e JOIN public.local l USING (id_local) JOIN public.campanha c USING (id_campanha)
UNION ALL SELECT 'DADOS_TECNICOS', e.id_dados, c.id_ambiente FROM public.dados_tecnicos e JOIN public.local l USING (id_local) JOIN public.campanha c USING (id_campanha)
UNION ALL SELECT 'EVIDENCIA', e.id_evidencia, c.id_ambiente FROM public.evidencia e JOIN public.local l USING (id_local) JOIN public.campanha c USING (id_campanha))
    SELECT 1 FROM ativos a WHERE NOT EXISTS (
      SELECT 1 FROM public.versao_entidade v WHERE v.id_ambiente = a.id_ambiente
      AND v.entidade = a.entidade AND v.id_entidade = a.id_entidade AND NOT v.excluido)) THEN
    RAISE EXCEPTION 'Entidade ativa sem versionamento consistente.';
  END IF;
END;
$validacao$;


CREATE ROLE nr33_dev_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
REVOKE ALL ON DATABASE inventario_nr33_multitenant_dev FROM PUBLIC;
GRANT CONNECT ON DATABASE inventario_nr33_multitenant_dev TO nr33_dev_app;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO nr33_dev_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nr33_dev_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nr33_dev_app;
COMMIT;
