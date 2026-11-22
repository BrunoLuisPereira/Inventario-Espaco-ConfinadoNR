# CD-241.47 — evidencia executada em 22/11/2026

**PostgreSQL e servicos reais; aplicacao, SHAs e dataset artificiais.**
Nenhum backup real foi restaurado, nenhuma credencial de producao ou AWS usada.
Nenhum acesso/alteracao na EC2 principal, IAM, Variables ou CD_ENABLED.

Execucao final: `nr33-cd-real-fixtures-d10b6c71810f`.
14 testes novos passaram, sem ignorados (4,714 segundos).
Rollback explicito concluido em `2026-11-22T10:40:02.188258+00:00`.
Baseline recuperada com HTTP/TLS 200, processo da release correta, esquema e
invariantes de dados preservados; uploads iguais ao inventario inicial acrescidos
somente das duas sentinelas da candidata, legiveis apos o retorno.

## Verificacoes exercitadas

- PostgreSQL 17 real e SQL de inspecao somente leitura; CREATE TABLE recusado.
- Mudanca real de catalogo detectada; tabela exclusiva do teste removida ao final.
- Conexao real remanescente bloqueando `Runtime.stop()`; conexao do teste encerrada
  por sua propria role e backend recuperado antes do ensaio final.
- Digest de pacote, arquivo da candidata ou dependencia alterados rejeitados.
- Codigo divergente/ausente em relacao a commit Git rejeitado (repo de teste artificial).
- Baseline incorreta, PID de outra release, ambiente AWS, volume externo e
  conexao PostgreSQL remota rejeitados.
- Invariantes SQL divergentes, perda/alteracao de upload e symlink rejeitados.
- `transacao` e `restore()` existentes executados, sem alterar contratos de prontidao.

Sintaxe Python e parser PowerShell passaram. O build normaliza CRLF dos scripts
Bash; setup/run foram executados com `set -euo pipefail`. A suite antiga de 54 testes
nao foi repetida: nenhum arquivo do executor/contrato de producao foi alterado.

Ambiente observado: PostgreSQL 17.12, Node v24.22.3, Python 3.13.5, systemd 257,
Nginx 1.26.3. Imagens base fixadas por digest; pacotes APT nao fixados em snapshot.
Container offline, sem portas publicadas nem volumes do host, removido pelo launcher.

## Evidencias preservadas localmente

`laboratorio/cd-real/results/nr33-cd-real-fixtures-d10b6c71810f/` (ignorado no Git):

- `summary-real.json`: SHA-256 `232afa0ab36d6de5f25badac62285b730401aa02c1d914f2d8fc5f2ea36a50bb`.
- `tests-real.log`: SHA-256 `1b1179a4162a11a477d2a96dd6b2ca667e39f1013ac6b2612bdba77e730a8edd`.
- `setup-real.log`, `operational-real.log`, `journal-real.log`, `services-real.log`,
  `mounts-real.json`, `versions-real.log`, `container.json`, `image.json`.

Summary: `VERIFIED_PACKAGES_LOCAL_POSTGRES_ROLLBACK`, `source_kind=fixtures`,
`production_readiness=false`, `production_rollback_tested=false`.
Executor de producao ensaiado: `e37ecd1f07d8ff886adeafdab4986f3539398d4eae49e4a90feb4e07b21ac4bf`.
Adaptador: `2fd6faa75dae73b2c915288349821147ab0df63008259fb50f057501b5883891`.

Falhas intermediarias preservadas separadamente: corrida no primeiro healthcheck,
cache Docker inconsistente e limpeza incompleta da conexao longa de teste.
Foram corrigidas antes da execucao final; nenhuma dessas tentativas foi promovida.

## Pendencias efetivas para ensaio AWS

Disponibilizar pacotes selados da baseline instalada e candidata final, com SHAs,
digests e bundle Git correspondentes; preparar dataset/esquema isolado autorizado
e seu fingerprint/invariantes; obter sessao AWS temporaria e autorizacao de recursos
descartaveis, caso seja usada nova EC2. Restaurar backup real requer aprovacao propria.

O perfil atual desabilita worker SMTP e nao reproduz independentemente o build do
frontend. Essas limitacoes precisam ser resolvidas/revisadas antes de declarar o
ensaio representativo da operacao real. Nenhum booleano operacional foi aprovado.
