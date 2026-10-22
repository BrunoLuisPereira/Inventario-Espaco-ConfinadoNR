# PASSO 29.7.4 — supervisão e confirmação de partida

## Evidência e correção

O comando externo do PASSO 29.7.3 recebeu exit code 1 do processo Node de controle e descartou seu stderr. O Node, por sua vez, descartava stderr do PowerShell filho e reduzia eventos error/exit a códigos genéricos. Não há registro histórico que comprove se esse filho chegou ao launcher real. Não é possível recuperar retrospectivamente a exceção perdida nem atribuir a causa original a DPAPI/PostgreSQL/backend.

O supervisor original foi reproduzido com launcher PowerShell e Node inofensivos em diretório temporário: retornou pronto e exit 0, com encerramento solicitado. Não houve falha reproduzida de caminhos/argumentos ou diretório nessa simulação. Metadados do PowerShell filho com ambiente mínimo confirmaram resolução do diretório LocalApplicationData e disponibilidade de node.exe. Isso não testa credenciais nem comprova qual foi o erro histórico.

Defeito comprovado corrigido no código reutilizável entrada-login-local.ps1: preservação de ExitCode numérico; distinção entre PROCESSO_INICIALIZACAO_FALHOU, PROCESSO_ARQUIVO_AUSENTE, PROCESSO_TIMEOUT e PROCESSO_FILHO_FALHOU; propagação dos códigos permitidos de preflight/HTTP/entrada/HMAC/JWT; cancelamento exit 2; diretório de trabalho explícito do script. stderr é consumido privadamente e somente códigos de uma lista permitida são interpretados, sem exibir texto bruto ou exceções completas. Recursos, buffers e configuração são limpos nos finally existentes.

A cadeia temporária anterior não foi reutilizada na partida real. Não foi criada outra infraestrutura de autenticação ou novo launcher: o comando chamou diretamente postgres-local.ps1 -Etapa Backend, com SenhaAplicacao recuperada do CLIXML existente. A etapa Instalar não foi utilizada. O launcher real permaneceu inalterado.

A janela própria da conta descartável permanece em Solicitar-SenhaLoginLocal (Windows Forms mascarado); não é necessária para iniciar a API e não foi aberta nesta etapa. Não é exigida senha administrativa para iniciar a API. Simulação de cancelamento não abre janela real; interação visual da janela não foi retestada neste passo.

## Validação simulada

56 testes direcionados passaram, sem falhas/skips: entradaLoginLocal, preflightLogin, hmacProtegidoPowershell, jwtProtegidoLocal e ambienteLocalPowershell. Incluem processos Node inofensivos, códigos de saída 7 e 9 preservados, erro conhecido em stderr com conteúdo sintético descartado, arquivo ausente, falha de invocação, cancelamento, timeout/encerramento e ambiente preservado. PostgreSQL e .env reais são bloqueados no preload da suíte. Sintaxe PowerShell/Node aprovada; ESLint no JavaScript alterado sem erros/avisos.

## Tentativa real única

- Branch: feature/recuperacao-senha.
- Verificação prévia somente leitura: 127.0.0.1:5432/inventario_nr33_multitenant_dev, PostgreSQL 17, current_user/session_user nr33_dev_app e papel não privilegiado.
- Migration 023 existente, preflight aprovado e HMAC/JWT persistentes disponíveis/válidos.
- Portas 3000/3001 livres antes da tentativa.
- Uma chamada direta ao launcher real, Etapa Backend, banco e confirmação exatos; NR33_BACKEND_PORT=3000 temporariamente, com restauração prevista no finally ao encerrar.
- Saída de startup confirmou desenvolvimento local e banco isolado.
- Node PID 17224 escutando exclusivamente 127.0.0.1:3000.
- GET /api/health: HTTP 200, laboratorio=true, banco=inventario_nr33_multitenant_dev.

API respondendo: SIM. O processo foi deixado ativo para revisão. Nenhuma tentativa de login/bloqueio, migration, GRANT, alteração de conta/ambiente, .env, JWT/HMAC ou operação Git de escrita foi realizada. A senha da conta não foi solicitada. A homologação do bloqueio continua pendente e exige autorização; não foi antecipada nesta etapa.
