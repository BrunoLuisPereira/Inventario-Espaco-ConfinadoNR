# Preparacao do CD em 22/11/2026

Base remota confirmada por fetch: `7f2b9ffa8a5773166b7cd2df3e23886ee7aebce7`.
Branch de trabalho: `fix/cd-finalizacao-rollback`, em worktree separado.
As alteracoes preexistentes da branch `feature/desenvolvimento-pos-aws` foram preservadas.

## Ensaio explicito

`transacao(ops, ensaio_isolado=True)` verifica candidata saudavel, mantem manutencao
e percorre a mesma rotina de rollback utilizada nas falhas: parada, `restore()`,
inicio, saude da anterior, retirada de manutencao e saude publica.
Somente depois registra `ROLLBACK_REHEARSED_ISOLATED`. Falha de recuperacao mantem
`MANUAL_RECOVERY_REQUIRED`; falha da candidata continua sendo falha, nao ensaio aprovado.

A opcao exige container com marcador descartavel, somente loopback e ausencia de
`/etc/nr33/cd.json`. Nao existe parametro SSM, variavel de ambiente ou opcao CLI
para solicita-la. O deploy normal permanece sujeito a `prontidao()` sem excecoes.
O laboratorio existente agora exercita tambem essa volta explicita, antes dos
cenarios de sucesso e falha. Nenhuma evidencia e promovida automaticamente.

Essa implementacao resolve o ensaio da rotina de retorno sem introduzir falha no
host principal. O laboratorio continua sintetico: nao comprova o comportamento
das releases reais, PostgreSQL, restauracao de backup ou IAM. Seu resultado nao
permite preencher `rollback_tested=true` no comprovante operacional.

## Dependencias e bloqueios reais

- AWS CLI disponivel, mas `aws sts get-caller-identity` retornou `NoCredentials`
  fora do sandbox. Nenhuma consulta autenticada a IAM, S3, SSM ou EC2 foi possivel.
  `aws configure list-profiles` tambem retornou lista vazia.
- Permanecem pendentes: trust OIDC, permissoes efetivas das duas roles, bucket
  privado/versionado/AES256, documento SSM exato e versao fixa, managed node Online,
  versao do agente, environment homologacao com revisores e somente main,
  variaveis Actions, CI push/main do SHA escolhido e comprovante root.
- O backup informado e `/var/backups/nr33/cd-preparacao/rollback-20261122-032327`.
  Nao houve releitura nesta sessao. O nome do diretorio nao substitui `captured_at`
  com timezone, manifesto e hashes. Revalidar idade de ate 24h imediatamente antes
  da janela; verificacao de leitura nao comprova restauracao isolada.
- Ainda e necessario ensaiar as releases reais baseline/candidata em ambiente
  descartavel, com banco e uploads isolados, sem rede para os dados principais.
  Comparar codigo, esquema, mounts e dados antes/depois; preservar logs, digests
  e recuperar a baseline com saude verificada. A preparacao desse ambiente real
  exige acesso AWS e definicao dos recursos descartaveis, ainda indisponiveis.

## Sequencia para a primeira janela

1. Revisar e integrar esta branch; selecionar o novo SHA exato da main e confirmar
   CI push/main. O SHA base acima deixa de ser candidato atual apos o merge.
2. Construir pelo workflow com `construir_candidato=true`, `implantar=false` e
   `CD_ENABLED=false`. Guardar os bytes do pacote e seu SHA-256; nao recompilar
   nem reutilizar comprovante de outro pacote.
3. Com sessao AWS autenticada, verificar as dependencias pendentes somente para
   leitura. Concluir o ensaio real isolado e restauracao de backup antes de emitir
   aprovacao. Registrar inventario de escritores e compatibilidade das duas releases.
4. Solicitar aprovacao explicita da janela para configurar o executor principal,
   instalar o comprovante root, habilitar CD e implantar. Nenhuma dessas acoes
   esta autorizada por este documento. Nao usar a EC2 principal para injecao de falhas.
5. O deploy constroi outro pacote na propria execucao: emitir o comprovante para
   o digest exibido por ESSA execucao antes de aprovar o job protegido. Confirmar
   backup <=24h, validade <=4h, anterior correta e hash dos bytes finais do JSON.
6. Aprovar o environment somente apos essas verificacoes. Registrar CommandId,
   VersionId S3, hashes e saude final; em estado incerto nao reenviar comando.

PostgreSQL e uploads persistentes sao preservados. Nao executar migrations,
restauracao de dados, limpeza de releases ou alteracoes de servicos nesta preparacao.

## Evidencias desta execucao

Container descartavel `nr33-rollback-lab-ab6b89629191`, removido pelo launcher.
54 testes CD passaram em Linux root, sem ignorados; `git diff --check` passou.
Resultado final: `COMPLETED_SYNTHETIC_LAB_ONLY`, com `production_readiness=false`
e `production_rollback_tested=false` preservados no summary.

Registros UTC de 22/11/2026: ensaio explicito 10:17:08, ida 10:17:11,
volta 10:17:13, rollback por falha 10:18:16 e recuperacao manual requerida
10:20:18. A recuperacao manual final foi concluida pelo laboratorio, com baseline
saudavel, integridade, mounts e sentinelas persistentes verificadas.

Evidencias locais em `laboratorio/cd-rollback/results/nr33-rollback-lab-ab6b89629191/`
(diretorio ignorado pelo Git, preservado no worktree):

- `summary.json` SHA-256 `807a84316a5727f359b4a7a5f2e3428035393c1277bb08f3b1da8d95062a160e`.
- `events.json` SHA-256 `3d0ba9c3a3640d1ae3e5a2c8c3e6d1647bfe7b212c8e18e431f33e782cd077ee`.
- `unit-root.log`, `operational.log`, `services.log`, `journal.log` e `mounts.json`.

Executor ensaiado SHA-256:
`e37ecd1f07d8ff886adeafdab4986f3539398d4eae49e4a90feb4e07b21ac4bf`.
