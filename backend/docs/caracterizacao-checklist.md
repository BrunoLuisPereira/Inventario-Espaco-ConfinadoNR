# Caracterização do espaço confinado no Checklist

Implementação na branch `feature/caracterizacao-espaco-checklist`, na tela existente
`/locais/:id/checklist`. Itens A, B, C, D e G opcionais, armazenados somente em
`checklist_nr33`. Não duplica situação do Local nem dados ambientais de Dados
Técnicos. O código é um texto próprio, separado da chave interna `id_local`, do
nome do Local e da antiga classificação `identificacao_espaco`.

## Migration 025

Aplicada exclusivamente no desenvolvimento local `127.0.0.1:5432/inventario_nr33_multitenant_dev`
em 02/11/2026, às 21:05:06 (São Paulo), após autorização final e backup validado.
Ver [relatório de aplicação e preservação dos dados](aplicacao-checklist025.md).
Não reaplicar. Os passos de preparação abaixo são referência histórica.

`backend/database/025_caracterizacao_checklist_nr33.sql` adiciona:

| Coluna | Tipo / limite |
| --- | --- |
| codigo_identificacao | VARCHAR(150) |
| volume_m3 | NUMERIC(18,6), positivo, rejeita NaN |
| quantidade_aberturas | INTEGER, não negativo (máximo 2147483647) |
| dimensoes_aberturas | TEXT, 5000 caracteres |
| formas_acesso | TEXT, 5000 caracteres |
| geometria | TEXT, 2000 caracteres |
| utilizacao_produto | TEXT, 5000 caracteres |
| perigos_antes_liberacao | TEXT, 5000 caracteres |

Todas aceitam NULL, sem valores padrão nem backfill. Não modifica colunas
existentes, dados cadastrados, triggers, perfis ou regras de status. A migration
usa BEGIN/COMMIT; falha em vez de ignorar um esquema parcialmente aplicado.

Para aplicação futura, somente após revisão e autorização:

1. Confirmar o destino e os backups conforme o processo de operação do ambiente;
   conferir que o esquema anterior está instalado e a 025 ainda não foi aplicada.
2. A etapa posterior validou SQL e constraints em PostgreSQL 17.10 descartável.
   Consultar [o relatório de validação](validacao-caracterizacao-checklist-025.md)
   antes de escolher o destino: o `.env` aponta para um banco legado diferente
   do inicializador local multi-tenant.
3. Em uma janela apropriada, aplicar a migration antes de disponibilizar o novo
   backend. ALTER TABLE requer bloqueio de tabela; as restrições são verificadas
   na aplicação.
4. Exemplo a partir da raiz do repositório, substituindo o nome de serviço por
   uma conexão previamente revisada (não executado nesta entrega):

   ```powershell
   psql "service=nr33_destino_revisado" -X -v ON_ERROR_STOP=1 -f backend/database/025_caracterizacao_checklist_nr33.sql
   ```

5. Conferir as oito colunas e constraints, disponibilizar o backend/frontend e
   verificar criação, edição e consulta com um registro de teste autorizado.
   Não executar novamente a migration já aplicada.

Não há rollback destrutivo incluído. Se for necessário reverter a aplicação,
preservar as colunas e dados novos enquanto se avalia a reversão do código.

## Contrato de API e sincronização

POST, GET (lista/detalhe) e PUT de `/api/checklists` usam os oito nomes acima.
As consultas já selecionam `ch.*`. PATCH de status mantém o contrato anterior.

Nas atualizações:

- Campo omitido (ou undefined em chamadas internas): preserva o valor.
- NULL, string vazia ou somente espaços: limpa explicitamente para NULL.
- Texto válido: remove espaços nas extremidades e preserva quebras de linha.
- Volume: decimal com ponto, até 12 dígitos inteiros e 6 casas decimais; maior
  que zero. String decimal preserva a precisão. Vírgula, notação exponencial
  textual, NaN, infinito, booleanos e objetos são recusados com HTTP 400.
- Quantidade: inteiro de 0 a 2147483647; zero permanece informado.

O PostgreSQL pode devolver NUMERIC como string. O formulário aceita essa
representação sem converter volume para ponto flutuante no payload.

A sincronização ativa em `sincronizacaoMultiTenantRepository.js` compartilha a
validação e inclui os campos na lista permitida, inclusive na resolução de
conflitos CLIENTE/MESCLADO. Payloads antigos que omitem os campos não os apagam.
A resolução SERVIDOR mantém o snapshot existente. Identidades e vínculos não
são aceitos do cliente; filtros de ambiente, RBAC e bloqueios existentes foram
preservados. Os caminhos legados não registrados não foram ampliados.

## Interface e PDF

Seção após os três critérios, antes dos seletores existentes, no mesmo formulário.
Inclui consulta, cadastro e edição, áreas de texto multilinha, zero preservado,
temas claro/escuro e layout com uma coluna em telas menores. Novos dados não são
requisitos para editar ou concluir checklists antigos. Nenhum campo E/F criado.

PDF permanece inalterado e não apresenta os novos campos nesta etapa. Uma
integração posterior depende de autorização própria para selecionar os atributos
e renderizá-los dentro da seção de Checklist, validando a paginação.

O modo demo existente continua sem simular salvamento de Checklists. O teste de
navegador desta entrega usa a interface real com API sintética independente.

## Verificação

- `backend/tests/caracterizacaoChecklist.test.js`: contrato e validações, serviço
  e parâmetros SQL sem banco real.
- Testes existentes de repository, serviço, controller, rotas e bloqueios:
  regressão das operações e limites de autorização; os simuladores foram
  atualizados para as novas colunas.
- `checklistIsolamentoIntegrado.test.js`: rotas ativas com dependências simuladas,
  criação/consulta/edição/limpeza e recusa de outro ambiente.
- `checklistAutorizacaoTransacional.test.js`: sete perfis e preservação/limpeza.
- `sincronizacaoMultiTenantSeguranca.test.js`: criação, atualização, limpeza,
  payload antigo, dados inválidos e conflitos com os novos campos.
- `frontend/tests/caracterizacaoChecklist.test.js`: carga antiga, payload,
  precisão, zero, limpeza e limites.
- `node --experimental-websocket frontend/scripts/verificar-caracterizacao-checklist.mjs`:
  Chrome headless, perfil temporário e API sintética, com rede de API bloqueada;
  consulta/edição/cadastro/limpeza, sete perfis, claro/escuro e 1440/390/320 px.
- Na pasta frontend: `npm test`, `npm run lint` e `npm run build`.

Banco atual, dados reais, gerador PDF e `artifacts/` não são usados por esses
testes de caracterização. A validação real em banco descartável foi concluída
posteriormente; a aplicação aos bancos existentes permanece pendente.

Resultados desta entrega: 597 testes selecionados do backend aprovados; 155
testes da suíte frontend aprovados; lint, build e teste Chrome acima aprovados.
Não foi executada a suíte inteira do backend; a seleção cobre o Checklist e a
sincronização afetados. Esses resultados são da etapa de implementação. A etapa
posterior executou a suíte completa (4449 aprovações) e a migration em uma
instância descartável (42 verificações). Ver o relatório de validação vinculado.

Comando da seleção backend, a partir da raiz:

```powershell
node --test backend/tests/caracterizacaoChecklist.test.js backend/tests/checklistMultiTenantService.test.js backend/tests/checklistMultiTenantRepository.test.js backend/tests/checklistIsolamentoIntegrado.test.js backend/tests/checklistAutorizacaoTransacional.test.js backend/tests/checklistMultiTenantController.test.js backend/tests/checklistMultiTenantRoutes.test.js backend/tests/sincronizacaoMultiTenantSeguranca.test.js
```

## Arquivos desta entrega

Criados:

- `backend/database/025_caracterizacao_checklist_nr33.sql`
- `backend/docs/caracterizacao-checklist.md`
- `backend/src/utils/caracterizacaoChecklist.js`
- `backend/tests/caracterizacaoChecklist.test.js`
- `frontend/src/components/CaracterizacaoChecklist.jsx`
- `frontend/src/services/caracterizacaoChecklist.js`
- `frontend/tests/caracterizacaoChecklist.test.js`
- `frontend/scripts/verificar-caracterizacao-checklist.mjs`

Modificados:

- `backend/src/services/checklistMultiTenantService.js`
- `backend/src/repositories/checklistMultiTenantRepository.js`
- `backend/src/repositories/sincronizacaoMultiTenantRepository.js`
- `backend/tests/checklistMultiTenantRepository.test.js`
- `backend/tests/checklistAutorizacaoTransacional.test.js`
- `backend/tests/checklistIsolamentoIntegrado.test.js`
- `backend/tests/sincronizacaoMultiTenantSeguranca.test.js`
- `frontend/src/pages/ChecklistLocal.jsx`
- `frontend/src/styles/ChecklistLocal.css`
