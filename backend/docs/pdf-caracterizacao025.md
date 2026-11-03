# Caracterização do Checklist no PDF NR-33

Validação em 02/11/2026 na branch `feature/caracterizacao-espaco-checklist`.

## Integração

`SQL_COMPLETO`, compartilhado pela consulta completa e geração autorizada do
relatório, passou a selecionar as oito colunas de `checklist_nr33`. Os joins,
filtros de ambiente, autorização, transação e persistência do relatório foram
preservados. O serviço do relatório já entrega esse objeto ao gerador PDF.

O gerador inclui a tabela **Caracterização do Espaço Confinado** depois dos
critérios A–G, antes de Observações e Status. Os rótulos não têm prefixos de
itens. Campos ausentes recebem `Não informado`; a quantidade zero é preservada.
O volume mantém a precisão de NUMERIC(18,6), com vírgula decimal, sem conversão
intermediária para ponto flutuante.

O bloco reutiliza o mecanismo existente de tabelas, quebra de linhas e páginas,
com títulos de continuação. Há reserva para manter o título com a primeira
informação e para manter o título de Dados Técnicos com seu primeiro conteúdo.
As seis seções e a proteção do bloco de responsabilidade permanecem.

## Verificação

- `cd backend; npm test`: **4.459 aprovados, zero falhas e zero ignorados**.
- Cobertura adicional: oito campos, valores ausentes, decimal com seis casas,
  maior volume permitido, quantidade zero, multilinhas e palavras extensas,
  conteúdo integral entre páginas, rodapés e isolamento entre dois ambientes.
- Testes de autorização existentes continuaram passando.
- `git diff --check` e `node --check` dos dois arquivos de produção: aprovados.
- O backend não tem scripts de lint ou build em `package.json`.
- Nenhuma conexão com PostgreSQL ou alteração do Relatório nº 17 foi necessária.
  Os testes de isolamento usam banco simulado; não constituem uma nova prova
  contra o PostgreSQL em execução.

O script `backend/laboratorio/validar-pdf-caracterizacao025.cjs` gera exemplos
somente com dados e imagens sintéticos, em nova pasta temporária, sem gravação
em uploads ou acesso ao banco. Executar da raiz com:

```powershell
node backend/laboratorio/validar-pdf-caracterizacao025.cjs
```

PDFs desta validação, renderizados integralmente com PyMuPDF e conferidos
visualmente nas páginas do Checklist, continuação, evidências e responsabilidade:

| Exemplo | Páginas |
| --- | ---: |
| Oito campos preenchidos | 5 |
| Checklist antigo sem os campos | 5 |
| Textos extensos e multilinhas | 9 |

Pasta de saída desta execução:
`C:\Users\BRUNOL~1\AppData\Local\Temp\nr33-pdf025-visual-IZz6Sc`.
Contém PDFs, manifesto e imagens renderizadas, fora do repositório.
Não foram observados cortes, sobreposições ou páginas em branco. Cabeçalhos e
numeração foram conferidos em todas as páginas. Quantidades de páginas variam
conforme o conteúdo; não há limitação a três páginas.

## Revisão operacional

Um PDF já armazenado não é reescrito por esta alteração. Para conferir o
Relatório nº 17 posteriormente, o backend deve carregar o código atualizado
(reiniciar o processo, se necessário) e o PDF precisa ser gerado novamente pelo
fluxo autorizado existente. Essa regeneração não foi executada nesta validação.

Nenhuma migration, alteração de dados, permissões, arquivos em `artifacts/`,
commit, push ou merge foi executado nesta etapa. Alterações anteriores da branch
foram preservadas. A implementação aguarda revisão.
