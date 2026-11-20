# Proposta de PR (nao publicada)

Titulo: feat: preparar CD supervisionado de homologacao com OIDC e SSM

Implementa build e artefato por SHA aprovado, OIDC no environment homologacao e envio de documento SSM dedicado.
O executor instalado e protegido fora das releases verifica comprovante administrativo, banco por leitura,
persistencia, manutencao e integridade antes de trocar codigo/frontend. Falha de saude tenta rollback de codigo;
falha na reversao mantem manutencao para recuperacao manual. Banco e uploads nao sao restaurados pelo CD.

Mantem as verificacoes existentes de main e CI e as repete apos aprovacao.
Nao utiliza a branch experimental de encerramento, recuperacao V2 ou migration 029.
Nao altera CI, migrations, codigo de negocio, IAM ou infraestrutura real.
Modo padrao de pre-verificacao; CD_ENABLED e configuracao do executor permanecem desabilitados.

Validacao: testes direcionados de contrato, GitHub/CI, AWS/SSM mockado, artefato, rollback e lock;
ver resultados anexos locais antes de publicar. Nenhum deploy real executado.

Ativacao requer configuracao AWS/GitHub/EC2 autorizada, backup externo/restauracao comprovados,
baseline anterior versionada, compatibilidade do esquema e janela de manutencao.
Ver ativacao-aws.md para o procedimento de primeira implantacao e contingencia.

Validacao local: 29 testes unittest em Ubuntu 24.04, sem rede; actionlint aprovado; diff --check aprovado.
Os testes de montagens exercitam a inspecao com mocks; nao comprovam montagens/systemd/SSM na EC2.
