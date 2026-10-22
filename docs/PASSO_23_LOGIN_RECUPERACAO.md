# PASSO 23 — Login e diagnóstico de recuperação

## Interface

Olho alterna o tipo do mesmo campo controlado, preservando a senha. Botão acessível com nome dinâmico, aria-pressed e foco visível. Autenticação permanece no mesmo handler.

Modal nativo dialog/showModal: fundo inerte, foco inicial no e-mail, navegação contida, Escape, Cancelar e fechar; devolve foco ao acionador. Validação nativa de formato ao sair do campo, com erro associado e anúncio. Enviar link desabilitado e indisponibilidade explícita; nenhuma consulta de conta, requisição de recuperação ou confirmação fictícia.

Não há estado de processamento de recuperação nesta etapa: não existe operação real para processar. Implementar e testar esse estado junto da integração aprovada. Loading e erro do login continuam ativos e são verificados no navegador com resposta controlada, sem banco.

## Diagnóstico estático (sem conexão a banco e sem leitura de .env)

- backend/package.json e src: nenhum provedor/transportador de e-mail ou serviço de entrega encontrado. Configuração externa de infraestrutura não pode ser comprovada pela inspeção do repositório.
- backend/src/routes/authRoutes.js: POST /login; GET /me e /perfil; PUT /perfil e /senha autenticados. Não há rotas de solicitação ou redefinição por token. PUT /senha exige senha atual, não é recuperação.
- authService.js e contaMultiTenantService.js: senha_hash, comparação bcrypt; novas senhas com custo 12.
- JWT HS256, issuer/audience, subject do usuário, prazo configurável com padrão 8h. Middleware multi-tenant reconsulta identidade, perfil e ambiente ativos. JWT não contém versão de sessão/senha; trocar senha não invalida por si só todos os JWT já emitidos.
- frontend/src/services/sessao.js: sessão real em localStorage; demo separada em sessionStorage. Logout remove sessão local; não foi encontrado refresh token nesta cadeia.
- autenticacaoMultiTenantRepository.js busca e-mail normalizado com ambiente. Migration 020 define unicidade global de e-mail normalizado. Manter essa regra: não aceitar id_ambiente enviado pelo cliente como autoridade. Nenhuma regra RBAC ou multi-tenant foi modificada.
- Migration 020 tem tokens de convite com hash, mas convite não é token de recuperação. Não foi encontrada tabela de recuperação: será necessária nova migration própria, após revisão. Nenhuma migration foi criada ou executada.

## Proposta para revisão (não implementada)

1. Integrar provedor real, remetente e domínio de entrega. Segredos pelo mecanismo de configuração existente, fora de logs e código. URL HTTPS de origem fixa e confiável, nunca derivada do Host recebido.
2. POST /auth/recuperacao com e-mail normalizado: resposta 202 genérica para contas existentes, inexistentes e inativas: “Se houver uma conta elegível, você receberá instruções por e-mail.” Aplicar limitação persistente por IP e hash do e-mail, limites globais e tempo de resposta comparável; ponto inicial para revisão: 5 solicitações/15 min por IP e 3/h por destinatário. Evitar trabalho síncrono que revele elegibilidade.
3. Gerar crypto.randomBytes(32), codificar base64url; prazo proposto 30 minutos. Armazenar somente SHA-256 do token em tabela própria, com usuário, ambiente, expiração, criação e consumo. FK composta (usuário, ambiente), hash único e índices de expiração. Invalidar solicitações anteriores conforme política transacional. Não reutilizar JWT nem tokens de convite.
4. Enviar link com token no fragmento; página extrai e remove o fragmento, envia token no corpo POST /auth/redefinir-senha. Sem analytics/recursos externos nessa página; Referrer-Policy no-referrer, sem token em query, histórico persistido, storage ou logs. Não armazenar token bruto em fila persistente; definir estratégia de entrega e repetição que preserve essa restrição.
5. Na redefinição, validar tamanho/formato, hash, expiração e consumo; bloquear registro em transação. Revalidar usuário e ambiente ativos no servidor; vínculo vem do token persistido. Conta inativa nunca recebe token utilizável e não é reativada. Atualizar bcrypt custo 12 e consumir tokens atomicamente; concorrência só permite um sucesso. Falhas genéricas, limitação de tentativas e nenhuma alteração sem token válido.
6. Propor versão de sessão ou marco de revogação verificado em cada autenticação; incrementar na redefinição para invalidar JWT anteriores. Exige revisão específica de contrato e migration, não alterar RBAC nem fundador. Exigir novo login após sucesso.
7. Antes de ativar, testar provedor em ambiente controlado; expiração, reutilização e concorrência; isolamento A/B e vínculo adulterado; inativos; ausência de enumeração e logs sensíveis; rate limits; falha de entrega; revogação de JWT; estados loading/erro/sucesso da interface com endpoint real.

Restrições preservadas: sem banco real/legado, registros, credenciais, .env, stash, staging, commit, push ou merge. Backend de produção não foi modificado. A implementação real aguarda revisão do usuário.

## Validação realizada

- Frontend: npm test, 117/117 aprovados.
- Backend isolado: authController, authServiceMultiTenant, loginSessaoSeguranca e contaPerfilRegressao, 216/216 aprovados; mocks, sem conexão a banco real.
- scripts/verificar-login-23.mjs: aprovado em Chrome headless, API substituída apenas dentro do teste; olho via clique e teclado, senha preservada, modal/validação/foco/Tab/Escape, fechar/cancelar, larguras 1440/390/320, nenhum envio de recuperação, loading e erro do login e payload preservado.
- npm run lint e npm run build aprovados.
- Execuções iniciais de testes/build no sandbox foram bloqueadas por spawn EPERM; repetidas com permissão fora do sandbox.
- Repetir navegador: iniciar frontend em 127.0.0.1:5174 e executar node --experimental-websocket scripts/verificar-login-23.mjs.
