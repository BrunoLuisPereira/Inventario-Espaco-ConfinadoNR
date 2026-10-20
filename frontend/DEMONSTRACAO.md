# PASSO 700 — versão navegável para revisão do TCC

## Iniciar com segurança

A partir da raiz do repositório, com as dependências já instaladas:

```powershell
npm run demo --prefix frontend
```

Abra **http://127.0.0.1:5173**. Não inicie backend nem PostgreSQL para este roteiro.
O Vite não carrega `.env` (`envDir: false`); em modo demo o proxy da API está
desativado e o transporte não encaminha operações à rede. A porta é fixa e
o processo falha se já estiver ocupada. Encerre com Ctrl+C.

O aviso **DEMONSTRAÇÃO — dados sintéticos, sem PostgreSQL** deve estar visível.
Se não estiver, interrompa o roteiro: pode ser outra aplicação ou outro modo.

## Contas exclusivamente fictícias

Senha de todas: `Demonstracao123!` (não usar em contas reais).

| Conta | Uso |
|---|---|
| `admin.a@demo.invalid` | Administrador sintético do ambiente A |
| `admin.b@demo.invalid` | Administrador sintético do ambiente B |
| `engenheiro.a@demo.invalid` | Engenheiro responsável pela campanha inicial A |

Os botões no login preenchem os dados. A demonstração não emite JWT real,
não testa hashing e não comprova autorização PostgreSQL.

## Roteiro visual e funcional

1. Tente uma senha incorreta: deve aparecer erro sem entrar no dashboard.
2. Entre como administrador A; confira indicadores e navegação lateral.
3. Abra Campanhas, cadastre uma campanha e confira o status EM ANDAMENTO.
4. Clique em Ver locais, cadastre um local e teste latitude/longitude zero.
5. Abra o inventário, confira nome, campanha e retorno para locais.
6. Recarregue: sessão e dados da demonstração devem permanecer nesta aba.
7. Saia e entre como B: os registros criados em A não devem aparecer.
8. Em B, tente a URL da campanha/local de A: deve aparecer não encontrado.
9. Entre como engenheiro A: somente campanhas de sua responsabilidade simulada.
10. Teste filtros de campanhas, estados vazios, status e viewport móvel.
11. Use Reiniciar demonstração para descartar os dados sintéticos e voltar ao login.

Os dados ficam em `sessionStorage`, separados das chaves reais de login.
Não são persistidos em servidor. O fechamento normal da aba os descarta;
restauração de sessão pelo navegador pode recuperá-los. Reiniciar é a forma
explícita de descartá-los. Logout limpa a sessão da interface, não os cadastros.

## Limites explícitos

Estão simulados login, perfil de leitura, campanhas/locais (lista, detalhe,
cadastro e status), responsabilidade e listas vazias do inventário.
Edição de dados, cadastro inicial, convites, senha, exportação, uploads,
downloads e gravações dos demais módulos não estão simulados: retornam erro
explicativo. Os módulos e chamadas reais permanecem fora do modo demo.
Os estados PENDENTE no inventário representam ausência de registros sintéticos.

A sessão real agora é revalidada em `/auth/perfil` antes de liberar telas.
HTTP 401 encerra a sessão; 403/404 exibem a falha sem promover ou alterar perfil.
Falhas de conexão na revalidação permitem tentar novamente ou voltar ao login.

## Validação automatizada

```powershell
node frontend/tests/fluxosPrioritarios.test.js
npm run lint --prefix frontend
npm run build --prefix frontend
npm run build:demo --prefix frontend
npm run test:browser --prefix frontend
```

O último comando requer Chrome ou Edge instalado e Node 20.19.6 ou compatível
com WebSocket experimental. Usa o build `dist-demo`, servidor estático efêmero
em loopback, perfil novo temporário e CSP `connect-src 'none'`. Não inicia o
backend, não lê perfil pessoal, não usa .env nem banco; fecha os processos e
remove somente o perfil temporário criado pelo teste. Não instala dependências.
Se faltar navegador ou houver bloqueio do sistema, o teste deve falhar, sem skip.

## O que ainda depende do laboratório PostgreSQL

Cadastro inicial, convites, JWT real, persistência, constraints, versionamento,
concorrência, revogação e isolamento efetivo no banco. As migrações 020/021
não foram executadas ou alteradas nesta entrega priorizada de frontend.
Não executar `npm start --prefix backend` ou `npm run dev --prefix backend`
contra configurações existentes como parte deste roteiro. O início do backend
real depende de destino descartável comprovado e autorização posterior.
