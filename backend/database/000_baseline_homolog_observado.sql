-- BASELINE OBSERVADO: PostgreSQL 17.10, estrutura de homologacao; nao e DDL original.
-- EM CONSTRUCAO - NAO EXECUTAR sem homologacao e autorizacao especifica do destino.
-- Fonte SHA256 FA133C8B3DCBFC9851BE023E64C3125FE06E8733B4E693FA54C1BFC0F86F01F3.
-- Objetos selecionados e reordenados; sem dump bruto, dados, ACL, owners ou configuracoes da fonte.
-- Nao reaplicar 004-019. Default de campanha corrigido para EM ANDAMENTO.
BEGIN;
DO $seguranca$
BEGIN
  IF current_database() !~ '^nr33_lab_[0-9]{8}_[a-f0-9]{6}$'
     OR current_setting('nr33.laboratorio', true) IS DISTINCT FROM 'passo702' THEN
    RAISE EXCEPTION 'Execucao restrita ao laboratorio descartavel autorizado.';
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
COMMIT;
