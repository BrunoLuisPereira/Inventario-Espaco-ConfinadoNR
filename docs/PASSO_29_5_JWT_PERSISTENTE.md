# PASSO 29.5 — JWT persistente no laboratório isolado

Branch confirmada: feature/recuperacao-senha. A inspeção prévia dos nomes/metadados em NR33-Dev-Privado não encontrou JWT persistente. O launcher anterior concatenava dois GUIDs a cada partida. O arquivo HMAC existente foi preservado, com finalidade e caminho independentes.

## Armazenamento e configuração

- Localização: `%LOCALAPPDATA%\NR33-Dev-Privado\jwt-inventario_nr33_multitenant_dev\jwt.clixml`.
- Identidade lógica: `NR33:inventario_nr33_multitenant_dev:JWT_SECRET:v1`.
- Windows DPAPI CurrentUser via PSCredential/Export-Clixml; diretório dedicado e arquivo com proprietário SID atual e ACL exclusiva FullControl. Validações rejeitam reparse points e identidade lógica divergente.
- Uma única chave foi criada com `crypto.randomBytes(48)`: 384 bits, Base64 canônico de 64 caracteres, adequado ao HS256 já usado pela aplicação.
- Geração passa por pipes privados de processo Node com ambiente mínimo; não há senha/chave nos argumentos, terminal, logs, .env ou repositório. O arquivo temporário contém apenas CLIXML cifrado, dentro do diretório protegido. Mutex e movimentação sem sobrescrita evitam substituir uma chave existente.
- Configuração explícita: configurar-jwt-local.ps1, etapas Plano/Criar/Validar. Criar exige confirmação `CRIAR JWT inventario_nr33_multitenant_dev`, switch Executar, banco e branch exatos. Se houver chave válida, reutiliza; se houver armazenamento inválido, recusa sem rotacionar.

## Inicialização

postgres-local.ps1 recupera o JWT protegido, valida Base64/48 bytes e independência do HMAC antes de chamar servidor-local.cjs. Não contém mais geração por GUID. JWT ausente, ACL incorreta, falha DPAPI, identidade ou formato inválido interrompem a partida antes do Node/backend. Não existe fallback automático nem chave fixa.

O segredo é disponibilizado temporariamente no ambiente do processo launcher e herdado pelo Node do backend, conforme o mecanismo já existente. O snapshot/finally restaura as variáveis anteriores, inclusive JWT/HMAC, e descarta SecureStrings. A autenticação, algoritmo, issuer/audience e expiração não foram alterados. A chave é específica do laboratório; não modifica configurações dos demais ambientes.

Limitação: strings em memória gerenciada e variáveis de processo não protegem de inspeção pelo próprio usuário comprometido ou administrador local. Referências são descartadas e buffers/BSTR zerados quando possível; não se promete apagar todas as cópias do runtime. DPAPI depende da identidade e perfil Windows originais. Não copiar a chave em claro, remover o arquivo nem executar sob captura de memória/transcrição externa.

## Verificações realizadas

- Criação real autorizada fora do workspace: Existe/FormatoValido/CompativelComNode/AclExclusiva/Criado = true, sem revelar valores.
- Nova sessão PowerShell sem perfil recuperou a chave. Provas HMAC sobre mensagem sintética foram comparadas em memória entre processos; somente o resultado booleano foi apresentado. Persistência confirmada, sem reiniciar backend.
- JWT e LOGIN_HMAC_SECRET recuperados por seus leitores protegidos e comparados somente em memória: diferentes. Nenhuma alteração ao HMAC.
- Segunda execução da configuração retornou Criado=false; conteúdo cifrado permaneceu idêntico (comparação privada, sem divulgar hashes).
- 68 testes direcionados passaram, sem falhas/skips: JWT protegido, ambiente PowerShell, regressão HMAC, configuração local e preflight. Cobrem fixtures de segredo existente, ausente, inválido, ACL/identidade recusadas, recuperação repetida, compatibilidade HS256, buffer zerado, ausência de geração no launcher e restauração após falha JWT. Os testes usam dados sintéticos; preload bloqueia PostgreSQL real e .env.
- Sintaxe Node e PowerShell aprovada. ESLint recomendado nos três arquivos JavaScript criados: zero erros e avisos.

Arquivos: jwt-canal.cjs, jwt-formato.cjs, jwt-protegido-local.ps1, configurar-jwt-local.ps1, postgres-local.ps1, tests/jwtProtegidoLocal.test.js, tests/helpers/jwtProtegidoTeste.ps1 e tests/helpers/ambienteLocalTeste.ps1, além deste relatório.

Tokens assinados com chaves temporárias anteriores não são recuperados por esta configuração. A nova chave mantém estabilidade a partir da próxima partida autorizada. A homologação HTTP após reinício ainda depende da migration e de autorização separada.

Nenhuma conexão PostgreSQL, migration 023, GRANT, alteração de registros, backend ou alteração de .env foi realizada. Sem git add, commit, push, merge ou manipulação de stash.
