# PASSO 702 — laboratório PostgreSQL preparado, ainda não executado

Frontend aprovado preservado no commit `e06e4ac`. Os arquivos deste laboratório
e as alterações backend/SQL permanecem **sem staging e sem commit**, para revisão.

## Destino proposto para aprovação específica

| Recurso | Valor |
|---|---|
| Banco novo | `nr33_lab_20261018_702a9f` |
| Container novo | `nr33-lab-20261018-702a9f` |
| Rede interna nova | `nr33-lab-20261018-702a9f-rede` |
| Imagem previamente disponível e aprovada | `postgres:17.10` |
| PostgreSQL publicado | `127.0.0.1:55432` |
| Backend exclusivo | `127.0.0.1:3001` |
| Frontend real do laboratório | `127.0.0.1:5174` |
| Papel da aplicação | `nr33_lab_app`, sem superusuário, criação de banco/papel ou replicação |

Não utilizar os bancos principal e homologação. Não utilizar portas, credenciais,
volumes, diretórios de dados, uploads ou PDFs existentes. A imagem deve estar
disponível localmente: `--pull=never` impede download implícito. Instalação de
Docker ou obtenção de imagem exige decisão separada, se necessária.

O cluster usa **tmpfs**, sem volume do host. Parar/reiniciar o container pode
descartar seus dados; não é backup. UTF-8 e locale C são escolhas explícitas
para dados sintéticos, não reprodução comprovada da collation da fonte.
O funcionamento de tmpfs, rede interna e publicação no Docker Desktop Windows
deverá ser comprovado na execução autorizada. Não foi testado neste passo.

## Artefatos preparados

- `database/000_baseline_homolog_observado.sql`: nove tabelas, nove identities,
  doze FKs, constraints, índices, função e cinco triggers, derivados do snapshot
  SHA-256 `FA133C8B3DCBFC9851BE023E64C3125FE06E8733B4E693FA54C1BFC0F86F01F3`.
  Não contém dump bruto, dados, owners, ACLs ou configurações da fonte.
- `database/020_multi_tenant_ambientes_convites.sql`: execução restrita ao
  laboratório, lock e rejeição de qualquer registro legado, sem tenant implícito
  ou UPDATE de campanhas durante backfill; função transitória bloqueia escritas
  versionadas até a 021. Mantidos avisos EM CONSTRUCAO.
- `database/021_multi_tenant_versionamento.sql`: remove ID fixo 2; inicializa
  versões ausentes das cinco entidades pela ancestralidade comprovada, sem
  reiniciar versões existentes ou reviver tombstones. Inconsistência bloqueia
  a operação. Versão 1 é inicialização, nunca recuperação de histórico perdido.
- `gerar-baseline.cjs`: derivação verificável, hash obrigatório e escrita exclusiva.
  Já utilizado para preparar o baseline. Não reexecutar para sobrescrever arquivo.
- `montar-sql.cjs`: combina somente 000, 020, 021 numa transação externa única,
  exigindo guardas e destino exato; recusa operações de criação/troca de banco.
- `laboratorio.ps1`: etapas explicitamente confirmadas, sem execução por padrão.
  Recusa reutilização de container/rede, Docker remoto, overrides e credenciais
  preexistentes. Não apaga recursos automaticamente em caso de falha.
- `app.cjs` e `servidor.cjs`: entrada isolada, sem `src/app.js` ou dotenv; prova
  Docker local/container/binding antes de carregar o pool; verifica banco, papel
  e estrutura antes de ouvir HTTP. Monta cadastro, convites, auth, usuários,
  campanhas e locais; não monta arquivos, PDFs ou demais módulos.
- `vite.config.mjs`: frontend existente, modo real com proxy exclusivo 3001,
  porta 5174, loopback e `envDir:false`. Não modifica o frontend commitado.
- `validar-integridade.sql`: casos sintéticos de versões, cascata, tombstones,
  FK composta e autoria externa; tudo dentro de transação com ROLLBACK.
- `fluxos-http.cjs`: cadastro A/B e engenheiro por convite, login, listas,
  criação, IDs externos/inexistentes, forja, BIGINT textual e inatividade.
  Confere health com marcador/banco exatos antes da primeira escrita.

**Não reaplicar 004–019 sobre este baseline.** O executor antigo
`database/testar_multi_tenant_homolog.ps1` não foi alterado e não deve ser usado.

Os nomes de usuários em cadastro/aceite foram alinhados a **120 caracteres**,
conforme decisão aprovada no PASSO 700. O default de campanha é EM ANDAMENTO.
O teste antigo de limite 180 foi ajustado ao novo limite; adicionados casos
120/121 que verificam recusa antes de conectar. Atualização de perfil e outros
campos ainda exigem revisão de limites completa em homologação.

## Comandos propostos — AGUARDAM APROVAÇÃO, não foram executados

Na raiz do repositório, em PowerShell sem `.env`, NODE_OPTIONS, overrides Docker
ou variáveis de credenciais reais. Os SecureStrings abaixo são novos e sintéticos;
não reutilizar senhas reais e não imprimir seus conteúdos.

```powershell
$banco702 = 'nr33_lab_20261018_702a9f'
$senhaAdmin702 = ConvertTo-SecureString ([Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')) -AsPlainText -Force
$senhaApp702 = ConvertTo-SecureString ([Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')) -AsPlainText -Force

# 1. Cria exclusivamente rede/container novos, nunca utiliza um existente.
& .\backend\laboratorio\laboratorio.ps1 -Etapa Criar -Banco $banco702 -Executar -Confirmacao "CRIAR $banco702" -SenhaAdministrador $senhaAdmin702

# 2. Somente inspeção do container novo; aguardar 'healthy'.
docker inspect --format '{{.State.Health.Status}}' nr33-lab-20261018-702a9f

# 3. Baseline + 020 + 021 + papel limitado numa única transação.
& .\backend\laboratorio\laboratorio.ps1 -Etapa Migrar -Banco $banco702 -Executar -Confirmacao "MIGRAR $banco702" -SenhaAplicacao $senhaApp702

# 4. Valida integridade com dados sintéticos e ROLLBACK.
& .\backend\laboratorio\laboratorio.ps1 -Etapa Validar -Banco $banco702 -Executar -Confirmacao "VALIDAR $banco702"

# 5. Neste terminal: backend isolado, sem src/server.js ou .env.
& .\backend\laboratorio\laboratorio.ps1 -Etapa Backend -Banco $banco702 -Executar -Confirmacao "BACKEND $banco702" -SenhaAplicacao $senhaApp702
```

Em um segundo terminal, após health aprovado e autorização dos testes HTTP:

```powershell
node .\backend\laboratorio\fluxos-http.cjs --executar --banco nr33_lab_20261018_702a9f
```

O teste deixa somente cadastros sintéticos no laboratório; não é uma limpeza.
Imprime o e-mail da conta A para teste manual. Sua senha fictícia, somente para
esse cluster descartável, é `LaboratorioSintetico702!`. Desativa a conta B ao
final para comprovar recusa do token existente. Cada execução usa e-mails novos.

Em um terceiro terminal, para navegador **com persistência PostgreSQL real no
laboratório**, sem modo demo:

```powershell
node .\frontend\node_modules\vite\bin\vite.js --config .\backend\laboratorio\vite.config.mjs --mode laboratorio
```

Abra **http://127.0.0.1:5174** e entre com a conta sintética A impressa pelo teste.
Cadastro inicial é exercitado pelo teste HTTP; a tela de cadastro inicial ainda
não foi adicionada ao frontend. Não confundir com a demonstração em 5173.

## Bloqueios e critérios antes de executar

1. Aprovação explícita do nome, imagem, portas, Docker local e comandos acima.
2. Confirmar que container/rede não existem e portas não estão ocupadas.
3. Revisão do diff SQL e hashes; comandos não executam scripts 004–019.
4. Reconhecer que nenhuma sintaxe/constraint/lock PostgreSQL foi homologada ainda.
5. Não importar dados legados: 020 os recusa. Migração de histórico exige política
   e mapeamento separados, inclusive para tombstones sem ancestralidade.
6. Validar o backfill da 021 com fixtures de versão ausente, versão já existente
   e tombstone inconsistente, além de testes simultâneos de revogação/deadlock.
7. Confirmar que falhas mantêm rollback, papel limitado e nenhum acesso cruzado.
8. Não remover avisos de segurança nem promover estes scripts a produção.

Não há destruição automática, comando de remoção de banco/container ou push.
Em falha, parar e diagnosticar: não trocar destino, permissões ou guardas para
forçar sucesso. A desmontagem futura requer autorização própria.

## Validação deste preparo

- Frontend: 30/30 testes, lint e builds normal/demo; 13 etapas de navegador aprovadas.
- Backend isolado: **3.405/3.405**, com preload em todos os processos, sem banco real.
- Novos testes: 26 de guardas/composição/estrutura e 4 de contrato de nomes.
- Sintaxe Node e PowerShell verificadas sem iniciar entradas ou executar SQL.
- SQL, Docker, rede, grants, persistência e concorrência: **ainda não executados**.

Hashes dos SQLs revisados (SHA-256):

| Arquivo | Hash |
|---|---|
| 000 | `E47D779C2BE881E8BA08BADBDA9DED87C7829FFDBBE613FF6673DF3D40A87AB7` |
| 020 | `CBDAC61C1241C86FBE86C66FF65F0FCDC23391AB0BBE48E7F9D434F644F94F0A` |
| 021 | `8B9AFE8145FB55D5D7495083F373D9B32B5660E0AD7B747665178C6BAC2C2311` |
