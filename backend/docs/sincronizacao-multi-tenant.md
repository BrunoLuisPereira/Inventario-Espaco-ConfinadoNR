# PASSO 645 — Sincronização offline multi-tenant

Base auditada: `feature/multi-tenant`, HEAD `06a0f66`, árvore inicialmente limpa;
suíte informada anterior 2.694/2.694. Implementação local para revisão, sem staging,
commit, push, migrações ou acesso a banco/arquivos reais. `app.js` inalterado.

## 1. Fluxos realmente existentes

`src/app.js:157` monta `/api/sincronizacoes`. Existem dez endpoints, todos agora
sob uma única aplicação do middleware existente `autenticarMultiTenant`:

| Método/caminho relativo | Controller | Serviço | Sucesso preservado |
| --- | --- | --- | --- |
| POST / | criar | criarSincronizacao | 201; 409 se registro CONFLITO |
| GET / | listar | listarSincronizacoes | 200, total/data |
| GET /pendentes | buscarPendentes | buscarPendentes | 200, total/data |
| GET /conflitos | buscarConflitos | buscarConflitos | 200, total/data |
| GET /entidade/:entidade/:idEntidade | buscarPorEntidade | buscarPorEntidade | 200, total/data |
| PATCH /:id/resolver | resolverConflito | resolverConflito | 200 |
| POST /:id/processar | processarSincronizacao | processarSincronizacao | 200; 409 se CONFLITO |
| PATCH /:id/status | atualizarStatus | atualizarStatus | 200 nas transições permitidas |
| GET /:id | buscarPorId | buscarSincronizacaoPorId | 200 |
| DELETE /:id | excluir | excluirSincronizacao | 200 para registro não aplicado autorizado |

O POST registra a operação; não aplica a entidade. `PENDENTE` não é confirmação
de aplicação. O POST /:id/processar executa uma operação individual. Não existe
endpoint de lote nem atomicidade entre várias requisições. Não foi criado nenhum.

As operações existentes são CRIAR, ATUALIZAR e EXCLUIR; as entidades efetivamente
aplicáveis são CAMPANHA, LOCAL, CHECKLIST_NR33 e DADOS_TECNICOS. EVIDENCIA é um nome
aceito no protocolo da fila, mas seu processamento/resolução não estava implementado
e continua recusado com 400, sem INSERT/UPDATE/DELETE da evidência ou arquivo.
Os endpoints diretos de evidências já protegidos não foram modificados.

Existem dados_cliente/dados_servidor, versao_cliente/versao_servidor, UUID de
operação e UUID de registro cliente; relacionamentos temporários usam
id_campanha_cliente/id_local_cliente. A versão oficial e os tombstones são
mantidos por triggers, não incrementados artificialmente pelo serviço.

Frontend: leitura de src, public, vite.config.js, package.json e api.js não
identificou IndexedDB, service worker, outbox, chamadas /sincronizacoes ou fila
offline implementada. api.js usa fetch e token em localStorage. Isso não prova
ausência de clientes antigos/externos. Nenhum código frontend foi alterado,
nenhuma fila foi apagada e nenhum mecanismo PWA novo foi inventado.

## 2. Vulnerabilidades e incompatibilidades auditadas

| Risco | Evidência anterior | Gravidade |
| --- | --- | --- |
| JWT sem revalidação de usuário/ambiente e perfil atual | Router anteriormente usava autenticar | Alta |
| Administrador global na consulta de filas/snapshots | sincronizacaoService.js:527, :639, :663; sincronizacaoRepository.js:85, :204, :224 | Alta |
| Recuperação global por UUID sem comparar operação/payload/contexto | sincronizacaoService.js:297 a :322; sincronizacaoRepository.js:62 | Alta |
| Propriedade da fila confundida com permissão sobre recurso; resolução/exclusão sem ambiente | sincronizacaoService.js:806, :945; sincronizacaoAplicacaoRepository.js:429, :2163, :2468 | Alta |
| Mapeamento de UUID de pai global, sem origem autenticada/ambiente | sincronizacaoAplicacaoRepository.js:210, :999, :1464 | Alta |
| Conclusão manual e adulteração de versão/snapshot | sincronizacaoService.js:687 a :748 | Alta, integridade |
| CLIENTE/MESCLADO podia sobrescrever versão posterior ao conflito | resolvers legados de LOCAL/CAMPANHA/CHECKLIST/DADOS_TECNICOS | Alta |
| Remoção do comprovante aplicado liberava chaves para nova criação | sincronizacaoRepository.js:304 | Alta, integridade |
| Remoção física após COMMIT, com possibilidade de erro tardio e referência ambígua | sincronizacaoAplicacaoRepository.js:2450, :3138 | Alta |
| Rollback podia substituir erro original; liberação sem descarte em rollback falho | catch/finally dos resolvers/processamento legados | Média |
| IDs sem inteiro seguro, respostas sem headersSent e checklist antigo incompatível com critérios obrigatórios | validadores legados; controller; migração 018 | Média |

A correção do PASSO 515 protegia ATUALIZAR nas quatro entidades por responsabilidade,
mas ainda não verificava ambiente e não cobria todos os caminhos de criação,
exclusão e resolução. Não foi considerada proteção multi-tenant completa.

Incompatibilidade estrutural confirmada por leitura: INSERTs legados de
sincronização/campanha omitiram id_ambiente, obrigatório no esquema 020. O fluxo
novo utiliza as colunas do esquema multi-tenant existente. Não se presume que
essas migrações estejam instaladas ou homologadas no banco real.

## 3. Correções implementadas

- Router existente passa a autenticarMultiTenant; sem dupla autenticação ou
  alteração de app.js. O middleware busca identidade atual; perfil/ambiente do
  dispositivo não autorizam operações.
- Controller mantém nomes, argumentos, mensagens de sucesso e envelopes. Encaminha
  a referência de req.usuario ao novo serviço. Verifica headersSent na entrada e
  depois do await; erros seguem ao tratamento global existente, sem responder duas vezes.
- Serviço/repositório específicos de sincronização multi-tenant; o caminho montado
  não usa repositórios globais, serviços legados ou serviços de outros módulos.
- SQL parametrizado por ambiente e usuário, com papel atual consultado no banco.
  Administrador acessa somente filas do próprio ambiente; engenheiro acessa sua
  fila e precisa continuar responsável pela campanha da entidade.
- Leituras de snapshots verificam novamente recurso/campanha/ambiente. Perda de
  responsabilidade impede ler dados_servidor históricos. Ausente, externo ou
  não autorizado produzem o mesmo 404 na consulta individual.
- Escritas começam com BEGIN READ COMMITTED, SHARE em ambiente/usuário e revalidação
  de atividade/perfil. Bloqueiam fila e os pais/recurso autorizados na ordem campanha
  → local → entidade, fixando seus IDs entre consultas; depois bloqueiam versão.
  SQL da escrita também contém autorização. Locks permanecem até COMMIT/ROLLBACK.
- INSERT SELECT das entidades, listas explícitas de campos e IDs oficiais gerados
  pelo servidor. UPDATE parcial nunca altera ambiente, autor ou vínculo da entidade.
  Valores omitidos não são reconstruídos a partir de snapshot anterior.
- Status válidos, números finitos, IDs seguros, UUIDs e limite INTEGER da versão
  são validados. Latitude/longitude zero e precisão textual de números enviados
  como string são preservados. Metadados GPS de evidências não são aplicados pela fila.
- Origem de um registro pai temporário: mesmo ambiente e autor original da operação;
  seu ID oficial só é utilizado após SINCRONIZADO e nova autorização do recurso.
  Um administrador pode processar fila de engenheiro do próprio ambiente sem
  assumir autoria/responsabilidade nem usar mapeamento de outro usuário.
- Falha técnica não vira ausência/permissão. UPDATE/finalização inesperadamente
  vazios geram erro interno e rollback. Falha de rollback descarta o cliente e
  preserva o erro original. Falha ao obter conexão não inventa release.
- O fluxo novo não importa filesystem/utilitários de remoção. Exclusões de entidade
  preservam o comportamento relacional/cascatas já existente no esquema, mas não
  apagam fotografias/PDFs. Não houve execução dessas exclusões em dados reais.

O serviço/repositórios antigos permanecem intactos, disponíveis apenas internamente;
não são usados pelo Router montado. Seus 41 testes anteriores foram preservados
sem alterações. Não se deve reutilizar os módulos antigos em novos caminhos HTTP.

## 4. Idempotência e retry

O índice existente 020 usa (id_ambiente, id_operacao_cliente), e a chave de registro
CRIAR usa (id_ambiente, entidade, id_registro_cliente). Não foi alterado o esquema.
A recuperação acrescenta o autor original: possuir a mesma chave como administrador
não permite assumir operação de outro usuário.

Uma repetição exige entidade, operação, recurso (ou UUID de registro na criação),
versão cliente, UUIDs e payload equivalentes. A comparação JSON ignora somente a
ordem das propriedades, preservando diferenças de conteúdo/tipo. Campo extra no
payload ou alteração de conteúdo pode causar 409 mesmo que pareça irrelevante ao
cliente; reenvios devem preservar a operação original. Metadados forjados do envelope
não definem identidade. IDs cliente na operação CRIAR não substituem o ID gerado.

Só os dois índices nomeados de sincronização são tratados como colisão idempotente.
SAVEPOINT permite recuperar após 23505 sem consultar uma transação abortada.
A recuperação continua limitada ao ambiente/autor/recurso e revalida permissão.
Colisão sem repetição autorizada resulta em 409 genérico, sem dados externos;
outras constraints e falhas técnicas propagam. O tratamento global já existente
continua responsável pelas respostas públicas dos demais erros PostgreSQL.

Sem UUID de operação, CRIAR pode recuperar pelo UUID do registro com o mesmo
contexto e payload; ATUALIZAR/EXCLUIR sem chave não recebem garantia idempotente
inventada. Após um COMMIT cuja resposta se perdeu, repetir o POST com a mesma
chave recupera o registro persistido. Reprocessar registro já SINCRONIZADO continua
409, conforme contrato anterior; GET/POST contextual permitem conhecer seu estado.

Não há garantia de exactly-once. Erros de conexão no COMMIT podem deixar seu resultado
incerto. Cliente deve consultar/reenviar a mesma chave, sem criar nova operação.

## 5. Decisões expressamente autorizadas neste passo

1. PATCH /:id/status não pode declarar SINCRONIZADO manualmente: retorna 409.
   Versão/snapshot/data de aplicação do corpo não substituem o estado do servidor.
   Operação concluída não pode ser reaberta por status, evitando aplicação repetida.
2. Resolução CLIENTE/MESCLADO compara a versão atual bloqueada com versao_servidor
   registrada no conflito. Se mudou, retorna 409 sem escrita da entidade.
   SERVIDOR usa estado atual. Nenhum campo obrigatório novo foi adicionado ao protocolo.
3. Payload legado de checklist com identificacao_espaco A/B/C é convertido conforme
   a regra da migração 018: critério indicado SIM, outros NAO. Critérios explícitos
   são preservados. Nenhuma migração ou alteração de registro antigo foi executada.
4. DELETE de sincronização já SINCRONIZADO retorna 409, preservando o comprovante
   e as chaves de idempotência. Exclusão autorizada de registro pendente continua.

Mantidos os estados PENDENTE, CONFLITO, SINCRONIZADO e ERRO; nenhuma resolução
automática ou política de mesclagem nova. EXCLUIR continua recusando MESCLADO.
Versões divergentes geram CONFLITO e snapshot autorizado sem aplicar a entidade;
versões iguais não dispensam autorização. Snapshot/versão são lidos sob os locks.

Para conflito que mudou novamente, nenhuma atualização silenciosa do snapshot foi
inventada. O cliente pode ler o estado atual e optar por SERVIDOR; uma experiência
de rebase/renovação da decisão requer definição de protocolo/frontend posterior.

## 6. Dependências, exclusões e limites

A sequência campanha → local → checklist é enfileirável. Processar filho antes
de o pai estar aplicado retorna 409, mantendo-o PENDENTE; retry após aplicação do
pai usa seu ID oficial. Mudança/revogação do pai é revalidada antes da escrita.
Operações em requisições separadas são independentes: falha de uma não marca
outras como concluídas. Os testes sequenciais não são prova de lote atômico.

Tombstones contêm ambiente/entidade/ID/versão, mas não a ancestralidade necessária
para comprovar responsabilidade atual de engenheiro depois da exclusão. O fluxo
novo não inventa essa autorização: retorna 404 para engenheiro quando o recurso
já não permite conferir vínculo. Administrador ativo do ambiente pode confirmar
EXCLUIR já consumado por tombstone contextual. A política para replay por engenheiro
nessa situação exige decisão futura e, possivelmente, retenção de ancestralidade;
não houve migração, recuperação global ou restauração de registros.

Recursos revogados podem tornar registros antigos/snapshots invisíveis, sem removê-los.
Clientes antigos que dependiam de consultas globais, criação sem ambiente, status
manual de conclusão, metadados oficiais forjados, exclusão do comprovante, resolução
desatualizada ou UUID de pai compartilhado entre usuários precisarão tratar os
401/404/409. Payloads válidos e autorizados mantêm os envelopes públicos existentes.

## 7. Testes e validação

| Arquivo novo | Quantidade | Resultado isolado |
| --- | ---: | --- |
| sincronizacaoAutenticacaoMultiTenant.test.js | 24 | 24 aprovados |
| sincronizacaoMultiTenantSeguranca.test.js | 162 | 162 aprovados |
| sincronizacaoControllerMultiTenant.test.js | 102 | 102 aprovados |
| Total adicionado | 288 | 288 aprovados |

Antes de alterar Router/controller, o primeiro arquivo foi executado contra o
roteamento legado: **4 aprovados e 20 falhas** de revalidação/identidade. Após
a correção: 24/24. Os demais testes foram construídos durante a implementação,
sem inventar contagem de falhas prévias para seus cenários.

Os testes exercitam Router e middleware reais (controller simulado), Controller
real (serviço simulado) e Serviço/Repositório reais com SQL interceptado. Verificam
argumentos/referências, envelopes, headersSent, A/B, autor original, snapshots,
chaves/payloads diferentes, ordem de locks, SQL parametrizado, campos imutáveis,
dependências temporárias, critérios antigos, GPS zero, dois dispositivos,
revogação, savepoints, rollback, resultado vazio e COMMIT com resposta perdida.

O simulador rejeita SQL/dependências desconhecidos e registra tentativas de escrita;
mudanças só são publicadas no COMMIT, salvo cenário explícito de COMMIT aplicado
com resposta perdida. Uma fixture foi corrigida para representar revogação externa
antes da aquisição do lock em READ COMMITTED, sem simular mudança atravessando um
lock já adquirido. Não foram enfraquecidas expectativas de segurança.

O preload existente foi inspecionado e utilizado sem alteração: bloqueia PostgreSQL
real, dotenv/.env, uploads e caminhos PDF reais. NODE_OPTIONS o propaga aos workers.
Os testes novos não abrem porta; HTTP efêmero da suíte existente permanece permitido
em loopback. A primeira tentativa de suíte no sandbox retornou spawn EPERM; o
comando completo foi submetido à autorização e executado fora do sandbox com o
mesmo preload. Não foi iniciado servidor de aplicação.

**Resultado final: 2.982 testes executados, 2.982 aprovados, zero falhas/skips.**
Suíte intermediária: 2.871/2.871. Todos os 2.694 testes anteriores foram preservados.

## 8. Homologação e riscos residuais

- Validar esquema real 008–014, 017–018 e 020–021, índices compostos, constraints,
  triggers, incremento de versões e tombstones. Nenhuma consulta real foi feita.
- Validar SQL com PostgreSQL, casts, planos, ACLs, isolamento, waits/deadlocks,
  bloqueios entre módulos, falhas de rede e COMMIT incerto. Mocks não provam MVCC,
  concorrência real, durabilidade ou exactly-once.
- O processamento segura locks de identidade/contexto/fila/versão até COMMIT.
  Operações cruzadas, FKs e cascatas podem causar contenção/deadlock; deve haver
  política de retry da mesma operação no cliente, sem esconder erro técnico.
- Não há lote HTTP, outbox/frontend, protocolo de rebase ou processamento offline
  de EVIDENCIA. Implementá-los requer autorização separada; não foram anunciados
  como funcionalidades concluídas.
- Limites de fila, tamanho/quantidade de payload, retenção/arquivamento dos
  comprovantes e experiência de conflito precisam de política futura; não foi
  adicionada limpeza automática ou exclusão de filas antigas.
- A origem de arquivos físicos não é resolvida pela sincronização: arquivos são
  preservados, sem leitura ou remoção. Reconciliação/orfandade continuam separadas.
- O middleware compartilhado ainda possui log do objeto de erro de consulta;
  foi reutilizado sem alterar módulos concluídos. A resposta pública é genérica,
  mas a sanitização desse log continua pendente em revisão própria.
- Módulos legados internos continuam inseguros para futuro uso direto: o isolamento
  descrito é da cadeia efetivamente montada, não uma certificação de todo consumidor
  hipotético ou de dados históricos já gravados.

## 9. Arquivos e estado final

Modificados somente:

- `src/routes/sincronizacaoRoutes.js`.
- `src/controllers/sincronizacaoController.js`.

Criados:

- `src/services/sincronizacaoMultiTenantService.js`.
- `src/repositories/sincronizacaoMultiTenantRepository.js`.
- Os três arquivos de testes da tabela.
- `docs/sincronizacao-multi-tenant.md`.

Nenhum teste anterior, módulo concluído, frontend, app.js, arquivo físico ou
migração foi alterado. Sem staging, commit, push ou merge. Pronto para revisão
do diff e dos testes; homologação real permanece obrigatória antes de implantação.
