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
ve-los no escopo do repositorio. Nenhuma variavel foi modificada. O adaptador para
PostgreSQL e releases reais ainda precisa ser implementado antes desse ensaio.
