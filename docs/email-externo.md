# Etapa C — preparação de SMTP externo

## Arquitetura e ativação

O adaptador `backend/src/services/smtpExterno.js` implementa o contrato existente
`enviar({ para, assunto, texto, html })` com o Nodemailer já instalado. A fábrica
`criarEmailConfigurado` seleciona o transporte; convites e recuperação continuam
usando os mesmos templates, serviços e contratos HTTP. Não há SDK de provedor,
migration, nova fila ou dependência adicional.

| EMAIL_TRANSPORT | Comportamento |
| --- | --- |
| ausente ou `disabled` | Indisponível; não cria cliente e não envia. |
| `local-smtp` | Mailpit em loopback, sem autenticação/TLS, com as restrições existentes. |
| `external-smtp` | Seleção explícita do SMTP externo autenticado e criptografado. |

Credenciais presentes sozinhas não ativam o transporte. Configuração externa
incompleta ou inválida causa erro fixo de configuração e impede iniciar o backend;
não há fallback para SMTP sem TLS ou para envio simulado. Criar o cliente não
abre conexão nem executa `verify()`. A disponibilidade indica configuração
aceita, não comprova conectividade, autorização da conta ou entrega.

Os pontos de entrada padrão e de laboratório iniciam o worker de recuperação
tanto com `local-smtp` quanto com `external-smtp`. O worker continua usando a
fila de recuperação já existente, sem mudança de expiração, limites, proteção
contra enumeração, ativação de token ou invalidação de sessões.

## Configuração futura

Injetar os valores no ambiente do processo por configuração protegida da
hospedagem/gerenciador de segredos. Não colocar segredos em código, Git, argumentos
de comandos, logs ou variáveis do frontend. Nenhum arquivo `.env` ou CLIXML foi
alterado nesta etapa.

| Variável | Requisito do modo externo |
| --- | --- |
| `EMAIL_TRANSPORT` | `external-smtp`, somente quando a ativação for autorizada. |
| `SMTP_HOST` | Nome DNS completo do endpoint SMTP do provedor; sem URL, IP ou nome local. |
| `SMTP_PORT` | `465` para TLS implícito ou `587` para STARTTLS obrigatório. |
| `SMTP_USER` | Login SMTP fornecido pelo provedor, obrigatório. |
| `SMTP_PASSWORD` | Segredo SMTP/API aceito pelo provedor, obrigatório. Não é necessariamente a senha da conta. |
| `EMAIL_FROM` | Um endereço simples de remetente autorizado/verificado; sem nome de exibição ou lista. |
| `APP_PUBLIC_URL` | Origem HTTPS pública, sem credenciais, caminho além de `/`, query ou fragmento. |

O SMTP usa `requireTLS: true`, `ignoreTLS: false`, TLS mínimo 1.2,
`rejectUnauthorized: true` e SNI com o host configurado. Não há opção de desligar
verificação de certificados ou permitir fallback em texto puro. Somente 465/587
são suportadas nesta etapa. Portas alternativas exigem revisão explícita.

Timeouts: DNS, conexão e saudação em 5 segundos; socket inativo em 10 segundos.
São limites por fase/inatividade, não uma garantia de prazo total de entrega.
Logger/debug e acesso a arquivos/URLs do Nodemailer ficam desabilitados.
Erros de configuração, autenticação, TLS, DNS ou envio não carregam mensagem,
`cause`, `response` ou código bruto do provedor para o restante da aplicação.

A validação da origem é sintática: não faz DNS, não verifica propriedade do
domínio nem publica o aplicativo. Cabe à implantação garantir que a origem é
controlada pelo projeto, resolve publicamente e serve as rotas corretas. Não
usar um nome que resolva para localhost/rede privada. IPs literais, nomes sem
domínio e sufixos `.localhost`, `.local` e `.internal` são recusados. A origem
vem exclusivamente de `APP_PUBLIC_URL`; Host/Origin/corpo HTTP não a substituem.

## Brevo e Resend

Comparação consultada em **02/11/2026**. Condições comerciais e disponibilidade
podem mudar; confirmar antes de contratar. Nenhuma conta ou provedor foi ativado.

| Critério | Brevo | Resend |
| --- | --- | --- |
| Compatibilidade/manutenção | SMTP padrão; login e chave SMTP. Sem SDK adicional. | SMTP padrão; usuário `resend` e API key como senha. Sem SDK adicional. |
| Segurança neste projeto | Mesmo adaptador, TLS obrigatório e segredos protegidos. | Mesmo adaptador, TLS obrigatório e segredos protegidos. |
| Remetente e domínio | Remetente autorizado e domínio autenticado recomendados para operação definitiva. | Domínio verificado para enviar a destinatários arbitrários. |
| Sem domínio | Há tratamento temporário com substituição do remetente; não deve orientar a arquitetura definitiva. | `resend.dev` limita testes ao e-mail da própria conta; não atende convites gerais. |
| Referência comercial | 300 envios/dia no plano gratuito; Starter a partir de US$ 9/mês. | Gratuito com 3.000/mês e 100/dia; Pro US$ 20/mês para 50.000/mês. |

Fontes oficiais:

- [Brevo SMTP: autenticação e portas](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).
- [Brevo: substituição temporária de remetente sem autenticação de domínio](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders).
- [Planos e limites Brevo](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans).
- [Resend SMTP](https://resend.com/docs/send-with-smtp).
- [Restrições de testes com resend.dev](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
- [Preços Resend](https://resend.com/pricing).
- [Nodemailer: TLS obrigatório e timeouts](https://nodemailer.com/smtp).

A opção técnica mais simples para o código atual é SMTP independente de provedor.
Brevo oferece maior franquia diária na referência consultada; Resend tem foco em
e-mail transacional e testes restritos sem domínio. Custos, volume, aprovação da
conta, suporte e política de dados ainda precisam ser avaliados pelo proprietário.
Não foi feita escolha comercial nem adotada gratuidade como garantia permanente.

## Confirmação, falhas e limites

O transporte confirma envio apenas se o SMTP aceitar exatamente o destinatário
solicitado e não houver destinatários rejeitados. Aceite não garante chegada na
caixa de entrada, leitura ou ausência de spam/bounce posterior.

Convites mantêm validade de 48 horas, uso único e associação ao ambiente, e-mail
e perfil persistidos. O envio ocorre depois do COMMIT e da liberação da conexão.
Falha mantém o convite pendente e a reserva do e-mail; outra emissão continua
bloqueada. Não há reenvio automático, reutilização do token antigo ou garantia
durável entre persistência e SMTP. Timeout pode ocorrer após o aceite remoto.
Ver [política de convites e proposta de rotação](convites-email-local.md).

Na recuperação, o token continua sendo ativado somente após confirmação do
transporte. Falha leva à invalidação conforme o fluxo existente. Nenhum token,
link completo ou credencial é registrado pelo novo adaptador. Provedores podem
reter mensagens e logs próprios: avaliar retenção, rastreamento e proteção dos
links antes da ativação. Webhooks de entrega/bounce e novas políticas de reenvio
estão fora desta etapa.

## Testar sem domínio ou credenciais reais

Os testes externos injetam uma fábrica SMTP em memória. Os endereços e segredos
são fixtures sintéticas, não há resolução DNS ou conexão externa. Não definir
`EMAIL_TRANSPORT=external-smtp` com fixtures no servidor real.

No diretório `backend`:

```powershell
node --test tests/emailExterno.test.js tests/emailWorkerInicializacao.test.js tests/emailLocalWorker.test.js tests/conviteEmail.test.js tests/cadastroConvitesSeguranca.test.js tests/recuperacaoSenha.test.js tests/recuperacaoSenhaRepository.test.js tests/preflightLogin.test.js
```

No diretório `frontend`:

```powershell
npm test
npm run lint
npm run build
```

Para uso manual com Mailpit, manter o supervisor existente e seguir
[o roteiro local](convites-email-local.md). Não exige domínio e continua usando
`local-smtp`; iniciar esse supervisor e emitir convites requer um banco local de
testes já preparado. Os testes automatizados não o iniciam nem alteram PostgreSQL.

Para ativar envio real faltam a decisão do provedor, conta autorizada, remetente
verificado e DNS conforme o provedor, credenciais protegidas, aplicação publicada
em HTTPS com origem confiável, configuração de CORS/proxy para a origem real e
teste supervisionado de entrega e acesso aos links. Nada foi publicado ou ativado.
