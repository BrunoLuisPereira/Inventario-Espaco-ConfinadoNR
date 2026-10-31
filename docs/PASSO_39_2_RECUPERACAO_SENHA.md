# PASSO 39.2 — Recuperação de senha por link

> Registro histórico. As seções de transporte, estado dos tokens e aplicação foram substituídas pelo [roteiro do PASSO 39.4](PASSO_39_4_HOMOLOGACAO_RECUPERACAO.md): fila persistente, ativação após confirmação, SMTP local e executor supervisionado.

Implementação preparada na branch `feature/recuperacao-senha-email`. Não executa migrations nem envia e-mails reais. Convites e PDFs não são alterados.

## Contratos públicos

- `POST /api/auth/recuperacao-senha`, corpo `{ email }`: 202 com mensagem genérica para endereço existente/inexistente; 400 para formato inválido; 429 para limite por IP; 503 para infraestrutura/transporte indisponível. Nunca devolve token, identidade ou ambiente.
- `POST /api/auth/redefinir-senha`, corpo `{ token, novaSenha, confirmarSenha }`: 200 após atualização; 400 para senha inválida ou link inválido/expirado/utilizado; 429 para limite por IP; 503 para falha de infraestrutura.
- `Cache-Control: no-store` nas respostas; `Retry-After: 900` no bloqueio por IP. Não há logs de tokens, links, corpos ou erros do provedor.
- `/redefinir-senha#token=...` recebe o token no fragmento, remove o fragmento do histórico e conserva o token somente em memória. Recarregar depois disso exige abrir novamente o link original. A página é acessível mesmo com revalidação de sessão pendente.

## Persistência e segurança

`backend/database/024_recuperacao_senha.sql` é uma proposta manual, não aplicada. Depende de 020, incluindo a chave única `(id_usuario, id_ambiente)` de usuário. Adiciona `usuario.sessao_versao`, tokens com hash SHA-256 e expiração de 30 minutos, e contadores persistentes para limitar solicitações.

Tokens usam `crypto.randomBytes(32)`. Nova emissão invalida tokens anteriores. A conta, o e-mail e o ambiente vêm do banco. O consumo verifica ambiente/usuário ativos, e-mail e versão originais; usa locks na ordem ambiente -> usuário -> token, revalida a expiração após bcrypt e atualiza senha/consumo/versão na mesma transação. Senhas usam bcrypt custo 12, mínimo de oito caracteres e limite explícito de 72 bytes UTF-8 para evitar truncamento.

JWTs novos contêm `sv`; tokens anteriores sem esse claim equivalem à versão zero e deixam de funcionar após a primeira recuperação. Os dois middlewares verificam a versão atual, e o middleware multi-tenant continua carregando as permissões atuais. Nenhuma chave JWT é trocada. Requisições que já estavam autorizadas antes do COMMIT não são interrompidas retroativamente.

Limites em janelas de 15 minutos: 20 solicitações/IP, 5 emissões/e-mail e 30 tentativas de redefinição/IP. O limite por e-mail responde com o mesmo 202, inclusive para endereço inexistente. HMAC separado por finalidade reutiliza `LOGIN_HMAC_SECRET`; nenhum e-mail/IP é persistido nos contadores em texto simples. A normalização de IP reutiliza a proteção existente (IPv4 e IPv6 /64). Não confiar em X-Forwarded-For sem configurar um proxy confiável. A limpeza de contadores antigos é limitada a 100 por chamada; retenção de tokens históricos deve ser definida antes de publicar.

## E-mail e configuração futura

`emailService.criarServicoEmail({ transporte, urlPublica })` aceita o contrato assíncrono `transporte.enviar({ para, assunto, texto, html })`. O template monta o link com `APP_PUBLIC_URL`, nunca com o Host recebido. Aceita HTTPS ou HTTP apenas em loopback, sem credenciais, caminho adicional, query ou fragmento.

O serviço padrão não tem transporte. Todas as solicitações válidas recebem 503 antes da consulta à conta enquanto não houver adaptação real; nenhum token é criado nesse estado. O frontend informa indisponibilidade, sem alegar envio. Configurar somente `APP_PUBLIC_URL` não habilita envio.

Uma etapa posterior deve implementar e injetar o adaptador real no ponto de composição em `emailService.js`, com configuração do provedor e remetente validado. Esta etapa não inventa credenciais nem cria variáveis SMTP sem um provedor escolhido. Variáveis usadas: `APP_PUBLIC_URL`, `LOGIN_HMAC_SECRET` e as configurações de PostgreSQL/JWT já existentes. O transporte em memória está exclusivamente em `backend/tests/helpers/emailMemoria.cjs`, sem seletor por variável de ambiente ou acesso em produção.

Antes do envio real, definir fila/retentativas e controle de latência para não revelar existência por tempo de resposta do provedor. Hoje o envio injetado é aguardado; o contrato HTTP é equivalente, mas a latência de um provedor real ainda não foi homologada. Falha do transporte invalida o token e preserva a resposta genérica.

## Validação local segura

Sem migration ou credenciais reais, executar na pasta backend:

```powershell
node --require ./tests/helpers/evidenciaIsolamentoPreload.cjs --test tests/recuperacaoSenha.test.js tests/recuperacaoSenhaRepository.test.js
```

Os testes usam contas e banco simulados, transporte em memória e bloqueio de PostgreSQL real/.env. Exercitam serviço, controller, SQL/transações, emissão do JWT e revogação. A concorrência é modelada com fila de locks; a confirmação com PostgreSQL real continua pendente e requer banco de teste e autorização para aplicar a migration.

Na pasta frontend:

```powershell
npm test
npm run lint
npm run build
```

Para interface em navegador, iniciar Vite local em `127.0.0.1:5174` e executar `node --experimental-websocket scripts/verificar-recuperacao-senha.mjs`. O script usa Chrome isolado e substitui fetch em memória; não chama backend, não envia e-mails e não imprime tokens. `verificar-login-23.mjs` continua cobrindo foco/teclado; `verificar-links-login.mjs` mantém os três controles públicos.

Teste manual completo com banco real fica para após aprovação da migration e definição de transporte real. Não usar console, resposta pública ou arquivos de log para obter tokens.

## Implantação pendente

Revisar/aplicar 024 antes de iniciar a versão nova: login e revalidação passam a consultar `sessao_versao`. Ambos os entrypoints já montam `authRoutes`, portanto recebem os novos endpoints; nenhum registro de rota de convites foi modificado. A ausência do transporte real é intencional. Não houve publicação, commit, push, merge ou alteração de `.env`.

## Arquivos criados

- `backend/database/024_recuperacao_senha.sql`
- `backend/src/controllers/recuperacaoSenhaController.js`
- `backend/src/repositories/recuperacaoSenhaRepository.js`
- `backend/src/services/recuperacaoSenhaService.js`
- `backend/src/services/emailService.js`
- `backend/tests/recuperacaoSenha.test.js`
- `backend/tests/recuperacaoSenhaRepository.test.js`
- `backend/tests/helpers/emailMemoria.cjs`
- `frontend/src/pages/RedefinirSenha.jsx`
- `frontend/src/services/recuperacaoSenha.js`
- `frontend/tests/recuperacaoSenha.test.js`
- `frontend/scripts/verificar-recuperacao-senha.mjs`
- `docs/PASSO_39_2_RECUPERACAO_SENHA.md`

## Arquivos modificados

- `backend/src/routes/authRoutes.js`: registro dos dois endpoints públicos.
- `backend/src/services/authService.js`: claim de versão da sessão.
- `backend/src/middlewares/autenticacaoMiddleware.js`: revogação por versão.
- `backend/src/repositories/autenticacaoMultiTenantRepository.js`: leitura da versão no login.
- `backend/src/repositories/usuarioRepository.js`: leitura da versão na identidade autenticada.
- `frontend/src/App.jsx`: acesso público à redefinição, independente de sessão pendente.
- `frontend/src/components/RecuperarSenha.jsx`: solicitação, loading e respostas.
- `frontend/src/services/api.js`: contratos HTTP de recuperação.
- `frontend/index.html`: política de referrer.
- `frontend/scripts/verificar-login-23.mjs`: adaptação da expectativa de botão habilitado.
- `backend/tests/contaPerfilRegressao.test.js`: contratos das novas rotas públicas, preservando as protegidas.
- `backend/tests/helpers/contaSimulada.cjs`: isolamento das novas dependências.
- `backend/tests/evidenciaArquivoIsolamentoSeguranca.test.js`
- `backend/tests/evidenciaCadastroIsolamentoSeguranca.test.js`
- `backend/tests/localExportacaoIsolamentoSeguranca.test.js`
- `backend/tests/usuarioCadastroDiretoSeguranca.test.js`
- `backend/tests/usuarioEscritaIsolamentoSeguranca.test.js`
- `backend/tests/usuarioIsolamentoSeguranca.test.js`

Os seis últimos arquivos atualizam somente o SQL esperado do simulador de identidade, para incluir `sessao_versao`. Não alteram funcionalidades de domínio.

## Resultados

- 23 arquivos de suítes pertinentes do backend aprovados (autenticação, recuperação, conta, convites, RBAC e isolamento).
- 33 testes específicos do backend de recuperação/repositório aprovados, incluindo rotas HTTP públicas.
- 133 testes do frontend aprovados.
- Navegador: recuperação/redefinição e regressão de login/modal aprovadas, com fetch simulado.
- Lint do frontend, build e verificação de sintaxe dos novos módulos do backend aprovados. O backend não possui script de lint configurado.
- `git diff --check` aprovado. Sem execução de PostgreSQL real, migrations ou envio real.
