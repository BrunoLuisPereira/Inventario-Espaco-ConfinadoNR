# Dados Técnicos — implementação integrada do PASSO 633

## Estado e endpoints auditados

Branch de partida `feature/multi-tenant`, HEAD `5b96810`, árvore inicialmente
limpa. `app.js` monta `dadosTecnicosRoutes` em `/api/dados-tecnicos`.

| Método e caminho relativo | Handler | Contrato de sucesso preservado |
| --- | --- | --- |
| POST / | criar | 201, status/message/data |
| GET / | listar | 200, status/total/data |
| GET /local/:idLocal | buscarPorLocal | 200, status/data |
| GET /:id | buscarPorId | 200, status/data |
| PUT /:id | atualizar | 200, status/message/data |
| DELETE /:id | excluir | 200, status/message/data do registro excluído |

Não existe PATCH ou endpoint separado de conclusão. Status é editado pelo PUT,
conforme o legado. O DELETE já existia: foi protegido, não introduzido.
A rota por local continua antes de /:id. Nenhum router adicional foi montado.

## Auditoria e riscos anteriores

| Risco confirmado | Gravidade | Evidência no fluxo legado |
| --- | --- | --- |
| JWT sem revalidar atividade/perfil/ambiente | Alta | dadosTecnicosRoutes usava autenticar |
| Listagem, busca por ID e busca por local globais | Alta | controller omitia identidade; serviço/repositório legados não filtravam ambiente |
| Administrador com permissão sobre local de qualquer ambiente | Alta | validarPermissaoLocal autorizava ADMINISTRADOR sem conferir ambiente |
| INSERT/UPDATE/DELETE sem autorização na própria escrita | Alta | dadosTecnicosRepository utilizava ID global após consultas separadas |
| Revogação entre leitura e escrita | Alta | validação de responsabilidade não era estabilizada por transação/bloqueios |
| PUT parcial podia restaurar medições antigas | Média | serviço mesclava omitidos de uma leitura anterior e enviava UPDATE completo |
| Sucesso depois de resposta iniciada | Média | controller não verificava headersSent antes/depois de awaits |
| Booleanos/arrays aceitos pela validação numérica por coerção | Média | Number(false), Number([]) eram finitos; isso não comprovava gravação NUMERIC válida |

O controller já delegava erros a next; não foi atribuído a ele vazamento direto
de error.message. O tratamento global de erros seguro existente foi mantido.
Não havia serviço, repositório ou testes unitários multi-tenant próprios de
Dados Técnicos. A sincronização possuía testes relacionados à entidade e
continua tendo sua cobertura na suíte completa, sem mudança nesta tarefa.

## Arquivos e implementação

Modificados somente:

- backend/src/routes/dadosTecnicosRoutes.js
- backend/src/controllers/dadosTecnicosController.js

Criados:

- backend/src/services/dadosTecnicosMultiTenantService.js
- backend/src/repositories/dadosTecnicosMultiTenantRepository.js
- backend/tests/dadosTecnicosIsolamentoIntegrado.test.js
- backend/tests/dadosTecnicosAutorizacaoTransacional.test.js
- backend/tests/dadosTecnicosMultiTenantService.test.js
- este relatório.

Serviço/repositório legados permanecem intactos para seus consumidores
anteriores. Não foram alterados app.js, frontend, autenticação compartilhada,
Campanhas, Locais, Checklist, Evidências, relatórios ou sincronização.

As seis rotas existentes usam uma única autenticarMultiTenant. Ela valida o
JWT e consulta a identidade atual. O controller encaminha req.usuario original,
inclusive nos GETs. Identidade, ambiente e perfil do corpo/query não substituem
o contexto autenticado. O serviço valida UUID e IDs inteiros positivos seguros.

O repositório novo exporta criarNoAmbiente, listarPermitidosNoAmbiente,
buscarPorIdNoAmbiente, buscarPorLocalNoAmbiente,
buscarLocalAutorizadoNoAmbiente, atualizarNoAmbiente e excluirNoAmbiente.
Todas as consultas são parametrizadas e condicionadas a:

- dados técnicos → local → campanha → ambiente autenticado;
- solicitante pertencente ao ambiente, usuário e ambiente ativos;
- administrador do ambiente ou responsável pela campanha.

Ser criador não concede permissão. As leituras com nome do criador usam LEFT
JOIN com o ambiente correspondente: um criador inconsistente não expõe nome
externo nem elimina o registro histórico cujo local foi autorizado. Não foram
reescritos IDs históricos. Leituras de lista usam [ambiente, usuário]; leituras
individuais e verificação de local usam [ID, ambiente, usuário].

Na busca por local, a autorização do local precede a busca dos dados. Local
inexistente, externo ou não autorizado recebe 404 `Local não encontrado.`.
Local autorizado sem dados mantém o 404 específico
`Dados técnicos não encontrados para este local.`. A consulta dos dados
também revalida autorização; não há recuperação global alternativa.

## Escritas, concorrência e exclusão

Todas as escritas do novo repositório são transacionais, sem modo de escrita
global ou alternativa sem bloqueios. BEGIN ISOLATION LEVEL READ COMMITTED;
bloqueios ambiente → usuário (FOR SHARE), campanha → local → dados técnicos
(FOR UPDATE; o último não existe na criação). A primeira consulta autorizada
identifica os pais e os SELECTs seguintes fixam seus IDs em parâmetros.
Troca de vínculo antes do lock não redireciona a autorização a outro pai.

INSERT SELECT, UPDATE e DELETE mantêm autorização diretamente no SQL. Recusa
anterior à escrita executa ROLLBACK sem tentar INSERT/UPDATE/DELETE. Escrita
inesperadamente vazia após bloqueios é falha interna, não um falso 404.
Sucesso exige COMMIT. Erros preservam a instância original, há rollback e
release; erro de rollback descarta o cliente. COMMIT de resultado ambíguo
não recebe repetição automática.

PUT usa COALESCE sobre a coluna atual para cada campo permitido; não faz
read-modify-write com valores antigos. id_local, id_usuario e ambiente nunca
integram o SET. Campos explicitamente enviados podem substituir alteração
anterior do mesmo campo; não foi criado novo contrato otimista/versionamento.

DELETE usa USING local/campanha, autorização contextual e RETURNING d.*.
Não exclui local, campanha, checklist, evidências ou PDF, nem manipula arquivos.
O esquema consultado declara FKs de dados_tecnicos para local e usuário,
sem dependência recebida de outra tabela identificada nessa auditoria.
ON DELETE CASCADE do vínculo ao local não foi alterado nem introduzido.
Triggers existentes de versão/exclusão offline ainda exigem homologação.

Não há chave idempotente de cliente em Dados Técnicos. A relação 1:1 por
id_local continua sendo protegida pelo UNIQUE previsto no esquema. Reenvio
de criação autorizada retorna 409
`Este local já possui dados técnicos cadastrados.`. O repositório reconhece
somente metadados específicos dessa duplicidade, sem consulta global ou
recuperação de registro conflitante. Outros 23505 são propagados; o handler
global existente pode mapeá-los ao seu 409 genérico, sem revelar dados.

## Campos, precisão e compatibilidade

| Campo | Tipo previsto no SQL existente |
| --- | --- |
| pressao_atmosferica | NUMERIC(10,2), opcional |
| oxigenio | NUMERIC(5,2), opcional |
| gas_inflamavel, monoxido_carbono, sulfeto_hidrogenio | NUMERIC(8,2), opcionais |
| temperatura, umidade | NUMERIC(6,2), opcionais |
| ventilacao | NATURAL, MECANICA, FORCADA, NAO_INFORMADA |
| observacoes | TEXT opcional |
| status | PENDENTE ou CONCLUIDO |

Preservados zero, negativos já aceitos, unidades e opções existentes.
Strings numéricas são validadas sem convertê-las antes do SQL, evitando perda
adicional de precisão por JavaScript; a escala/limites reais continuam sendo
os NUMERIC do banco, não precisão arbitrária. Não foram inventados limites
clínicos/ocupacionais, conversões de unidades ou arredondamentos novos.

POST omisso gera ventilacao NAO_INFORMADA e status PENDENTE. Ventilação null
também usa esse padrão; status null explícito continua inválido na criação.
PUT omitido ou null preserva o valor atual, inclusive observações/status.
Observações vazias continuam texto vazio, não NULL; espaços são preservados.
Não foi autorizado nem implementado um novo mecanismo de limpeza por null.

Não há coluna booleana neste módulo. false/true nos campos numéricos são
rejeitados com 400, sem transformá-los em zero ou ausência. Arrays, objetos,
strings numéricas vazias e números não finitos também são recusados antes do
banco. Observações precisam ser texto. O serviço legado tolerava algumas
dessas entradas na validação, mas isso não assegurava persistência válida.
Esse endurecimento pode afetar clientes antigos com tipos incorretos; dados
históricos não foram convertidos ou modificados.

Frontend DadosTecnicosLocal.jsx transforma entradas numéricas vazias em null,
envia status/ventilação válidos e usa os mesmos contratos. Nada foi alterado
nele. A regra antiga que impede limpar por null permanece inclusive nesse
formulário. Offline sem identidade/ambiente válido, com IDs inseguros ou alvo
externo passa a ser recusado. Não foi alterada a sincronização legada.

Mantidos HTTP 201 na criação; 200 nas demais operações; envelopes, total e
mensagens de sucesso. Recursos por ID externos, ausentes ou não autorizados
recebem o mesmo 404. Inatividade/JWT inválido retorna 401 pelo middleware.
Erros internos são delegados ao handler global, com mensagem genérica e
validação de status existentes. O controller verifica headersSent na entrada
e após awaits; erro de JSON após início é delegado a next sem segunda resposta
no controller. Não há logs novos contendo objetos de erro.

## Testes e resultados

Foram adicionados **238 testes**: 117 integrados, 94 de SQL/transações e 27
de validação do serviço. Nenhum teste anterior foi modificado, removido,
ignorado ou enfraquecido. Os testes usam fixtures A/B, identidade atual
distinta dos claims JWT, vínculos independentes e mocks estritos. Consultas
desconhecidas falham; tentativas de escrita são registradas antes de asserções.
O simulador transacional distingue alterações externas simuladas das alterações
pendentes da própria transação; rollback não confirma nem apaga a mudança externa.

A primeira contagem 30/73 foi descartada por um erro de nome no estado do
simulador. Após corrigir o simulador, o router e controller originais do HEAD
foram recompilados somente em memória para executar o baseline: **103 testes,
26 aprovações e 77 falhas**. Arquivos de produção não foram revertidos e o Git
não foi modificado nessa comparação. A implementação atual passou nos mesmos
103 testes. Falhas não são uma contagem de vulnerabilidades independentes.

Resultado final da suíte completa: **2.399/2.399 testes aprovados**, sem falhas,
cancelamentos ou ignorados. Inclui regressões anteriores de Locais, Campanhas,
Checklist, Evidências e sincronização. O preload existente foi inspecionado
e aplicado a todos os processos, bloqueando PostgreSQL, dotenv/.env e uploads.
O sandbox apresentou spawn EPERM; o comando completo foi submetido a autorização
específica antes da execução externa. Não foi iniciado servidor da aplicação.

## Homologação e decisões futuras

Nenhuma migração ou mudança de esquema foi feita. Homologar colunas/tipos,
constraints e nome do UNIQUE, triggers de ambiente/versionamento, execução
de JOIN/locks, READ COMMITTED/EvalPlanQual, deadlocks com outros módulos,
contenção e falhas de COMMIT reais. Locks exclusivos de campanha serializam
conservadoramente escritas dos filhos; o custo precisa ser medido.
Mocks não comprovam segurança, precisão persistida ou concorrência PostgreSQL.

Relatórios possuem LEFT JOIN de dados_tecnicos pelo local. A exclusão legítima
pode fazer medições deixarem de aparecer numa geração futura, como no legado;
PDF já existente não é invalidado ou regravado automaticamente nesta tarefa.
A segurança dos endpoints de relatórios e demais consumidores legados não foi
declarada resolvida por esta correção. O middleware compartilhado mantém logs
técnicos existentes em falha da consulta da identidade; revisão desse componente
fica fora do escopo. Leituras autorizam no snapshot SQL, sem cancelar uma
resposta por revogação posterior ao SELECT.

Não há bloqueio adicional para revisar estas mudanças. Limpeza nova por null,
política de retenção/exclusão, regularização de vínculos históricos, alterações
em relatórios ou esquema exigem autorização separada. Nenhum arquivo real de
Evidências, banco ou dado real foi acessado. HEAD permanece 5b96810, com alterações
locais para revisão, sem staging, commit, push ou merge.
