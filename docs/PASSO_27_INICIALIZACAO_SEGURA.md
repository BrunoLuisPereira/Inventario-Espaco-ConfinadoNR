# PASSO 27 — Inicialização segura e executor da migration 023

## Estado da entrega

Preparado para revisão na branch feature/recuperacao-senha. Nenhuma operação executada no PostgreSQL. Nenhuma migration aplicada, banco acessado ou serviço iniciado/reiniciado. Nenhum segredo real gerado, impresso ou gravado. Sem mudanças em .env, credenciais, usuários, ambientes, RBAC ou stash; sem git add, commit, push ou merge.

## Inicialização antes da porta HTTP

servidor-local.cjs valida primeiro a configuração local, inclusive LOGIN_HMAC_SECRET, antes de carregar pg. Conecta exclusivamente a 127.0.0.1:5432 / inventario_nr33_multitenant_dev / nr33_dev_app. O preflight usa uma transação REPEATABLE READ READ ONLY, com statement_timeout de 5s, lendo apenas catálogos e privilégios. Não consulta registros de usuários, não tenta login, não grava uma tentativa e não executa DDL. O pool só é disponibilizado aos routers e listen só é chamado após o COMMIT do preflight.

Validações:

- Banco conectado, endereço/porta efetivos, PostgreSQL 17, current_user e session_user exatos; papel sem flags administrativas.
- HMAC: presença e Base64 canônico que decodifica exatamente 32 bytes. A mesma função pura é utilizada pelo login e pelo preflight, evitando regras divergentes.
- Tabela public.login_tentativa comum e persistente, sem particionamento, RLS ou triggers de aplicação inesperados.
- Sete colunas da 023, ordem, tipos, nulabilidade, defaults, ausência de identity/generated.
- PK de tipo/chave_hash e os seis CHECKs da migration; constraints validadas e não diferíveis. Expressões compostas preservam parênteses e literais na comparação, evitando aceitar regras alteradas por mudanças de precedência ou caixa dos valores.
- Índices B-tree da PK e da limpeza: nome, colunas, unicidade, validade, prontidão, imediatismo, ordem e ausência de expressões/predicados inesperados.
- CONNECT, USAGE e cada privilégio SELECT/INSERT/UPDATE em login_tentativa verificados separadamente. SELECT em usuário e ambiente.
- Colunas exigidas por login/identidade, inclusive senha_hash e eh_fundador; FK de usuário para ambiente, PKs, conjunto dos sete perfis, CHECK de fundador, unicidade do e-mail normalizado e do fundador por ambiente.
- Preservadas as verificações anteriores das onze tabelas-base, FK de campanha/usuário/ambiente e chave de versionamento multi-tenant.

Falhas produzem códigos seguros como HMAC_AUSENTE, HMAC_INVALIDO, TABELA_023_AUSENTE, COLUNAS_023_INCOMPATIVEIS, CONSTRAINTS_023_INCOMPATIVEIS, INDICES_023_INCOMPATIVEIS, PERMISSOES_LOGIN e RBAC_SETE_PERFIS. Não incluem valor do segredo, senha, SQL, erro completo do driver ou registros. A conexão é liberada, o pool encerrado e nenhuma porta é aberta. Falha de rollback descarta a conexão.

O binding HTTP permanece 127.0.0.1. Porta padrão 3001; NR33_BACKEND_PORT=3000 é uma opção explícita já existente. Não foi aberta porta real nos testes novos: listen foi substituído por um objeto simulado.

## HMAC fora do repositório

O nome continua LOGIN_HMAC_SECRET: 32 bytes aleatórios, codificados em Base64 canônico, 44 caracteres com um = ao final, sem espaço ou quebra de linha. Nenhum valor deve ser reutilizado dos testes; as fixtures usam constantes sintéticas conhecidas e não credenciais reais.

Procedimento futuro, somente após revisão:

1. Criar uma única vez o segredo por mecanismo criptográfico do cofre/gerenciador de segredos do sistema; não usar GUID, senha humana ou JWT_SECRET. Esta etapa NÃO foi realizada.
2. Armazenar no cofre externo ao repositório com acesso limitado à identidade que inicia o backend. Não colocar em .env, arquivo do projeto, argumentos em texto, terminal, logs ou histórico.
3. Recuperar como SecureString em sessão PowerShell dedicada e fornecer pelo parâmetro SegredoHmac do postgres-local.ps1. Também é aceita a variável de processo previamente injetada por canal privado.
4. O inicializador valida formato antes de gerar o JWT local ou chamar Node. A variável LOGIN_HMAC_SECRET entra no snapshot de ambiente e é restaurada no finally, tanto em sucesso quanto em falha. Se não existia antes, é removida; se existia, o valor anterior é preservado. Não altera variáveis persistentes de usuário/máquina.
5. Reutilizar o mesmo segredo após reinícios e entre instâncias. Não gerar um HMAC por partida. Rotação precisa de procedimento próprio porque muda as chaves dos contadores.

O parâmetro SenhaAplicacao continua recebendo a senha existente por SecureString; não redefine senha do papel. A etapa Backend exige Executar e a confirmação exata BACKEND inventario_nr33_multitenant_dev. A etapa Instalar não aplica a 023 e continua reservada à instalação inicial; não usá-la para atualização incremental. Nenhuma dessas etapas foi executada para iniciar o backend neste passo.

## Executor específico da 023

Novo arquivo: backend/laboratorio/migrar-login-023.cjs.

Importar o módulo ou solicitar --plano não conecta e não altera o ambiente. O executor não lê dotenv, não usa a configuração DB_* da aplicação e não inicia HTTP. O modo real exige --executar, banco exato e confirmação exata. Credenciais do operador vêm exclusivamente de NR33_MIGRACAO_023_USER e NR33_MIGRACAO_023_PASSWORD no ambiente privado do processo; o papel da API não pode ser usado como operador de DDL.

Guardas:

1. Recusa bancos diferentes, confirmação ausente/incorreta, nomes inválidos de operador e overrides PG*, NODE_OPTIONS ou DATABASE_URL antes de carregar o driver.
2. Lê somente a migration 023 em caminho fixo. Verifica SHA-256 da fonte revisada após normalizar CRLF/LF; qualquer alteração requer revisão e atualização explícita da assinatura. O corpo deve conter somente CREATE TABLE login_tentativa e seu CREATE INDEX.
3. Fixa host 127.0.0.1, porta 5432, database inventario_nr33_multitenant_dev e parâmetros explícitos do driver. Confirma banco, servidor, PostgreSQL 17, current_user e session_user na conexão antes de qualquer DDL.
4. Abre uma única transação, aplica timeouts e serializa executores desta migration com advisory lock dedicado. Revalida banco/versão/papel, ausência da tabela e do índice, USAGE/CREATE do operador no schema e existência do papel limitado nr33_dev_app.
5. Aplica apenas o corpo da 023, sem aninhar o BEGIN/COMMIT da fonte. Faz GRANT SELECT, INSERT, UPDATE ON TABLE public.login_tentativa TO nr33_dev_app e verifica cada privilégio individualmente antes do COMMIT. Não concede DELETE ou permissões administrativas.
6. Qualquer erro de DDL, grant ou validação provoca rollback. Não há DROP, TRUNCATE, DELETE, atualização de usuários/ambientes, criação de papéis, alteração de credenciais ou tentativa automática de reparo/repetição. Falha de transporte durante COMMIT exige verificar o catálogo antes de tentar novamente.

O SQL da migration 023 permanece inalterado. A concessão explícita ocorre na mesma transação do executor, evitando tabela aplicada sem grant quando o grant falhar. O executor não substitui os pré-requisitos de autenticação/RBAC já existentes.

Comandos de referência para uma etapa FUTURA autorizada (não executados):

```powershell
# Revisão sem conexão:
node backend/laboratorio/migrar-login-023.cjs --plano

# Somente após aprovação e injeção privada das credenciais do operador:
node backend/laboratorio/migrar-login-023.cjs --executar --banco inventario_nr33_multitenant_dev --confirmacao 'APLICAR 023 inventario_nr33_multitenant_dev'
```

Não executar agora. Usar sessão dedicada, sem overrides, e remover/restaurar as variáveis privadas de credencial ao encerrá-la. O executor não imprime nem gera essas credenciais.

## Testes e limites da evidência

- preflightLogin.test.js: configuração/HMAC ausente e inválido, tabela ausente, tipos/defaults/nulabilidade, CHECKs alterados/não validados, índices ausentes/inválidos/parciais, papel/banco/host/versão incorretos, privilégios individuais, sete perfis/fundador/FKs, falha SQL e preservação da base anterior. Todos os erros impedem até carregar o app/listen; caminho válido usa pool/HTTP simulados, sem socket real.
- migration023Executor.test.js: fonte fixada, confirmação/destino/overrides recusados, tabela preexistente, ausência de direitos DDL/papel, fluxo válido com cliente simulado, atomicidade dos grants, rollback e ausência de repetição/destruição em erros.
- ambienteLocalPowershell.test.js e helper .ps1: validam formato, restauram valores presentes/ausentes em sucesso/falha e exercitam o finally real do inicializador no caminho HMAC inválido, que aborta antes da geração de JWT ou de qualquer chamada a Node. Função node bloqueada no processo de teste. Só usam constantes sintéticas em processo descartável. Também analisam a sintaxe PowerShell sem executar as etapas operacionais.
- postgresLocalPreparacao.test.js e loginProtecao.test.js atualizados para a validação HMAC compartilhada e seu novo pré-requisito.

Os snapshots de catálogos são sintéticos: não comprovam o formato real de pg_get_constraintdef/pg_get_expr no banco alvo, conectividade ou permissões reais. A verificação estrita pode recusar uma definição semanticamente equivalente, uma extensão futura de schema ou índice extra; nesse caso deve haver revisão, não bypass. Uma alteração de esquema após o preflight continua podendo afetar o serviço; a configuração deve permanecer estável durante a homologação.

## Riscos remanescentes

- Aplicação da 023, concessões efetivas e homologação real de catálogos/locks continuam pendentes de aprovação.
- Ausência de HMAC, 022/RBAC ou demais estruturas deve agora impedir a partida, não criar/reparar automaticamente o banco.
- O launcher continua com o comportamento anterior de gerar JWT_SECRET local a cada partida. Não foi alterado neste passo; um reinício invalida JWT antigos independentemente da persistência das tentativas.
- Lock durante bcrypt, carga do pool, política por IP atrás de proxy e negação temporária de acesso por e-mail conhecido continuam sujeitos à homologação e às decisões documentadas no passo 25.
- verificar-login-25.cjs permanece destinado ao banco descartável inventario_nr33_login_test; não deve ser apontado ao banco multitenant de desenvolvimento.

## Arquivos deste passo

Modificados: backend/laboratorio/servidor-local.cjs, backend/laboratorio/postgresLocal.cjs, backend/laboratorio/postgres-local.ps1, backend/src/services/loginProtecaoService.js, backend/tests/loginProtecao.test.js e backend/tests/postgresLocalPreparacao.test.js.

Criados: backend/laboratorio/preflight-login.cjs, backend/laboratorio/ambiente-local.ps1, backend/laboratorio/migrar-login-023.cjs, backend/src/utils/loginHmac.js, backend/tests/preflightLogin.test.js, backend/tests/migration023Executor.test.js, backend/tests/ambienteLocalPowershell.test.js, backend/tests/helpers/preflightLoginFixture.cjs, backend/tests/helpers/ambienteLocalTeste.ps1 e este relatório.

Referências técnicas: https://www.postgresql.org/docs/17/catalog-pg-constraint.html ; https://www.postgresql.org/docs/17/catalog-pg-index.html ; https://www.postgresql.org/docs/17/functions-info.html .

## Resultados finais executados

- Backend completo: 4.127/4.127 testes aprovados, zero falhas e zero skips. Execução com preload tests/helpers/evidenciaIsolamentoPreload.cjs, que bloqueia PostgreSQL real, dotenv e arquivos reais de evidência.
- ESLint recommended: aprovado nos 12 arquivos JavaScript/CommonJS backend modificados/criados neste passo, utilizando a instalação existente do frontend, sem instalar dependências ou gravar configuração.
- npm run lint do frontend: aprovado; não houve alteração de interface neste passo.
- node --check: aprovado nos inicializadores, executor, módulos e testes novos/alterados.
- Parser PowerShell: aprovado para postgres-local.ps1 e ambiente-local.ps1; teste de restauração também aprovado em processo isolado.
- git diff --check: aprovado.
- Migration 023: fonte preservada e assinatura validada em teste; executor testado exclusivamente com cliente simulado.
- Nenhuma conexão ou operação executada no PostgreSQL; nenhum backend real iniciado/reiniciado. A execução válida de listen nos testes é integralmente simulada. Não foram gerados nem gravados segredos reais.

Aguarda revisão do usuário. A aplicação da migration, configuração de segredos reais, partida do backend e homologação com PostgreSQL dependem de autorização futura explícita.
