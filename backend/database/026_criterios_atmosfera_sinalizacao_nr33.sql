-- PREPARADA, NAO EXECUTADA. Aplicacao manual somente apos revisao,
-- verificacao explicita do destino e autorizacao especifica.
-- Complementa 025; nao reaplicar migrations anteriores.
-- Segue 025: transacional e de aplicacao unica, sem IF NOT EXISTS.
-- Uma reexecucao deve falhar por objeto duplicado, sem mascarar schema divergente;
-- o executor futuro deve parar no primeiro erro e realizar ROLLBACK.
-- Nao executa DML: preserva criterios, status, timestamps e versoes existentes.
-- Todas as novas colunas sao opcionais e sem DEFAULT ou backfill.
--
-- Contrato da Etapa 2A: regrasCaracterizacaoNr33.js (inalterado).
-- As cinco condicoes mantem nomes e valores SIM/NAO/null. O adaptador futuro
-- reconstruira avaliacao_especifica=null quando o marcador for NULL e um objeto
-- com essas condicoes quando for TRUE, mesmo que todas estejam NULL.
-- NULL no marcador = nao iniciada; TRUE = iniciada, nao resultado positivo.
-- Uma hipotese descartada e calculada das condicoes negativas, nunca de FALSE
-- no marcador. Nao existe estado persistido de classificacao ou nao aplicavel.
--
-- A condicao de ocupacao da hipotese especifica tem redacao propria no contrato;
-- nao e copiada de A. A condicao de acesso e independente na persistencia para
-- preservar a avaliacao especifica e sua ausencia, sem inferir respostas legadas.
-- Na integracao futura, o servico devera resolver divergencias de acesso com B
-- para o mesmo espaco e avaliar coerencia da ocupacao sem equiparar as redacoes.
-- Nao ha constraint global de igualdade com A/B ou de conclusao: registros
-- historicos e clientes antigos podem continuar atualizando os campos existentes.
-- Atualizacoes parciais futuras devem preservar omissao, false e null; ao limpar
-- o marcador, limpar as cinco condicoes na mesma escrita, apos confirmacao.
-- As FKs, triggers, permissoes e ancestralidade checklist/local/campanha/ambiente
-- permanecem intactas. Homologar locks e DDL no PostgreSQL descartavel autorizado.
BEGIN;

ALTER TABLE public.checklist_nr33
  ADD COLUMN atmosfera_oxigenio BOOLEAN NULL,
  ADD COLUMN atmosfera_contaminantes BOOLEAN NULL,
  ADD COLUMN atmosfera_explosiva BOOLEAN NULL,
  ADD COLUMN possui_placa_identificacao BOOLEAN NULL,
  ADD COLUMN nao_destinado_ocupacao_humana VARCHAR(3) NULL,
  ADD COLUMN meios_limitados_entrada_saida VARCHAR(3) NULL,
  ADD COLUMN utilizado_armazenagem VARCHAR(3) NULL,
  ADD COLUMN potencial_engolfamento VARCHAR(3) NULL,
  ADD COLUMN potencial_afogamento VARCHAR(3) NULL,
  ADD COLUMN avaliacao_especifica_iniciada BOOLEAN NULL,
  ADD CONSTRAINT ck_checklist_nao_destinado_ocupacao_humana_dominio
    CHECK (nao_destinado_ocupacao_humana IN ('SIM', 'NAO')),
  ADD CONSTRAINT ck_checklist_meios_limitados_entrada_saida_dominio
    CHECK (meios_limitados_entrada_saida IN ('SIM', 'NAO')),
  ADD CONSTRAINT ck_checklist_utilizado_armazenagem_dominio
    CHECK (utilizado_armazenagem IN ('SIM', 'NAO')),
  ADD CONSTRAINT ck_checklist_potencial_engolfamento_dominio
    CHECK (potencial_engolfamento IN ('SIM', 'NAO')),
  ADD CONSTRAINT ck_checklist_potencial_afogamento_dominio
    CHECK (potencial_afogamento IN ('SIM', 'NAO')),
  ADD CONSTRAINT ck_checklist_avaliacao_especifica_iniciada_dominio
    CHECK (avaliacao_especifica_iniciada IS NULL OR avaliacao_especifica_iniciada IS TRUE),
  ADD CONSTRAINT ck_checklist_avaliacao_especifica_presenca
    CHECK (avaliacao_especifica_iniciada IS TRUE OR (
      nao_destinado_ocupacao_humana IS NULL AND
      meios_limitados_entrada_saida IS NULL AND
      utilizado_armazenagem IS NULL AND
      potencial_engolfamento IS NULL AND
      potencial_afogamento IS NULL
    ));

COMMIT;
