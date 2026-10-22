# PASSO 28 — HMAC persistente do ambiente isolado

## Resultado

Configurado exclusivamente para inventario_nr33_multitenant_dev, na branch feature/recuperacao-senha. Nenhum PostgreSQL foi acessado; nenhuma migration ou partida/reinício do backend foi executada. JWT, autenticação, credenciais anteriores, .env e stash não foram alterados. Sem staging, commit, push ou merge.

Foi identificado o mecanismo já usado pelo laboratório no passo 715: PSCredential/SecureString exportado em CLIXML, cifrado pelo Windows DPAPI CurrentUser e armazenado fora do repositório com ACL exclusiva. O mesmo método foi adotado para um novo arquivo dedicado; a credencial da aplicação existente não foi lida ou modificada.

## Localização lógica e proteção

- Arquivo: %LOCALAPPDATA%\NR33-Dev-Privado\login-hmac-inventario_nr33_multitenant_dev\login-hmac.clixml
- Identidade lógica interna: NR33:inventario_nr33_multitenant_dev:LOGIN_HMAC_SECRET:v1
- Proteção: DPAPI CurrentUser, vinculada ao usuário Windows local que criou o arquivo.
- Diretório e arquivo com proprietário igual ao SID atual e uma única permissão Allow/FullControl para esse SID; herança removida/protegida. Pais e arquivo não podem ser reparse points/redirecionamentos.
- Nenhuma chave, senha, ciphertext CLIXML ou hash do segredo consta deste relatório, de arquivos versionados ou da saída dos comandos.

Não foi criada variável persistente de usuário/máquina nem arquivo .env. É necessário manter esse arquivo e o contexto DPAPI do usuário para recuperação após reinícios. Outros usuários/serviços não devem receber cópia em texto; se a identidade de execução mudar, planejar procedimento específico.

## Geração e persistência

O comando de criação foi executado uma única vez com a autorização de gravação externa exigida pelo sandbox. A geração usa crypto.randomBytes(32) do Node e Base64 canônico; não usa JWT_SECRET, GUID como chave, senha humana ou valor fixo. O buffer aleatório é zerado depois da codificação.

O canal Node usa pipes redirecionados exclusivamente em memória, sem shell, argumentos contendo segredo, terminal ou arquivos temporários em claro. O gerador/validador recebe ambiente mínimo, sem credenciais da aplicação, JWT, NODE_OPTIONS ou NODE_PATH. O valor em Base64 é convertido em SecureString e exportado como PSCredential DPAPI, sempre após confirmar a ACL da pasta. Eventual arquivo temporário contém somente CLIXML cifrado, com ACL própria, e é movido sem sobrescrever o destino.

Criar exige banco exato, branch exata, Executar e confirmação CRIAR HMAC inventario_nr33_multitenant_dev. Se já houver arquivo, ele é validado e reutilizado; não há rotação automática, sobrescrita ou novo segredo por partida. Mutex coordena criadores concorrentes e o move final recusa destino existente. ACL ou conteúdo inválido causa interrupção, nunca reparo silencioso ou substituição.

## Integração com o inicializador

postgres-local.ps1 mantém as entradas explícitas anteriores (SegredoHmac ou variável de processo já fornecida). Quando nenhuma estiver presente, a etapa Backend recupera o SecureString do arquivo protegido do banco autorizado. Ausência, falha DPAPI, ACL inadequada, identidade lógica divergente ou formato inválido interrompe a execução; a recuperação nunca gera uma chave.

O valor recuperado só é convertido para variável de processo durante a inicialização, para herança pelo Node do backend. Não é gravado em ambiente de usuário/máquina. O snapshot e o finally do passo 27 restauram LOGIN_HMAC_SECRET e todas as configurações anteriores; o SecureString recuperado é descartado ao encerrar. Não há fallback para vazio, chave fixa ou geração por inicialização.

O HMAC deste passo não foi injetado em backend real porque nenhum backend foi iniciado. A validação independente recuperou o SecureString e enviou apenas pelo stdin privado ao validador Node, que usa a mesma função hmacValido do login.

## Verificações realizadas sem divulgar valores

A criação retornou somente metadados: existência confirmada, formato válido, compatibilidade Node, ACL exclusiva e confirmação de criação.

Depois foi aberto outro powershell.exe com -NoProfile e -NonInteractive para executar exclusivamente a etapa Validar. Essa nova sessão recuperou o arquivo DPAPI sem depender de variáveis da sessão criadora. Foram confirmados:

- Existe = true.
- FormatoValido = true: exatamente 32 bytes em Base64 canônico.
- CompativelComNode = true: validador usado pela autenticação aceitou o formato.
- AclExclusiva = true.
- NovaSessaoPowerShell = true.
- ArquivoProtegidoInalterado = true: comparados em memória hashes do arquivo cifrado antes/depois da recuperação; esses hashes não foram exibidos ou registrados.

Essa recuperação somente de leitura não criou ou rotacionou a chave. O segredo não foi impresso no terminal, ferramentas, respostas, logs ou relatórios.

## Uso futuro

Após aprovação para as etapas seguintes, a mesma conta Windows pode usar o postgres-local.ps1 normalmente com a senha da aplicação recebida por SecureString. Em uma sessão sem LOGIN_HMAC_SECRET/SegredoHmac explícitos, a recuperação do arquivo é automática. Não é necessário copiar o HMAC para linha de comando, .env ou variável persistente.

Para verificar apenas o armazenamento, sem PostgreSQL nem backend:

```powershell
.\backend\laboratorio\configurar-hmac-local.ps1 -Etapa Validar -Banco inventario_nr33_multitenant_dev
```

Essa etapa retorna somente metadados. Plano também não conecta ou gera segredo. Não repetir a etapa Criar para obter chave nova; perda/rotação precisa de revisão, pois uma chave diferente altera os identificadores dos contadores.

## Arquivos deste passo

Modificado:

- backend/laboratorio/postgres-local.ps1 — recuperação protegida opcional e descarte do SecureString, mantendo restauração do ambiente.

Criados:

- backend/laboratorio/hmac-canal.cjs — geração/validação pelo canal privado.
- backend/laboratorio/hmac-protegido-local.ps1 — localização fixa, ACL, DPAPI e recuperação segura.
- backend/laboratorio/configurar-hmac-local.ps1 — plano, criação explícita e validação sem iniciar serviços.
- backend/tests/hmacCanal.test.js — canal, RNG sintético, rejeições e validação sem eco.
- backend/tests/hmacProtegidoPowershell.test.js e helpers/hmacProtegidoTeste.ps1 — recuperação simulada, formato Node, erros e sintaxe.
- docs/PASSO_28_HMAC_ISOLADO.md — este relatório, sem conteúdo do segredo.

O único artefato real de segredo é o arquivo CLIXML cifrado externo mencionado acima. Nenhuma credencial anterior foi substituída.

## Testes e pendências

- Suíte backend completa: 4.132/4.132 testes aprovados, sem falhas/skips, com preload bloqueando acesso real ao PostgreSQL e .env. Testes do armazenamento usam constantes sintéticas e mocks; não leem o HMAC real.
- ESLint recommended aprovado nos novos arquivos JavaScript; node --check e parser PowerShell aprovados.
- Restauração do ambiente anterior continua coberta pelos testes do passo 27.
- Criação DPAPI e recuperação real em nova sessão confirmadas separadamente, sem banco ou backend.

Pendente para a migration 023: revisão/autorização do usuário para executar o executor exclusivo no banco isolado, conferir ausência prévia da tabela, aplicar DDL e grants na mesma transação, validar catálogos/privilégios e homologar concorrência. O HMAC está preparado, mas isso não comprova nem altera o estado da migration. Não houve nenhuma consulta ao banco neste passo.

Referências: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/export-clixml?view=powershell-5.1 ; https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.dataprotectionscope?view=netframework-4.8.1 ; https://nodejs.org/docs/latest-v20.x/api/crypto.html#cryptorandombytessize-callback .
