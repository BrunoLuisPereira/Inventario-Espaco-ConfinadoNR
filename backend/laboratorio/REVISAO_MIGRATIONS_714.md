# PASSO 714 — instalação limpa revisada, sem execução PostgreSQL

Destino local exclusivo: inventario_nr33_multitenant_dev, 127.0.0.1:5432.
O instalador continua postgres-local.ps1. Não executar scripts Docker antigos.

## SQL final para revisão

instalacao-local-revisao.sql foi composto das fontes atuais 000 → 020 → 021,
com uma transação externa única, guarda exata do banco, marcador passo712,
criação de papel e grants somente no banco novo. Não contém senha ou dados.
Seu papel é **NOLOGIN**: não usar esse preview como substituto do instalador.
O instalador fornece a senha privada apenas em memória e cria o papel LOGIN
dentro da mesma transação. Nenhum SQL foi executado nesta etapa.

Comando de geração para revisão, sem credenciais ou conexão:

```powershell
node .\backend\laboratorio\postgresLocal.cjs --banco inventario_nr33_multitenant_dev --revisao
```

Os comandos de criação/instalação de POSTGRES_LOCAL_712.md continuam propostos,
aguardando aprovação. CREATE DATABASE é separado: PostgreSQL não permite criá-lo
dentro da transação que instala o esquema. Falha de instalação não remove o banco
vazio criado anteriormente; não há reset ou limpeza automática.

## Correções

- Compositor agora inspeciona comandos fora de comentários, strings e corpos
  dollar-quoted. Rejeita COMMIT/ROLLBACK/BEGIN intermediários, outros controles
  transacionais e metacomandos psql, inclusive gexec. Corpos incompletos são
  rejeitados. Não é um parser completo PostgreSQL e não valida a gramática SQL.
- As guardas antigas continuam nas fontes históricas. O compositor só adapta a
  guarda literal conhecida, uma vez por fonte; a entrada local exige nome exato.
  O SQL final não contém nr33_lab_, passo702 ou passo710.
- 020 mantém a ancestralidade local → campanha → ambiente. Não adiciona UUIDs
  redundantes a local/checklist/dados/evidência/relatório e não muda respostas
  SELECT *. Mantidos todos os campos NR-33, GPS e offline.
- Triggers de autoria usam nomes de tabela qualificados, search_path fixo e
  KEY SHARE sobre local, campanha e usuário. Usuário/campanha já não podem mudar
  ambiente e local já não pode mudar campanha. Novos triggers impedem transferência
  de checklist/dados/evidência/relatório para outro local, como os serviços atuais.
- FKs compostas continuam garantindo ambiente de responsável de campanha,
  emissor de convite e usuários de sincronização/resolução.
- 021 conserva unicidade composta por ambiente e acrescenta unicidade global
  entidade/ID: IDs de domínio são PKs identity globais por tabela, não UUIDs
  de operações offline. Isso impede duas histórias do mesmo recurso em tenants
  diferentes, inclusive em corrida entre INSERTs de versionamento.
- INSERT de versão não usa UPSERT para reviver tombstones. UPDATE somente
  incrementa uma versão ativa existente; ausência ou tombstone aborta a escrita.
- DELETE bloqueia a versão ativa, exige uma história única e marca tombstone.
  Em cascatas usa essa história, pois o ancestral pode já ter sido removido.
  Campanha valida adicionalmente OLD.id_ambiente. Não se apagam históricos.

## Concorrência e limites

E-mail global continua protegido por uq_usuario_email_normalizado. Cadastro,
emissão/aceite e alterações de e-mail usam pg_advisory_xact_lock compartilhado.
Aceite consulta FOR UPDATE e atualiza apenas convite pendente/não expirado,
na mesma transação do usuário, com índice global como última barreira.
Não foi criado índice parcial dependente de now()/clock_timestamp(): expiração
é dinâmica e não deve ser fingida como garantia de índice imutável.

Locks de autorização de usuário/ambiente/responsabilidade permanecem nos
serviços/repositórios existentes. Triggers relacionais não substituem autorização.
Não foram alterados contratos HTTP, parser BIGINT, frontend, app.js ou credenciais.
Os papéis continuam globais à instância e ACLs herdadas de PUBLIC em outros bancos
não foram inspecionadas nem modificadas.

Os testes desta etapa verificam composição, guardas e invariantes estruturais,
além das regressões simuladas dos serviços. **Não comprovam atomicidade real,
execução PLpgSQL, ordem de cascatas, locks, deadlocks ou isolamento PostgreSQL.**
Ainda é obrigatório executar instalação e testes reais A/B no banco novo após
aprovação, incluindo rollback por falha na 021/criação do papel, cascatas nas
cinco entidades versionadas, UPDATE sem versão, tentativa de reutilização de ID,
convites simultâneos, duplicidade de e-mail e revogação concorrente.

Hashes do README do PASSO 702 documentam o checkpoint anterior: 020/021 agora
foram revisadas e têm hashes diferentes. Não tratar aquela lista como manifesto
de aprovação destes arquivos novos. Não há migração autorizada de dados legados.
