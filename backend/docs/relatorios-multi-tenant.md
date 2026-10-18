# PASSO 639 — Relatórios PDF multi-tenant

## Escopo e estado

Base: branch `feature/multi-tenant`, HEAD `4dcc15a`, árvore inicialmente limpa.
Implementação local para revisão. Sem staging, commit, push, migração ou acesso a
PostgreSQL, `.env`, fotografias ou PDFs reais. `app.js` permanece inalterado.

As nove operações já montadas por `src/app.js:151` foram protegidas:

| Método e endpoint | Controller | Sucesso |
| --- | --- | --- |
| POST /api/relatorios | criar | 201 |
| GET /api/relatorios | listar | 200, total/data |
| GET /api/relatorios/local/:idLocal | buscarPorLocal | 200 |
| GET /api/relatorios/:id/completo | buscarCompleto | 200 |
| POST /api/relatorios/:id/gerar-pdf | gerarPdf | 200 |
| GET /api/relatorios/:id/pdf | baixarPdf | 200; 206/416 para Range |
| GET /api/relatorios/:id | buscarPorId | 200 |
| PUT /api/relatorios/:id | atualizar | 200 |
| DELETE /api/relatorios/:id | excluir | 200 |

## Auditoria e correções

Problemas confirmados no fluxo anterior:

- **Alto:** autenticação apenas pelo JWT; administrador com autorização global
  (`relatorioService.js:83` e `:251`), consultas globais ou por ID sem ambiente
  (`relatorioRepository.js:53`, `:105`, `:164`).
- **Alto:** alteração/exclusão e geração separavam a consulta de autorização da
  escrita, permitindo revogação entre as etapas (`relatorioService.js:319`,
  `:418`, `:490`). A agregação dependia de autorização anterior, sem repetir o
  ambiente na própria consulta.
- **Alto:** download reabria o caminho salvo via Express, sem conferência de
  hash, identidade física ou propriedade contextual. Geração usava timestamp e
  abertura não exclusiva. Fotos eram abertas por caminho, sem comprovar ambiente.
- **Médio:** risco de segunda resposta e consumo de caminho após operações
  assíncronas; IDs não exigiam inteiro seguro.

O Router agora aplica `autenticarMultiTenant` uma única vez. O middleware existente
revalida o usuário e o ambiente no banco; o controller encaminha `req.usuario`.
O novo serviço usa apenas o repositório contextual, valida UUID/IDs seguros e
seleciona os campos editáveis. Dados de identidade, vínculo, caminho/hash PDF e
data de emissão enviados no corpo não substituem valores controlados pelo servidor.

Todas as consultas usam parâmetros e o vínculo relatório → local → campanha →
ambiente. O predicado SQL exige usuário/ambiente ativos e administrador do mesmo
ambiente ou responsabilidade pela campanha. Ser criador não concede acesso.
O nome/e-mail do responsável histórico só são associados se ele pertencer ao
ambiente da campanha; o registro histórico continua preservado.

As escritas usam transação READ COMMITTED e bloqueios na ordem ambiente → usuário
→ campanha → local → relatório (sem relatório na criação). Ambiente/usuário usam
SHARE; os demais, UPDATE. Cada etapa reaplica autorização e fixa os pais obtidos
na primeira consulta. INSERT SELECT, UPDATE e DELETE também contêm autorização.
Falha de autorização retorna null/404 antes de escrever ou executar callback
físico. Falhas técnicas propagam, com rollback/release; rollback falho descarta
a conexão. Essas garantias são condicionais ao comportamento real dos bloqueios,
que ainda precisa de homologação.

O relatório completo filtra o registro raiz e associa Checklist, Dados Técnicos
e Evidências pelo local autorizado. A leitura básica precede a agregação, e a
consulta agregada reaplica ambiente e autorização. A geração mantém os bloqueios
até persistência dos metadados e COMMIT; o download, até concluir leitura e hash.

## Geração, download e compatibilidade

PDFKit conserva o layout existente, seções NR-33, ART, descrições e GPS zero.
O fluxo montado gera em memória e só recebe imagens já lidas em buffers pelo
utilitário seguro. Não reabre caminhos pelo PDFKit ou pelo Express.

As duas mudanças de política foram expressamente autorizadas:

1. Novos PDFs têm nome imutável `relatorio-ID-AMBIENTE_UUID.pdf`; abertura `wx`,
   permissão solicitada 0600 e fsync. A pasta final pode ser criada com 0700,
   após validação de uploads. Nenhum arquivo antigo é substituído ou renomeado.
2. Fotos sem nome gerenciado que vincule ambiente/local ficam indisponíveis no
   novo PDF, preservando descrição/GPS e sem leitura física. Fotografias e PDFs
   antigos não são modificados.

Diretórios e arquivos usam lstat/realpath, identificação dev/ino, rejeição de
symlinks/junctions/hardlinks e conferências antes/depois da leitura pelo mesmo
descritor. O_NOFOLLOW é usado quando disponível. Alteração de tamanho/versão ou
troca de identidade provoca rejeição. Somente arquivos diretamente na pasta
esperada são aceitos, sem caminho externo, subpasta, NUL ou fluxo alternativo.

PDF legado no padrão `relatorio-ID-TIMESTAMP.pdf` continua disponível após
autorização, validação física e SHA-256 correspondente ao hash salvo. Hash não
prova origem histórica do conteúdo: comprova integridade em relação ao banco.
Documentos sem hash válido ou com referência incompatível ficam indisponíveis,
sem alterar seus registros ou arquivos.

Download mantém nome público `relatorio-ID.pdf`, application/pdf, disposição de
anexo, tamanho e suporte a Range simples/Last-Modified. Cache foi endurecido para
`private, no-store`. Os envelopes JSON e mensagens de sucesso foram mantidos;
404 não distingue recurso externo/inexistente/não autorizado. Erros de arquivo
não devolvem caminhos ou mensagens técnicas; erros inesperados seguem ao
tratamento global existente. Entrada e retorno assíncrono verificam headersSent.

PUT preserva campos omitidos no próprio CASE SQL, sem reenviar uma leitura antiga;
null/string vazia limpam campos opcionais. Caminho/hash/data de emissão são
controlados somente pela geração. DELETE continua apenas no banco, sem unlink.
Criação repetida no mesmo local mantém 409; não foi inventada idempotência de
geração. Regerar produz novo nome exclusivo e mantém PDFs anteriores.

As chamadas de `frontend/src/services/api.js:424` a `:462` mantêm URLs, verbos e
respostas utilizadas. Clientes sem identidade vinculada a ambiente agora recebem
401; recursos fora do escopo recebem 404. Reenvios offline não recuperam recurso
externo e criação repetida continua conflito. Nenhuma política offline nova foi
implementada, nem houve execução real do frontend.

## Testes e resultados

| Arquivo novo | Testes | Resultado isolado |
| --- | ---: | --- |
| relatorioIsolamentoIntegrado.test.js | 159 | 159 aprovados |
| relatorioAutorizacaoTransacional.test.js | 103 | 103 aprovados |
| relatorioArquivoSeguranca.test.js | 29 | 29 aprovados |
| relatorioPdfBuffer.test.js | 4 | 4 aprovados |
| Total adicionado | 295 | 295 aprovados |

Baseline válido dos 134 primeiros testes integrados, carregando router/controller
originais do HEAD em memória: **37 aprovados, 97 falhas**. Não corresponde a 97
vulnerabilidades distintas. Os testes posteriores foram acrescentados durante a
implementação. Um primeiro ensaio de baseline tinha defeito no reset da fixture;
foi descartado e repetido corretamente. Não houve rollback de arquivos de produção.

Os testes integrados exercitam router/controller/service/auth reais, com dados
A/B, dependências externas interceptadas e proibição explícita de dependências
desconhecidas. Os testes SQL exercitam o repositório real com pool/client simulados,
estado pendente até COMMIT, parâmetros, ordem dos bloqueios, revogações, rollback e
release. Os testes físicos substituem todo filesystem do utilitário. PDFKit real
renderiza buffers, com fotografia RGB sintetizada em memória e inspeção de texto,
imagem e estrutura PDF; nenhuma fotografia real é aberta.

O preload existente foi ampliado para bloquear também caminhos `.pdf`, além de
uploads/.env e PostgreSQL. A suíte usa NODE_OPTIONS com esse preload herdado por
todos os workers. O sandbox retornou spawn EPERM; o mesmo comando completo foi
executado fora do sandbox mediante autorização, mantendo o isolamento.

**Suíte completa final: 2.694 executados, 2.694 aprovados, zero falhas ou skips.**
Base anterior: 2.399. Uma execução intermediária passou 2.669/2.669 antes dos
25 últimos testes de transporte e download parcial.

## Limitações e homologação pendente

- Não existe transação atômica PostgreSQL/filesystem. Falha após gravação e antes
  do COMMIT pode deixar órfão; falha na resposta após COMMIT pode motivar reenvio.
  Não há limpeza automática, tabela nova ou migração. Reconciliação futura deve
  começar por inventário somente leitura, referências/hash/propriedade e revisão.
- Não existe openat/dirfd portátil nesta implementação. Um agente com permissão
  de modificar os diretórios pode disputar os intervalos entre verificações e
  operações. Verificações rejeitam trocas detectáveis, mas não provam segurança
  contra toda corrida, sobretudo junctions/replace no Windows. ACLs restritas e
  testes reais de filesystem continuam obrigatórios; 0600/0700 não provam ACL Windows.
- A autorização fica estável durante geração/leitura, não durante toda a entrega
  de bytes após COMMIT. Revogação posterior não revoga bytes já autorizados.
  Locks durante renderização e buffers completos podem aumentar latência/memória;
  limites e carga precisam ser definidos e medidos.
- Decodificação de imagem permanece risco residual: um primeiro PNG sintético
  corrompido provocou erro assíncrono de zlib no PDFKit. A fixture foi substituída
  por PNG RGB válido gerado com CRC e zlib. Esse ensaio não valida a robustez do
  parser contra arquivos malformados. Isolamento do decodificador, limites de
  recursos e validação profunda exigem tratamento adicional; não foram alegados
  como resolvidos por checks de caminho ou de assinatura.
- O middleware compartilhado ainda registra objeto de erro em falha de consulta
  (`autenticacaoMiddleware.js:178`), podendo expor detalhes nos logs. Não foi
  modificado por estar fora do escopo. A resposta pública permanece genérica.
- O serviço/repositório legados e o modo físico antigo do pdfService continuam
  disponíveis internamente para compatibilidade. O router montado usa exclusivamente
  o novo fluxo; sua existência não torna seguros eventuais futuros consumidores
  do modo legado.
- Confirmar em homologação o esquema 007/016/020/021, constraints, triggers,
  relacionamento de ambientes, permissões de DB, locks/deadlocks, rollback/COMMIT
  incerto, hashes históricos, ACLs, trocas de caminho, documentos compartilhados,
  vazios/grandes/corrompidos, ranges reais e cancelamento HTTP. Nenhuma migração
  ou constraint foi presumida homologada a partir dos mocks.

## Arquivos e revisão

Modificados: `src/routes/relatorioRoutes.js`, `src/controllers/relatorioController.js`,
`src/services/pdfService.js`, `tests/helpers/evidenciaIsolamentoPreload.cjs`.
Criados: `src/repositories/relatorioMultiTenantRepository.js`,
`src/services/relatorioMultiTenantService.js`, `src/utils/relatorioArquivoUtils.js`,
os quatro testes da tabela e este relatório.

Pronto para revisão do diff e dos testes. A aprovação simulada não equivale a
homologação nem autoriza implantação. Sem alteração em app.js, frontend, outros
módulos de negócio ou dados existentes. Não houve staging, commit ou push.
