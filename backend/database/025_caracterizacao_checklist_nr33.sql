-- Caracterização opcional do espaço confinado. Aplicação manual após revisão.
-- Não preenche nem altera os valores das colunas existentes.
BEGIN;

ALTER TABLE public.checklist_nr33
  ADD COLUMN codigo_identificacao VARCHAR(150),
  ADD COLUMN volume_m3 NUMERIC(18,6),
  ADD COLUMN quantidade_aberturas INTEGER,
  ADD COLUMN dimensoes_aberturas TEXT,
  ADD COLUMN formas_acesso TEXT,
  ADD COLUMN geometria TEXT,
  ADD COLUMN utilizacao_produto TEXT,
  ADD COLUMN perigos_antes_liberacao TEXT,
  ADD CONSTRAINT ck_checklist_volume_positivo CHECK (volume_m3 > 0 AND volume_m3 <> 'NaN'::numeric),
  ADD CONSTRAINT ck_checklist_aberturas_nao_negativas CHECK (quantidade_aberturas >= 0),
  ADD CONSTRAINT ck_checklist_dimensoes_tamanho CHECK (char_length(dimensoes_aberturas) <= 5000),
  ADD CONSTRAINT ck_checklist_acessos_tamanho CHECK (char_length(formas_acesso) <= 5000),
  ADD CONSTRAINT ck_checklist_geometria_tamanho CHECK (char_length(geometria) <= 2000),
  ADD CONSTRAINT ck_checklist_utilizacao_tamanho CHECK (char_length(utilizacao_produto) <= 5000),
  ADD CONSTRAINT ck_checklist_perigos_tamanho CHECK (char_length(perigos_antes_liberacao) <= 5000);

COMMIT;
