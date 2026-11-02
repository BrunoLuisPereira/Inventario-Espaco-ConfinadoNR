# PASSO 39.4 — Aplicação supervisionada e homologação local

Código preparado na branch `feature/recuperacao-senha-email`. Nenhuma migration foi aplicada ao banco real; nenhum envio foi realizado. Este roteiro substitui as instruções de e-mail/ativação do PASSO 39.2.

## Correções implementadas

- A migration 024 permanece transacional e preserva usuários, hashes e ambientes. Inclui versão de sessão inicial zero, tokens com estado pendente/ativo, contadores e fila persistente de solicitações. Concede somente SELECT/INSERT/UPDATE/DELETE nas três novas tabelas a `nr33_dev_app`, incluindo limpeza; remove acesso de PUBLIC. Não altera migrations anteriores.
- A API enfileira igualmente e-mails existentes e inexistentes. Não consulta a conta nem aguarda SMTP na resposta. Limites: 20 solicitações/IP, 5/e-mail e 30 redefinições/IP a cada 15 minutos; o limite por e-mail mantém a resposta genérica.
- O worker consulta a conta fora do HTTP, cria token pendente e só o ativa após confirmação de entrega pelo transporte. Consumo exige `ativado_em IS NOT NULL`. Se envio e invalidação falharem simultaneamente, o token permanece pendente e não pode redefinir a senha.
- Reserva persistente de dois minutos, com nonce e SKIP LOCKED, permite múltiplos workers sem reivindicar o mesmo trabalho. Ativação exige reserva atual e válida. Após interrupção, até três reivindicações são permitidas; nenhuma tentativa ativa token de envio não confirmado. Uma nova tentativa emite outro token, invalidando o anterior. Trabalho muito antigo deixa de ser processado.
- Falhas de envio tratadas não são reenviadas automaticamente: o usuário solicita outro link. Quedas antes da conclusão permitem recuperação pela reserva. Retenção de filas e tokens expirados é de um dia, com limpeza limitada a 100 registros por passagem.
- Troca autenticada e redefinição revogam sessões anteriores; a troca autenticada invalida tokens e cancela solicitações enfileiradas para o e-mail da conta, atomicamente. O frontend encerra a sessão atual e encaminha ao login. Ambiente e perfil continuam provenientes do banco.
- Não há transporte de console, retorno público de token ou registro de destinatário/link/credenciais. O transporte em memória continua exclusivo dos testes.

## 1. Revisão sem conexão

Na raiz do projeto:

```powershell
node .\backend\laboratorio\migrar-recuperacao-024.cjs --plano
```

Também pode executar `powershell -NoProfile -File .\backend\laboratorio\aplicar-recuperacao-024.ps1` sem argumentos: somente imprime o plano. Nenhuma senha ou conexão é solicitada.

O executor aceita exclusivamente PostgreSQL 17 em `127.0.0.1:5432`, banco `inventario_nr33_multitenant_dev`. Não é o endereço Docker `55432`. Identidade conectada é validada antes do DDL. Não usa `.env`, senha em argumentos nem o pool da aplicação. A fonte SQL é fixada por SHA-256; qualquer alteração exige revisão e atualização deliberada do hash.

## 2. Aplicar somente após autorização

Parar instâncias antigas do backend, garantir backup pelo procedimento administrativo existente e revisar o plano. Confirmar o destino e os pré-requisitos 020, RBAC/fundador da 022 e proteção de login da 023.

Comando exato, a partir da raiz, **não executado nesta etapa**:

```powershell
powershell -NoProfile -File .\backend\laboratorio\aplicar-recuperacao-024.ps1 -Banco inventario_nr33_multitenant_dev -Executar -Confirmacao "APLICAR 024 inventario_nr33_multitenant_dev"
```

O wrapper solicita a senha de `postgres` com entrada oculta; não a salva. Envia-a somente por stdin para um filho com ambiente limpo. O operador deve ser proprietário efetivo de usuário e poder criar objetos no schema. O executor verifica FK composta anterior, papel da aplicação sem privilégios administrativos, ausência dos objetos 024 e presença dos pré-requisitos. Define `lock_timeout=3s`, `statement_timeout=10s`, serializa executores e executa DDL e concessões em uma única transação.

Antes do COMMIT, verifica tabelas, índices válidos, coluna/valor inicial/restrição da versão, FK, estado de ativação, permissões efetivas de aplicação e ausência de grants a PUBLIC. Só informa sucesso após confirmação do COMMIT.

Se houver erro anterior ao COMMIT, faz rollback. Se a confirmação do COMMIT for perdida, o resultado é incerto: verificar catálogo com o operador antes de repetir. Nunca repetir automaticamente nem excluir objetos. A operação não é idempotente. Não remover a versão de sessão nem voltar a um backend que ignore sua validação após uso da recuperação.

## 3. Preparar a caixa local (etapa manual posterior)

Utilizar Mailpit sem relay. O padrão captura SMTP em 1025 e disponibiliza caixa em 8025 ([documentação oficial](https://mailpit.axllent.org/docs/install/docker/)). Exemplo manual, não iniciado nesta etapa:

```powershell
docker run --rm --name nr33-mailpit-local -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit
```

Não configurar relay, credenciais SMTP ou envio externo. Alternativamente, usar a instalação local do Mailpit disponível na máquina. Caixa: `http://127.0.0.1:8025`.

Em outro PowerShell, definir somente configurações não secretas da sessão atual, sem editar `.env`:

```powershell
$env:EMAIL_TRANSPORT = 'local-smtp'
$env:SMTP_HOST = '127.0.0.1'
$env:SMTP_PORT = '1025'
$env:EMAIL_FROM = 'nr33@example.invalid'
$env:APP_PUBLIC_URL = 'http://127.0.0.1:5174'
$env:NR33_BACKEND_PORT = '3000'
```

`EMAIL_FROM` é um endereço de teste, não uma credencial. O adaptador Nodemailer só aceita IP literal de loopback, recusa autenticação e mantém debug/logger desabilitados; não permite ler arquivos/URLs de mensagens. Conexões externas não são permitidas. A confirmação exige exatamente um destinatário aceito e nenhum rejeitado ([contrato SMTP](https://nodemailer.com/smtp)). Sem configuração, permanece desabilitado e a solicitação retorna 503 para todos os e-mails, sem enfileirar ou emitir tokens.

## 4. Iniciar backend e frontend após a migration

Na raiz, no PowerShell configurado acima, usar o launcher existente e as chaves protegidas já preparadas:

```powershell
$senhaAppHomologacao = Read-Host 'Senha existente de nr33_dev_app' -AsSecureString
try {
  .\backend\laboratorio\postgres-local.ps1 -Etapa Backend -Banco inventario_nr33_multitenant_dev -Executar -Confirmacao 'BACKEND inventario_nr33_multitenant_dev' -SenhaAplicacao $senhaAppHomologacao
} finally {
  $senhaAppHomologacao.Dispose()
}
```

Esse comando usa somente `-Etapa Backend`, nunca `Instalar`. O launcher carrega JWT/HMAC protegidos já existentes; não os recria. O worker inicia no backend somente com `EMAIL_TRANSPORT=local-smtp` e encerra antes do pool no launcher local.

Em outro terminal, na pasta `frontend`:

```powershell
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

As portas são intencionais: frontend 5174, API 3000, PostgreSQL 5432. O proxy Vite existente aponta para 3000. Abrir `http://127.0.0.1:5174/login`.

## 5. Homologação supervisionada

1. Confirmar login de uma conta de teste já existente antes de solicitar recuperação. Confirmar que usuários/ambientes existentes continuam acessíveis. JWTs antigos sem `sv` equivalem a zero até a primeira revogação da conta.
2. Solicitar recuperação para essa conta. A resposta é genérica (202). O worker processa em segundo plano; abrir a mensagem na caixa Mailpit e clicar no link, sem copiar tokens para terminal, logs, capturas ou chat.
3. Definir senha com pelo menos oito caracteres e no máximo 72 bytes UTF-8. Confirmar retorno ao login, senha antiga recusada e nova senha aceita. Conferir outra sessão/aba antiga: deve receber 401 ao acessar a API ou revalidar.
4. Reabrir o mesmo link: deve ser recusado. Solicitar outro link e verificar que o anterior deixa de funcionar. Não exceder 5 solicitações/e-mail em 15 minutos durante a homologação.
5. Solicitar para um endereço inexistente: mesma resposta pública; nenhuma mensagem é emitida. Confirmar que SMTP indisponível não aumenta o tempo da resposta HTTP com base na existência da conta.
6. Parar Mailpit e solicitar outro link. A API continua genérica com o transporte configurado, mas o worker não ativa token de envio não confirmado. Reiniciar Mailpit e fazer nova solicitação. Não esperar reenvio automático de uma falha já tratada.
7. Emitir link, fazer troca autenticada da senha e tentar o link anterior: deve ser recusado. A sessão usada na troca também termina. Solicitações ainda na fila devem ser canceladas.
8. Repetir com conta de teste de outro ambiente e confirmar que perfis e vínculos não mudam. Nunca informar ambiente ou perfil na recuperação.
9. Para expiração, aguardar 30 minutos; não alterar relógio do sistema nem registros do banco persistente.

Ao terminar, encerrar backend/frontend/Mailpit e fechar o PowerShell configurado; suas variáveis temporárias desaparecem. Usar contas de teste, pois redefinir senha é uma alteração real de credencial depois da autorização.

## Testes automatizados e limites desta entrega

Os testes usam driver, SMTP e banco simulados, sem ler `.env` ou conectar ao PostgreSQL real. Cobrem grants/contrato SQL, executor, preflight/pós-condições, rollback/COMMIT incerto, login/versões, ativação, falha dupla, concorrência, fila, limites, isolamento e troca autenticada. Lint/build são do frontend; o backend não possui script de lint, sendo verificado por `node --check`.

Validação desta etapa: 1.802 testes do backend e 133 do frontend aprovados, sem falhas ou skips; lint, build, sintaxe JavaScript/PowerShell e `git diff --check` aprovados.

A execução real da migration e a homologação PostgreSQL/Mailpit permanecem pendentes de autorização; não são alegadas como concluídas. Não há pendência de implementação de adaptador para a caixa local. Não foram alterados convites, PDFs, migrations anteriores, `.env`, segredos ou stash; sem commit/push/merge.

## Arquivos desta correção

- Migration: `backend/database/024_recuperacao_senha.sql`.
- Executor/canal: `backend/laboratorio/migrar-recuperacao-024.cjs`, `migration-024-canal.cjs`, `aplicar-recuperacao-024.ps1`.
- Recuperação/e-mail: `backend/src/repositories/recuperacaoSenhaRepository.js`, `backend/src/services/recuperacaoSenhaService.js`, `emailService.js`, novo `recuperacaoSenhaWorker.js`.
- Revogação: `backend/src/repositories/contaMultiTenantRepository.js`, `frontend/src/pages/Configuracoes.jsx`.
- Inicialização: `backend/src/server.js`, `backend/laboratorio/servidor-local.cjs`.
- Dependência SMTP: `backend/package.json` e `backend/package-lock.json` (Nodemailer; instalação sem scripts).
- Testes: `backend/tests/recuperacaoSenha.test.js`, `recuperacaoSenhaRepository.test.js`, `contaPerfilRegressao.test.js`, novos `migration024Executor.test.js` e `emailLocalWorker.test.js`; simuladores `helpers/contaSimulada.cjs` e `helpers/idsBigintSimulados.cjs`.
- Documentação: este roteiro e indicação de substituição em `docs/PASSO_39_2_RECUPERACAO_SENHA.md`.
