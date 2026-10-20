# Campanhas — auditoria e implementação do PASSO 615

Base: branch `feature/multi-tenant`, HEAD `eeb776b`, Git inicialmente limpo.

## Endpoints existentes

`app.js` monta `campanhaRoutes` em `/api/campanhas`. Há POST `/`, GET `/`,
GET `/:id`, PUT `/:id` e PATCH `/:id/status`. Não há DELETE montado nem
implementação de exclusão no repositório de campanhas. Nenhuma rota de exclusão
ou cascata foi criada. O router multi-tenant separado permanece sem montagem.

## Problemas encontrados

- O router legado utilizava JWT sem revalidar identidade, perfil e atividade.
- As leituras legadas eram globais. Administradores podiam alterar registros
  externos; engenheiros tinham verificações de responsabilidade sem ambiente.
- Os GETs multi-tenant existentes filtravam ambiente, mas não responsabilidade.
- UPDATEs legados autorizavam por leitura anterior, sem filtro na própria escrita.
- O SQL multi-tenant já verificava autorização, mas não mantinha usuário/ambiente
  bloqueados até o término da transação de escrita.
- Controllers aceitavam status sem validação estrita, registravam erros completos
  e podiam expor mensagens técnicas ou tentar responder após headersSent.

## Implementação

O router montado usa somente `autenticarMultiTenant`. O controller de compatibilidade
reutiliza os handlers multi-tenant; não existe um segundo fluxo de autenticação.
Leituras novas recebem a identidade validada e filtram no SQL por ambiente,
atividade e administrador do ambiente ou responsável pela campanha.

As consultas anteriores do repositório foram preservadas para compatibilidade
interna. O serviço de Campanhas usa exclusivamente as leituras novas e ativa o
modo transacional nas três escritas. Ordem de locks: ambiente -> solicitante ->
campanha. Criação bloqueia ambiente e solicitante, pois a campanha ainda não existe.
Cada fase revalida autorização; a própria escrita também contém filtros. Erros
fazem rollback, cliente é liberado e falha no rollback descarta a conexão.

`responsavel` é texto descritivo, não usuário-alvo. O vínculo de autorização é
`id_usuario`: na criação ele é o usuário autenticado; PUT não altera esse vínculo
nem `id_ambiente`. Administradores e engenheiros ativos podem criar campanhas
próprias, preservando a regra anterior; não foi criado fluxo de transferência.

Sucesso preservado: POST 201 e demais operações 200, mensagens existentes,
`status`, `data` e `total` nas listas. Mantidos os status EM ANDAMENTO, CONCLUIDO
e CANCELADA. A listagem não tinha paginação/filtros SQL públicos; filtros visuais
do frontend continuam sendo aplicados sobre a lista já autorizada. PUT continua
exigindo nome, empresa, responsável descritivo e data, sem inventar atualização parcial.

Erros controlados preservam status numérico inteiro válido; internos/5xx usam
mensagens genéricas. Logs do controller não contêm erros completos ou mensagens
técnicas. A autenticação compartilhada ainda possui log de erro completo na falha
da consulta de identidade: revisão transversal separada permanece recomendada.

## Testes e limites

- 75 testes integrados iniciais: 18 passaram, 57 falharam antes da correção.
- Conjunto final novo: 134 integrados e 48 de autorização SQL/transações.
- Testes anteriores do serviço foram adaptados para identidade nas leituras e
  opção transacional, mantendo casos, erros, chamadas estritas e normalizações.
- Suíte completa: 1.756 testes aprovados, nenhum ignorado. Preload existente
  inspecionado e usado em todos os processos, bloqueando banco, .env e uploads.
- HTTP efêmero dos testes somente em loopback; aplicação principal não iniciada.

Mocks não homologam locks, snapshots, deadlocks, triggers ou constraints reais.
A migração 020 prevê vínculo composto usuário/ambiente e imutabilidade de ambiente;
a 021 trata versionamento. Nenhuma migração foi executada. Os scripts de criação
base de Campanhas/Locais não constam entre os SQLs presentes na pasta database;
não se presumem tipos e ações de FK além das evidências disponíveis.

Locais, evidências, checklist, dados técnicos e relatórios dependem de campanhas.
Seus endpoints e consultas legadas não são protegidos automaticamente por esta
alteração e não foram modificados. Ids, ambiente e vínculos de campanhas existentes
não são transferidos nem apagados. Homologar também concorrência com sincronização
e versionamento, inclusive possíveis deadlocks com outras ordens de bloqueio.

Não houve acesso a banco real, arquivos de evidências ou .env, nem staging/commit/push.
