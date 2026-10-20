# PASSO 712 — PostgreSQL local, preparação sem conexão

Este procedimento substitui operacionalmente o Docker dos passos 702/710.
Os arquivos anteriores foram preservados como histórico, mas **não usar**
laboratorio.ps1, servidor.cjs ou comandos Docker para esta instalação.
Usar postgres-local.ps1 e servidor-local.cjs. Nenhum comando abaixo foi executado
contra PostgreSQL nesta preparação; criação e instalação aguardam aprovação.

## Destino único

- Banco: inventario_nr33_multitenant_dev
- Host: 127.0.0.1; PostgreSQL: 5432; backend: 3001; frontend: 5174.
- PostgreSQL servidor e cliente: versão principal 17.
- Administrador instalador: postgres, ou outro papel aprovado com CREATEDB e
  CREATEROLE e autoridade para criar objetos e conceder acesso no banco novo.
- Aplicação: nr33_dev_app, papel novo LOGIN, sem SUPERUSER, CREATEDB, CREATEROLE,
  REPLICATION ou BYPASSRLS. Não será proprietário do banco/tabelas.
- Não usar bancos principal/homologação como manutenção ou destino.

O papel PostgreSQL é global ao cluster. Criar nr33_dev_app altera o catálogo de
papéis da instância, não usuários da aplicação nem dados dos bancos protegidos.
Se esse papel já existir, a instalação falha; não o altera ou reutiliza.
Recebe CONNECT somente por grant explícito no banco novo, USAGE em public,
DML nas tabelas e USAGE/SELECT nas sequences. Não recebe TRUNCATE ou DDL.
ACLs dos bancos existentes permanecem intactas. Privilégios herdados de PUBLIC
nesses bancos são desconhecidos: não afirmar que um papel global seja tecnicamente
incapaz de conectar a outros bancos. As entradas preparadas fixam o destino e
não fazem essas conexões. Isolamento absoluto de instância exigiria outro cluster.

## 1. Criação manual pelo pgAdmin 4 — após aprovação

Conferir a conexão do servidor: 127.0.0.1:5432, versão 17.
Em Databases → Create → Database:

- Database: inventario_nr33_multitenant_dev
- Owner: postgres (ou instalador aprovado)
- Template: template0
- Encoding: UTF8

Não selecionar um banco protegido, restaurar dump com dados ou importar usuários.
Alternativa PowerShell, executada somente após aprovação:

```powershell
$psql712 = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
& $psql712 --no-psqlrc --host=127.0.0.1 --port=5432 --username=postgres --dbname=postgres --password --set=ON_ERROR_STOP=1 --command 'CREATE DATABASE inventario_nr33_multitenant_dev WITH OWNER = postgres TEMPLATE = template0 ENCODING = ''UTF8'';'
```

Esse comando conecta apenas ao banco de manutenção postgres e cria o banco de
nome literal. A senha administrativa é solicitada interativamente; não a inserir
no comando. Usar terminal limpo, sem variáveis PG*, NODE_OPTIONS ou configurações
reais carregadas. Collation/locale herdados de template0 precisam ser registrados
na homologação; não presumir equivalência com a fonte ou com o Docker.

## 2. Instalação do esquema — após aprovação

Na raiz do repositório, em PowerShell novo, sem .env ou overrides:

```powershell
$banco712 = 'inventario_nr33_multitenant_dev'
$senhaAdmin712 = Read-Host 'Senha do administrador PostgreSQL local' -AsSecureString
$senhaApp712 = Read-Host 'Nova senha de nr33_dev_app (32-128 caracteres A-Z/a-z/0-9/_/-)' -AsSecureString

& .\backend\laboratorio\postgres-local.ps1 -Etapa Instalar -Banco $banco712 -Executar -Confirmacao "INSTALAR $banco712" -Administrador postgres -SenhaAdministrador $senhaAdmin712 -SenhaAplicacao $senhaApp712
```

Escolher senha nova e guardá-la em gerenciador privado fora do Git antes de
fechar a sessão. SecureString em variável não é armazenamento persistente.
Não imprimir os valores, usar .env existente, transcrever SQL gerado ou gravar
um arquivo com senha no repositório.

O script não executa CREATE DATABASE. Ele conecta por psql somente ao destino
literal, usando -X, ON_ERROR_STOP, credenciais temporárias e saída sanitizada.
Executa baseline 000 → 020 → 021, papel e grants numa transação externa única.
Não reaplica 004–019. Compositor adapta guardas conhecidas somente em memória,
com current_database exato e marcador passo712. Originais SQL não são alterados.

Serão criadas 11 tabelas: ambiente, convite, usuario, campanha, local,
checklist_nr33, dados_tecnicos, evidencia, relatorio, sincronizacao e
versao_entidade. O baseline inclui identity BIGINT, GPS, critérios do checklist,
hash de PDF e campos de sincronização/conflitos. A 020 acrescenta vínculos UUID,
FKs compostas e e-mail normalizado global; a 021 instala o versionamento por
ambiente. A consulta prévia exige esquema public vazio e papel ainda inexistente.
Reexecutar a instalação não é suportado. Em falha: parar, sem reset ou limpeza.

## 3. Backend e frontend reais — após instalação e aprovação

No mesmo terminal, ou lendo novamente a senha privada:

```powershell
$banco712 = 'inventario_nr33_multitenant_dev'
# Se necessário em nova sessão:
# $senhaApp712 = Read-Host 'Senha privada de nr33_dev_app' -AsSecureString
& .\backend\laboratorio\postgres-local.ps1 -Etapa Backend -Banco $banco712 -Executar -Confirmacao "BACKEND $banco712" -SenhaAplicacao $senhaApp712
```

O backend cria pool explícito exclusivamente para 127.0.0.1:5432 e o banco novo;
não importa src/app.js nem .env. Confere banco, papel limitado, versão 17, as 11
tabelas e constraints de vínculo/versionamento antes de ouvir em loopback 3001.
Routers existentes reutilizam esse pool, evitando outro pool implícito.
JWT novo a cada início exige novo login. Variáveis temporárias são restauradas.

Em outro terminal:

```powershell
node .\frontend\node_modules\vite\bin\vite.js --config .\backend\laboratorio\vite.config.mjs --mode laboratorio
```

Abrir http://127.0.0.1:5174. O modo é real, sem mocks, com proxy para 3001 e
envDir:false. Cadastro inicial está em POST /api/cadastro/ambiente; ainda não há
formulário frontend de cadastro inicial ou aceite de convite.

O roteiro sintético A/B existente pode ser autorizado posteriormente:

```powershell
node .\backend\laboratorio\fluxos-http.cjs --executar --banco inventario_nr33_multitenant_dev
```

Ele cria dados reais sintéticos no banco novo, não envia e-mails e não limpa
registros automaticamente. Não foi executado nesta etapa.

## Limites e verificações pendentes

- Entradas locais recusam qualquer nome diferente, inclusive bancos protegidos,
  variantes de caixa, sufixos e strings de conexão. Scripts antigos não são a entrada local.
- Clientes PGHOSTADDR/PGSERVICE/PGOPTIONS e outras variáveis de redirecionamento
  preexistentes são recusados pelo instalador. Porta e host são literais.
- Nenhuma permissão ou dado de bancos protegidos será alterado por estes comandos;
  não executar comandos manualmente contra uma conexão diferente no pgAdmin.
- Não é possível comprovar locks, triggers/cascatas, rollback, grants, isolamento
  A/B ou concorrência apenas por testes simulados. Tudo exige execução autorizada.
- A entrada HTTP mantém cadastro, convites, autenticação, usuários, campanhas e
  locais. Demais tabelas são preparadas, mas seus routers não são montados aqui.
- Não modificar ACLs dos outros bancos para compensar permissões PUBLIC sem
  autorização específica. Nenhum parser global BIGINT é alterado.
