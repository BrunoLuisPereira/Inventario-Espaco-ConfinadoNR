# Locais — revisão integrada do PASSO 621

## Escopo e auditoria

HEAD de partida: `43a3a38`, branch `feature/multi-tenant`, árvore inicialmente limpa.
`app.js` monta `localRoutes` em `/api/locais`. Os endpoints existentes são:

| Método e caminho | Handler | Contrato de sucesso |
| --- | --- | --- |
| POST /api/locais | criar | 201, status/message/data |
| GET /api/locais | listar | 200, status/total/data |
| GET /api/locais/:id | buscarPorId | 200, status/data |
| PUT /api/locais/:id | atualizar | 200, status/message/data |
| PATCH /api/locais/:id/status | alterarStatus | 200, status/message/data |
| GET /api/locais/exportar | exportar | 200, XLSX |

Não existe DELETE montado. Não foi criado endpoint de exclusão, nem exclusão
em cascata ou física. Os SQLs existentes de checklist, dados técnicos, evidências
e relatórios declaram FKs para local com ON DELETE CASCADE; isso é uma
dependência a revisar se uma exclusão de local for proposta futuramente, não
uma autorização para excluir agora. Nenhuma regra de bloqueio de exclusão
inexistente foi inventada.

Riscos confirmados antes da correção:

- GETs JSON usavam leituras globais sem identidade nem ambiente (alto).
- POST, PUT e PATCH usavam identidade legada e administrador com autorização
  global, consultas por ID e escritas sem ambiente (alto).
- Verificação de responsabilidade anterior à escrita permitia uma janela de
  revogação; o UPDATE não incorporava autorização (alto).
- PUT apagava opcionais omitidos, incluindo coordenadas (médio).
- Controller devolvia mensagens internas de erros com status e registrava
  objetos de erro completos; não verificava headersSent (médio).
- Excel já isolava ambientes, mas exportava campanhas alheias do mesmo ambiente
  para engenheiros. A restrição por responsabilidade recebeu autorização
  explícita adicional nesta tarefa.

## Implementação

Uma única autenticação `autenticarMultiTenant` protege todas as rotas. O JWT
identifica o solicitante; usuário, perfil e ambiente atuais são reconsultados
pelo middleware existente. O controller encaminha `req.usuario` original.
O serviço valida identidade, UUID e IDs inteiros positivos seguros, e utiliza
somente o repositório multi-tenant para as operações JSON.

Leituras públicas usam `listarPermitidosNoAmbiente` e
`buscarPermitidoPorIdNoAmbiente`: local JOIN campanha, ambiente parametrizado,
EXISTS de usuário/ambiente ativos e administrador do ambiente ou responsável
pela campanha. Recursos externos, ausentes e sem autorização retornam o mesmo
404; uma listagem sem recursos permitidos retorna lista vazia.

As três escritas montadas exigem `{ bloquearAutorizacao: true }`. A transação
usa READ COMMITTED, bloqueia ambiente e solicitante com FOR SHARE, depois a
campanha com FOR UPDATE e, nas atualizações, o local com FOR UPDATE. Cada
consulta mantém autorização e ambiente. A campanha descoberta no primeiro
SELECT é fixada nos seguintes: troca concorrente de vínculo não redireciona
a autorização para outra campanha. O INSERT SELECT ou UPDATE também mantém
os filtros de autorização. Recusa termina com ROLLBACK antes da escrita.
Uma escrita inesperadamente vazia depois dos bloqueios é erro interno,
não um 404 ou conflito inventado. Falhas são propagadas, há rollback e release;
falha de rollback descarta o cliente. Falha de COMMIT tem resultado potencialmente
ambíguo no banco real e não recebe repetição automática.

O modo antigo do repositório sem a opção transacional permanece disponível
para compatibilidade interna e testes antigos; não é o modo usado pelos
endpoints montados. Consultas globais antigas de outros consumidores também
permanecem intactas e não constituem caminhos públicos alternativos neste router.

PUT mantém nome obrigatório. O serviço envia somente opcionais presentes;
CASE com flags no UPDATE preserva valores atuais das colunas omitidas, sem
reconstruí-los de uma leitura antiga. Null explícito limpa opcionais; zero
é preservado. Campanha, ambiente, identidade e status não fazem parte do SET
do PUT. Status continua ATIVO/INATIVO pelo PATCH. Valores explicitamente
enviados ainda podem substituir alterações anteriores no mesmo campo;
não foi introduzido versionamento otimista novo para Locais.

Controller preserva envelopes/mensagens de sucesso, valida status inteiro
400–599 sem coerção, oculta mensagens 5xx, usa logs fixos/status validado e
verifica headersSent antes e depois das operações assíncronas e no catch.

## Excel e compatibilidade

Os dois caminhos existentes de Excel agora passam identidade ao repositório
de exportação. A consulta exige ambiente, atividade e administrador ou
responsabilidade diretamente no SQL. A assinatura interna
`listarParaExportacaoPorAmbiente(idAmbiente, usuarioAutenticado)` exige o
segundo argumento, impedindo exportação contextual sem identidade. LEFT JOIN
de evidências continua incluindo locais autorizados sem fotos.

Preservados: 12 colunas, ordem, títulos, formatos numéricos, coordenadas zero,
numeração das fotos, cabeçalho/filtro/congelamento, XLSX válido, Content-Type,
Content-Length e download `inventario-locais.xlsx`. Engenheiros agora recebem
apenas campanhas próprias; administradores continuam vendo todo o ambiente.

`frontend/src/components/locais/LocalForm.jsx` envia nome e opcionais explícitos
e usa os mesmos endpoints de `frontend/src/services/api.js`; esses arquivos
não foram alterados. Reenvios antigos com IDs inseguros, identidade sem ambiente
ou campanha não autorizada passam a ser recusados. HTTP 403 de acesso ao local
legado passa a 404 indistinguível. Ausência/invalidade de campanha na criação
usa a mensagem de validação do serviço multi-tenant. Não há migração de dados.
O serviço legado de sincronização e outros consumidores de localRepository
não foram alterados, nem foi declarada proteção completa desses outros módulos.

## Testes e limitações

Arquivos de produção modificados (todos de Locais/exportação de Locais):

- `backend/src/routes/localRoutes.js`
- `backend/src/controllers/localController.js`
- `backend/src/services/localMultiTenantService.js`
- `backend/src/repositories/localMultiTenantRepository.js`
- `backend/src/repositories/localRepository.js` (somente exportação contextual)
- `backend/src/services/excelService.js`

Testes existentes adaptados: `localMultiTenantService.test.js`,
`localMultiTenantRepository.test.js`, `localExportacaoIsolamentoSeguranca.test.js`.
Arquivos criados: `localIsolamentoIntegrado.test.js`,
`localAutorizacaoTransacional.test.js` e este relatório.

Primeira execução, antes das correções de produção: 82 testes integrados,
20 aprovados e 62 falhas. Esse conjunto inclui expectativas do novo contrato
transacional; os totais não representam 62 vulnerabilidades independentes.
A cobertura integrada foi posteriormente ampliada, além dos testes SQL,
transacionais e de conteúdo XLSX. Nenhum teste anterior foi removido ou ignorado.
Mocks de assinatura e parâmetros foram adaptados para exigir as novas
verificações, preservando cenários e asserções de segurança.

O preload existente bloqueia PostgreSQL, dotenv/.env e uploads reais em todos
os processos. XLSX é gerado e reaberto em memória; JWT e banco são simulados.
Não foi iniciado o servidor da aplicação. A suíte completa precisou de
autorização específica após spawn EPERM no sandbox.

Resultado final: **1.948/1.948 testes aprovados**, sem falhas, cancelamentos
ou testes ignorados. Foram adicionados **192 testes**: 113 em
`localIsolamentoIntegrado.test.js`, 69 em `localAutorizacaoTransacional.test.js`
e 10 no arquivo existente `localExportacaoIsolamentoSeguranca.test.js`
(que passou de 32 para 42). Os testes antigos de serviço/repositório foram
compatibilizados com os argumentos de autorização e flags de atualização,
mantendo os 25 e 22 testes, respectivamente. A suíte completa inclui as
regressões anteriores de Campanhas, Evidências e demais módulos.

Homologação pendente: existência/tipos de campanha.id_ambiente e demais colunas,
FKs, índices, triggers/versionamento, planos e custo das consultas, locks reais,
READ COMMITTED/EvalPlanQual, deadlocks com outros módulos e comportamento de
COMMIT ambíguo. Bloqueio exclusivo de campanha serializa conservadoramente
escritas de seus locais; medir contenção em homologação. Leituras/Excel usam
autorização no snapshot SQL, sem garantir cancelamento de resposta após uma
revogação posterior ao SELECT. Dados legados sem vínculo válido ficam
inacessíveis, preservados fisicamente; regularização exige decisão separada.

O middleware compartilhado de autenticação mantém seu tratamento/logs atuais,
incluindo registro de erro técnico na falha de consulta da identidade. Revisão
desse middleware fica fora do módulo de Locais e não foi feita silenciosamente.
Testes simulados não comprovam segurança ou compatibilidade de PostgreSQL real.

Não foram modificados app.js, outros módulos, frontend ou arquivos físicos.
Não houve banco real, migrações, staging, commit, push ou merge.
