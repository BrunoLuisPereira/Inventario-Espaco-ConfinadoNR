-- PREPARADA, NAO EXECUTADA. Aplicacao manual apos revisao do destino.
-- Aditiva, transacional e de aplicacao unica; nao modifica entidades NR-33.
BEGIN;
ALTER TABLE public.usuario
  ADD COLUMN idioma VARCHAR(5) NOT NULL DEFAULT 'pt-BR',
  ADD CONSTRAINT usuario_idioma_permitido CHECK (idioma IN ('pt-BR', 'en'));
COMMIT;
