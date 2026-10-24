# PASSO 29.7.6 — diagnóstico direcionado do HTTP 401

## Resultado

Não foi identificada uma causa comprovada para o HTTP 401 anterior. Não foram realizadas novas tentativas reais de login nem consultados hashes de senha. A inspeção e os testes sintéticos não demonstraram corrupção da senha pelo canal protegido nem defeito no contrato de autenticação.

## Verificações somente leitura

- Branch confirmada pela leitura de .git/HEAD, sem executar comandos Git: feature/recuperacao-senha.
- PID 17224 continua sendo node.exe com entrada laboratorio/servidor-local.cjs, escutando em 127.0.0.1:3000. GET /api/health retornou HTTP 200, laboratorio=true e inventario_nr33_multitenant_dev.
- Conexão exclusiva da aplicação, somente leitura: 127.0.0.1:5432/inventario_nr33_multitenant_dev, PostgreSQL 17, current_user/session_user nr33_dev_app, papel não privilegiado; preflight aprovado.
- Conta descartável ativa, ambiente Teste ativo, perfil ADMINISTRADOR e fundador preservado.
- E-mail armazenado normalizado e encontrado pela condição LOWER(email) usada pelo endpoint. Portanto, diferença de caixa ou espaços no e-mail armazenado não explica este caso.
- Uma falha registrada no array; restrito_ate NULL, sem bloqueio. Não foi feita limpeza ou alteração direta de contadores/timestamps.

## Fluxo e contrato

app.cjs monta /api/auth; authRoutes.js POST /login chama authController.login. O controller passa req.body e o endereço do socket para authService.login, que delega a loginMultiTenant e à proteção persistente.

Campos esperados: email e senha, ambos strings. E-mail normalizado com trim().toLowerCase(); senha sem trim ou normalização Unicode. O repositório usa consulta parametrizada por LOWER(u.email) e retorna o estado do ambiente. No diagnóstico real foram consultados somente campos de estado/metadados permitidos, sem usar a consulta que seleciona senha_hash.

Cadastro normal usa os mesmos campos email/senha. Frontend repassa senha sem transformação, cadastroService normaliza o e-mail e entrega a senha original a bcrypt.hash(senha,12). Login entrega senha original a bcrypt.compare. Não foi encontrada divergência entre os contratos normais de cadastro e login. O caminho histórico usado para criar a conta não foi inferido nem validado pelo acesso a material de senha.

Condições de HTTP 401 no código:

- E-mail normalizado acima de 180 caracteres ou senha acima de 1024 caracteres.
- Usuário não encontrado em alguma das duas leituras ou comparação bcrypt não aprovada.
- Usuário/ambiente inativo, vínculo de ambiente inválido, perfil fora dos sete permitidos.
- ID inválido/fora da faixa segura, ou mudança de ID, ambiente ou material de senha entre as leituras.

Campos ausentes retornam 400; restrição retorna 429; indisponibilidade da proteção retorna 503. O 401 público é propositalmente genérico e não permite identificar qual condição ocorreu historicamente.

## Canal protegido inspecionado

O PASSO 29.7.5 usou Solicitar-SenhaLoginLocal: Windows Forms TextBox com UseSystemPasswordChar, leitura de Text, conversão para SecureString, BSTR temporário e JSON. O PowerShell definiu OutputEncoding=UTF8 sem BOM e enviou ConvertTo-Json pelo pipe nativo para node.exe, sem interpolar a senha em comandos.

O Node lê stdin com setEncoding('utf8'), concatena os dados e faz JSON.parse. A requisição usa JSON.stringify({email,senha}) e Content-Type application/json. Nenhuma dessas etapas faz trim, substituição ou normalização da senha. O código não registra senha, Base64, digest ou token. O corpo da resposta real não foi registrado integralmente.

Os testes reproduzem os mesmos mecanismos com dados fictícios e destino HTTP efêmero local; não importam o roteiro temporário que poderia acessar a API real. O teste de campo não abre ShowDialog e não reconstrói o que o usuário efetivamente digitou na tentativa anterior. Layout de teclado, digitação, conteúdo pretendido e coincidência com a senha cadastrada não podem ser determinados retrospectivamente, sem nova autenticação autorizada.

## Testes

Arquivos criados:

- backend/tests/senhaCanalProtegido.test.js
- backend/tests/helpers/senhaCanalHttpTeste.ps1
- backend/tests/helpers/senhaCanalHttpMock.cjs
- Este relatório.

Seis grupos: letras/números, caracteres especiais, acentos, espaços iniciais/finais e repetidos, caracteres literais de PowerShell ($, crase, aspas, operadores e expressão de comando), Unicode com emoji e acento decomposto. Comparação integral em memória, incluindo espaços e unidades Unicode; nenhuma representação da senha real foi produzida. Expressões fictícias não foram executadas.

O percurso testado foi TextBox mascarado sem janela → SecureString/BSTR → ConvertTo-Json → pipe nativo UTF-8 → Node JSON.parse → JSON.stringify → fetch → HTTP mock em porta efêmera, explicitamente diferente de 3000/3001. O destino simulado verifica os campos e a senha integral contra fixtures independentes. Responde apenas sucesso/falha, sem ecoar conteúdo. Seis testes adicionais do serviço confirmam senha integral entregue ao bcrypt mock e normalização do e-mail.

101 testes direcionados passaram, sem falhas/skips: senhaCanalProtegido, authServiceMultiTenant, autenticacaoMultiTenantRepository, authController e loginProtecao. Preload bloqueou PostgreSQL/.env reais nos testes. Sintaxe Node/PowerShell aprovada e ESLint dos dois arquivos JavaScript criados sem erros/avisos.

## Próximo passo mínimo

Nenhuma correção de produção é justificada pelas evidências atuais. Após revisão, confirmar a senha da conta descartável pelo fluxo normal de autenticação na interface apontada para a API isolada, sem insistir em tentativas automatizadas. Não enviar senha ao chat. Se a confirmação falhar, interromper novamente; não redefinir senha ou limpar contador sem autorização específica.

Não houve login real, reinício de backend, leitura de hashes reais, alteração de usuário/ambiente/contador, migration, modificação de .env/JWT/HMAC, acesso a outros bancos ou operações Git. A senha real não foi solicitada nem utilizada nos testes.
