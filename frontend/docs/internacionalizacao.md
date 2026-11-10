# Internacionalização da interface — estado consolidado dos PASSOS 1 a 4

Idiomas: `pt-BR` (padrão/fallback) e `en`. A infraestrutura e a persistência dos
passos anteriores são reutilizadas, sem mudanças no protocolo de preferência.

## Catálogos e apresentação

São 747 chaves por idioma, distribuídas em 14 domínios locais: `navigation`, `settings`,
`common`, `authentication`, `dashboard`, `campaigns`, `locations`, `inventory`,
`checklist`, `technical`, `evidence`, `reports`, `users` e `messages`.
Os dois idiomas acompanham o bundle; trocar idioma não baixa arquivos de tradução.

Os namespaces existentes conservam suas chaves. Nos novos catálogos, as frases
portuguesas são chaves legíveis, com separadores de chave/namespace desativados
na resolução. `apresentacao.js` resolve a referência por domínio e reutiliza
textos comuns, inclusive os já catalogados em navigation/settings.
Para acrescentar uma frase, reutilizar um texto existente ou adicionar a mesma
chave aos dois idiomas no domínio correspondente. Os testes verificam referências
literais, paridade de chaves, parâmetros e ausência de textos JSX não catalogados.

`useTraducao` assina as mudanças de idioma sem alterar chaves de componentes,
estado, rotas, efeitos de carregamento ou payloads. Mensagens continuam guardadas
no estado original e são traduzidas na renderização, incluindo modelos com
parâmetros. Confirmações e alertas são traduzidos antes de abrir.

`traduzir` e `rotuloEnum` são apenas para rótulos controlados: não aplicar a nomes,
descrições, observações, legendas, identificadores ou outros textos livres.
As respostas e enums continuam sendo enviados como `SIM`, `NAO`, booleanos,
`PENDENTE`, `CONCLUIDO`, perfis e demais valores originais.
CREA, ART, unidades e a referência à norma brasileira NR-33 são preservados.

Mensagens conhecidas da API são traduzidas no frontend, sem alterar códigos,
status, detalhes normativos ou respostas HTTP. Uma mensagem inesperada e ainda
não catalogada usa um erro genérico em inglês; em português mantém o texto
existente. Novas mensagens públicas podem ser catalogadas sem alterar o backend.

O seletor do cabeçalho usa o mesmo `useIdioma` de Configurações e permite trocar
de idioma com um formulário aberto. O seletor das telas públicas é transitório:
não grava preferências de conta enquanto não há sessão; ao autenticar, prevalece
a preferência individual. Se uma tela pública for aberta por alguém já
autenticado, o seletor usa o mesmo `useIdioma` da conta.
Título do documento, atributos acessíveis e mensagens nativas de validação
acompanham o idioma. A validação nativa conserva as regras e os limites originais.

## Datas, números e offline

- Português: `pt-BR`.
- Inglês: `en-GB`, datas dia/mês/ano, ponto decimal e vírgula para agrupamento.
- Datas `AAAA-MM-DD` são formatadas como datas civis, sem deslocamento por fuso.
- Timestamps continuam no fuso de apresentação existente; idioma não muda fuso.
- Strings decimais do PostgreSQL são formatadas sem conversão para `Number`,
  sem arredondar ou perder casas decimais, inclusive zero e valores negativos.
- Campos editáveis e dados enviados à API não recebem formatação de apresentação.
- O teste offline cobre a interface já carregada e seus catálogos locais. Não
  acrescenta service worker, instalação offline ou autorização offline ao PWA.

## Arquivos desta etapa

- `index.html`, `package.json`, `src/App.jsx`.
- `src/i18n/index.js`, novos `domains.js`, `apresentacao.js`, `formatacao.js`,
  `ValidacaoIdioma.jsx` e 24 novos JSON em `src/i18n/locales/{pt-BR,en}/`.
- Novo `src/hooks/useTraducao.js`; apresentação em `src/hooks/useAmbienteAtual.js`.
- Todas as páginas em `src/pages/`: Login, Cadastro, RedefinirSenha, Dashboard,
  Campanhas, Locais, LocaisCampanha, InventarioLocal, ChecklistLocal,
  DadosTecnicosLocal, EvidenciasLocal, ResponsaveisRelatorio, RelatorioLocal,
  Listagem, Usuarios, Convites e Configuracoes.
- Componentes: AuditoriaPermissoes, CamposNr33, CaracterizacaoChecklist,
  DemoBanner, EditarPermissoes, RecuperarSenha, campanhas/CampanhaForm,
  locais/LocalForm, locais/BotaoPdfLocal, layout/Header, layout/Painel e
  layout/Sidebar. Novos SeletorIdioma e SeletorIdiomaPublico.
- `src/styles/Header.css`, `src/styles/Login.css`.
- Novo `tests/interfaceI18n.test.js` e `scripts/testar-interface-i18n.mjs`;
  ajuste em `scripts/testar-demo-navegador.mjs` para comparar campos editáveis,
  permitindo que rótulos de somente leitura sejam traduzidos.
- Este documento.

## Validação

- `npm test`: 215 testes aprovados, incluindo preferências, autenticação/RBAC,
  NR-33, paridade, resolução dos catálogos, mensagens, datas e precisão decimal.
- `npm run test:interface-i18n`: 73 verificações, 15 telas e 2 modais; alternância,
  formulário/sessão/tema/perfil preservados, valores/payload NR-33 originais,
  textos livres preservados, layouts móveis, validações e tradução offline.
- `npm run test:browser`: fluxos demo em português, campanhas, locais e contas.
- `npm run test:i18n-browser`: preferência individual e reconexão na demonstração.
- `npm run test:nr33-browser`: 11 cenários normativos e de edição existentes.
- `npm run test:rbac-browser`: sete perfis, desktop/mobile, API sintética.
- `npm run lint`, `npm run build`, `npm run build:demo`, `git diff --check`.

O build sinaliza bundle JavaScript acima de 500 kB (cerca de 579 kB minificado,
160 kB gzip em produção), com os dois catálogos locais. O build conclui;
otimização de divisão de código pode ser tratada separadamente sem remover a
disponibilidade local das traduções.

Os comandos automatizados acima usam respostas em memória ou demonstração
isolada; não acessam PostgreSQL ou API real. O CI atual executa sintaxe do backend
e lint/build do frontend, mas não essas suítes completas nem o navegador. Os
resultados informados correspondem à validação local da branch.

O PASSO 4 integrou o idioma ativo à geração e à consulta de PDFs por UUID. A
homologação real posterior confirmou geração nos dois idiomas, hashes, acesso
autenticado e isolamento entre ambientes, preservando textos livres e documentos
legados. Os PDFs históricos sem idioma conhecido continuam explicitamente
identificados; não são apresentados como uma tradução do idioma ativo.

As migrations 027 e 028 já foram aplicadas manualmente no banco local
`inventario_nr33_multitenant_dev`. A aplicação não executa migrations
automaticamente. Outros ambientes exigem aplicação manual autorizada; não
reaplicar as migrations no banco local. Consulte os procedimentos de
[implantação e rollback](../../backend/docs/internacionalizacao-pdf028.md#implantação-em-outro-ambiente)
e a [persistência individual](../../backend/docs/preferencia-idioma027.md).

A homologação real dos PDFs usou troca transitória de idioma para não atualizar
usuários; não revalidou a gravação da preferência individual. Testes de fila
offline, troca de contas, fallback e respostas antigas continuam automatizados.
Registros reais, identificadores de ambientes, senhas, tokens e evidências de
homologação permanecem locais e não devem integrar a documentação pública.
