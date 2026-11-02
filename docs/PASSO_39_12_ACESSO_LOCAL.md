# Acesso local com credencial Windows existente

Foi identificada a aplicação incorreta da política de **criação** (32–128 caracteres alfanuméricos, `_`, `-`) durante o uso de uma senha PostgreSQL existente. A criação/instalação continua exigindo essa política. O caminho de autenticação existente aceita uma credencial não vazia, até 4096 caracteres e sem NUL; quem decide se ela está correta é o PostgreSQL.

O arquivo informado pelo usuário é reutilizado sem gravação: `%LOCALAPPDATA%\NR33-Dev-Privado\passo715-0f96ec9838574923b700d425574629b8\aplicacao.clixml`. A leitura exige o mesmo usuário Windows, DPAPI, proprietário/ACL privada, ausência de redirecionamento e identidade `nr33_dev_app`. Não há busca ou impressão de senhas.

## Iniciar normalmente

Na raiz do projeto:

```powershell
powershell -NoProfile -File .\iniciar-backend-local.ps1
```

Sem solicitação de senha. Primeiro autentica com a credencial salva usando transação READ ONLY e destino fixo PostgreSQL 17/127.0.0.1:5432/inventario_nr33_multitenant_dev. Depois reutiliza o launcher seguro existente, com as chaves JWT/HMAC protegidas, API na porta 3000. Transporte de e-mail fica desabilitado nessa partida normal, sem processamento automático de recuperações. Variáveis do chamador são restauradas na saída.

Verificação sem iniciar backend:

```powershell
powershell -NoProfile -File .\iniciar-backend-local.ps1 -Verificar
```

Em outro PowerShell, na raiz:

```powershell
Set-Location .\frontend
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Login: http://127.0.0.1:5174/login. Health: http://127.0.0.1:3000/api/health.

Para a homologação com Mailpit, `iniciar-recuperacao-local.ps1` também reutiliza o CLIXML salvo, sem solicitar a senha a cada partida; suas verificações de fila e binds locais são preservadas.

## Sincronização somente quando necessária e autorizada

```powershell
powershell -NoProfile -File .\sincronizar-credencial-postgres.ps1 -Executar -Confirmacao "SINCRONIZAR nr33_dev_app inventario_nr33_multitenant_dev"
```

Exige confirmação interativa adicional e senha administrativa por entrada oculta. A opção `-EntradaGrafica` usa janela privada com botão de confirmação. Nunca informe senha no chat ou nos argumentos.

A rotina restringe destino/versão/operador e altera somente `PASSWORD` do papel PostgreSQL existente, para corresponder ao CLIXML; não grava esse arquivo. O SQL recebe um verificador SCRAM gerado localmente, nunca a senha original em texto SQL. Os demais atributos do papel são comparados antes/depois. Autenticação com `nr33_dev_app` é verificada após a operação. Falha/resultado incerto não gera repetição automática.

Isso não altera senhas de usuários do NR-33, permissões, JWT/HMAC, tabelas, dados de aplicação, migrations ou `.env`. Outros clientes PostgreSQL que usam a senha anterior de `nr33_dev_app` precisarão utilizar a credencial sincronizada. Nenhuma operação Git faz parte do procedimento.
