# PASSO 659 — Login e sessão multi-tenant

Base revisada: `87479cc`, branch `feature/multi-tenant`, árvore inicialmente limpa.

## Fluxo efetivamente montado

`app.js` monta `authRoutes` em `/api/auth`. `POST /login` continua usando
`authController.login` e `authService.login`. Este último agora delega a
autenticação a `loginMultiTenant`, preservando os campos públicos anteriores.
Nenhuma rota ou montagem foi adicionada. `/me`, `/perfil` e `/senha` permanecem
na cadeia protegida do PASSO 653.

## Evidências e correções

Três regressões falharam antes das alterações: login em ambiente inativo,
desativação durante bcrypt e emissão de perfil anterior à revogação durante
bcrypt. As três passaram após a correção.

O serviço consulta usuário e ambiente pelo e-mail normalizado, confere a senha
e reconsulta após bcrypt. O resultado atual determina nome, e-mail e perfil.
Usuário/ambiente inativos ou ausentes, UUID inválido e perfil incompatível não
produzem token. Mudança de hash, identidade ou ambiente entre as leituras exige
novo login, com erro público de credenciais inválidas. Dados de identidade e
perfil enviados pelo cliente não são usados.

O middleware multi-tenant já reconsulta a identidade em cada requisição e
ignora ambiente/perfil das claims como fonte de autorização. Agora também
recusa explicitamente um perfil atual fora dos dois perfis suportados.
As consultas de identidade existentes exigem usuário e ambiente ativos.

Todos os routers de negócio montados examinados utilizam autenticação
multi-tenant. O middleware legado ainda precede o POST de usuários bloqueado
com 403; não permite cadastro direto e não foi alterado nesta etapa.

## Contratos e frontend

O sucesso mantém HTTP 200, mensagem `Login realizado com sucesso.`, e
`data: { token, tipo, expiraEm, usuario }`. O usuário conserva exatamente
`id_usuario`, `nome`, `email` e `perfil_acesso`; o ambiente é interno à validação.
`loginMultiTenant` conserva seu retorno separado com `id_ambiente`.

Mantidos HS256, sub, perfil, issuer, audience, prazo configurado e padrão de
8 horas. Não foram criados claims obrigatórios, blacklist, refresh tokens,
armazenamento ou revogação de JWT. Inexistência e senha errada produzem o mesmo
401. A mensagem legítima de usuário desativado foi preservada; ela é apresentada
após conferir a senha. Ambiente indisponível produz 403 sem dados externos.

`frontend/src/pages/Login.jsx` consome `resposta.data`, e `AuthContext.jsx`
persiste token e usuário: o formato permanece compatível. `ProtectedRoute.jsx`
verifica somente a presença de token. Perfil salvo localmente pode ficar antigo;
a API aplica o perfil atual. Atualização visual de sessão exige etapa futura
autorizada de frontend, que não foi modificado.

## Testes e isolamento

Novo arquivo: `backend/tests/loginSessaoSeguranca.test.js`, 48 testes.
Controller, serviço, repositório de login e middleware reais são exercitados;
SQL é interceptado e examinado, bcrypt e a consulta de identidade são simulados.
JWTs são assinados/verificados pela biblioteca real com segredo fictício.
Não se inicia aplicação principal nem servidor nos testes novos.

Cobertos A/B, administradores/engenheiros, identidade forjada, credenciais e
entradas inválidas, inatividade, revogação, adulteração/expiração de JWT,
alterações durante bcrypt, erros técnicos e proteção de resposta iniciada.
O teste antigo de login multi-tenant passou a exigir duas consultas, com os
mesmos parâmetros em ambas; nenhuma asserção de segurança foi removida.

Resultados: 48/48 novos testes, 9/9 testes existentes do serviço e suíte completa
3.155/3.155. Os testes anteriores de controller, conta, perfil, senha e módulos
de negócio passaram na suíte. Foi inspecionado e usado o preload
`evidenciaIsolamentoPreload.cjs` em todos os processos via NODE_OPTIONS, bloqueando
PostgreSQL real, dotenv, uploads e PDFs. Após spawn EPERM, o comando completo
foi executado fora do sandbox mediante autorização específica. HTTP efêmero
dos testes existentes permanece em loopback.

## Limites e decisões futuras

A reconsulta não mantém locks durante assinatura/resposta: uma desativação
posterior à última consulta pode ocorrer antes da entrega do JWT. Um teste
documenta esse limite e confirma a recusa na requisição seguinte. Não se afirma
atomicidade entre banco e entrega HTTP, nem revogação instantânea de requisições
já autorizadas. As escritas de negócio mantêm suas próprias revalidações.

Dependência de esquema: ambiente, vínculo do usuário e unicidade normalizada
previstos na migração 020; nenhuma dependência nova da 021. Homologação deve
verificar constraints, dados legados sem ambiente, isolamento/snapshots reais,
desativação concorrente e índices. Nenhuma migração ou consulta real ocorreu.

Mensagens públicas iguais não eliminam possíveis diferenças de tempo entre
e-mail inexistente e senha errada. Rate limiting e análise de enumeração temporal
permanecem recomendações futuras, sem política nova introduzida nesta etapa.

Revogação após troca de senha, prazo de JWT, refresh/blacklist e mudanças de
contrato de sessão exigem autorização específica. Cadastro inicial, convites,
frontend, filas offline, app.js e módulos de negócio não foram modificados.

Alterações estão locais, para revisão. Nenhum staging, commit, push ou merge.
