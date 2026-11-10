# Preferência individual de idioma — Passo 2

Migration: `database/027_preferencia_idioma_usuario.sql`.
As migrations **027 e 028 já foram aplicadas manualmente** no banco local de
desenvolvimento `inventario_nr33_multitenant_dev`. Não reaplicá-las nesse banco.
A aplicação não executa migrations automaticamente. Em outros ambientes,
verificar o estado do schema e obter autorização para aplicação manual controlada.
O comentário de preparação no arquivo SQL registra sua origem; não é um controle
do estado de cada ambiente nem motivo para repetir uma migration já aplicada.

O procedimento consolidado de [implantação e rollback](internacionalizacao-pdf028.md#implantação-em-outro-ambiente)
define backup, conferência de destino, ordem 027 → 028, privilégios e validação.
Não há conversão de dados NR-33, tradução de textos livres ou backfill de PDFs.

`GET /api/auth/perfil` acrescenta `id_ambiente` e `idioma`. A leitura usa
`to_jsonb(u)` para tolerar a coluna ausente, retornando `pt-BR` até a aplicação
da migration. `PATCH /api/auth/preferencias/idioma` recebe somente `{ idioma }`;
campos extras são rejeitados. Idioma ausente ou diferente de `en`/`pt-BR` usa
`pt-BR`. Identidade e ambiente vêm do middleware multi-tenant existente.
A escrita usa a capacidade `conta.propria`, locks ambiente → usuário e transação.
Sem a coluna, falha com 503 e rollback; não aplica DDL nem altera JWT/permissões.

O frontend mantém uma chave versionada por ambiente e ID de usuário, separada
entre aplicação real e demo. Uma alteração local pendente prevalece sobre o
perfil recebido. A confirmação só limpa a mesma revisão que foi enviada.
Envios são serializados por escopo e vinculados ao token/identidade de origem.
Consultas de perfil capturam a revisão local ao iniciar; uma resposta só atualiza
o idioma se nenhuma edição ou confirmação posterior tiver mudado essa revisão.
Logout e troca de sessão invalidam respostas antigas; pendências de outra conta
só voltam a ser enviadas depois da autenticação daquela conta. Reconexão e foco
da janela tentam novamente; falhas não criam loop de requisições.

O snapshot local restaura apenas a apresentação do idioma enquanto a sessão é
validada. Não autoriza acesso offline nem contorna a revalidação atual do PWA.
Catálogos acompanham o bundle. A preferência não entra no protocolo de entidades.

## Diagnóstico do test:browser

Falha preexistente ao Passo 1: em `HEAD`, `demoApi.campanhaPermitida` já usa
ambiente e capacidade `campanhas.consultar`, sem filtro por responsável.
`campanhaMultiTenantRepository` aplica o mesmo escopo de leitura. O roteiro
esperava que o engenheiro não enxergasse a campanha criada pelo administrador
do mesmo ambiente. A expectativa foi atualizada para o contrato existente,
mantendo uma asserção explícita de rejeição de campanha de outro ambiente.
Nenhuma permissão nem filtro de produção foi alterado para acomodar o teste.

## Validação e limites atuais

Os testes automatizados de backend usam simuladores de autenticação, SQL,
transações e falhas; os de navegador usam API sintética ou demo isolada.
A branch inclui a interface completa e PDFs multilíngues dos passos posteriores.
A homologação real dos PDFs, após aplicação manual da 028, confirmou consulta de
preferência e preservação dos usuários. A troca de idioma nessa homologação foi
transitória no navegador, sem PATCH da preferência; não equivale a uma nova
homologação real de gravação da preferência individual.

O frontend possui 747 chaves por idioma, distribuídas em 14 domínios.
Os limites de offline, mensagens e validação estão descritos na
[documentação da interface](../../frontend/docs/internacionalizacao.md).
Não versionar credenciais, contas de teste, PDFs reais ou evidências locais.
