# Cobertura de testes — Inventário de Espaços Confinados NR-33

**Data de referência:** 17/11/2026.

**Auditorias de cobertura de linhas:** APROVADAS para backend e frontend.

## Objetivo e escopo

Este documento registra os resultados de cobertura de linhas obtidos e auditados em uma cópia isolada do projeto. As medições executaram seleções de testes com `node:test`, instrumentação Istanbul e bloqueios de infraestrutura externa.

Os resultados correspondem às fontes, aos testes e aos registros dessas medições, incluindo alterações locais presentes no momento da cópia. Não representam a execução da suíte completa do repositório, nem estão automaticamente associados a um commit de `main`.

## Resultados auditados

| Indicador | Backend | Frontend |
|---|---:|---:|
| Linhas cobertas | 5.300 | 674 |
| Linhas instrumentáveis | 6.976 | 2.224 |
| Linhas não cobertas | 1.676 | 1.550 |
| Cobertura de linhas | **75,97477064220183%** | **30,305755395683452%** |
| Percentual exato, em forma racional | 33125/436% | 8425/278% |
| Percentual arredondado | **75,97%** | **30,31%** |
| Arquivos de produção no denominador | 118 | 72: 33 JS e 39 JSX |
| Arquivos com execução registrada | 101 | 42 |
| Arquivos sem execução, incluídos com zero | 17 | 30 |
| Arquivos de testes selecionados | 92 | 29 |
| Testes aprovados na seleção acumulada | 5.082 | 421 |
| Falhas e ignorados nas execuções incorporadas | 0 | 0 |
| Auditoria independente dos contadores | APROVADA | APROVADA |

Os testes executados em controle e novamente com instrumentação não foram contados duas vezes na quantidade de testes aprovados. Tentativas reprovadas não foram incorporadas ao acumulado.

### Atendimento às metas

| Meta | Mínimo de linhas cobertas | Resultado | Excedente sobre o mínimo inteiro |
|---|---:|---|---:|
| Backend: 75% | 5.232 | Atingida | 68 linhas |
| Frontend: 25% | 556 | Atingida | 118 linhas |
| Frontend ampliada: 30% | 668 | Atingida | 6 linhas |

O mínimo inteiro é calculado pelo arredondamento para cima do produto entre a meta e o denominador. Para 30% de 2.224, são necessárias pelo menos 668 linhas, pois o produto é 667,2.

## Metodologia de medição

### Ferramentas

| Ferramenta | Versão utilizada |
|---|---|
| Node.js e runner `node:test` | 20.19.6 |
| `istanbul-lib-instrument` | 6.0.3 |
| `istanbul-lib-coverage` | 3.2.2 |
| `istanbul-lib-report` | 3.0.1 |
| `istanbul-reports` | 3.2.0 |
| `@babel/parser` dos auxiliares | 7.29.14 |
| React e React DOM, para renderização estática | 19.3.0 |
| Rolldown, para transformação JSX | 1.2.9 |

As ferramentas foram disponibilizadas em ambientes auxiliares isolados. A medição final não utilizou c8, Vitest ou a porcentagem nativa do Node como substitutos dos mapas Istanbul consolidados.

### Denominador e arquivos não executados

- Backend: os 118 arquivos JavaScript de produção de `backend/src/`.
- Frontend: os 72 arquivos `.js` e `.jsx` de produção de `frontend/src/`.
- Os mapas foram construídos estaticamente, sem importar artificialmente arquivos para aumentar a cobertura.
- Arquivos não executados permaneceram no denominador com contadores zerados.
- Testes, mocks, fixtures, dependências, auxiliares de medição e código gerado não foram contabilizados como produção.
- CSS, imagens e catálogos JSON não fazem parte do escopo de linhas JavaScript/JSX informado.

As linhas instrumentáveis são determinadas pelos mapas do Istanbul. Não se utilizou a quantidade de linhas físicas como substituta do denominador.

### Numerador e união sem sobreposição

Os statements de cada arquivo foram agrupados por sua linha inicial original. Uma linha é coberta quando pelo menos um contador correspondente registra execução. Cada par **arquivo + linha original** entra uma única vez no numerador, independentemente do número de chamadas ou de testes que o exercitem.

Os contadores de statements, funções e branches foram consolidados somente após verificar a compatibilidade dos identificadores, mapas e posições. Não se somaram os numeradores dos lotes, pois eles podem conter linhas sobrepostas.

```text
cobertura de linhas (%) = linhas únicas cobertas / linhas instrumentáveis × 100
```

### Execução controlada

Cada nova seleção passou por controle sem instrumentação e, após aprovação, execução com Istanbul. Foram utilizados hooks CommonJS/ESM e, no backend, instrumentação de código executado por VM com origem verificável.

A execução usou preloads e ambiente sanitizado, com bloqueios de rede, servidores, subprocessos não autorizados e operações em arquivos protegidos. Banco, SMTP, AWS e transportes externos foram simulados quando necessários. Não foram executadas migrations ou integrações reais com esses serviços durante a medição.

O runner permaneceu `node:test`, com seleção explícita de arquivos. Executar `npm test` ou `node --test` no checkout atual não reproduz, por si só, os percentuais deste documento: são necessários os auxiliares, a seleção, os insumos e os ambientes isolados correspondentes. Os novos testes criados na cópia não foram incorporados ao repositório neste registro documental.

## Renderização estática React

No PASSO 26.8, dez novos arquivos de testes executaram componentes e providers reais com `renderToStaticMarkup`, usando React DOM Server em memória. Foram verificadas saídas HTML observáveis, valores iniciais, diferenças entre criação e edição, tradução, escape de texto, permissões de apresentação e valores fornecidos por contextos.

Os componentes e providers abrangidos foram CampanhaForm, LocalForm, CaracterizacaoChecklist, CamposNr33/AvaliacaoNr33, Header/SeletorIdioma, EditarPermissoes, AuditoriaPermissoes, ThemeProvider, LayoutProvider e RecuperarSenha.

Esse passo acrescentou **106 linhas únicas** ao frontend: **82 linhas JSX efetivamente executadas** e 24 linhas JavaScript. Os dez arquivos adicionaram 24 testes aprovados à seleção acumulada.

O JSX original foi instrumentado antes da transformação pelo Rolldown. Os mapas de origem foram compostos, preservando a associação dos contadores às posições originais. O código transformado não foi instrumentado novamente. CSS foi tratado como módulo vazio, sem alegação de validação visual; imports sem extensão foram resolvidos dentro dos caminhos permitidos.

A simples leitura ou análise de JSX como AST não gerou cobertura de execução. Handlers e corpos de efeitos não chamados permaneceram sem execução registrada nesses lotes estáticos.

### Ressalva de sourcemap em SeletorIdioma.jsx

A auditoria identificou 249 segmentos de sourcemap que apontam além do fim da fonte de `SeletorIdioma.jsx`. Todos pertencem exclusivamente ao bootstrap `cov_*` gerado pelo Istanbul.

Esse bootstrap não integra os mapas originais de statements, funções ou branches e não entra no denominador. Os mapas originais e os contadores brutos foram comparados independentemente; nenhum contador, linha coberta ou resultado de cobertura foi afetado. A ressalva limita a depuração desse código gerado e não altera os percentuais aprovados.

## Auditorias e integridade

As auditorias recalcularam numerador e denominador e confrontaram os registros brutos com os acumulados intermediários e finais, sem depender apenas dos percentuais exibidos pelos relatórios.

No frontend foram conferidas 15 seleções em controle e Istanbul, totalizando 30 execuções registradas. Os 44 produtores instrumentados encerraram corretamente e os 44 loaders internos foram classificados. HTML, LCOV, JSON, TAPs, inventários e hashes apresentaram correspondência.

Os hashes dos **626 arquivos originais e 626 arquivos-base da cópia** foram preservados até as auditorias de cobertura. Os novos testes da cópia foram registrados separadamente. A auditoria final do frontend também verificou os 7.514 arquivos do pacote permanente de evidências do backend. Esta atualização altera somente documentação, sem modificar as fontes ou os testes medidos.

## Evidências locais e reprodução

As evidências permanecem em acervo local, sem publicação de caminhos pessoais, credenciais, arquivos `.env`, dependências instaladas ou relatórios temporários neste repositório.

- **Backend:** pacote permanente identificado como `backend-75pct-2026-11-17`, com relatórios, registros de execução, auxiliares, documentação e manifesto SHA-256.
- **Frontend:** consolidação final identificada como `frontend-26-8-recuperarSenhaRenderizacao-1794960476085`, e conferência complementar `frontend-26-8-auditoria-final-1794960716567`, mantidas nos auxiliares da cópia isolada. Esses arquivos ainda não constituem um pacote permanente de evidências do frontend.
- **Artefatos de referência:** `index.html`, `lcov.info`, `coverage-final.json`, `coverage-summary.json`, `summary.json`, TAPs, seleções, registros brutos e manifestos de hashes.

Os identificadores permitem localizar as evidências com o responsável pelo acervo; não são links públicos ou comandos executáveis. O repositório não contém, neste passo, todos os insumos necessários para reproduzir integralmente as medições. A reprodução exige a versão correspondente das fontes e testes, incluindo os criados na cópia, os auxiliares, lockfiles, configurações de isolamento e ajustes documentados dos caminhos históricos. Não se deve executar indiscriminadamente a suíte ou instalar ferramentas no ambiente original para tentar reproduzir esses números.

## Limitações e TDD

- Renderização estática não comprova cliques, digitação, submissões interativas, navegação ou eventos DOM.
- `useEffect` não é executado pela renderização estática; não se atribui cobertura funcional a seus corpos por mera declaração.
- Não houve navegador real ou integração real com backend, PostgreSQL, SMTP ou AWS nessa medição isolada.
- Mocks comprovam o comportamento observado diante das respostas simuladas, sem substituir testes de integração real.
- Cobertura de linhas não equivale a cobertura integral de funções, branches, fluxos ou requisitos, nem demonstra ausência de defeitos.
- As garantias de autorização e isolamento verificadas são as implementadas nos módulos; não se presumem regras multitenant inexistentes nos serviços legados.
- Os resultados pertencem às seleções executadas, não necessariamente a toda a suíte disponível no projeto.
- A existência de testes e o percentual de cobertura não comprovam TDD. A comprovação de ciclos red–green–refactor exige evidências históricas próprias; nenhuma conclusão de TDD histórico foi extraída somente destes resultados.

**Conclusão:** na referência de 17/11/2026, as seleções auditadas atendem às metas de cobertura de linhas de 75% no backend e 25% no frontend, incluindo a meta ampliada de 30% no frontend, dentro do escopo e das limitações acima.
