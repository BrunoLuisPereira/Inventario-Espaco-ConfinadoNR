# PASSO 710 — desenvolvimento PostgreSQL preparado, não executado

Destino explícito: `inventario_nr33_multitenant_dev`, PostgreSQL `postgres:17.10`
em container Docker local exclusivo. Não utiliza o PostgreSQL instalado no host.
Nenhuma instalação, criação de recurso, conexão ou migração foi executada neste passo.

| Recurso | Destino proposto |
|---|---|
| PostgreSQL | `127.0.0.1:55432` |
| Container | `nr33-multitenant-dev-710` |
| Rede interna | `nr33-multitenant-dev-710-rede` |
| Volume persistente exclusivo | `nr33-multitenant-dev-710-dados` |
| Backend | `127.0.0.1:3001` |
| Frontend real | `127.0.0.1:5174` |
| Papel de instalação | `postgres`, somente no cluster novo, pelo socket do container |
| Papel do backend | `nr33_dev_app` |

O papel da aplicação recebe CONNECT no banco, USAGE no schema public,
SELECT/INSERT/UPDATE/DELETE nas tabelas e USAGE/SELECT nas sequences.
Não recebe superusuário, criação de banco/papel, replicação, BYPASSRLS ou
propriedade do esquema. As funções de trigger permanecem com seus privilégios
de execução padrão. Não há RLS por tenant: o isolamento depende das consultas,
transações, autenticação e constraints da aplicação.

## Esquema e compatibilidade estática

Ordem única: baseline observado `000` → `020` → `021`, numa transação externa,
incluindo a criação do papel e grants. Não reaplicar 004–019.

O baseline cria usuario, campanha, local, checklist_nr33, dados_tecnicos,
evidencia, relatorio, sincronizacao e versao_entidade. A 020 acrescenta ambiente
e convite, totalizando **11 tabelas**, e os vínculos UUID de ambiente; a 021
instala o versionamento multi-tenant. IDs de domínio continuam BIGINT/identity,
recebidos como strings pelo driver. GPS e critérios explícitos do checklist
estão presentes, assim como chaves offline, conflitos, tombstones e hash de PDF.

As colunas usadas pelo cadastro inicial, login, consulta da identidade,
convites, campanhas e locais estão presentes. Nome de usuário limita-se a 120
caracteres e campanha inicia em EM ANDAMENTO. A compatibilidade é revisão
estática, não confirmação de instalação real ou de todos os limites de entrada.

A 020 recusa qualquer dado legado. Não atribui dados a uma empresa implícita.
A 021 não exige evidência ID 2 e não reinicia histórico conhecido. As fontes SQL
originais mantêm suas guardas de laboratório. Para o destino dev, o compositor
substitui **somente a guarda literal conhecida, uma vez por fonte, em memória**,
exigindo nome exato e `nr33.laboratorio=passo710`; divergência bloqueia a composição.
Nenhum SQL gerado é gravado em arquivo ou enviado a banco nesta preparação.

## Comandos propostos — executar somente após aprovação

Na raiz do projeto, PowerShell novo, sem carregar .env ou credenciais reais.
Docker Desktop Linux local deve estar disponível e a imagem `postgres:17.10`
já aprovada e instalada. O script utiliza `--pull=never`; não baixa imagem.
Portas 55432, 3001 e 5174 devem estar livres. Se algum recurso já existir, parar;
o instalador não reaproveita nem remove container, rede ou volume.

```powershell
$banco710 = 'inventario_nr33_multitenant_dev'
$senhaAdmin710 = ConvertTo-SecureString ([Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')) -AsPlainText -Force
$senhaApp710 = ConvertTo-SecureString ([Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')) -AsPlainText -Force

# Criação: a imagem oficial inicializa um cluster e cria POSTGRES_DB com o nome exato.
& .\backend\laboratorio\laboratorio.ps1 -Etapa Criar -Banco $banco710 -Executar -Confirmacao "CRIAR $banco710" -SenhaAdministrador $senhaAdmin710

# Inspeção apenas do container novo; aguardar healthy antes de migrar.
docker inspect --format '{{.State.Health.Status}}' nr33-multitenant-dev-710

# Instalação: 000 + 020 + 021 + nr33_dev_app/grants, ON_ERROR_STOP e transação única.
& .\backend\laboratorio\laboratorio.ps1 -Etapa Migrar -Banco $banco710 -Executar -Confirmacao "MIGRAR $banco710" -SenhaAplicacao $senhaApp710

# Backend no mesmo terminal: configura ambiente do processo e restaura ao encerrar.
& .\backend\laboratorio\laboratorio.ps1 -Etapa Backend -Banco $banco710 -Executar -Confirmacao "BACKEND $banco710" -SenhaAplicacao $senhaApp710
```

Manter os SecureStrings nessa sessão; não imprimir nem versionar seus valores.
Persistência dos dados não preserva essas variáveis após fechar o terminal.
Antes da criação, definir como guardar as novas credenciais em cofre local
privado, fora do Git. Não reutilizar credenciais dos bancos existentes.
JWT é novo a cada início; reiniciar backend exige novo login.

Em outro terminal, frontend sem mocks/demo e sem .env:

```powershell
node .\frontend\node_modules\vite\bin\vite.js --config .\backend\laboratorio\vite.config.mjs --mode laboratorio
```

Abrir `http://127.0.0.1:5174`. O proxy usa exclusivamente o backend 3001.
Não usar `src/server.js`, `npm start` do backend ou o modo demo para esta integração.

Após autorização dos testes HTTP e backend ativo, o roteiro existente cria
contas e recursos sintéticos A/B, exercita login, convites e isolamento:

```powershell
node .\backend\laboratorio\fluxos-http.cjs --executar --banco inventario_nr33_multitenant_dev
```

Esse comando faz escritas reais **no banco novo** e deixa os dados para revisão;
não é parte da preparação atual. A senha fictícia das contas de teste está
documentada em README.md. Não usar dados pessoais. O cadastro inicial também
está disponível em POST /api/cadastro/ambiente; ainda não há formulário frontend
implementado para esse cadastro ou aceite de convite.

## Proteções e pendências

- Lista positiva de nomes: somente laboratório nr33_lab válido ou o nome dev
  exato; bancos principal e homologação e variantes são recusados antes de Docker/pool.
- Exige -Executar, confirmação textual exata, Docker local e ausência de overrides
  de Docker/NODE_OPTIONS e de variáveis de credenciais preexistentes.
- Criação exige recursos novos; backend/migração comprovam label, imagem,
  binding loopback e montagem do volume exclusivo; PS também confere label do volume.
- Backend valida destino/papel/esquema antes de ouvir HTTP, sem importar app.js
  principal ou dotenv. A instalação usa psql apenas dentro do container confirmado,
  socket explícito, banco explícito e marcador de guarda.
- Volume é persistente, mas não é backup. Não existe exclusão automática.
- A entrada HTTP isolada mantém apenas cadastro, convites, auth, usuários,
  campanhas e locais. Demais tabelas existem no esquema, mas checklist, dados
  técnicos, evidências, relatórios e sincronização não são montados nessa entrada.
  O inventário completo do local ainda depende dessa integração posterior.
- A fixture SQL descartável da etapa Validar é recusada no destino persistente;
  sua autorização e adaptação precisam ser tratadas separadamente.
- Instalação limpa é prevista, não idempotente; repetir Migrar deve falhar sem
  sobrescrever dados. Não usar este procedimento como migração de banco existente.
- Confirmar Docker ativo, imagem local, portas, sintaxe PostgreSQL, grants,
  triggers/cascatas, locks, concorrência, reservas de e-mail e A/B em execução autorizada.
- Limites de campos de perfil e outros módulos ainda precisam de homologação.
- Novos testes puros de destino/volume/composição foram preparados, sem executar
  scripts do laboratório ou testes nesta etapa. Verificação sintática não comprova
  funcionamento PostgreSQL, Docker ou persistência.
