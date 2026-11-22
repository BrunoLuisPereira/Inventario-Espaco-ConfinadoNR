# fix(cd): ensaiar retorno explicito em laboratorio isolado

O contrato operacional exige rollback ensaiado antes da implantacao, enquanto a
transacao so retornava pela rotina de recuperacao apos uma falha. Acrescenta ensaio
opt-in que verifica a candidata saudavel e retorna pela mesma rotina `restore()`,
confirmando saude da baseline antes de registrar `ROLLBACK_REHEARSED_ISOLATED`.

O modo exige container descartavel identificado, ausencia de configuracao CD e
isolamento de rede. Nao e exposto no SSM ou CLI. As barreiras do comprovante e a
configuracao desabilitada permanecem. O laboratorio sintetico nao autoriza o
comprovante das releases reais; o relatorio de preparacao documenta essa pendencia.

Validacao: 54 testes direcionados de CD passaram em Linux root, sem ignorados.
Ensaio operacional e seus limites registrados em `finalizacao-20261122.md`.
Sem alteracoes em EC2, IAM, S3, SSM, PostgreSQL ou uploads reais.

Preparacao AWS: `docs/cd/ensaio-releases-reais-aws.md` descreve staging,
restauracao isolada autorizada, criterios de aceite das releases reais e a matriz
de permissoes EC2/OIDC/sessao temporaria. As protecoes GitHub foram consultadas;
os seis parametros AWS estao apenas no environment, mas a pre-validacao precisa
ve-los no escopo do repositorio. Nenhuma variavel foi modificada.

CD-241.47 implementa `laboratorio/cd-real`: staging de pacotes por SHA/digest e
comparacao backend/shared com commits Git, dependencias seladas e PostgreSQL 17
real por socket local. Reutiliza a transacao/restore e valida baseline/processo,
esquema, invariantes SQL, uploads e recuperacao. O perfil preparado nao restaura
backups; exige dataset isolado autorizado. Contratos e executor de producao intactos.

Validacao nova: 14 testes passaram com PostgreSQL 17.12, systemd/Nginx e rollback
efetivos, usando aplicacao/dados artificiais. `production_rollback_tested=false`
permanece. Evidencias e limites em `laboratorio/cd-real/RELATORIO-CD24147.md`.
Releases reais, clone autorizado e worker SMTP representativo continuam pendentes.
