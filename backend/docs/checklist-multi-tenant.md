# Checklist NR-33 — PASSO 627

## Escopo auditado e endpoints

Branch de partida: `feature/multi-tenant`, HEAD `e9c10d8`, árvore limpa.
`app.js` monta `checklistRoutes` em `/api/checklists`. Não foi modificado.

| Método e endpoint | Handler | Sucesso preservado |
| --- | --- | --- |
| POST /api/checklists | criar | 201, `{ status, data }` |
| GET /api/checklists | listar | 200, `{ status, total, data }` |
| GET /api/checklists/:id | buscarPorId | 200, `{ status, data }` |
| PUT /api/checklists/:id | atualizar | 200, `{ status, message, data }` |
| PATCH /api/checklists/:id/status | alterarStatus | 200, `{ status, message, data }` |

Não há DELETE montado, operação de exclusão no serviço/repositório, rota por
local nem endpoint separado de conclusão. Conclusão continua sendo o PATCH
de status, que também aceita PENDENTE. Não foram criadas operações adicionais,
regras de irreversibilidade, bloqueio de edição após conclusão ou cascatas.

## Riscos confirmados na auditoria

| Risco anterior | Gravidade | Evidência no fluxo legado |
| --- | --- | --- |
| JWT sem revalidação de usuário/ambiente/perfil | Alta | checklistRoutes usava autenticar |
| Listagem e busca global de checklists | Alta | checklistController não passava identidade nos GETs; checklistService usava listarTodos/buscarPorId |
| Administrador com permissão global por ID de local/checklist | Alta | checklistService autorizava administrador sem ambiente; checklistRepository não filtrava ambiente |
| Revogação entre a verificação e a escrita | Alta | leituras anteriores e UPDATE global sem autorização no SQL |
| Restauração de respostas antigas em PUT parcial | Média | serviço legado mesclava respostas atuais e omitidas antes do UPDATE completo |
| Sucesso enviado após resposta já iniciada | Média | controller não verificava headersSent antes/depois dos awaits |

O controller legado já delegava erros a `next`; não se atribuiu a ele um
vazamento direto por `error.message`. O tratamento global seguro já existente
foi preservado, sem substituí-lo pelo controller multi-tenant separado.

## Correções implementadas

O router existente usa uma única `autenticarMultiTenant` para os cinco endpoints.
Esse middleware valida JWT e reconsulta a identidade atual no repositório de
usuários. O controller encaminha a referência original de `req.usuario` ao
serviço, inclusive nos GETs; body/query/params não definem ambiente ou perfil.

O serviço multi-tenant valida identidade, UUID e IDs positivos seguros.
As novas leituras `listarPermitidosNoAmbiente` e
`buscarPermitidoPorIdNoAmbiente` exigem no SQL:

- checklist → local → campanha → ambiente autenticado;
- solicitante do mesmo ambiente, usuário e ambiente ativos;
- administrador do próprio ambiente ou responsável pela campanha;
- criador pertencente ao ambiente para incluir seu nome na resposta.

Não há autorização automática para o criador. Listagem usa parâmetros
`[id_ambiente, id_usuario]`; busca individual usa
`[id_checklist, id_ambiente, id_usuario]`. Não há filtragem de consulta global
em memória nem recuperação global alternativa na cadeia montada.

As três escritas do serviço passam `{ bloquearAutorizacao: true }`. A opção
é interna e não é extraída de dados do cliente. Transação READ COMMITTED:

1. BEGIN.
2. Bloquear ambiente e usuário solicitante com FOR SHARE.
3. Bloquear campanha, local e, nas atualizações, checklist com FOR UPDATE.
4. Aplicar INSERT SELECT ou UPDATE também condicionado à autorização SQL.
5. COMMIT e release; recusa anterior à escrita termina com ROLLBACK.

Os IDs da campanha e do local descobertos na primeira consulta são fixados
como parâmetros nas consultas seguintes. Troca de vínculo antes dos bloqueios
não redireciona a operação para um novo pai. A autorização permanece protegida
pelos locks até o fim da transação. Escrita inesperadamente vazia após bloqueios
é erro interno, não 404 ou conflito de concorrência inventado. Falhas técnicas
são propagadas; falha de rollback descarta a conexão, mantendo o erro original.
Não há repetição automática após falha de COMMIT de resultado ambíguo.

As assinaturas antigas das escritas no repositório continuam aceitando chamadas
sem opção para compatibilidade interna. Esse modo mantém os filtros SQL, mas
não fornece os bloqueios adicionais. Todos os cinco endpoints montados usam
o serviço atualizado, que exige o modo transacional nas escritas.
Consultas antigas e componentes legados usados por outros consumidores não
foram alterados; isso não declara isolamento completo desses outros módulos.

## Regras e contratos preservados

Sete respostas: criterio_a, criterio_b, criterio_c, acesso_controlado,
ventilacao_adequada, monitoramento_atmosferico e procedimento_emergencia.
Cada uma aceita SIM/NAO; as sete são obrigatórias no POST. Não foi inventada
exclusividade entre critérios, classificação automática ou proibição de todos
os critérios NAO. Estados continuam PENDENTE/CONCLUIDO, com PENDENTE padrão.

PUT permite preenchimento parcial, inclusive corpo vazio. Omitido ou null
preserva a resposta atual e observações; observação `""` limpa para NULL;
espaços são preservados. COALESCE e CASE operam sobre o valor da coluna no
UPDATE, sem reconstrução do SET a partir de uma leitura anterior. Campos
explicitamente enviados ainda seguem a semântica de última escrita;
não foi criado novo controle otimista de versão. PUT não altera id_local,
id_usuario, ambiente ou status. O criador vem da autenticação no POST.

Mantidos envelopes, total, mensagens de sucesso de atualização/status e
conflito 409 `Este local já possui um checklist NR-33.`. A duplicidade é
reconhecida somente pelos metadados específicos já aceitos pelo repositório;
outros 23505 são propagados. O middleware global existente pode mapear esses
outros 23505 para seu 409 genérico, sem afirmar que são duplicidade por local.
Usuário/ambiente inativo ou JWT inválido retorna 401; recursos externos,
inexistentes ou não autorizados recebem 404 indistinguível. Falhas internas
chegam ao tratamento global e recebem mensagem pública genérica.

O controller verifica headersSent na entrada e após cada await. Erros,
inclusive falha de JSON depois de começar o envio, continuam delegados uma
única vez a `next`; o middleware global existente evita outro JSON quando
headersSent já é verdadeiro. Não foram acrescentados logs sensíveis.

O frontend ChecklistLocal.jsx utiliza os mesmos campos, respostas SIM/NAO,
status e envelopes; não foi alterado. Reenvios offline sem ambiente válido,
com ID inseguro ou recurso não autorizado passam a ser recusados. POST repetido
para local autorizado continua sendo conflito 409, não recuperação idempotente.
Status vazio/null explícito, tolerado como padrão pelo serviço legado, é
rejeitado pelo serviço multi-tenant existente; o frontend inspecionado envia
status válido. Não foram alteradas respostas históricas nem o campo legado
identificacao_espaco. Vínculos históricos inconsistentes ficam preservados,
mas podem ficar inacessíveis até regularização autorizada.

## Arquivos e testes

Produção modificada exclusivamente dentro de Checklist:

- backend/src/routes/checklistRoutes.js
- backend/src/controllers/checklistController.js
- backend/src/services/checklistMultiTenantService.js
- backend/src/repositories/checklistMultiTenantRepository.js

Teste existente adaptado: checklistMultiTenantService.test.js, preservando
seus 27 testes e asserções, atualizando chamadas de leitura contextual e a
exigência de opção transacional. Não foram modificados outros testes antigos.

Criados: checklistIsolamentoIntegrado.test.js (132 testes),
checklistAutorizacaoTransacional.test.js (81 testes) e este relatório.
Total: **213 testes novos**. Os primeiros 114 testes integrados, antes da
correção, tiveram **45 aprovações e 69 falhas** na execução válida sem erros
assíncronos do simulador. Houve uma execução preliminar com erro no adaptador
de transporte do próprio teste; ela não foi usada como contagem de segurança.
A cobertura foi ampliada depois, incluindo duplicidade contextual e vínculos
independentes entre checklist, local e campanha. Os totais de falhas não são
contagem de vulnerabilidades independentes nem distribuição comprovada por causa.

Resultado final: **2.161/2.161 testes aprovados**, nenhum ignorado, cancelado
ou com falha. A suíte completa inclui as regressões de Locais, Campanhas,
Evidências, sincronização e demais módulos anteriores.
O preload existente foi inspecionado e usado em todos os processos, bloqueando
PostgreSQL, dotenv/.env e uploads reais. SQL, JWT e transações são simulados;
consultas desconhecidas falham explicitamente. Não foi iniciado servidor da
aplicação. A execução completa fora do sandbox recebeu solicitação específica
para o comando integral após spawn EPERM.

## Pendências de homologação e escopo

Nenhuma migração ou mudança de esquema foi feita. O código depende dos critérios
da migração 018, campanha.id_ambiente do modelo multi-tenant e versionamento
previsto em 021. As migrações foram apenas consultadas; aplicação real e estado
do banco não foram verificados. Homologar tipos, constraints, nome do UNIQUE
de id_local, FKs, triggers de versão, READ COMMITTED/EvalPlanQual, concorrência
com outros módulos, deadlocks, custo e contenção dos locks. Bloqueio exclusivo
de campanha serializa conservadoramente escritas dos filhos e deve ser medido.

Leituras autorizam no snapshot SQL; revogação posterior não cancela bytes já
entregues. Mocks não comprovam execução, durabilidade ou bloqueios PostgreSQL.
O middleware compartilhado de autenticação mantém seu tratamento/logs atuais,
incluindo objeto técnico na falha de consulta da identidade; revisão desse
componente e dos demais endpoints fora de Checklist exige autorização separada.
Não foram alterados relatórios, sincronização offline ou políticas de negócio.

Não há decisão adicional bloqueando estas alterações. Regularização de vínculos,
mudança de respostas históricas ou mudança funcional incompatível precisa de
autorização futura. Nenhum arquivo físico foi acessado e nenhum dado real foi
modificado. app.js, frontend e módulos anteriores permanecem intactos.
Sem staging, commit, push ou merge; revisão necessária antes de commit.
