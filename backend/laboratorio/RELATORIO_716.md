# PASSO 716 — sincronização corrigida e frontend real integrado

Branch feature/multi-tenant; HEAD preservado 6b9fa63. Sem staging, commit, push,
merge, reset, Docker, alterações em .env ou acesso aos bancos antigos.

## Diagnóstico comprovado e correção

O diagnóstico real identificou SQLSTATE 42P08 na função finalizar de
sincronizacaoMultiTenantRepository.js: parâmetro $4 do UPDATE sincronizacao,
com inferência conflitante text/character varying, posição 37.
SET status e o CASE de data_sincronizacao agora usam $4::varchar(20).
Nenhuma regra de ambiente, autorização, versionamento ou idempotência foi relaxada.

O auxiliar anterior esperava sucesso de um segundo processamento. O contrato
existente recusa esse processamento com 409, pois a operação já foi aplicada.
O teste real foi corrigido para verificar reenvio idempotente do registro,
mesma operação/entidade e recusa do segundo processamento, sem enfraquecer o contrato.

## Implementação

- Cadastro público aceita nome_ambiente opcional, até 180 caracteres; omissão
  mantém o comportamento anterior. UUID e primeiro ADMINISTRADOR continuam
  exclusivamente gerados pelo backend. Nome de usuário permanece até 120.
- /cadastro: nome completo, empresa/ambiente, e-mail, senha e confirmação.
- /login: Criar conta e Tenho um convite visíveis; login real e sessão revalidada.
- /convites/aceitar: nome/senha/confirmação e token; ambiente/perfil vêm do convite.
- /convites: emissão administrativa, link mostrado uma vez, sem envio de e-mail.
  O token fica no fragmento da URL, não no caminho/query HTTP; referrer bloqueado.
- Sidebar esquerda preservada com Dashboard, Campanhas, Locais, Usuários,
  Convites, Relatórios e Configurações. Menus e rotas administrativas protegidos
  por perfil atual; backend continua exigindo autorização própria.
- Listas de locais, usuários e relatórios; campanhas e cadastro de locais preservados.
- Sidebar mobile mantém abrir/fechar/overlay/Escape; controles têm aria-expanded.
- Entrada isolada real acrescenta routers existentes de checklist, dados técnicos
  e relatórios. app.js principal não foi alterado. Upload/download de evidências
  e integração de todas as rotas restantes ainda exigem etapa específica.
- API real não cai em demo por falha. Demo só é ativada pelo modo demo explícito.

## Resultados

- Backend simulado completo: **3.450/3.450**, zero falhas/ignorados/cancelados,
  preload de isolamento em todos os subprocessos e NODE_OPTIONS restaurado.
- Frontend: **41/41**, lint e builds normal/demo aprovados.
- Novas regressões: 1 de SQL tipado, 6 de nome do ambiente, 11 de conta/frontend.
- PostgreSQL 17.10 real: 23 recusas nos serviços A/B, cadastro/login/convites,
  aceite concorrente (um sucesso/um 409), sincronização LOCAL aplicada e reenvio
  sem duplicação. Marcador sintético: passo715_65447d8ab491.
- Nova rodada relacional: 9 recusas cruzadas, versões 1/2/3 nas cinco entidades,
  cinco tombstones, cascata de relatório, rollback confirmado e bloqueio de e-mail
  entre duas conexões. Essa fixture foi revertida por rollback.
- Navegador real: cadastro A/B, confirmação de senha, login, campanha/local,
  recarga, isolamento de listas e IDs externos, convite/aceite, engenheiro sem
  menus/endpoints administrativos, desktop 1440x1000 e mobile 390x844, logout.
  **82 chamadas à API real, zero requisições externas, zero exceções JavaScript.**
- Conexão PostgreSQL independente confirmou o marcador ui716_552c94c46c:
  **2 ambientes UUID distintos, 3 usuários, 2 campanhas, 1 local, 1 convite aceito**;
  nomes Empresa A/B preservados e engenheiro vinculado exclusivamente a A.
- Dados sintéticos dos passos anteriores e das tentativas de teste preservados.
  Nenhum arquivo físico de evidência/PDF foi acessado, e nenhuma senha/token foi
  impresso em logs. As capturas mostram somente dashboards de contas sintéticas.

Capturas da rodada aprovada: desktop-administrador.png e mobile-engenheiro.png,
no diretorio temporario privado informado pela execucao. Caminhos pessoais e
imagens nao sao versionados.

## Uso manual imediato

Backend 3001 e frontend 5174 foram iniciados para os testes. Abra
http://127.0.0.1:5174/cadastro e crie sua conta de teste; não são necessárias
credenciais das contas sintéticas automatizadas. Cada cadastro cria novo ambiente.
Para convidar engenheiro, entre como administrador e use Convites; compartilhe o
link por canal privado, saia e aceite o convite com o e-mail convidado.

**Banco já instalado: não executar Instalar nem repetir migrações.**
Se os processos forem encerrados, iniciar backend com a credencial DPAPI privada
existente, usando o mesmo usuário Windows que a criou:

```powershell
if (-not $env:NR33_CREDENCIAL_DPAPI_ARQUIVO) { throw 'Informe o caminho privado da credencial DPAPI fora do repositorio.' }
$cred716 = Import-Clixml -LiteralPath $env:NR33_CREDENCIAL_DPAPI_ARQUIVO
& .\backend\laboratorio\postgres-local.ps1 -Etapa Backend -Banco inventario_nr33_multitenant_dev -Executar -Confirmacao 'BACKEND inventario_nr33_multitenant_dev' -SenhaAplicacao $cred716.Password
```

Em outro terminal:

```powershell
node .\frontend\node_modules\vite\bin\vite.js --config .\backend\laboratorio\vite.config.mjs --mode laboratorio
```

O backend usa apenas 127.0.0.1:5432/inventario_nr33_multitenant_dev e papel
nr33_dev_app, sem .env. Reiniciar gera JWT secreto novo e exige novo login.

Repetir o roteiro de navegador (faz novas escritas sintéticas, sem limpeza):

```powershell
node --experimental-websocket .\frontend\scripts\testar-real-navegador.mjs
```

## Limites

Esta etapa não declara homologação integral de produção, de todos os fluxos
offline, filesystem ou recuperação de senha. Evidências offline automáticas
continuam fora do processamento implementado. Operações de campanha/local e
conta foram verificadas com backend e banco reais; cenários adicionais de
revogação concorrente, PDFs e uploads precisam de homologação própria.
Usuários estão em listagem; não foi criada nova política administrativa ou
de último administrador. ACLs dos bancos antigos não foram consultadas/alteradas.
As pendências Git dos passos anteriores permanecem para revisão conjunta.

## Parametrizacao dos auxiliares no checkpoint anterior ao RBAC

Este relatorio descreve a execucao historica do PASSO 716. As telas e o sidebar
receberam melhorias posteriores; nao representa implementacao do PASSO 723.

- simular-limpeza-717.cjs exige NR33_PLANO_717_PASTA com diretorio privado
  absoluto fora do repositorio; os e-mails preservados continuam recebidos
  por variaveis de ambiente, sem valores pessoais no codigo.
- executar-limpeza-718.cjs exige NR33_PLANO_718_ARQUIVO com o caminho absoluto
  do inventario privado fora do repositorio. O hash aprovado e os limites da
  limpeza historica permanecem obrigatorios; nao e um executor generico.
  A limpeza ja foi concluida: nao repetir esses scripts no banco em uso.
- verificar-usuarios.mjs --real recebe NR33_EMAIL_ADMIN_A_722,
  NR33_EMAIL_ADMIN_B_722, NR33_ID_ADMIN_A_722, NR33_ID_ADMIN_B_722,
  NR33_SENHA_ADMIN_A_722 e NR33_SENHA_ADMIN_B_722 exclusivamente no ambiente
  temporario do processo. Usar entrada privada para senhas e restaurar todas
  as variaveis ao terminar. As senhas nao sao herdadas pelo Chrome.
- Sem --real, verificar-usuarios.mjs utiliza somente API simulada no navegador
  de teste; isso nao modifica o modo de funcionamento da aplicacao.
- O caminho da credencial DPAPI e informado por NR33_CREDENCIAL_DPAPI_ARQUIVO;
  o arquivo criptografado continua privado, fora do Git.

O checkpoint nao exige nem autoriza nova instalacao, limpeza ou teste real.
