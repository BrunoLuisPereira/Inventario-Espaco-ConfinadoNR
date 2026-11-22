# Prontidao operacional do primeiro deploy ? CD-241.62

Estado: preparacao local; CD permanece desabilitado. Nenhuma autorizacao de deploy.
Auditorias em 22/11/2026, somente leitura por SSM/GitHub; dados de usuarios,
credenciais e conteudo de filas nao foram coletados. Ensaio CD-241.61 nao repetido.

## Identidade imutavel e evidencias aprovadas

- Baseline: `315fe0539da1e7077ef8204e79274de12832af7a`; pacote local recomposto,
  verificavel, nao apresentado como arquivo comprimido original.
- Candidata: `cbe7ee2e3963474ac66c8c15de08eec630c0dafb`.
- `release.tar.gz` ensaiado: SHA-256
  `49bc03a335a23fb4bfdc1efcf3bf426845ce99630eea0fca1263e7a57b288d53`.
- Build-only GitHub `45014900734`, tentativa 1, artefato `14751069323`,
  `nr33-45014900734-1`, disponivel ate 24/11/2026 10:57:36 UTC.
  Digest do ZIP GitHub e diferente do digest do tar.gz interno; nao confundir.
- Ensaio real `cd24160-e503a04b6d1a`: restauracao real, 17/17, seis arquivos,
  quatro referencias, candidata saudavel e retorno real a baseline, sentinelas,
  esquema e uploads preservados, limpeza sem remanescentes.
- Os 108 arquivos de `backend/src` sao byte a byte identicos entre os pacotes.
  Mudancas no lockfile limitadas a patches de brace-expansion, sem troca do
  driver PostgreSQL. Frontend e seu marcador de release diferem.
  Nenhuma migration ou inicializacao de esquema no caminho server.js.
- Compatibilidade tecnica do esquema demonstrada para este par e snapshot;
  isso nao aprova mudancas posteriores ou dispensa o aceite do responsavel.

Evidencias locais ignoradas pelo Git: `laboratorio/cd-real/results/cd24149/`.
Relatorios principais: `host-operational-cd24162.json`,
`host-supplement-cd24162.json`, `writer-edges-cd24162.json`,
`cloud-schedules-cd24162.json`, `github-operational-cd24162.json`,
`technical-readiness-cd24162.json`, `executor-diff-cd24162.json`,
`evidence-cd24160-e503a04b6d1a/{restoration,rollback}.json`.
O manifesto `readiness-evidence-hashes-cd24162.json` sela os bytes efetivos.

## Inventario de escritores e retomada

| Componente | Evidencia | Parada/retomada proposta |
| --- | --- | --- |
| HTTP backend, login, sincronizacao, PDF e evidencias | Um Node, PID 151881 no snapshot, usuario ubuntu, cgroup nr33-backend.service; role nr33_hml_app com escrita em 16 relacoes | Maintenance HTTP 503, depois stop/start da mesma unit; nao usar PID fixo para comandos |
| Recuperacao de senha/SMTP e limpeza da fila SQL | EMAIL_TRANSPORT=external-smtp; iniciarWorker dentro de server.js; ciclo aguarda processarProximo e limpar; SIGTERM aguarda ciclo e encerra pool | Mesma parada do backend; nenhum worker independente a parar; ao iniciar a release, worker retoma automaticamente |
| Administracao PostgreSQL | Role postgres pode escrever; role nr33_cd_readonly nao pode escrever em nenhuma relacao | Operador declara ausencia de sessoes/comandos administrativos concorrentes durante a janela; nao parar PostgreSQL |
| Processos internos PostgreSQL | PostgreSQL 17 local, listen_addresses=localhost, HBA local/loopback; uma conexao app idle no snapshot | Manter servico ativo, autovacuum/WAL/checkpointer nao sao escritores de aplicacao a interromper |
| Backup agendado | nr33-postgresql-backup.service, usuario postgres, pg_dump, sem uploads ou parada do backend | Leitor do banco, escritor somente no destino de backup; nao parar cron ou timers globais |

Systemd services/timers/sockets/paths, crontabs de sistema/usuarios, PM2,
Supervisor, unidades de usuario e processos foram inspecionados. Sem Docker/at
na EC2, sem agendamentos de usuario/PM2/Supervisor, sem pg_cron/pgAgent/Redis
identificados. Associacoes SSM direcionadas a instancia, regras EventBridge e
agendamentos Scheduler na regiao: listas vazias. Nao extrapolar para qualquer
regiao/conta ou para comandos futuros de administradores. A declaracao operacional
de congelamento de escritores manuais/externos continua pendente.

Backend usa KillMode=control-group e TimeoutStopSec=90; executor aguarda 110 s.
SMTP externo tem DNS/conexao/greeting limitados a 5 s e socket a 10 s. Isso nao
certifica entrega SMTP nem evita todos os efeitos de falhas do provedor. Antes
de trocar a release, o executor exige unit inactive, PID 0, Result=success,
cgroup vazio e zero conexoes da role da aplicacao. Sem sucesso, abortar sem
ampliar permissoes, forcar parada ou continuar automaticamente.

## Esquema e persistencia

Fingerprint ao vivo, calculado com a identidade SQL usada pelo executor:
`62d810758dd2e499d5b8f6270117bf8fcd10af550deb9248590fc53ed42891d5`.
Nao usar o fingerprint do clone, cujos owners/ACLs e identidade foram mapeados,
nem o fingerprint calculado como superusuario. O contrato inclui visibilidade,
owners, ACLs e default ACLs. Revalidar antes da janela; divergencia bloqueia.

Os dois submounts da baseline estao presentes, rw,nosuid,nodev,noexec, mesmos
inodes das pastas persistentes; owner ubuntu, modo 0700. Caminhos administrativos
root protegidos e suporte Nginx a `/run/nr33/maintenance` conferidos.

Executor instalado difere nos bytes da fonte ensaiada: a fonte nova adiciona
somente o caminho opt-in de ensaio isolado. Todos os metodos Runtime, incluindo
restore(), sao identicos por AST. Comparacao da transacao com ensaio=False e
identica; hashes originais e diff preservados. Nao ha necessidade demonstrada
de atualizar o executor para este primeiro deploy. Nenhuma atualizacao realizada.

## Backup: tres propriedades diferentes

1. Integridade: hashes/tamanhos dos dois originais conferidos ao vivo por SSM,
   novamente pelo uploader do ensaio e pelo download de versoes exatas.
2. Restaurabilidade: comprovada para este conjunto exato pelo restore real,
   17 contagens, constraints, seis arquivos e quatro referencias.
3. Consistencia coordenada: NAO COMPROVADA. Nao existe prova suficiente de que
   todos os escritores foram drenados durante a captura conjunta banco/uploads.
   A rotina agendada observada faz somente pg_dump e nao certifica o conjunto
   manual aprovado. Referencias restauradas integras nao provam ausencia de
   operacoes concorrentes na captura. Responsavel pelos dados deve decidir se
   aceita esse conjunto/RPO/limite ou exige nova captura coordenada autorizada.

Captura: 22/11/2026 03:23:53 UTC. Limite de 24h: **23/11/2026 00:23:53 BRT**.
Uma nova captura seria outro conjunto: nao herda automaticamente restore_tested
ou os hashes deste conjunto. Nao fazer backup/restore novo nesta preparacao.
`backup-manifest-cd24162.json` e um manifesto local de evidencias criado agora,
nao um manifesto original encontrado na EC2.

## Correcao minima do workflow

Deploy passa a selecionar o artefato original por run/id; nao executa npm build
ou empacotamento nesse caminho. Origem, SHA, tentativa, workflow main e expiracao
sao verificados, e os bytes do pacote sao conferidos antes do OIDC e novamente
no controlador AWS/EC2. Ausencia/expiracao/divergencia aborta, sem rebuild como
fallback. O build-only permanece separado e nao concede aprovacao operacional.

A integracao do controle muda o HEAD da main. Por isso a release ensaiada pode
ser ancestral somente se a ancestralidade e as arvores completas backend,
frontend e shared forem identicas as da main do dispatch. A main e revalidada
apos a aprovacao; qualquer alteracao da aplicacao ou corrida do HEAD bloqueia.
CI exato da candidata, branch main, environment e comprovante continuam exigidos.

Variables existentes estao apenas no environment homologacao; a pre-validacao
sem environment nao podia le-las. Ela agora verifica origem/CI; a validacao das
Variables e feita no job protegido, apos a aprovacao do environment.

Alteracoes propostas, NAO aplicadas:
- Preservar as seis Variables existentes em homologacao: CD_ACCOUNT_ID,
  CD_ROLE_ARN, CD_ARTIFACT_BUCKET, CD_INSTANCE_ID, CD_SSM_DOCUMENT, CD_SSM_VERSION.
- Em homologacao: adicionar CD_READINESS_SHA256 do comprovante FINAL aprovado.
- No repositorio: CD_ENABLED=true somente na ativacao autorizada, pois o if do
  job precisa dessa flag antes de carregar o environment. Nao copiar todas as
  Variables para o repositorio nem criar chaves AWS.
- Instalar comprovante FINAL protegido em /etc/nr33/cd-readiness/<candidata>.json
  e mudar somente enabled=true em /etc/nr33/cd.json, quando autorizado.

## Janela e operacao supervisionada proposta

Reservar 30 minutos; inicio/fim devem ser explicitamente aprovados. O limite de
SSM e 20 minutos e o job tem 25 minutos. Nao prometer indisponibilidade fixa;
preparacao/npm precede manutencao. Nao parar PostgreSQL, Nginx ou servicos alheios.

1. Integrar a correcao somente do controle e conferir CI/Quality Gate. Confirmar
   codigo da aplicacao identico e artefato original ainda disponivel.
2. Responsavel pelos dados aceita o conjunto/RPO e compatibilidade; operador
   confirma inventario e ausencia de escritores manuais/externos; aprovar janela.
3. Emitir comprovante final com approved, maintenance_authorized e
   writers_inventory_complete verdadeiros SOMENTE apos essas declaracoes;
   validade <=4h e nunca alem da idade permitida do backup. Recalcular hash dos
   bytes finais, instalar protegido e configurar a Variable correspondente.
4. Com autorizacao especifica, ativar as duas barreiras durante a janela e
   disparar o workflow com `dispatch-first-deploy-cd24162.PROPOSED.json`.
5. Aprovador do environment revalida janela/evidencias; o job revalida main/CI,
   pacote, OIDC e infraestrutura. O executor prepara release sem migrations,
   ativa manutencao e drena todos os escritores da unit antes da troca.
6. Conferir HTTP/TLS, marker, PID/cwd, mounts, esquema e retomada do worker/fila.
   Em falha usar o rollback existente para baseline, sem restore do banco.
   Se rollback falhar, manter manutencao e registrar recuperacao manual.
   Estado SSM incerto nao autoriza reenviar. Sem limpeza de releases automatica.

## Responsaveis e autorizacoes pendentes

- BrunoLuisPereira: administrador confirmado do repositorio; deve autorizar
  alteracoes de host/Variables/ativacao, janela e primeiro deploy. Isso nao o
  identifica automaticamente como DBA ou responsavel pelo aceite de dados.
- Responsavel pelos dados/DBA e operador da janela: ainda precisam ser nomeados
  e registrar aceite de compatibilidade, RPO, limitacoes do backup e escritores.
- ramirespaes: revisor obrigatorio real do environment homologacao;
  prevent_self_review=true, somente main permitida. Nao modificar nem contornar
  essa protecao; se o dispatch for dele, nao presumir que pode autoaprovar.

Rascunho local `readiness-cd24162.DRAFT.json`: approved=false,
maintenance_authorized=false, writers_inventory_complete=false. rollback_tested
true refere-se ao ensaio real isolado; backup.restore_tested true refere-se aos
bytes exatos restaurados. Nao instalar ou usar o hash do rascunho como aprovacao.
Nenhuma mensagem foi enviada a revisores; nenhuma configuracao remota alterada.
