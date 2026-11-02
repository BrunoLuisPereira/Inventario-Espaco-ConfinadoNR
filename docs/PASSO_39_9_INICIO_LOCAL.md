# Início local da recuperação de senha

> Atualização do PASSO 39.12: o inicializador reutiliza a credencial CLIXML protegida existente, sem solicitar senha em cada execução. Consulte `PASSO_39_12_ACESSO_LOCAL.md` para verificação e sincronização supervisionada.

Na raiz do projeto, em PowerShell:

```powershell
powershell -NoProfile -File .\iniciar-recuperacao-local.ps1
```

Se `mailpit.exe` não estiver no PATH ou nos caminhos locais reconhecidos:

```powershell
powershell -NoProfile -File .\iniciar-recuperacao-local.ps1 -MailpitExecutable 'C:\caminho\mailpit.exe'
```

Pré-requisitos: PostgreSQL 17 existente em 127.0.0.1:5432, migration 024 já aplicada, dependências Node instaladas, chaves JWT/HMAC protegidas existentes e senha atual de `nr33_dev_app`. Não há instalação de pacotes, migração, redefinição de senha ou operação Git pelo inicializador.

O script verifica PostgreSQL/Mailpit e portas, inicia Mailpit quando necessário somente em 127.0.0.1 (SMTP 1025, UI 8025), solicita a senha oculta e usa stdin privado para os filhos. Não salva senhas, não edita `.env` e não altera o ambiente do PowerShell chamador. Reutiliza `postgres-local.ps1 -Etapa Backend` com todas as suas validações, API 3000 e worker, e inicia Vite na porta 5174. Configurações SMTP/URL são temporárias nos filhos.

O pré-check PostgreSQL é READ ONLY e bloqueia a partida caso haja solicitações de recuperação ainda processáveis na fila: assim o worker não envia mensagens antigas automaticamente. O script não solicita recuperação. Depois de pronto, solicitar o link apenas pela interface. A operação normal do backend/worker utiliza o banco conforme o fluxo existente.

- Login: http://127.0.0.1:5174/login
- Caixa: http://127.0.0.1:8025

Ctrl+C encerra somente as árvores de processos iniciadas por este comando. Mailpit preexistente é preservado. Se um Mailpit existente estiver escutando em 0.0.0.0/::, a partida é recusada; encerre-o manualmente e repita para que o inicializador o abra com os binds locais seguros. Nenhum processo preexistente é encerrado automaticamente.

Mensagens de falha distinguem PostgreSQL ausente, senha recusada, fila pendente, migration/permissões, portas ocupadas, Mailpit não encontrado e falha de inicialização do backend/frontend. O launcher continua responsável pela validação de JWT/HMAC; a saída privada dos filhos não é impressa.

Arquivos novos: inicializador da raiz, `backend/laboratorio/iniciar-recuperacao-backend.ps1`, `backend/laboratorio/verificar-inicio-recuperacao.cjs`, `backend/tests/iniciarRecuperacaoLocal.test.js` e este roteiro. Scripts de segurança existentes permanecem intactos.
