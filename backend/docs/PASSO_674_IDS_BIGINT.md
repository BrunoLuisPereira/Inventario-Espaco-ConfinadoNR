# PASSO 674 — IDs BIGINT textuais

Referência: branch `feature/multi-tenant`, HEAD `00a48b5`.

## Diagnóstico e correção

Reproduzidos os 100 testes do PASSO 673 antes da correção: 71 aprovados e
29 falhas. O login exigia ID numérico e comparava estritamente duas leituras
que podiam representar o mesmo ID como número e string. O middleware
propagava o ID textual do banco para consumidores que exigem identidade
interna numérica. Isso afetava conta, administração, convites e Excel,
inclusive retornando 401 antes de alcançar buscas que deveriam retornar 404.
As proteções físicas de relatórios também recebiam IDs textuais incompatíveis.

O utilitário `normalizarIdDominio` aceita somente números inteiros positivos
seguros ou strings decimais canônicas positivas. Valida representação e
limite antes de converter, sem coerção de objetos nem arredondamento.
Rejeita NULL, UUID, BigInt nativo, expoentes, hexadecimal, frações, espaços,
zeros à esquerda e valores acima de `Number.MAX_SAFE_INTEGER`.
Campos nullable, UUIDs, GPS, contadores e valores físicos não passam por ele.

O login normaliza apenas as variáveis internas de comparação e o JWT sub.
O middleware normaliza a identidade revalidada e confere seu ID com o token.
O serviço de relatórios normaliza argumentos privados de filesystem, usando
uma cópia para a validação física do PDF e preservando o registro original
na resposta. Não houve alteração do parser PostgreSQL, SQL, autorização,
rotas montadas, tipos públicos dos registros ou snapshots offline.

## Arquivos

Criados nesta etapa:

- `backend/src/utils/normalizarIdDominio.js`
- `backend/tests/normalizarIdDominio.test.js`
- `backend/docs/PASSO_674_IDS_BIGINT.md`

Produção modificada:

- `backend/src/services/authService.js`
- `backend/src/middlewares/autenticacaoMiddleware.js`
- `backend/src/services/relatorioMultiTenantService.js`

Simuladores adaptados somente para reconhecer o novo import puro:

- `backend/tests/helpers/idsBigintSimulados.cjs`
- `backend/tests/helpers/contaSimulada.cjs`
- `backend/tests/campanhaIsolamentoIntegrado.test.js`
- `backend/tests/checklistIsolamentoIntegrado.test.js`
- `backend/tests/dadosTecnicosIsolamentoIntegrado.test.js`
- `backend/tests/localIsolamentoIntegrado.test.js`
- `backend/tests/relatorioIsolamentoIntegrado.test.js`
- `backend/tests/evidenciaArquivoIsolamentoSeguranca.test.js`
- `backend/tests/evidenciaCadastroIsolamentoSeguranca.test.js`
- `backend/tests/evidenciaMultiTenantRoutes.test.js`
- `backend/tests/evidenciaOperacoesIntegradasSeguranca.test.js`
- `backend/tests/loginSessaoSeguranca.test.js`
- `backend/tests/localExportacaoIsolamentoSeguranca.test.js`
- `backend/tests/sincronizacaoAutenticacaoMultiTenant.test.js`
- `backend/tests/usuarioCadastroDiretoSeguranca.test.js`
- `backend/tests/usuarioEscritaIsolamentoSeguranca.test.js`
- `backend/tests/usuarioIsolamentoSeguranca.test.js`

O helper de BIGINT e `backend/tests/idsBigintTextuaisSeguranca.test.js` já
estavam não rastreados no início. O arquivo dos 100 testes foi preservado.
A lista estrita de imports do teste de rotas de evidências foi ampliada com
o import real do normalizador; as expectativas de segurança não mudaram.

## Validação

- PASSO 673 após correção: **100/100**.
- Novos testes do normalizador e preservação pública: **49/49**.
- Regressões específicas: login multi-tenant **9/9**, autenticação **7/7**,
  login/sessão **48/48**, conta/perfil **125/125**, arquivos de relatório **29/29**.
- Suíte completa: **3.375/3.375**, zero falhas, skips ou testes cancelados.
- `git diff --check`: sem erros.

Foi usado o preload `backend/tests/helpers/evidenciaIsolamentoPreload.cjs`.
A execução completa encontrou `spawn EPERM` no sandbox e foi repetida
com autorização específica, mantendo NODE_OPTIONS com o preload nos
processos filhos. Não houve conexão PostgreSQL real, leitura de .env,
manipulação de uploads/PDFs reais ou inicialização da aplicação principal.

As regressões preservam isolamento A/B, 404 para recursos externos,
revalidação atual, identidade forjada sem efeito, UUIDs/NULL e snapshots.
Os testes antigos precisaram reconhecer o novo import antes de passar;
não foram removidos ou enfraquecidos.

## Limitações e estado final

A aplicação não suporta IDs de domínio acima de 9.007.199.254.740.991;
eles são rejeitados, nunca arredondados. Este trabalho normaliza fronteiras
necessárias às regressões; não converte todas as colunas BIGINT nem afirma
que todos os validadores antigos já usam o utilitário centralizado.

Permanecem necessárias a comprovação do DDL-base e a homologação do esquema,
driver, constraints e bloqueios em PostgreSQL real. Mocks de filesystem não
comprovam segurança física real. Nenhuma migração foi executada.

HEAD e branch preservados. Alterações locais sem staging; nenhum commit,
push, merge, alteração de app.js ou frontend. Trabalho pronto para revisão
antes de eventual commit, sem declaração de prontidão para produção.
