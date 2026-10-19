# PASSO 723 — RBAC multi-tenant preparado para revisão

Data: 19/10/2026. Branch: `feature/multi-tenant`.
Checkpoint preservado: `6de545f5485fb95d4358c703b867baad45028424`.

Implementação e validação simulada concluídas. **Não implantado no PostgreSQL real.**
A migration 022 não foi executada. O código novo depende das colunas dessa migration;
não reiniciar/deployar o backend novo sobre o esquema anterior esperando compatibilidade automática.

## Política aprovada

Fonte compartilhada: `shared/permissoes.json`. Backend e frontend consomem a mesma matriz.
Abreviações: ADM = Administrador fundador; ENG = Engenheiro; TEC = Técnico;
COORD = Coordenador; SUP = Supervisor; AUD = Auditor; VIS = Visualizador.

| Capacidade | ADM | ENG | TEC | COORD | SUP | AUD | VIS |
|---|---|---|---|---|---|---|---|
| Dashboard; consultar campanhas, locais, checklist, dados técnicos, evidências e relatórios do ambiente | Sim | Sim | Sim | Sim | Sim | Sim | Sim |
| Criar/editar campanhas e locais; alterar seus status | Sim | Sim | Sim | Sim | Não | Não | Não |
| Preencher/editar checklist e dados técnicos | Sim | Sim | Sim | Sim | Não | Não | Não |
| Registrar/editar evidências | Sim | Sim | Sim | Sim | Não | Não | Não |
| Excluir evidências | Sim | Sim | Não | Sim | Não | Não | Não |
| Criar/editar/gerar relatórios | Sim | Sim | Não | Sim | Não | Não | Não |
| Exportar Excel | Sim | Sim | Sim | Sim | Sim | Sim | Não |
| Consultar histórico técnico autorizado | Sim | Sim | Não | Sim | Sim | Sim | Não |
| Sincronizar alterações offline | Sim | Sim | Sim | Sim | Não | Não | Não |
| Usuários, convites, edição de permissões e auditoria de perfis | Sim | Não | Não | Não | Não | Não | Não |
| Configurações administrativas, quando aplicáveis | Sim | Não | Não | Não | Não | Não | Não |
| Conta pessoal, senha e preferências próprias | Sim | Sim | Sim | Sim | Sim | Sim | Sim |

Exclusões existentes de campanhas/locais/registros técnicos/relatórios não foram ampliadas:
as capacidades destrutivas correspondentes continuam limitadas a ADM/ENG e às regras de integridade.
Campanhas não ganham uma rota DELETE nova. Nenhuma tabela de compartilhamento individual foi criada.

## Backend

- Autenticação reconhece os sete perfis e consulta a identidade atual no banco em cada requisição.
  JWT continua com `sub` textual e perfil assinado; a autorização usa o perfil atual consultado,
  não o perfil antigo do token. Login também recupera o marcador persistente de fundador.
- Routers montados aplicam capacidades por operação. Administração exige também `eh_fundador=true`.
  POST legado de usuários continua bloqueado. Cadastro público continua criando ambiente e primeiro administrador.
- Consultas parametrizadas mantêm ambiente, usuário e atividade. `campanha.id_usuario` permanece atribuição,
  mas deixa de restringir exclusivamente o acesso ao recurso dentro do próprio ambiente.
- Escritas conservam/revalidam a capacidade atual sob locks transacionais. Foi acrescentada a proteção
  transacional ao INSERT/UPDATE de evidências sem CAS GPS. GPS, arquivos gerenciados e proteções físicas existentes foram preservados.
- Sincronização revalida o perfil no processamento e a capacidade específica de entidade/operação.
  A propriedade de uma fila não permite alterar recursos externos. Mudança de responsável da campanha não
  revoga a capacidade; mudança de perfil para leitor impede escrita. Não amplia exclusões offline.
- `PATCH /api/usuarios/:id/permissoes` aceita somente `perfil_acesso`, exige fundador atual, limita alvo ao
  ambiente e comprova convite de origem aceito. Fundador e promoção a ADMINISTRADOR são recusados.
- PUT antigo não altera mais perfil: mudança recebe 409 e deve usar o endpoint auditado. Nome/e-mail/status
  continuam nos fluxos existentes. E-mail globalmente único e reserva de convites mantêm seus bloqueios.
- Mudança de perfil bloqueia ambiente, ator e alvo; contexto do ator fica local à transação. O trigger de
  auditoria da 022 registra ator, alvo, ambiente, perfis anterior/novo e horário no mesmo UPDATE/COMMIT.
  Falhas propagam erro original, tentam rollback e descartam conexão se necessário.
- `GET /api/usuarios/auditoria/perfis`: fundador, últimos 200 eventos do próprio ambiente.
  `GET /api/usuarios/auditoria/entidades`: metadados atuais de versionamento do ambiente para perfis autorizados.
  Este último não é um log histórico completo de todas as ações de negócio.
- Respostas iniciadas, formatos de sucesso, erros públicos e logs sanitizados foram preservados.

## Migration 022 — preparada, não executada

Arquivo: `backend/database/022_perfis_fundador_auditoria.sql`.

- Transação única; guardas de destino exclusivo `inventario_nr33_multitenant_dev`, PostgreSQL 17 e autorização explícita.
- Revalida o mapeamento aprovado de IDs 21/22 e UUIDs correspondentes, atividade e ausência de administrador não mapeado.
  Não infere fundador por ordem de ID/data. Conferência privada das identidades continua obrigatória antes da execução.
- Expande CHECKs, acrescenta fundador e origem do convite, índice único parcial de fundador por ambiente e
  FKs compostas de origem/auditoria no mesmo ambiente.
- Protege fundador/origem imutáveis, impede promoção administrativa e exige origem de convite para novos não fundadores.
- Mantém convites administrativos históricos armazenados; novos são bloqueados, e aceite histórico é recusado pelo serviço.
- Auditoria via trigger AFTER UPDATE, função com schema fixo e privilégios controlados; aplicação recebe SELECT,
  sem INSERT/UPDATE/DELETE/TRUNCATE da auditoria nem uso de sua sequence. UPDATE/DELETE da auditoria também são bloqueados por trigger.
- Usuários legados sem origem comprovada permanecem intactos; edição de seu perfil retorna 409.
  Não existe backfill especulativo de convites.
- Não reaplica nem altera semanticamente 020/021. Não há instalação automática da 022 pelo laboratório.

## Frontend

- Convite mostra exatamente seis perfis não administrativos, nomes amigáveis e descrição das permissões.
- Usuários mantém indicadores/busca/status e acrescenta ações, fundador identificado e modal para convidados elegíveis.
  Modal exige confirmação, não oferece ADMINISTRADOR e atualiza a linha após sucesso; não altera nome/e-mail.
- Auditoria de permissões pode ser consultada na própria tela Usuários, sem exposição de tokens ou dados externos.
- Menus administrativos exigem fundador. Excel não aparece para VIS. Conta pessoal permanece acessível a todos.
- Campanhas, locais e telas técnicas desabilitam controles de escrita conforme capacidade. Leitores não provocam
  criação automática de rascunho ao consultar responsáveis do relatório.
- Contexto da sessão é reconsultado ao retornar à aba/foco e após 403. Backend permanece a autoridade em toda chamada,
  mesmo enquanto uma interface antiga ainda estiver aberta; não foi criada política nova de revogação de JWT.
- Demonstração permanece explícita, com fundadores sintéticos mapeados somente dentro do simulador e sem fallback de API real.

## Testes e adaptações

- Backend: **3.867/3.867**, falhas 0, ignorados 0, cancelados 0.
  Acréscimo de 408 casos sobre os 3.459 do checkpoint: matriz, SQL real parametrizado com simulador independente,
  leitura dos sete perfis, criação por capacidade, JWT antigo/perfil atual, edição/auditoria/rollback,
  convites administrativos e processamento offline após revogação.
- Frontend: **55/55**, falhas 0, ignorados 0, cancelados 0; nove casos novos de política/perfis.
- Lint, build normal e build demo: aprovados.
- Chrome headless: sete perfis aprovados; modal/confirmacão/auditoria/erro seguro, menus, leitura e edição,
  larguras 1440/390/320. Vite exclusivo em loopback; API explicitamente simulada e URLs de API bloqueadas na rede.
- `git diff --check`: aprovado.

Simuladores antigos foram adaptados para imports puros da política, novos campos da identidade e transações.
As expectativas que exigiam responsabilidade individual ou promoção administrativa foram alteradas pela política
expressamente aprovada. Não se converteram erros desconhecidos de SQL em autorizações; não há testes removidos,
ignorados ou desabilitados. Falhas intermediárias refletiram essas incompatibilidades e ajustes dos próprios simuladores.

Isolamento: `backend/tests/helpers/evidenciaIsolamentoPreload.cjs`, inspecionado e mantido, bloqueia pg real,
dotenv e acesso a arquivos .env/uploads/PDFs. `NODE_OPTIONS` foi propagado e restaurado em `finally`.
Execuções bloqueadas por spawn EPERM foram repetidas somente pelos comandos autorizados fora do sandbox.
Não foram iniciados backend principal, PostgreSQL ou serviços de laboratório.

## Pendências de homologação e implantação

1. Revisar/autorizar a 022 e confirmar privadamente identidade dos dois fundadores, schema e ACLs reais.
2. Validar a migration em destino autorizado com transação/rollback, triggers, SECURITY DEFINER, privilégios,
   aceite concorrente e locks/deadlocks reais. Mocks não comprovam PL/pgSQL nem garantias PostgreSQL.
3. Implantar o backend novo somente após o esquema 022 aprovado e instalado. Não há fallback para schema antigo.
4. Validar contas, convites, perfil, offline e isolamento A/B com persistência real em etapa autorizada.
5. Analisar manualmente qualquer origem de convite histórica não comprovada; não inventar backfill.
6. Preservar limitações físicas já documentadas de evidências/PDFs; esta etapa não homologa filesystem real.
7. Tombstones sem ancestralidade continuam com política conservadora; não se inventa autorização a partir de um ID.

Nenhum banco, dado existente, upload/PDF ou .env real foi acessado/alterado.
Sem staging, commit, push ou merge. HEAD/checkpoint e main preservados.

## Inventário final de arquivos

A lista abaixo é o estado Git após a implementação, incluindo testes adaptados.
```text
 M backend/database/021_multi_tenant_versionamento.sql
 M backend/src/middlewares/autenticacaoMiddleware.js
 M backend/src/repositories/administradorRepository.js
 M backend/src/repositories/autenticacaoMultiTenantRepository.js
 M backend/src/repositories/cadastroRepository.js
 M backend/src/repositories/campanhaMultiTenantRepository.js
 M backend/src/repositories/checklistMultiTenantRepository.js
 M backend/src/repositories/contaMultiTenantRepository.js
 M backend/src/repositories/dadosTecnicosMultiTenantRepository.js
 M backend/src/repositories/evidenciaMultiTenantRepository.js
 M backend/src/repositories/localMultiTenantRepository.js
 M backend/src/repositories/localRepository.js
 M backend/src/repositories/relatorioMultiTenantRepository.js
 M backend/src/repositories/sincronizacaoMultiTenantRepository.js
 M backend/src/repositories/usuarioConvidadoRepository.js
 M backend/src/repositories/usuarioRepository.js
 M backend/src/routes/campanhaRoutes.js
 M backend/src/routes/checklistRoutes.js
 M backend/src/routes/conviteRoutes.js
 M backend/src/routes/dadosTecnicosRoutes.js
 M backend/src/routes/evidenciaRoutes.js
 M backend/src/routes/localRoutes.js
 M backend/src/routes/relatorioRoutes.js
 M backend/src/routes/sincronizacaoRoutes.js
 M backend/src/routes/usuarioRoutes.js
 M backend/src/services/authService.js
 M backend/src/services/conviteService.js
 M backend/src/services/usuarioService.js
 M backend/tests/appTratamentoErros.test.js
 M backend/tests/autenticacaoMiddleware.test.js
 M backend/tests/autenticacaoMultiTenantRepository.test.js
 M backend/tests/authController.test.js
 M backend/tests/authServiceMultiTenant.test.js
 M backend/tests/cadastroController.test.js
 M backend/tests/cadastroConvitesSeguranca.test.js
 M backend/tests/campanhaAutorizacaoTransacional.test.js
 M backend/tests/campanhaIsolamentoIntegrado.test.js
 M backend/tests/campanhaMultiTenantController.test.js
 M backend/tests/campanhaMultiTenantRepository.test.js
 M backend/tests/campanhaMultiTenantRoutes.test.js
 M backend/tests/campanhaMultiTenantService.test.js
 M backend/tests/checklistAutorizacaoTransacional.test.js
 M backend/tests/checklistIsolamentoIntegrado.test.js
 M backend/tests/checklistMultiTenantController.test.js
 M backend/tests/checklistMultiTenantRepository.test.js
 M backend/tests/checklistMultiTenantRoutes.test.js
 M backend/tests/checklistMultiTenantService.test.js
 M backend/tests/contaPerfilRegressao.test.js
 M backend/tests/conviteController.test.js
 M backend/tests/conviteRoutes.test.js
 M backend/tests/dadosTecnicosAutorizacaoTransacional.test.js
 M backend/tests/dadosTecnicosIsolamentoIntegrado.test.js
 M backend/tests/dadosTecnicosMultiTenantService.test.js
 M backend/tests/evidenciaArquivoIsolamentoSeguranca.test.js
 M backend/tests/evidenciaArquivosGerenciados.test.js
 M backend/tests/evidenciaCadastroIsolamentoSeguranca.test.js
 M backend/tests/evidenciaExclusaoTransacional.test.js
 M backend/tests/evidenciaMultiTenantController.test.js
 M backend/tests/evidenciaMultiTenantRepository.test.js
 M backend/tests/evidenciaMultiTenantRoutes.test.js
 M backend/tests/evidenciaMultiTenantService.test.js
 M backend/tests/evidenciaOperacoesIntegradasSeguranca.test.js
 M backend/tests/excelMultiTenantService.test.js
 M backend/tests/helpers/contaSimulada.cjs
 M backend/tests/helpers/idsBigintSimulados.cjs
 M backend/tests/idsBigintTextuaisSeguranca.test.js
 M backend/tests/localAutorizacaoTransacional.test.js
 M backend/tests/localExportacaoIsolamentoSeguranca.test.js
 M backend/tests/localIsolamentoIntegrado.test.js
 M backend/tests/localMultiTenantController.test.js
 M backend/tests/localMultiTenantRepository.test.js
 M backend/tests/localMultiTenantRoutes.test.js
 M backend/tests/localMultiTenantService.test.js
 M backend/tests/loginSessaoSeguranca.test.js
 M backend/tests/relatorioArquivoSeguranca.test.js
 M backend/tests/relatorioAutorizacaoTransacional.test.js
 M backend/tests/relatorioIsolamentoIntegrado.test.js
 M backend/tests/relatorioPdfBuffer.test.js
 M backend/tests/sincronizacaoAutenticacaoMultiTenant.test.js
 M backend/tests/sincronizacaoControllerMultiTenant.test.js
 M backend/tests/sincronizacaoIsolamentoSeguranca.test.js
 M backend/tests/sincronizacaoMultiTenantSeguranca.test.js
 M backend/tests/usuarioCadastroDiretoSeguranca.test.js
 M backend/tests/usuarioController.test.js
 M backend/tests/usuarioEscritaIsolamentoSeguranca.test.js
 M backend/tests/usuarioIsolamentoSeguranca.test.js
 M backend/tests/usuarioRepository.test.js
 M frontend/package.json
 M frontend/src/components/ProtectedRoute.jsx
 M frontend/src/components/layout/Sidebar.jsx
 M frontend/src/contexts/AuthContext.jsx
 M frontend/src/pages/Campanhas.jsx
 M frontend/src/pages/ChecklistLocal.jsx
 M frontend/src/pages/Convites.jsx
 M frontend/src/pages/DadosTecnicosLocal.jsx
 M frontend/src/pages/EvidenciasLocal.jsx
 M frontend/src/pages/LocaisCampanha.jsx
 M frontend/src/pages/RelatorioLocal.jsx
 M frontend/src/pages/ResponsaveisRelatorio.jsx
 M frontend/src/pages/Usuarios.jsx
 M frontend/src/services/api.js
 M frontend/src/services/conta.js
 M frontend/src/services/demoApi.js
 M frontend/src/services/usuarios.js
 M frontend/src/styles/Usuarios.css
 M frontend/tests/contaMultiTenant.test.js
 M frontend/tests/usuarios.test.js
 M frontend/vite.config.js
?? backend/database/022_perfis_fundador_auditoria.sql
?? backend/src/controllers/usuarioPermissoesController.js
?? backend/src/repositories/usuarioPermissoesRepository.js
?? backend/src/utils/permissoes.js
?? backend/tests/helpers/rbacSqlSimulado.cjs
?? backend/tests/rbac723Seguranca.test.js
?? docs/RELATORIO_PASSO_723.md
?? frontend/scripts/verificar-rbac-723.mjs
?? frontend/src/components/AuditoriaPermissoes.jsx
?? frontend/src/components/EditarPermissoes.jsx
?? frontend/src/hooks/useCapacidade.js
?? frontend/src/services/permissoes.js
?? frontend/tests/permissoes723.test.js
?? shared/
```

Observação de Git: `021_multi_tenant_versionamento.sql` ainda é sinalizada como modificada,
mas não apresenta diff de conteúdo. O hash Git normalizado do arquivo é igual ao do HEAD:
`6977365b4baff3633e68bbc5ec6fb7978861a8f0`. Foi preservado, sem restaurar ou sobrescrever o arquivo.
020 e app.js não apresentam alterações. O staging permanece vazio.
