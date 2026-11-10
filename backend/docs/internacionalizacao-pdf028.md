# PASSO 4 — PDFs em pt-BR e en

Branch: `feature/multilinguagem-pt-en`. Estado consolidado após implementação,
auditoria e homologação real. As migrations **027 e 028 já foram aplicadas
manualmente** no banco local `inventario_nr33_multitenant_dev`; não reaplicá-las.
A aplicação não executa migrations automaticamente. Outros ambientes dependem
de aplicação manual, autorizada e controlada. Os procedimentos abaixo são
instruções para uma implantação futura; não foram executados na revisão documental.

## Diagnóstico anterior às alterações

- Rota ativa: `relatorioRoutes` → `relatorioController` → `relatorioMultiTenantService` → `relatorioMultiTenantRepository` → `pdfService`. `relatorioService`/`relatorioRepository` são consumidores legados e não atendem a rota multi-tenant.
- `POST /api/relatorios/:id/gerar-pdf` gerava arquivo UUID, mas substituía `relatorio.caminho_pdf/hash_pdf`. `GET`/`HEAD /:id/pdf` liam esse ponteiro com SHA-256, validação de caminho, descritor e vínculos físicos. Não havia histórico por idioma.
- `SQL_COMPLETO` recuperava o criador do relatório; a preferência precisa vir do solicitante autenticado. A autenticação fornece IDs reais do usuário/ambiente após validar JWT e consultar o banco; não foi modificada.
- A consulta completa usava indevidamente a capacidade de exclusão. Foi corrigida para a capacidade existente de consulta; geração continua exigindo a autorização de geração na rota e de escrita nos locks. Matriz de permissões, JWT e RBAC não foram alterados.
- O frontend usava `gerarPdfRelatorio`, `buscarPdfRelatorio`, `verificarPdfRelatorio`, `consultarPdfLocal`, `RelatorioLocal` e `BotaoPdfLocal`. A disponibilidade dependia apenas do ponteiro legado e de HEAD; não conhecia idioma nem geração.
- Migrações existentes terminavam em 027. Próxima disponível: **028**.
- Testes existentes cobriam renderização/buffers, regras NR-33, autorização transacional, isolamento de rotas, caminhos, hashes, symlinks/hardlinks, Range e BIGINT. Foram mantidos e ampliados com dados sintéticos.

## Contrato e idioma

- `POST /:id/gerar-pdf`, corpo `{ "idioma": "en" }` ou `{ "idioma": "pt-BR" }`. Corpo omitido: usa preferência do solicitante recuperada por ID e ambiente dentro da transação. Idioma explícito ausente/inválido na preferência, ou inválido no corpo: fallback `pt-BR`. Nenhum ID do cliente define identidade/ambiente.
- Resposta preserva `data.relatorio`/`data.arquivo` e acrescenta `data.geracao`, com UUID, idioma efetivo, relatório, ambiente, solicitante, caminho/hash, data e versão do template.
- `GET /:id/geracoes-pdf?idioma=en`: consulta somente leitura, ordenada da geração mais recente à mais antiga, com metadados das gerações nesse idioma e referência separada ao legado (`idioma: null`). Escolher uma geração para visualizar não equivale a reutilizá-la para uma nova geração: todo POST produz outro UUID/arquivo.
- `GET`/`HEAD /:id/geracoes-pdf/:uuid/pdf?idioma=en`: arquivo exato. Divergência de idioma retorna 409; UUID de outro relatório/ambiente ou sem autorização retorna 404. Usuário autorizado no mesmo ambiente pode gerar/ler documento de relatório criado por outro usuário.
- Resposta PDF: `Content-Language`, `X-Pdf-Geracao`, ETag com hash, `private, no-store`, `nosniff`; Range preservado. HEAD informa tamanho sem corpo. Nenhuma leitura chama renderizador/persistência.
- `GET`/`HEAD /:id/pdf` continua entregando exclusivamente o ponteiro legado, sem atribuir idioma presumido. Se receber idioma esperado, recusa com 404. O frontend oferece esse documento em ação explícita “Abrir PDF legado — idioma desconhecido”, inclusive quando a migration ainda está pendente.

## Armazenamento e segurança

`public.relatorio_pdf_geracao` guarda uma linha por geração. O arquivo conserva o padrão seguro `uploads/relatorios/relatorio-<relatorio>-<ambiente>_<uuid>.pdf`; o UUID da linha é o mesmo do arquivo. Cada POST escreve com criação exclusiva (`wx`), calcula SHA-256 e insere metadados na transação protegida pelos locks existentes. Os campos legados de caminho/hash não são substituídos, nem há backfill ou remoção de arquivos antigos.

Toda leitura revalida usuário ativo, ambiente ativo, capacidade e cadeia relatório/local/campanha antes de ler a geração. O arquivo ainda passa pelas verificações físicas e de integridade existentes. A posse do UUID não concede acesso. Preferência e dados do criador não determinam o idioma do solicitante.

IDs históricos de relatório e solicitante são snapshots sem FK, para não impedir exclusões já autorizadas nem apagar metadados em cascata. Leituras dependem do relatório vivo e autorizado; após sua exclusão os metadados/arquivos permanecem retidos, mas ficam inacessíveis pelas rotas. Há FK do ambiente, CHECKs, unicidade de caminho e chave UUID. A aplicação não oferece atualização/exclusão dos registros de geração.

Uma falha após a escrita física e antes do COMMIT pode deixar um arquivo órfão sem metadados confirmados, como no fluxo anterior. Ele não é disponibilizado por nenhuma rota. Não foi introduzida limpeza automática, para preservar arquivos históricos e a política segura contra substituição de caminhos. Limpeza/retencão operacional exige procedimento futuro próprio.

## Renderização

- Catálogo local `pdf.en.json`, sem rede nem novas dependências. Português é o catálogo-base nas chamadas controladas. Contexto imutável por geração e helpers fechados sobre esse contexto; não há variável global mutável de idioma.
- Traduz apenas títulos, cabeçalhos/rodapés, rótulos, respostas/estados enumerados, observações automáticas, mensagens de ausência, legendas automáticas e metadados. Nomes, endereços, descrições, observações, códigos, ART/CREA e legendas cadastradas permanecem originais.
- `pt-BR` e `en-GB` para datas/números. Colunas DATE são lidas como texto, sem deslocamento de dia; timestamps usam explicitamente `America/Sao_Paulo` nos dois idiomas. NUMERIC textual não passa por Number: preserva precisão/casas significativas, inclusive valores negativos próximos de zero. Volume conserva a apresentação anterior sem zeros fracionários finais. Nenhum cálculo/classificação normativa mudou.
- Oxigênio/umidade mostram `%`; temperatura mostra `°C`. Outras unidades não são inventadas nem convertidas, pois o esquema não as registra; essa limitação aparece traduzida no documento.
- Paginação e fotografias continuam locais. Status longos em inglês ajustam o tamanho da fonte ao selo, para não cortar palavras.

## Frontend

O idioma ativo é enviado somente no contrato de geração/consulta PDF. Persistência individual de idioma e sincronização de entidades de negócio não foram modificadas. O UUID retornado pelo POST é usado diretamente; após recarga a consulta identifica a geração mais recente no idioma ativo. HEAD e download usam o mesmo UUID/idioma.

Controles de PDF têm escopo por usuário, ambiente, token e idioma. São reiniciados quando esse escopo muda; callbacks antigos verificam o escopo antes de iniciar a próxima chamada, publicar estado ou abrir Blob. Logout/login, inclusive de outra conta, descarta respostas pendentes. Formulários de inventário, tema e autenticação não são reiniciados pela troca de idioma. PDF requer conexão; nenhum documento de outro idioma é apresentado como alternativa automática offline.

## Implantação em outro ambiente

Procedimento a ser executado somente pelo responsável autorizado pelo destino.
O banco local já migrado não é um alvo para repetição desses comandos.

1. **Pré-requisitos e janela.** Identificar banco, host, porta, papel do runtime,
   responsável pelo schema, versão anterior e artefatos de backend/frontend a
   publicar. Conferir a base anterior às migrations 027/028: `public.usuario`,
   `public.ambiente(id_ambiente UUID PRIMARY KEY)`, relatórios e seus vínculos
   multi-tenant. O ambiente homologado usa PostgreSQL 17; outro destino precisa
   de revisão de compatibilidade. Preparar Node.js/dependências conforme o projeto
   (a validação local usou Node 20.19.6). Não habilitar inicialização que aplique SQL.
2. **Backup consistente.** Antes de qualquer alteração, autorizar e realizar
   backup somente do banco de destino, das permissões relevantes e dos diretórios
   de PDFs/evidências. Pausar gravações durante a captura ou usar o procedimento
   consistente de backup do ambiente. Guardar os artefatos/versionamento anterior
   da aplicação e conferir que o backup pode ser restaurado em local separado
   autorizado. Senhas ficam no mecanismo protegido do ambiente, nunca na linha de
   comando, repositório ou logs. Não executar backup/restauração de outros bancos
   por conveniência e não publicar backups no Git.
3. **Confirmar o destino e o estado atual.** Em sessão explícita, sem depender de
   defaults de conexão, conferir `current_database()`, `current_user`,
   `session_user`, `inet_server_addr()` e `inet_server_port()` contra o alvo
   aprovado. Interromper em qualquer divergência. Consultar catálogos para
   verificar a coluna `usuario.idioma`, sua restrição/default e a tabela/índice da
   028. Objetos já existentes exigem comparação das definições: não reaplicar
   migrations nem usar alterações improvisadas para encobrir estado parcial.
4. **Aplicar manualmente na ordem 027 → 028.** Após autorização específica,
   aplicar `backend/database/027_preferencia_idioma_usuario.sql` e depois
   `backend/database/028_geracoes_pdf_idioma.sql`, apenas se ainda não aplicadas.
   Usar cliente SQL com parada no primeiro erro (por exemplo, `psql` com
   `--no-psqlrc` e `ON_ERROR_STOP=1`) e destino explicitamente informado. Os arquivos
   já contêm suas próprias transações; executar e conferir um por vez. Não editar
   os arquivos SQL já homologados, não fazer backfill de documentos nem repetir
   automaticamente após falha. O responsável pela criação precisa dos privilégios
   de schema/referência apropriados; a aplicação não deve recebê-los.
5. **Privilégios mínimos e conferência de schema.** O proprietário da nova tabela
   concede somente SELECT/INSERT ao papel de execução daquele ambiente. Exemplo
   para o papel de desenvolvimento, exclusivamente após conferir o destino e a
   existência da tabela:

   ```sql
   GRANT SELECT, INSERT ON TABLE public.relatorio_pdf_geracao TO nr33_dev_app;
   ```

   Em outro ambiente, substituir pelo papel autorizado, sem reutilizar
   credenciais locais. Não usar `GRANT ALL`, `WITH GRANT OPTION`, permissões
   administrativas, CREATE, UPDATE ou DELETE na nova tabela. Não há sequence a
   autorizar. Conferir CONNECT no banco, USAGE no schema e execução de
   `clock_timestamp()`; validar os privilégios já necessários nas tabelas-pai
   para consultas/locks e na coluna de preferência, sem ampliá-los indiscriminadamente.
   Conferir tipos BIGINT/UUID, PK, unicidade do caminho, CHECKs de idioma/hash e
   índice de consulta. O runtime deve ser distinto do proprietário do schema.
6. **Publicar backend e frontend.** Após sucesso das verificações de schema e
   privilégios, publicar primeiro o backend compatível e verificar saúde e destino
   do pool; depois publicar o frontend correspondente. Usar o mecanismo de
   publicação de assets/cache já existente, sem acrescentar arquitetura neste
   procedimento. Não iniciar workers auxiliares ou alterar autenticação para
   contornar falhas. Sem a 028, o serviço recusa a geração antes de escrever PDF;
   `src/app.js` preserva 503, mas o servidor de laboratório pode convertê-lo em
   erro genérico 500. Esse retorno não autoriza uma migration automática.
7. **Verificar traduções.** Conferir `pt-BR` padrão/fallback, troca para `en`,
   atributo HTML `lang`, mensagens, formulários preenchidos, temas e viewport
   móvel. Confirmar formatação `en-GB` e preservação dos valores canônicos e textos
   livres. Os catálogos frontend têm 747 chaves por idioma em 14 domínios.
8. **Verificar preferência individual.** Usar contas de teste existentes e
   autorizadas. Antes de login ou PATCH real, apresentar e autorizar as gravações
   de preferência e os controles normais de segurança do login. Conferir perfil,
   recarga, novo login, duas contas/dispositivo compartilhado e sincronização de
   uma preferência pendente após reconexão, sem enviar dados com a sessão de
   outra conta. Definir previamente o estado final esperado da preferência e
   não modificar nomes, senhas, perfis ou ambiente.
9. **Gerar e baixar PDFs.** Selecionar relatório de teste existente. Antes de
   escrever, autorizar quantidade de gerações, linhas de metadados, arquivos e
   atualizações normais de status/datas do relatório. Registrar o estado lógico
   com snapshots/digests e registrar os hashes legados, sem divulgar dados reais.
   Gerar pt-BR e en, confirmar UUIDs/caminhos distintos, idioma efetivo, template,
   hash no banco/arquivo/download, `Content-Language`, GET/HEAD/Range, textos
   livres, `%`, `°C`, fotografias e legibilidade. Conferir que consultas não criam
   gerações e não reutilizam arquivo de outro idioma. Em falha parcial, apurar
   quais registros foram confirmados; não repetir POST nem limpar arquivos sem
   nova autorização.
10. **Validar isolamento e aceitar a publicação.** Conferir acesso autorizado,
    bloqueio de outra conta/ambiente, ausência/JWT inválido e capacidades dos
    perfis, com dados de teste aprovados. Conferir preferência, usuários, dados
    NR-33, gerações anteriores, ponteiros e hashes legados antes/depois. Registrar
    resultados sanitizados e obter aceite humano. Evidências reais, contas,
    tokens e arquivos protegidos ficam fora do repositório público.

## Rollback da aplicação sem perda de dados

O rollback padrão preserva o schema das migrations 027/028, preferências,
registros de geração, PDFs, evidências, dados NR-33 e todos os caminhos/hashes
legados. Não há DROP, remoção de coluna, DELETE/TRUNCATE de histórico ou exclusão
de arquivos como procedimento padrão. Não restaurar um backup sobre um banco
que recebeu novas gravações como se isso fosse uma reversão inofensiva.

1. Registrar a falha, a versão em execução e as operações em andamento. Suspender
   novas gerações e alterações de preferência durante a transição; deixar
   operações já autorizadas terminarem ou apurar o estado confirmado. Preservar
   snapshots, hashes, registros e arquivos, inclusive órfãos, para análise.
2. Preferir recuar somente o frontend, mantendo o backend compatível com o schema
   aditivo. Se for necessário recuar também o backend, usar um artefato anterior
   revisado e manter bloqueado o POST de geração por controle de manutenção da
   implantação. Não há flag de bloqueio de geração implementada por este trabalho:
   se o ambiente não oferece um controle seguro, manter o backend compatível ou
   usar manutenção total até resolver a incompatibilidade.
3. O código anterior de geração pode atualizar o ponteiro/hash único do relatório.
   Portanto, não reabilitar geração por essa versão sem revisão específica que
   preserve os legados. Não conceder acesso público direto ao diretório de PDFs
   como alternativa ao download autenticado.
4. A versão antiga pode ignorar a coluna `idioma` e a tabela de gerações: os valores
   continuam armazenados, mas a interface anterior pode apresentar apenas
   português e consultar somente o PDF legado. Ela não descobre os novos UUIDs.
   Documentos novos permanecem retidos; reabrir seu acesso exige backend/contrato
   compatível, sem sobrescrever `caminho_pdf/hash_pdf` para simular compatibilidade.
   A preferência local pendente e a persistida não devem ser apagadas ou convertidas
   em massa para adaptar a versão antiga.
5. Verificar saúde, autenticação, isolamento, dados NR-33, preferências armazenadas,
   gerações e hashes após o recuo. Conservar o papel da aplicação sem UPDATE/DELETE
   na nova tabela e manter migrations aplicadas. Reabilitar a versão corrigida e
   as gravações somente após validação e autorização.

Uma restauração de desastre exige plano próprio, análise das gravações posteriores
ao backup e autorização explícita; não faz parte deste rollback padrão. Nenhum
procedimento de implantação ou rollback foi executado na revisão documental.

## Arquivos desta etapa

Criados:

- `backend/database/028_geracoes_pdf_idioma.sql`
- `backend/src/i18n/pdf.en.json`
- `backend/src/utils/idiomaPdf.js`
- `backend/scripts/gerar-amostras-pdf-idiomas.cjs`
- `backend/scripts/validar-pdf-idiomas.py`
- `backend/docs/internacionalizacao-pdf028.md`
- `frontend/src/hooks/useEscopoPdf.js`
- `frontend/src/services/documentoPdf.js`
- `frontend/tests/documentoPdf.test.js`

Modificados:

- `backend/src/controllers/relatorioController.js`
- `backend/src/routes/relatorioRoutes.js`
- `backend/src/repositories/relatorioMultiTenantRepository.js`
- `backend/src/services/relatorioMultiTenantService.js`
- `backend/src/services/pdfService.js`
- `backend/src/utils/relatorioArquivoUtils.js`
- `backend/tests/relatorioPdfBuffer.test.js`
- `backend/tests/relatorioAutorizacaoTransacional.test.js`
- `backend/tests/relatorioIsolamentoIntegrado.test.js`
- `backend/tests/laboratorioAppErros.test.js`
- `backend/tests/helpers/idsBigintSimulados.cjs`
- `frontend/src/services/api.js`
- `frontend/src/services/pdfLocal.js`
- `frontend/src/components/locais/BotaoPdfLocal.jsx`
- `frontend/src/pages/RelatorioLocal.jsx`
- `frontend/src/i18n/locales/{pt-BR,en}/reports.json`
- `frontend/tests/pdfLocal.test.js`
- `frontend/scripts/testar-interface-i18n.mjs`

Os simuladores estritos dos testes existentes foram atualizados para aceitar o novo utilitário puro e simular o SQL do histórico. Não foram liberadas dependências reais de banco ou arquivos de produção.

Amostras sintéticas podem ser geradas pelo script listado acima; saídas em
`artifacts/` são locais e não acompanham o repositório. O validador Python requer
PyMuPDF instalado separadamente; não versionar cópias de dependências. Evidências
e roteiros de homologação com dados/contas reais também permanecem locais.

## Validação

| Verificação | Resultado |
| --- | --- |
| Backend `npm test` | 5.223/5.223 aprovados |
| Frontend `npm test` | 215/215 aprovados |
| Rotas PDF após ajuste final de cache | 165/165 aprovados |
| `test:interface-i18n` | 73 verificações, 15 telas, dois modais; inclui geração/download por UUID, troca de idioma pendente e logout/outra conta |
| `test:browser` | Aprovado, incluindo campanhas de engenheiro e isolamento |
| `test:rbac-browser` | Sete perfis aprovados, desktop/mobile |
| `test:nr33-browser` | 11 cenários aprovados, sem backend real |
| Frontend lint | Aprovado |
| Builds normal/demo | Aprovados; aviso preexistente de chunk acima de 500 kB |
| Seis PDFs sintéticos | Completos: cinco páginas por idioma; extensos: sete; incompletos: três |
| Auditoria PyMuPDF e inspeção visual | Margens, conteúdo, rodapés, foto, precisão, unidades e status sem corte aprovados |
| `git diff --check` | Aprovado |

O teste de interface passou a aguardar requisições e commits React antes de conferir os formulários, inclusive a revalidação de sessão em páginas públicas. Isso removeu as falhas de temporização observadas nas execuções intermediárias, sem alterar a persistência de idioma.

## Homologação real e limitações

Após a aplicação manual das migrations 027/028 no banco local, a homologação real
foi aprovada: dois PDFs independentes em pt-BR/en, SHA-256 coincidente entre banco,
arquivo, download e Blob do frontend, GET/HEAD sem geração automática e recusa de
acesso entre ambientes. Textos livres, unidades, fotografias, ponteiros/hashes
legados e snapshots de usuários/dados NR-33 foram preservados. A aplicação usa
SELECT/INSERT na tabela nova; UPDATE/DELETE permanecem negados.

A troca de idioma nessa homologação foi transitória no navegador, sem alterar
usuários; ela não re-homologou a gravação de preferência individual. Perfis sem
capacidade de geração e solicitante diferente do criador no mesmo ambiente
continuam cobertos pelas regressões sintéticas, sem ampliação desse teste real.
Contas, identificadores, caminhos/UUIDs reais e PDFs de homologação não são
publicados nesta documentação.

Os comandos automatizados da tabela usam simulações. O CI atual executa apenas
sintaxe do backend e lint/build do frontend; as suítes completas e o navegador
foram executados localmente. Os roteiros de navegador atuais dependem de Chrome
e configuração Windows. Não foram alterados para outra plataforma neste passo.
O aviso de bundle, fallback genérico de mensagens novas em inglês, retenção de
histórico sem FKs de relatório/solicitante, órfãos após falha antes do COMMIT e
offline limitado à infraestrutura existente continuam documentados, sem limpeza
automática nem alteração das regras de segurança.
