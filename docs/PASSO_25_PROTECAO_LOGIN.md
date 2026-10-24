# PASSO 25 — Proteção persistente do login

## Entrega e limites

Implementação preparada na branch feature/recuperacao-senha. Nenhuma migration executada, nenhum banco acessado, nenhum registro real alterado. Sem .env, credenciais, stash, staging, commit, push ou merge. Não houve deploy/ativação em banco real.

A migration proposta é backend/database/023_controle_tentativas_login.sql, independente da 021. Cria somente public.login_tentativa e um índice de limpeza; não altera tabelas existentes. A chave primária (tipo, chave_hash) serve às consultas e à criação concorrente. Array de até cinco timestamps limita armazenamento por identificador; não há e-mail, IP, senha ou token em claro.

## Política implementada

- Identificador: e-mail com trim e lowercase, conforme autenticação existente. Janela móvel de 15 minutos; primeira à quarta falha retornam 401; a quinta grava restrição de 15 minutos e retorna 429. Durante a restrição não executa bcrypt nem prolonga restrito_ate. No vencimento, falhas fora da janela são descartadas pela próxima operação. Sucesso limpa falhas/restrição somente desse identificador.
- HTTP 401: “E-mail ou senha inválidos.”
- HTTP 429: “Muitas tentativas de login. Aguarde antes de tentar novamente.”
- Não há contador restante nem Retry-After que exponha estado adicional. Frontend já renderiza a mensagem em role=alert; teste unitário e navegador foram ampliados para 429.
- Contas inexistentes executam bcrypt com hash fictício público de custo 12. Senha errada, inexistência, conta/ambiente inativo e identidade inválida recebem a mesma política pública. Todos fazem duas consultas de identidade, evitando o retorno antecipado anterior à comparação. A equivalência de custo pressupõe hashes reais com custo equivalente; não é garantia de tempo constante de ponta a ponta.
- Autenticação válida preserva o contrato JWT, os sete perfis, fundador e isolamento. O ambiente continua vindo do banco, nunca do corpo para formar a chave de limitação. Nenhum usuário é desativado, reativado ou atualizado pelo controle. JWT/sessões existentes não são revogados pela restrição.
- Entradas ausentes/tipos inválidos mantêm 400 e não consultam banco. Entradas excessivamente grandes são recusadas antes do bcrypt; o limitador não substitui proteção de volume/parser na borda.

## Concorrência e relógio

1. IP: transação curta própria registra requisição e confirma antes da etapa do identificador. Nunca mantém lock de IP durante bcrypt. Assim, um login bem-sucedido não apaga consumo da rede compartilhada; falhas técnicas posteriores também não devolvem a requisição ao IP.
2. Identificador: INSERT ON CONFLICT DO UPDATE adquire lock da linha, inclusive na primeira criação simultânea. A atualização não altera prazo de restrição existente. Não há lacuna entre INSERT DO NOTHING e SELECT que permita corrida com limpeza.
3. Após adquirir lock, consulta restrição com clock_timestamp() do PostgreSQL. Não usa Date.now() nem transaction_timestamp() capturado antes da espera.
4. Mantém esse lock durante bcrypt, reconsulta multi-tenant e preparação do JWT. As consultas de identidade usam o mesmo cliente transacional. Falhas normais são persistidas e COMMIT ocorre antes de lançar 401/429. O token preparado nunca sai do serviço antes do COMMIT da limpeza após sucesso.
5. Qualquer falha técnica provoca rollback; não conta como senha incorreta. Falha de conexão, tabela ausente, privilégios insuficientes, timeout ou COMMIT: 503 genérico e nenhum token entregue. Rollback malsucedido descarta a conexão. O IP pode permanecer consumido quando a transação do identificador falhar.
6. Pool convencional: espera de conexão de 5 segundos; transações de limitação: lock_timeout=3s, statement_timeout=5s e idle_in_transaction_session_timeout=10s. Sob saturação, alguns concorrentes podem receber 503; nunca se libera o limite por falha. Pool de laboratório já tem timeout próprio.

## IP e redes compartilhadas

100 requisições de login com entradas aceitas para autenticação por janela fixa de 15 minutos. A 101ª inicia restrição do IP por 15 minutos; novas requisições restritas não prolongam o prazo. A janela é própria do IP e não se reinicia com sucesso de uma pessoa. Esse limite é uma decisão inicial conservadora para permitir vários usuários na mesma rede, não um número universalmente adequado.

Usa exclusivamente req.socket.remoteAddress. Ignora X-Forwarded-For e req.ip, sem configurar trust proxy. IPv4 mapeado para IPv6 é normalizado; IPv6 é agrupado por /64 para reduzir rotação de endereços dentro da rede.

Atrás de Vite/proxy reverso, o endereço visto pode ser o próprio proxy: todos os clientes desse caminho compartilharão o teto de 100. Antes de exposição pública, mapear a topologia e aprovar configuração explícita de proxies confiáveis, saneamento de cabeçalhos e bloqueio de acesso direto ao backend. Não basta habilitar trust proxy=true ou confiar no primeiro X-Forwarded-For. Essa integração não foi presumida nem ativada.

## Segredo HMAC e implantação futura

LOGIN_HMAC_SECRET é obrigatório: exatamente 32 bytes aleatórios, codificados em Base64 canônico (44 caracteres). Deve ser criado pelo mecanismo criptográfico do gerenciador de segredos e injetado no ambiente do processo por canal privado. Não usar exemplos de testes, senha humana ou JWT_SECRET; não imprimir em terminal/log/CI, não incluir em .env versionado, scripts, tickets ou documentação. Nenhum segredo real foi gerado ou armazenado neste trabalho.

Todas as instâncias precisam compartilhar o mesmo segredo estável. Alterar/remover esse segredo muda as chaves e pode reiniciar a proteção observável; rotação exige manutenção coordenada, interrupção de tentativas e avaliação das janelas/restrições ativas. Não fazer rolling deployment com segredos diferentes.

A implementação é obrigatória no caminho de login, sem bypass por flag. Código não deve ser implantado antes de aprovar/aplicar a 023, configurar o segredo e conceder SELECT/INSERT/UPDATE na tabela ao papel limitado da API. Sem pré-requisitos, novos logins retornam 503; sessões existentes continuam na cadeia atual. O papel de manutenção precisa também de DELETE para limpeza. Não há concessões genéricas ou alteração de papéis na migration.

## Limpeza segura (proposta operacional, não executada)

Executar periodicamente por manutenção autorizada, em lotes. Retenção sugerida: remover linhas sem atividade há mais de 24 horas e sem restrição vigente. Nunca apagar restrição ativa ou registros recentes; o desbloqueio não depende da limpeza.

```sql
WITH antigas AS (
  SELECT tipo, chave_hash FROM public.login_tentativa
  WHERE atualizado_em < clock_timestamp() - INTERVAL '24 hours'
    AND (restrito_ate IS NULL OR restrito_ate <= clock_timestamp())
  ORDER BY atualizado_em
  LIMIT 1000 FOR UPDATE SKIP LOCKED
)
DELETE FROM public.login_tentativa t USING antigas a
WHERE t.tipo = a.tipo AND t.chave_hash = a.chave_hash;
```

O lock da limpeza coordena com o UPSERT. Se a limpeza ganhar primeiro, a próxima tentativa insere novamente; se a tentativa ganhar primeiro, a limpeza pula a linha. Nenhuma tarefa automática de exclusão foi ativada.

## Testes e homologação futura

Suíte determinística nova: backend/tests/loginProtecao.test.js, com helper loginBancoSimulado.cjs. Exercita o código real do serviço/repository com modelo de transações e locks; não comprova sintaxe SQL, bloqueios reais ou durabilidade do PostgreSQL. Regressões antigas de credenciais isolam o novo serviço explicitamente; a suíte nova testa a composição completa com proteção.

O teste backend/laboratorio/verificar-login-25.cjs está preparado, mas NÃO foi executado. Ele não executa migrations nem lê .env. Exige banco descartável exato inventario_nr33_login_test, em 127.0.0.1, papel nr33_login_test_app sem privilégios administrativos e somente a tabela login_tentativa no schema public. Grava/remove apenas chaves sintéticas aleatórias próprias; nunca consulta ou modifica usuários/ambientes. Verifica SQL real, janela móvel, quinta/sexta tentativas, expiração, prazo fixo, limpeza no sucesso, limite por IP, concorrência e restrição observada em um novo processo Node com novo pool.

Procedimento futuro, após aprovação:

1. Provisionar PostgreSQL isolado e descartável, separado de produção/homologação/legado e do banco de desenvolvimento com dados existentes.
2. Revisar e aplicar manualmente somente a migration 023 nesse banco vazio. Criar papel limitado dedicado e conceder CRUD somente na tabela criada para a suíte isolada. Não usar superusuário no teste.
3. Injetar por canal privado LOGIN_TEST_PASSWORD e definir LOGIN_TEST_HOST=127.0.0.1, LOGIN_TEST_PORT com a porta isolada, LOGIN_TEST_DATABASE=inventario_nr33_login_test, LOGIN_TEST_USER=nr33_login_test_app e LOGIN_TEST_AUTORIZADO=PASSO25_ISOLADO. Não reutiliza DB_* ou credenciais reais. A suíte do repository não precisa de segredo HMAC.
4. Executar, na pasta backend: node laboratorio/verificar-login-25.cjs. Somente esse comando, após a preparação aprovada, conecta ao banco isolado. Não executar agora.
5. Antes de ativação da API, validar também a composição completa com usuários sintéticos em dois ambientes isolados, os sete perfis, fundador, desativação concorrente, latência bcrypt, saturação, indisponibilidade do banco e reinício de processos. Aprovar limite de IP com tráfego esperado e topologia real de proxy.

## Riscos e dependências

Bloqueio global por identificador permite negação temporária de acesso por quem conhece um e-mail, inclusive do fundador. IP e prazo não prorrogável reduzem, mas não eliminam esse risco aprovado. Não existe bypass administrativo nem desbloqueio público. Ataques distribuídos e criação massiva de identificadores ainda exigem limites na borda, monitoramento sem credenciais, limpeza e capacidade adequada. A limitação não substitui MFA ou proteção de infraestrutura.

Pendente: homologação real da 023/locks, grants do papel, segredo seguro, planejamento de retenção/monitoramento, topologia de proxy e aprovação de implantação. Ícone de senha e modal de recuperação permanecem; envio de recuperação segue desabilitado.

Referências consultadas: https://www.postgresql.org/docs/current/sql-insert.html ; https://www.postgresql.org/docs/current/explicit-locking.html ; https://expressjs.com/en/guide/behind-proxies/ .

## Arquivos deste passo

Criados:

- backend/database/023_controle_tentativas_login.sql
- backend/src/repositories/loginTentativaRepository.js
- backend/src/services/loginProtecaoService.js
- backend/tests/loginProtecao.test.js
- backend/tests/helpers/loginBancoSimulado.cjs
- backend/laboratorio/verificar-login-25.cjs
- frontend/tests/loginProtecao.test.js
- docs/PASSO_25_PROTECAO_LOGIN.md

Modificados:

- backend/src/config/database.js — timeout de conexão e log de erro sem objeto do driver.
- backend/src/controllers/authController.js — encaminha somente IP do socket; mantém envelope e mensagens genéricas 5xx.
- backend/src/repositories/autenticacaoMultiTenantRepository.js — aceita cliente transacional.
- backend/src/services/authService.js — proteção obrigatória, comparação fictícia e recusa uniforme de contas inelegíveis.
- backend/tests/authController.test.js — contrato da delegação do IP.
- backend/tests/authServiceMultiTenant.test.js — isolamento unitário do limitador e respostas 401 uniformes.
- backend/tests/loginSessaoSeguranca.test.js — regressões de credenciais/JWT e respostas uniformes.
- backend/tests/helpers/idsBigintSimulados.cjs — dependência explicitamente simulada nos testes de IDs.
- frontend/scripts/verificar-login-23.mjs — acrescenta verificação da mensagem e acessibilidade no HTTP 429.

As mudanças de Login.jsx, Login.css, RecuperarSenha.jsx, verificar-links-login.mjs e relatório do passo 23 já estavam no workspace antes deste passo e foram preservadas. O tratamento existente de erros no frontend já exibia corretamente 429, sem necessidade de alterar a interface de produção.

## Resultados executados

- Backend completo: 4.049/4.049 testes aprovados, sem skips, com NODE_OPTIONS apontando para tests/helpers/evidenciaIsolamentoPreload.cjs. Esse preload impede PostgreSQL real, dotenv e acesso a arquivos reais de evidência. Logs completos ficaram somente no diretório temporário do sistema.
- Frontend completo: 118/118 aprovados.
- npm run lint (frontend): aprovado. Backend não possui script/dependência de lint; verificações sintáticas node --check realizadas nos componentes e roteiro novos.
- npm run build (frontend): aprovado.
- Chrome headless, verificar-login-23.mjs: aprovado, inclusive 429, olho/teclado, preservação de senha, modal/foco/Escape, validação, larguras 1440/390/320 e ausência de envio de recuperação. API substituída apenas dentro do teste; nenhuma chamada real ao backend.
- git diff --check: aprovado.
- Migration 023 e roteiro PostgreSQL real: NÃO executados.

O controller preserva o contrato genérico de erros 5xx: uma indisponibilidade do armazenamento retorna HTTP 503 com “Erro interno ao realizar login.”. O frontend mantém seu texto genérico para 5xx; nenhum detalhe de banco/segredo é apresentado.
