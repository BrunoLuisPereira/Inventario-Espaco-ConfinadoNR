-- PREPARADA, NAO EXECUTADA. Exige aprovacao especifica e verificacao privada das identidades.
-- Nao reaplicar 020/021. Aplicar somente apos testes PostgreSQL em laboratorio descartavel.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
DO $guarda$
BEGIN
  IF current_database() <> 'inventario_nr33_multitenant_dev'
     OR current_setting('nr33.autorizar_migracao', true) IS DISTINCT FROM 'PASSO723'
     OR current_setting('server_version_num')::int / 10000 <> 17 THEN
    RAISE EXCEPTION 'Destino, versao ou autorizacao da migration 022 recusados.';
  END IF;
END;
$guarda$;
LOCK TABLE public.ambiente, public.usuario, public.convite IN SHARE ROW EXCLUSIVE MODE;
DO $identidades$
BEGIN
  -- Mapeamento explicitamente aprovado; nunca usa ordem de IDs ou datas.
  IF (SELECT count(*) FROM public.usuario u JOIN public.ambiente a USING(id_ambiente)
      WHERE u.perfil_acesso='ADMINISTRADOR' AND u.ativo AND a.ativo AND
        ((u.id_usuario=21 AND u.id_ambiente='a9cdba4a-fd68-4b3e-bfd0-d86a9281bb66'::uuid)
          OR (u.id_usuario=22 AND u.id_ambiente='021ae9c9-7c37-4be0-ab2b-306ebb0a3004'::uuid))) <> 2
     OR EXISTS(SELECT 1 FROM public.usuario WHERE perfil_acesso='ADMINISTRADOR' AND id_usuario NOT IN (21,22)) THEN
    RAISE EXCEPTION 'Fundadores divergentes do mapeamento aprovado; nenhuma classificacao automatica.';
  END IF;
END;
$identidades$;
ALTER TABLE public.usuario ADD COLUMN eh_fundador BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.usuario ADD COLUMN id_convite_origem UUID;
UPDATE public.usuario SET eh_fundador=TRUE WHERE
  (id_usuario=21 AND id_ambiente='a9cdba4a-fd68-4b3e-bfd0-d86a9281bb66'::uuid)
  OR (id_usuario=22 AND id_ambiente='021ae9c9-7c37-4be0-ab2b-306ebb0a3004'::uuid);
ALTER TABLE public.usuario DROP CONSTRAINT usuario_perfil_acesso_check;
ALTER TABLE public.usuario ADD CONSTRAINT usuario_perfil_acesso_check CHECK (perfil_acesso IN
  ('ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR','SUPERVISOR','AUDITOR','VISUALIZADOR'));
ALTER TABLE public.usuario ADD CONSTRAINT ck_usuario_fundador_admin CHECK (eh_fundador=(perfil_acesso='ADMINISTRADOR'));
CREATE UNIQUE INDEX uq_usuario_fundador_ambiente ON public.usuario(id_ambiente) WHERE eh_fundador;
ALTER TABLE public.convite DROP CONSTRAINT ck_convite_perfil;
-- ADMINISTRADOR permanece apenas para preservar convites historicos, sem autorizar novos ou aceite.
ALTER TABLE public.convite ADD CONSTRAINT ck_convite_perfil CHECK (perfil_acesso IN
  ('ADMINISTRADOR','ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR','SUPERVISOR','AUDITOR','VISUALIZADOR'));
ALTER TABLE public.convite ADD CONSTRAINT uq_convite_id_ambiente UNIQUE(id_convite,id_ambiente);
ALTER TABLE public.usuario ADD CONSTRAINT fk_usuario_convite_origem_ambiente
  FOREIGN KEY(id_convite_origem,id_ambiente) REFERENCES public.convite(id_convite,id_ambiente);
CREATE UNIQUE INDEX uq_usuario_convite_origem ON public.usuario(id_convite_origem) WHERE id_convite_origem IS NOT NULL;

CREATE TABLE public.auditoria_perfil_usuario (
  id_auditoria BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_ambiente UUID NOT NULL REFERENCES public.ambiente(id_ambiente),
  id_usuario_responsavel BIGINT NOT NULL,
  id_usuario_afetado BIGINT NOT NULL,
  perfil_anterior VARCHAR(30) NOT NULL,
  perfil_novo VARCHAR(30) NOT NULL,
  data_hora TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_auditoria_responsavel FOREIGN KEY(id_usuario_responsavel,id_ambiente) REFERENCES public.usuario(id_usuario,id_ambiente),
  CONSTRAINT fk_auditoria_afetado FOREIGN KEY(id_usuario_afetado,id_ambiente) REFERENCES public.usuario(id_usuario,id_ambiente),
  CONSTRAINT ck_auditoria_perfis CHECK (perfil_anterior IN ('ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR','SUPERVISOR','AUDITOR','VISUALIZADOR')
    AND perfil_novo IN ('ENGENHEIRO_SEGURANCA','TECNICO_SEGURANCA','COORDENADOR','SUPERVISOR','AUDITOR','VISUALIZADOR') AND perfil_anterior<>perfil_novo)
);
CREATE INDEX ix_auditoria_perfil_ambiente_data ON public.auditoria_perfil_usuario(id_ambiente,data_hora DESC,id_auditoria DESC);

CREATE FUNCTION public.nr33_proteger_convite_perfil() RETURNS TRIGGER LANGUAGE plpgsql
SET search_path=pg_catalog,public AS $func$
BEGIN
  IF NEW.perfil_acesso='ADMINISTRADOR' AND (TG_OP='INSERT' OR OLD.perfil_acesso IS DISTINCT FROM NEW.perfil_acesso) THEN
    RAISE EXCEPTION 'Convite administrativo nao permitido.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$func$;
CREATE TRIGGER trg_convite_perfil_rbac BEFORE INSERT OR UPDATE OF perfil_acesso ON public.convite
FOR EACH ROW EXECUTE FUNCTION public.nr33_proteger_convite_perfil();

CREATE FUNCTION public.nr33_proteger_usuario_perfil() RETURNS TRIGGER LANGUAGE plpgsql
SET search_path=pg_catalog,public AS $func$
DECLARE v_convite public.convite%ROWTYPE; v_ator BIGINT;
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM 1 FROM public.ambiente WHERE id_ambiente=NEW.id_ambiente AND ativo FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ambiente indisponivel.' USING ERRCODE='23514'; END IF;
    IF NEW.eh_fundador THEN
      -- Serializa a primeira conta; o indice parcial e a barreira final.
      PERFORM 1 FROM public.ambiente WHERE id_ambiente=NEW.id_ambiente FOR UPDATE;
      IF EXISTS(SELECT 1 FROM public.usuario WHERE id_ambiente=NEW.id_ambiente) OR NEW.id_convite_origem IS NOT NULL THEN
        RAISE EXCEPTION 'Fundador so pode ser criado no cadastro inicial.' USING ERRCODE='23514';
      END IF;
    ELSE
      SELECT * INTO v_convite FROM public.convite WHERE id_convite=NEW.id_convite_origem AND id_ambiente=NEW.id_ambiente FOR UPDATE;
      IF NOT FOUND OR v_convite.perfil_acesso='ADMINISTRADOR' OR v_convite.perfil_acesso<>NEW.perfil_acesso
        OR lower(btrim(v_convite.email))<>lower(btrim(NEW.email)) OR v_convite.data_aceite IS NOT NULL
        OR v_convite.data_cancelamento IS NOT NULL OR v_convite.data_expiracao<=clock_timestamp() THEN
        RAISE EXCEPTION 'Origem de convite invalida.' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSE
    IF OLD.eh_fundador IS DISTINCT FROM NEW.eh_fundador OR OLD.id_convite_origem IS DISTINCT FROM NEW.id_convite_origem THEN
      RAISE EXCEPTION 'Fundador e origem sao imutaveis.' USING ERRCODE='23514';
    END IF;
    IF OLD.perfil_acesso IS DISTINCT FROM NEW.perfil_acesso THEN
      IF OLD.eh_fundador OR NEW.perfil_acesso='ADMINISTRADOR' OR OLD.id_convite_origem IS NULL THEN
        RAISE EXCEPTION 'Alteracao de perfil nao permitida.' USING ERRCODE='23514';
      END IF;
      IF coalesce(current_setting('nr33.usuario_responsavel',true),'') !~ '^[1-9][0-9]{0,15}$' THEN
        RAISE EXCEPTION 'Responsavel autenticado obrigatorio.' USING ERRCODE='23514';
      END IF;
      v_ator:=current_setting('nr33.usuario_responsavel')::bigint;
      PERFORM 1 FROM public.usuario u JOIN public.ambiente a USING(id_ambiente)
      WHERE u.id_usuario=v_ator AND u.id_ambiente=NEW.id_ambiente AND u.ativo AND a.ativo
        AND u.eh_fundador AND u.perfil_acesso='ADMINISTRADOR' FOR SHARE OF a,u;
      IF NOT FOUND THEN RAISE EXCEPTION 'Responsavel nao autorizado.' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$func$;
CREATE TRIGGER trg_usuario_perfil_rbac BEFORE INSERT OR UPDATE ON public.usuario
FOR EACH ROW EXECUTE FUNCTION public.nr33_proteger_usuario_perfil();

CREATE FUNCTION public.nr33_auditar_perfil() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $func$
BEGIN
  IF OLD.perfil_acesso IS DISTINCT FROM NEW.perfil_acesso THEN
    INSERT INTO public.auditoria_perfil_usuario(id_ambiente,id_usuario_responsavel,id_usuario_afetado,perfil_anterior,perfil_novo)
    VALUES(NEW.id_ambiente,current_setting('nr33.usuario_responsavel')::bigint,NEW.id_usuario,OLD.perfil_acesso,NEW.perfil_acesso);
  END IF;
  RETURN NEW;
END;
$func$;
REVOKE ALL ON FUNCTION public.nr33_auditar_perfil() FROM PUBLIC;
CREATE TRIGGER trg_usuario_auditar_perfil AFTER UPDATE OF perfil_acesso ON public.usuario
FOR EACH ROW EXECUTE FUNCTION public.nr33_auditar_perfil();
CREATE FUNCTION public.nr33_auditoria_imutavel() RETURNS TRIGGER LANGUAGE plpgsql
SET search_path=pg_catalog,public AS $func$
BEGIN RAISE EXCEPTION 'Auditoria nao pode ser modificada.' USING ERRCODE='23514'; END;
$func$;
CREATE TRIGGER trg_auditoria_imutavel BEFORE UPDATE OR DELETE ON public.auditoria_perfil_usuario
FOR EACH ROW EXECUTE FUNCTION public.nr33_auditoria_imutavel();
REVOKE ALL ON public.auditoria_perfil_usuario FROM PUBLIC,nr33_dev_app;
GRANT SELECT ON public.auditoria_perfil_usuario TO nr33_dev_app;
REVOKE ALL ON SEQUENCE public.auditoria_perfil_usuario_id_auditoria_seq FROM PUBLIC,nr33_dev_app;
COMMIT;
