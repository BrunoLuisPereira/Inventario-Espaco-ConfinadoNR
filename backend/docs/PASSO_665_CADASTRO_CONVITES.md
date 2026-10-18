# PASSO 665 — Cadastro inicial e convites

Base: `7aff708`, branch `feature/multi-tenant`, árvore inicialmente limpa.

## Endpoints existentes, ainda não montados

| Router | Método/caminho relativo | Fluxo |
| --- | --- | --- |
| cadastroRoutes | POST /ambiente | cadastro público de ambiente e administrador |
| conviteRoutes | POST / | autenticação multi-tenant, autorização administrativa, emissão |
| conviteRoutes | POST /aceitar | aceite público mediante token |

Os prefixos documentados são `/api/cadastro` e `/api/convites`, mas app.js não
importa nem monta esses routers. Nenhuma ativação foi realizada. Não existem
endpoints de cancelamento, reenvio ou recuperação do token neste módulo.
`data_cancelamento` é respeitada na validação, sem criar política de cancelamento.

## Problemas confirmados e correções

Quatro regressões falharam antes das correções: a emissão não mantinha locks
de ambiente/administrador; cadastro, emissão e aceite reutilizavam a conexão
após falha de rollback. Esses catches também registravam o erro completo.

`cadastroService.cadastrarAmbiente` mantém ambiente e administrador na mesma
transação, acrescenta verificação explícita de usuário já existente após obter
o advisory lock de e-mail e preserva a verificação de convite pendente. O
administrador é fixado pelo SQL, sem perfil/ambiente do cliente. Nome de usuário
válido com 180 caracteres é preservado; o nome derivado do ambiente é limitado
a 180 para não causar falha interna por causa do prefixo acrescentado.

`conviteService.emitirConvite` usa a opção interna de bloqueio de
`administradorRepository.buscarAdministradorAtivo`. A leitura inicial apenas
descobre o ambiente. Em seguida bloqueia ambiente ativo com FOR SHARE e
reconsulta/bloqueia o administrador ativo, do mesmo ambiente, com FOR SHARE OF u.
O ambiente e autor do convite vêm desse registro autorizado. Revogações antes
da aquisição do lock são recusadas; alterações conflitantes posteriores precisam
aguardar o encerramento da transação. O perfil de destino continua podendo ser
ADMINISTRADOR ou ENGENHEIRO_SEGURANCA conforme o contrato anterior.

`conviteService.aceitarConvite` descobre o e-mail pelo hash e adquire seu lock.
Uma leitura preliminar mantém a precedência anterior de erros públicos. Depois
bloqueia o ambiente e relê o convite com FOR UPDATE OF c, revalidando uso,
cancelamento, expiração, ambiente e consistência de e-mail/ambiente com as
referências utilizadas para os locks. Usuário, perfil e ambiente vêm do convite.
Verifica existência global do e-mail antes do INSERT; não transfere contas.
A marcação do aceite continua exigindo validade pelo clock_timestamp() do banco.

Ordem de locks: e-mail -> ambiente -> administrador na emissão; e-mail ->
ambiente -> convite no aceite. Leituras preliminares não são autorização para
escrita. O mesmo lock de e-mail já utilizado por cadastro, convites e alterações
administrativas/de conta foi preservado; esses outros módulos não mudaram.

Os três fluxos verificam retorno de persistência antes de confirmar a operação.
BEGIN falho, rollback falho ou COMMIT com resultado incerto descartam a conexão
com release(true). Falhas após BEGIN tentam rollback; erros técnicos originais
são preservados, exceto os mapeamentos históricos de unicidade descritos abaixo.
Logs de rollback agora contêm somente texto fixo e status 500.

## Contratos, tokens e compatibilidade

Controllers e routers não foram alterados. Sucessos mantêm HTTP 201 e os
envelopes `{ status, message, data }` e mensagens existentes. Permanecem 400
para validação, 401 para identidade ausente, 403 para autorização administrativa
recusada/ambiente indisponível, 404 para token desconhecido, 409 para uso,
cancelamento, colisão/reserva e 410 para expiração. Erros inesperados usuais
continuam com mensagens públicas genéricas dos controllers.

O token continua sendo 32 bytes aleatórios representados em 64 caracteres hex,
com armazenamento apenas do SHA-256. O token original é retornado exclusivamente
na emissão legítima, conforme contrato anterior, sem registro em logs. Prazo de
48 horas preservado. Seu vencimento é validado pelo banco; a data de expiração
inicial ainda é calculada pelo relógio Node, como antes.

Mantidos os mapeamentos históricos amplos de 23505 no cadastro e aceite; o
controller de cadastro também mantém esse contrato. Assim, uma constraint
inesperada pode ainda ser apresentada como conflito genérico de e-mail, sem
detalhes internos. Restringir esse mapeamento exige revisão específica de
contrato/constraints e dos testes existentes; não se afirma que toda falha
técnica de unicidade seja classificada corretamente nesta etapa.

## Testes e resultados

Criado `backend/tests/cadastroConvitesSeguranca.test.js`, com 71 testes.
Exercita serviços, controllers e SQL dos repositórios reais, substituindo pool e
bcrypt antes dos imports. Crypto real gera/hashifica apenas dados em memória.
Consultas desconhecidas e SQL fora da transação falham explicitamente; falhas
das asserções do simulador são registradas e verificadas mesmo se capturadas.
Não há servidor nos testes novos nem acesso a arquivos de evidências/PDFs.

Cobertura: criação atômica, e-mails existentes/reservados e snapshots após
aquisição de lock; ambientes A/B; perfil de destino legítimo e identidade
forjada; revogação de administrador/usuário/ambiente antes do lock; token inválido,
desconhecido, cancelado, expirado, reutilizado ou aplicado por outra transação;
impedimento de transferência; ordem de locks; falhas parciais, INSERT vazio,
BEGIN/INSERT/UPDATE/COMMIT/rollback e descarte; HTTP/JSON e logs seguros.

Resultados: quatro regressões iniciais falharam antes e passaram depois;
71/71 novos testes e suíte completa 3.226/3.226 aprovados. As regressões existentes
de cadastro/convites, conta, login e módulos protegidos passaram. Preload
`evidenciaIsolamentoPreload.cjs` inspecionado e aplicado em todos os processos
por NODE_OPTIONS. Após spawn EPERM, a execução fora do sandbox foi autorizada
para o comando completo. HTTP efêmero existente permanece em loopback.

## Limitações e decisões futuras

Mocks representam interleavings por pontos controlados e estado confirmado;
não executam duas transações PostgreSQL concorrentes nem comprovam bloqueios,
reavaliação de predicados, índices ou ausência de deadlocks. Homologação deve
exercitar desativação/revogação enquanto há espera por locks, dois aceites,
cadastro/convites/troca de e-mail concorrentes e falhas reais de conexão.

O esquema e as constraints da migração 020 devem ser homologados antes de
ativar routers, incluindo unicidade normalizada global e vínculos de ambiente.
Não houve migração, consulta real ou mudança de esquema. Deadlocks/falhas de
serialização propagam como falha técnica, com rollback; não foi criado retry
automático de emissão/cadastro, para não duplicar efeitos.

COMMIT que falha no transporte pode já ter sido aplicado. Os testes simulam
falha antes da aplicação e não comprovam reversão nesse caso real. Perda de
resposta após emissão pode deixar convite persistido sem o token disponível ao
cliente. Reenvio, cancelamento, recuperação e idempotência desses fluxos exigem
decisão específica; não foram inventados endpoints ou políticas novas.

Convites já emitidos não são invalidados automaticamente pela posterior
revogação de quem os emitiu; permanece a política anterior de validade e estado
do convite/ambiente. Alterar essa regra exige autorização. Ativação de routers,
limites de abuso do cadastro público e envio de convites também são futuras
decisões, sem integração com frontend nesta etapa.

Alterações locais em quatro arquivos de produção, um teste novo e este relatório.
App.js, frontend, autenticação/conta e demais módulos de negócio não mudaram.
Nenhum staging, commit, push ou merge foi executado.
