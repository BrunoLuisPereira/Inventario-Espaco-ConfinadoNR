# Convites por e-mail — SMTP local

## Fluxo e contrato

`POST /api/convites` continua exigindo administrador fundador autenticado.
Ambiente e emissor vêm da identidade validada no banco; e-mail e perfil são
validados e persistidos na transação existente. O token aleatório de 32 bytes
continua armazenado somente como SHA-256, com validade de 48 horas.

Após COMMIT e liberação da conexão, o serviço tenta enviar a mensagem pelo
transporte já utilizado pela recuperação. Não há SMTP dentro da transação.
O link usa exclusivamente a origem validada de `APP_PUBLIC_URL` e a rota
`/convites/aceitar#token=...`. Host, Origin e URLs do corpo não são utilizados.

O HTTP 201 continua significando **convite criado**, preservando `data.convite`
e `data.token`. Foram acrescentados `data.link` (ou null se a origem não estiver
configurada corretamente) e `data.envio.status`:

- `enviado`: o SMTP confirmou o aceite da mensagem; isso não comprova leitura
  nem entrega final em uma caixa externa.
- `falhou`: houve tentativa, mas não foi possível confirmar o aceite SMTP.
- `indisponivel`: o transporte está desabilitado ou não está configurado.

Os erros do provedor não são devolvidos nem registrados. O token permanece
na resposta administrativa para compatibilidade; não deve entrar em logs,
telemetria ou armazenamento persistente do frontend. Em envio confirmado, a
tela não apresenta o link. Em falha/indisponibilidade, oferece compartilhamento
manual quando há origem válida, exibindo o link somente na tela atual.

## Falhas, duplicatas e reenvio

Uma falha SMTP não desfaz nem cancela o convite. Ele permanece válido e pendente
por 48 horas a partir da emissão, reservando globalmente o e-mail. Outra emissão
é recusada com 409 enquanto estiver pendente e válido. Isso vale também quando
o transporte está desabilitado. Não há retentativa automática.

Um timeout pode ocorrer depois que o SMTP recebeu a mensagem; por isso a tela
informa que o envio não foi confirmado. O link dessa mensagem continua válido.
Se o processo cair depois do COMMIT, o convite também pode ficar pendente sem
envio ou sem resposta ao administrador. Não há garantia de entrega durável.

Proposta para uma próxima etapa, **não implementada**: endpoint de reenvio
autenticado e limitado por frequência, restrito ao fundador do mesmo ambiente.
Sob os bloqueios existentes (e-mail, ambiente e convite), revalidar o estado,
gerar novo token e substituir o hash atomicamente, invalidando o link anterior.
Só depois do COMMIT enviar o novo link. Se falhar, manter o novo estado pendente
e explicitar a falha. Não recuperar nem persistir o token original. Definir antes
se a rotação mantém ou renova a validade. Uma fila durável precisaria de desenho
e autorização próprios; nenhuma migration foi criada nesta etapa.

## Testar manualmente com Mailpit

Use exclusivamente um banco local de testes já preparado. Emitir e aceitar um
convite pela interface grava dados nesse banco. Esses passos não foram executados
automaticamente durante a implementação.

1. Com dependências, Mailpit e configuração local segura já disponíveis, execute
   na raiz `./iniciar-recuperacao-local.ps1`. Se necessário, passe
   `-MailpitExecutable` com o caminho do executável existente. Não é necessário
   editar `.env`, CLIXML ou chaves.
2. O supervisor existente usa SMTP `127.0.0.1:1025`, remetente local
   `nr33@example.invalid` e `APP_PUBLIC_URL=http://127.0.0.1:5174`. Ele inicia a
   interface Mailpit em `http://127.0.0.1:8025` e o frontend em
   `http://127.0.0.1:5174`. Não o execute sobre dados reais.
3. Entre como fundador do ambiente local de testes, abra Convites e informe um
   endereço sintético ainda não cadastrado e um perfil permitido.
4. Confirme a mensagem de envio, abra a mensagem capturada no Mailpit e confira
   destinatário, botão e validade. Abra o link em uma janela sem sessão: a tela
   deve remover o fragmento e pré-validar antes de mostrar o cadastro.
5. Ao concluir o cadastro no banco de testes, confira o ambiente e perfil. Tentar
   reutilizar o link deve indicar que já foi utilizado.

Mailpit captura e-mails localmente; não entrega ao Gmail ou Outlook. Os testes
automatizados simulam SMTP e PostgreSQL e não precisam iniciar esse supervisor.

## Para entrega externa futura

O adaptador atual aceita somente SMTP em loopback. Entrega externa exige outro
adaptador/configuração aprovada com TLS, autenticação ou API do provedor,
remetente/domínio verificado e origem HTTPS pública. Também será necessário
validar a entrega, política de falhas e implantação sem alterar os contratos de
recuperação. Nenhuma dependência ou credencial foi adicionada nesta etapa.
