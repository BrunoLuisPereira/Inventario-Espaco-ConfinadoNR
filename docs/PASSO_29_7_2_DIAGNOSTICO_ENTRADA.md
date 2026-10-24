# PASSO 29.7.2 — diagnóstico sem autenticação real

Branch confirmada: feature/recuperacao-senha.

## Fluxo efetivamente utilizado

A tentativa anterior não executou postgres-local.ps1: utilizou um comando PowerShell temporário, que importou entrada-admin-023.ps1 somente para clonar/adaptar a janela de senha, leu a credencial da aplicação e os cofres HMAC/JWT e enviou JSON por pipe ao roteiro temporário `%TEMP%\nr33-homologacao-297\homologar.cjs`. Esse roteiro pretendia chamar diretamente servidor-local.cjs com configuração explícita, preflight e porta 3000.

O fluxo administrativo é executar-login-023.ps1 → janela de postgres → migration-023-canal.cjs → migrar-login-023.cjs. Somente esse fluxo precisa de senha administrativa. O fluxo da API usa nr33_dev_app + HMAC/JWT; a senha da conta descartável serve apenas às futuras requisições de homologação. Não deve haver pedido de senha postgres para iniciar a API.

postgres-local.ps1 continua como entrada existente de backend: recebe SenhaAplicacao, recupera HMAC/JWT protegidos, salva/restaura ambiente e chama servidor-local.cjs. Não executa a etapa administrativa quando Etapa=Backend. Não foi alterado neste diagnóstico.

## O que foi identificado e o limite da evidência

O PowerShell anterior converteu qualquer exceção em FALHA_SEGURA, descartando estágio, tipo e código; stderr do Node foi consumido e descartado. O roteiro Node também descartou a exceção original e o código recebido do preflight, reduzindo falhas a um resultado genérico. Isso explica por que o registro anterior não permite localizar a falha entre recuperação, pipe, preflight e HTTP.

A reprodução do mesmo comando PowerShell com janela/Import-Clixml/leitores HMAC/JWT substituídos por mocks e Node inofensivo confirmou transmissão e parse do JSON. Não houve falha nesse replay. Portanto, não há evidência suficiente para atribuir a causa histórica a DPAPI, senha, canal, PostgreSQL ou HTTP; não se afirma que ela foi reproduzida ou corrigida. Nenhuma exceção original foi preservada para recuperação retrospectiva.

| Etapa histórica | Conclusão |
| --- | --- |
| Credencial nr33_dev_app | Sem marcador histórico; sucesso/falha reproduzidos com mock |
| HMAC | Sem marcador histórico; leitor existente testado com armazenamento simulado |
| JWT | Sem marcador histórico; leitor existente testado com armazenamento simulado |
| Pipe para Node | Replay completo com dados sintéticos passou |
| Preflight | Não houve confirmação histórica da tentativa; falha simulada distinguível |
| HTTP | Não houve confirmação histórica de inicialização; falha simulada distinguível |

## Instrumentação preparada

entrada-login-local.ps1 é biblioteca sem efeitos ao importar. Contém janela própria da conta descartável, leitor da credencial da aplicação com identidade nr33_dev_app e preparação por etapas. Não depende da entrada administrativa. Leitores HMAC/JWT existentes continuam responsáveis por ACL/DPAPI/identidade/formato, sem geração ou substituição.

Códigos seguros: ENTRADA_PROTEGIDA_FALHOU, CREDENCIAL_APLICACAO_INDISPONIVEL, HMAC_INDISPONIVEL, JWT_INDISPONIVEL, CANAL_PRIVADO_FALHOU, PREFLIGHT_FALHOU, INICIALIZACAO_HTTP_FALHOU e ENCERRAMENTO_SEGURO_FALHOU. Não incluem objetos de exceção, caminhos privados ou valores. Exceções são reempacotadas sem preservar a exceção sensível como InnerException.

O transporte envia UTF-8 pelo BaseStream do stdin, somente a processo Node explícito, sem shell ou credenciais nos argumentos/ambiente. Ambiente do filho é mínimo; o ambiente do chamador não é alterado. stdout/stderr brutos nunca são repassados: somente códigos de uma lista permitida são retornados. BSTR/buffers são zerados quando possível; hashtable de configuração e SecureStrings são descartados no finally. Strings gerenciadas não oferecem garantia de apagamento de todas as cópias em memória.

Esse transporte possui timeout de 15 segundos para diagnóstico/readiness; não é o executor do teste de 15 minutos. Nenhum novo launcher de autenticação foi ativado. O roteiro temporário antigo foi inspecionado e permanece como evidência; não deve ser reutilizado sem substituir seu tratamento genérico.

servidor-local.cjs mantém validações e adiciona codigoEtapa para distinguir preflight de HTTP. A saída CLI agora usa somente código permitido, nunca mensagem de uma exceção arbitrária. Os códigos internos de preflight existentes continuam disponíveis para testes, sem alterar SQL ou autenticação.

## Validação

97 testes direcionados aprovados, sem falhas/skips: entradaLoginLocal, preflightLogin, hmacProtegidoPowershell, jwtProtegidoLocal, ambienteLocalPowershell, migration023Canal e migration023Executor. Preload bloqueia acesso real ao PostgreSQL e .env. Inclui Import-Clixml simulado (válido, ausente, identidade errada), cancelamento sem leituras, falhas em cada etapa, segredo ausente das mensagens, ambiente preservado em sucesso/falha, limpeza da configuração, pipe real com processo inofensivo e caracteres Unicode, respostas inválidas, códigos de preflight/HTTP e encerramento de filho por timeout.

Sintaxe PowerShell/Node aprovada; ESLint recomendado nos quatro arquivos JavaScript novos/modificados: zero erros/avisos. Os testes de servidor usam listen e pool simulados; o processo auxiliar não importa pg nem faz HTTP.

## Retomada recomendada após revisão

Integrar a preparação por etapas ao roteiro de homologação, preservando os códigos seguros via IPC e separando readiness do ciclo de 15 minutos. Primeiro validar somente preparação e confirmação de destino/preflight/HTTP; só depois da confirmação iniciar a primeira autenticação. Diante de qualquer falha, apresentar código/etapa e interromper, sem repetir automaticamente. A aplicação real dessa integração e o backend real aguardam revisão.

Neste passo não houve PostgreSQL, autenticação real, janela com senha real, leitura de credenciais reais, geração/substituição de segredos, migration, GRANT ou backend real. Não houve alteração de .env, dados, stash ou operações Git de escrita.
