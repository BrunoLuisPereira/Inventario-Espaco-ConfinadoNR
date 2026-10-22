# PASSO 29.4 — preparação, sem execução administrativa

## Entrada administrativa

`backend/laboratorio/executar-login-023.ps1` exige banco e confirmação exatos e o switch Executar antes de abrir uma janela. O operador é fixo `postgres`, conforme a instalação original. A senha existente é solicitada em TextBox mascarado, convertida em SecureString e descartada em finally. Cancelar/fechar/entrada vazia não cria processo nem conexão. Não usar executar-715.ps1 nem a etapa Instalar para manutenção.

A biblioteca entrada-admin-023.ps1 não tem efeitos ao ser importada. O envio cria somente o processo Node do canal migration-023-canal.cjs, sem shell, sem janela adicional e com stdin/stdout/stderr redirecionados. O filho recebe ambiente mínimo (SystemRoot, WINDIR, TEMP, TMP), sem NODE_OPTIONS, PG*, JWT, HMAC ou credenciais herdadas. O caminho do script é o único argumento. A senha passa como JSON UTF-8 por pipe anônimo em memória; nenhuma saída bruta do filho é exibida. Mensagens de erro são genéricas. Não são criados arquivos, logs, transcrições ou armazenamento da senha.

O canal passa um objeto de configuração privado para a API já existente do executor. Apesar do nome `env` nessa API, não há atribuição a process.env nem transmissão de senha por variável do sistema operacional. Nenhuma variável do chamador é alterada; o finally descarta credenciais e processo tanto em sucesso quanto em falha, preservando o ambiente original sem precisar sobrescrevê-lo/restaurá-lo.

O executor continua fixando 127.0.0.1:5432/inventario_nr33_multitenant_dev, PostgreSQL 17, current_user e session_user do operador. Antes do DDL, confirma ausência de tabela/índice, USAGE/CREATE no schema e papel limitado da aplicação. O novo objeto pertencerá ao operador que o cria, permitindo os grants específicos da mesma transação. Não exige superusuário genericamente; autoridade insuficiente é recusada antes do DDL. O arquivo SQL fixado por assinatura e as guardas não foram alterados.

Limitação: senha digitada e JSON necessariamente passam por strings gerenciadas em memória no Windows Forms, PowerShell e Node/driver. O BSTR é zerado e referências são descartadas, mas a coleta de lixo não garante apagar todas as cópias. Usuário local comprometido ou administrador do sistema pode inspecionar processos; o pipe não protege contra esses agentes. Não executar sob captura de memória/depurador/transcrição externa. Falha de transporte no COMMIT tem resultado incerto: parar e conferir metadados com autorização antes de repetir.

## JWT persistente — proposta separada, ainda não ativada

Não foi gerado, recuperado, copiado ou substituído JWT_SECRET. O launcher atual continua gerando JWT novo a cada partida; a autenticação da aplicação não mudou. A migration não necessita JWT nem HMAC para sua conexão administrativa.

Em etapa futura autorizada, usar arquivo dedicado `%LOCALAPPDATA%\NR33-Dev-Privado\jwt-inventario_nr33_multitenant_dev\jwt.clixml`, Windows DPAPI CurrentUser, ACL exclusiva do SID local, rejeição de links/reparse points e identificação lógica exclusiva do banco e finalidade. Não reutilizar LOGIN_HMAC_SECRET ou seu arquivo. A implementação deverá separar criação explícita única de leitura e jamais gerar chave automaticamente na partida.

Para preservar sessões já emitidas, será necessário recuperar o JWT atual por um canal autorizado e armazenar exatamente esse valor sem imprimi-lo. Se não estiver recuperável, uma geração futura explicitamente aprovada invalidará sessões anteriores. Persistir não recupera JWT de processos já encerrados.

O futuro leitor validará o requisito atual (string com pelo menos 48 caracteres), retornará SecureString e falhará antes do HTTP se faltar arquivo, DPAPI, ACL ou formato. Para nova chave, propor crypto.randomBytes(48) em Base64 canônico, por pipe privado e somente sob autorização própria. O backend receberá JWT_SECRET exclusivamente no ambiente do processo filho, sem gravar .env ou argumentos. Refatorar a geração atual apenas após aprovação, mantendo issuer/audience/algoritmo/expiração. Se o launcher temporariamente alterar o ambiente, usar snapshot/finally existente; preferir ProcessStartInfo com ambiente exclusivo do filho.

Testar com valores sintéticos: nova sessão recuperando o mesmo valor; falhas de arquivo/ACL/DPAPI; ausência de fallback; ambiente restaurado em falhas; JWT emitido antes de reinício aceito depois com mesma chave. Nenhum desses testes requer gerar chave real nesta etapa.

## Utilização futura — depende de revisão e autorização

Em PowerShell local limpo, executar o launcher com `-Executar`, `-Banco inventario_nr33_multitenant_dev` e `-Confirmacao 'APLICAR 023 inventario_nr33_multitenant_dev'`. Informar a senha somente na janela local. Não colocar senha na linha de comando. Antes disso, cumprir as demais verificações e referência não sensível previstas no PASSO 29; o launcher não substitui esse roteiro.

Nesta preparação, somente testes simulados são permitidos. Nenhuma janela real com senha, conexão PostgreSQL, migration, GRANT ou backend foi executado.

## Validação realizada

89 testes direcionados aprovados (migration023Canal, migration023Executor e preflightLogin), sem falhas ou skips. Preload bloqueia PostgreSQL real e leitura de .env. A janela e o transporte PowerShell foram substituídos por funções simuladas nos testes de fluxo; a compatibilidade canal/executor foi exercitada com driver simulado. A janela real e o transporte completo com credenciais reais aguardam revisão. Foram cobertos cancelamento sem envio, senha em SecureString, ambiente preservado em sucesso/falha, mensagens sem senha, banco incorreto, operador divergente, USAGE/CREATE insuficientes e rejeição antes do DDL. Sintaxe PowerShell/Node aprovada; ESLint recomendado nos três arquivos JavaScript novos/modificados: zero erros e avisos. Não foi executada a suíte completa nem testes reais de banco.
