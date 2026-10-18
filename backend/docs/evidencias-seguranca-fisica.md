# Evidências: limites físicos e homologação — PASSO 608

## Implementado

- Upload em memória, com autorização antes da gravação e nova autorização no INSERT.
- Caminhos novos exclusivamente gerados pelo servidor; POST JSON rejeita caminhos
  não vazios e PUT não permite trocar/limpar a associação física.
- Arquivo novo aberto com `wx`, permissão solicitada 0600 e nome aleatório.
- Verificação de diretórios por `lstat`/`realpath` e identidade `dev:ino` antes e
  depois da abertura e da escrita. IDs lidos com `bigint` para não arredondar NTFS.
- Verificação do descritor aberto, do caminho correspondente, de arquivo regular
  e de uma única ligação física. `sync()` antes de retornar a referência.
- Fechamento do descritor mesmo em erro; falha de fechamento não mascara a
  falha original. Nenhum `unlink` após falha ou troca de caminho.
- Resolver lexical rejeita fuga de diretório, diretório raiz, NUL, tipos
  inesperados e referências a streams alternativos no Windows.
- DELETE autorizado remove o registro, mas preserva bytes legados/compartilhados.

Nenhum arquivo existente foi inspecionado, movido, renomeado ou removido nesta
tarefa. Testes de filesystem usam objetos simulados. Multipart usa memória.

## O que ainda não está resolvido

Verificar antes/depois não equivale a abrir relativamente a um descritor de
diretório (`openat`/`dirfd`). O processo pode detectar substituições, mas não
impede toda janela de corrida contra um agente que consiga alterar o filesystem:
até um arquivo vazio pode ter sido criado antes da detecção de troca de pasta.
ACLs que impeçam terceiros de alterar os diretórios e homologação no SO alvo
são necessárias. Não há garantia de durabilidade do diretório só por fazer
`sync()` no arquivo.

O download legado autorizado ainda usa `res.sendFile(caminho)`: o caminho é
reaberto pelo Express. A validação lexical não prova ausência de symlink/junction
nem propriedade física de referência legada. Uma entrega vinculada a descritor
exige preservar e testar MIME, Range, HEAD, ETag, cache, erros e fechamento no
cancelamento. Não foi introduzida uma implementação parcial que mude esse contrato.

Nenhum formato de nome prova propriedade de arquivos existentes. Registros
legados podem compartilhar caminhos ou conter aliases anteriores. Não renomear
nem invalidar esses registros automaticamente.

Filesystem e PostgreSQL não formam uma transação atômica. Falha de escrita,
sincronização/fechamento, INSERT, revogação ou corrida idempotente pode deixar
arquivo sem associação. Falha de COMMIT/transporte pode ter resultado ambíguo.
Preservar o arquivo evita apagar uma referência válida. Reconciliação e limites
operacionais de espaço permanecem necessários; não há limpeza automática.

Assinaturas, MIME e extensão não substituem decodificação completa ou inspeção
antimalware de documentos/imagens.

## Proposta futura de reconciliação, inicialmente somente leitura

1. Em homologação autorizada, obter inventário estável de metadados físicos e
   snapshot de referências do banco, sem expor dados de outros ambientes por API.
2. Comparar todas as referências normalizadas e possíveis aliases; separar
   referenciado, compartilhado, ausente, inseguro e sem referência observada.
3. Nunca tratar ausência em um snapshot como prova definitiva de arquivo órfão:
   pode haver upload/COMMIT em curso, cópia incompleta ou resultado ambíguo.
4. Produzir relatório sem mover, renomear, corrigir registros ou excluir arquivos.
5. Definir posteriormente propriedade verificável, período de retenção, mecanismo
   de coordenação com uploads e recuperação. Se exigir esquema ou mudança de
   contrato, solicitar autorização antes de implementar.

## Compatibilidade observada do cliente

`frontend/src/services/api.js` envia arquivo por FormData para `/evidencias/upload`.
`frontend/src/pages/EvidenciasLocal.jsx` edita descrição/GPS sem trocar o caminho.
Esses fluxos são compatíveis com a política nova. O frontend não foi modificado.
A função de envio inspecionada não fornece chave de operação: retentativas sem
chave não têm garantia de idempotência. Filas de versões antigas e dados já
armazenados no navegador não foram inspecionados; payloads com caminho bruto ou
UUID/GPS inválido podem receber 400 e precisam de tratamento no cliente.

## Execução de testes

Usar `backend/tests/helpers/evidenciaIsolamentoPreload.cjs` em NODE_OPTIONS de todos
os processos, bloqueando PostgreSQL, `.env` e uploads reais. HTTP efêmero dos
testes foi autorizado; não iniciar a aplicação principal. No PASSO 608 os testes
isolados passaram (33 de arquivos e 91 de operações) e a suíte completa passou
com 1.574 testes, sem falhas ou ignorados. Isso não constitui homologação real.
