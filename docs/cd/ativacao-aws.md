# CD de homologacao: implementacao e ativacao supervisionada

Estado inicial: DESABILITADO. Este documento nao autoriza provisionamento, acesso ao banco ou deploy.
Nao usa fix/backend-encerramento-rastreamento, recuperacao V2 ou migration 029.

## Componentes implementados

- Workflow manual com as verificacoes anteriores de SHA/CI, repetidas apos aprovacao.
- Build isolado das credenciais AWS. Backend/shared lidos dos blobs Git; frontend compilado do mesmo checkout.
- Pacote com allowlist, manifesto, hashes e marcador frontend; verificador rejeita links, duplicatas e caminhos inseguros.
- OIDC restrito ao environment homologacao. Nenhuma chave estatica.
- S3 privado/versionado/SSE-S3, escrita condicional e checksum, sem sobrescrita.
- SSM com documento dedicado, versao fixa e parametros ENV_VAR; nenhum shell fornecido por input.
- Executor Linux root fixo, fora do pacote. Releases fisicas por SHA; uploads por bind mounts reais.
- Lock GitHub e flock no servidor. Nao apagar releases nem desmontar uploads automaticamente.
- Manutencao Nginx, parada controlada, PostgreSQL somente leitura, saude HTTP/TLS/esquema e rollback da aplicacao.
- Se rollback falhar: manter manutencao e exigir recuperacao manual. Nunca restaurar banco como rollback de codigo.

O manifesto permanece approval=NOT_VERIFIED/deployEligible=false: nao e uma autorizacao.
O executor somente aceita a promocao operacional em comprovante externo root, vinculado ao SHA, digest do pacote e digest do proprio comprovante.
Os artefatos candidatos anteriores nao sao modificados.

## O que NAO esta comprovado

IAM efetivo/SCPs, recuperacao administrativa, registro SSM, conectividade, backups recuperaveis,
restauracao, equivalencia do esquema, layout real de releases e janela de manutencao.
JSON preenchido nao substitui ensaio de restauracao, revisao DBA ou teste de rollback.
Falhas no encerramento do backend atual nao foram corrigidas aqui.
A janela aceita interrupcao controlada apenas apos bloquear clientes e comprovar parada do grupo de processos;
operacoes interrompidas podem exigir reconciliacao. Nao e deploy sem indisponibilidade.

## Configuracao AWS (exige autorizacao separada)

1. Confirmar permissao administrativa e recuperacao do acesso Building Momentum/organizacao.
2. Criar ou identificar o provider OIDC token.actions.githubusercontent.com com audience sts.amazonaws.com.
3. Usar a role GitHub NR33-GitHub-CD-Homologacao; trust exata do template, somente environment homologacao.
4. Criar bucket de ARTEFATOS separado dos backups, us-east-2, Block Public Access integral,
   BucketOwnerEnforced, SSE-S3 e versionamento. Sem permissao de exclusao para CD.
5. Usar a role existente NR33-EC2-SSM-Role da EC2 compartilhada com o backup PostgreSQL.
   Preservar suas politicas independentes de backup e o suporte SSM; revisar restricoes organizacionais.
6. Publicar infra/cd/ssm-document.json como documento Command com nome nr33-hml-cd-<sufixo>.
   Fixar numero de versao. Agent >=3.3.2746.0 necessario para ENV_VAR.
7. Validar managed node Online e documentar as permissoes efetivas.

iam-policies.template.json sao MODELOS, nao policies finais: preencher __ACCOUNT_ID__,
__ARTIFACT_BUCKET__, __BACKUP_BUCKET__, __INSTANCE_ID__, __DOCUMENT_NAME__.
Nao conceder iam:PassRole, criacao de recursos ou SSM generico. A role GitHub nunca recebe acesso ao backup.
As acoes de metadados que usam Resource=* nao sao autorizacao de comandos genericos.
IAM nao restringe automaticamente a versao do documento: limitar sua administracao e manter todas as versoes
desse documento dedicado apontando exclusivamente ao executor fixo. O workflow verifica conteudo/versao antes de enviar.

## EC2 compartilhada (CD-156, Opcao A)

Conta 792440910201, regiao us-east-2. Artefatos: nr33-cd-artifacts-792440910201;
backups: nr33-db-backups-792440910201. Os valores de approved_architecture no template
identificam os parametros aprovados; instancia e documento SSM ainda exigem identificacao.
A politica github_identity mantem integralmente NeverAccessBackups (Deny s3:* no bucket e objetos).
A politica ec2_identity nao nega acesso ao backup: essa role tambem executa o servico de backup.
O acrescimo S3 do CD e somente s3:GetObjectVersion em releases/* do bucket de artefatos,
sem ListBucket, escrita ou exclusao. O suporte SSM existente e preservado.
Nao substituir as permissoes independentes de backup por este modelo.

cd.example.json permanece enabled=false. O executor exige account_id e instance_role_name
aprovados e STS Account=792440910201, com ARN completo no formato
arn:aws:sts::792440910201:assumed-role/NR33-EC2-SSM-Role/i-<8 ou 17 digitos hexadecimais minusculos>.
Outras contas, roles, particoes, caminhos e sessoes sao rejeitados.
A identidade comprova a role e a conta, nao uma instancia unica; a instancia aprovada continua
restrita pelo destino SSM na politica GitHub e na configuracao do workflow.

Compartilhar a role significa que processos com acesso as credenciais da instancia podem ter
as permissoes efetivas de backup; a ausencia de Deny na EC2 nao isola esses processos por IAM.
As protecoes do executor e as evidencias externas de restauracao continuam obrigatorias.
Esta adaptacao altera apenas arquivos do repositorio: nao aplica IAM, nao ativa timer,
nao altera PostgreSQL/bucket de backup e nao autoriza deploy.

## Preparacao EC2 (fora do workflow, autorizacao propria)

Layout obrigatorio:
- /opt/nr33/releases/<sha>/backend e /frontend: codigo root, nao gravavel pelo usuario da aplicacao.
- /var/lib/nr33/uploads/{evidencias,relatorios}: dados reais, usuario da aplicacao, modo 0700;
  /var/lib/nr33/uploads e seus ancestrais root nao gravaveis pela aplicacao.
- Bind mounts em cada release/backend/uploads/{evidencias,relatorios}. Substrato root:0555.
- /etc/nr33/backend.env: configuracao real externa; nunca embutida no pacote.
- /etc/nr33/pg_service.conf: servico libpq nr33_hml_readonly, exclusivamente leitura do banco homolog.
- /etc/nr33/cd.json: configuracao root, inicialmente enabled=false.
- /etc/nr33/cd-readiness/<sha>.json: comprovante operacional root.
- /run/nr33, /run/nr33-cd, /var/log/nr33-cd: diretorios root protegidos.
- /var/www/nr33/current: UNICO link permitido aqui, apenas frontend; destino fisico da release anterior.
- /etc/systemd/system/nr33-backend.service.d/50-release.conf: release fisica anterior, EnvironmentFile externo.

Instalar somente servidor.py, contrato.py e artefato.py em /usr/local/lib/nr33-cd, root:root,
codigo 0644, diretorio 0755, sem escrita por aplicacao/CD. O SSM NAO executa arquivos do artefato como root.
Instalar/revisar Python 3.12+, Node 24, npm, AWS CLI, psql 17, findmnt, curl, runuser e mount;
a instalacao dessas ferramentas nao faz parte do deploy.
A unit deve executar como usuario nao root, KillMode=control-group e timeout de parada revisado
(compativel com 90s observado e com o prazo do executor).
O executor so altera o drop-in da APLICACAO e a referencia do frontend. Nao altera Nginx nem PostgreSQL.

Incluir o mecanismo de infra/cd/nginx-maintenance.conf na location /api/ mediante revisao;
servir /release.json sem cache/fallback SPA. TLS e proxy existentes precisam ser preservados.
O executor comprova 503 pelo vhost HTTPS antes de parar a aplicacao.
Preparar tmpfiles/mount units para recriar os diretorios /run apos reboot.
Adicionar dependencia/monitoramento das montagens ao systemd exige configuracao operacional propria.

A primeira implantacao exige uma release ANTERIOR selada, com release-manifest.json, marcador release.json,
bind mounts e drop-in coerentes. Converter o layout antigo em baseline e migrar dados persistentes e uma
operacao administrativa independente, com backup/rollback e autorizacao; nao e executada automaticamente pelo CD.
Nao mover os dados atuais de /home/ubuntu/inventario-nr33 com estes scripts.

## Comprovante de prontidao

O administrador produz o comprovante somente apos:
- captura coordenada consistente, copia externa e restauracao isolada comprovadas;
- inventario completo de escritores (o executor inicial admite somente nr33-backend.service e seu worker interno);
- esquema PostgreSQL catalogado e aprovado para as duas releases;
- rollback ensaiado e manutencao autorizada;
- persistencia real configurada, permissoes verificadas e teste de ausencia de montagem.

Copiar readiness.example.json e preencher os campos com evidencias REAIS, nao apenas trocar booleans.
captured_at deve estar no RPO proposto de 24h; verified_at registra a verificacao.
A autorizacao expira em no maximo 4h. Ambos RPO/janela exigem aceite operacional.
schema_sha256 e SHA256 do JSON canonico retornado por SCHEMA_SQL (servidor.py), obtido com o mesmo
servico de leitura. A revisao humana compara esse catalogo com o contrato da release; o hash apenas
detecta alteracoes posteriores. Nao inferir migrations por contagem de objetos.
O executor verifica PostgreSQL 17, fingerprint, mounts por dispositivo/inode, identidade EC2 aprovada e parada real.
Nao ha SQL de escrita nem migrations.

Calcular SHA256 dos bytes finais do comprovante root e publicar esse digest em CD_READINESS_SHA256.
OIDC/CD nao podem escrever esse arquivo. Nao guardar senhas nele.
Depois de npm ci e antes da manutencao, autorizacao/expiracao/digest sao novamente conferidos.

## GitHub

Environment homologacao deve existir com revisores obrigatorios e deployment branch policy exclusivamente main.
Confirmar suporte do plano antes de depender disso; API indisponivel ou protecao ausente bloqueia.
Configurar checks/revisao da main; nao permitir que branch de PR receba credenciais AWS.

Variaveis de repositorio (nao sao segredos):
CD_ENABLED=false, CD_ACCOUNT_ID, CD_ROLE_ARN, CD_ARTIFACT_BUCKET, CD_INSTANCE_ID,
CD_SSM_DOCUMENT, CD_SSM_VERSION.
CD_READINESS_SHA256 pode ser variavel protegida do environment, especifica do candidato aprovado.
Sem secrets AWS estaticos. Credenciais temporarias existem somente no job protegido implantar.

## Primeiro deploy: sequencia exata, apos autorizacoes

1. Revisar/validar o PR, publicar e integrar os novos scripts/workflow; nenhuma dessas operacoes foi feita nesta entrega.
2. Concluir as configuracoes acima, confirmar baseline anterior e recuperar backup em ensaio isolado.
3. Selecionar SHA completo da main com CI push/main aprovado. Somente esse SHA pode ser solicitado.
4. Com AWS/EC2 preparados e autorizacao de janela, habilitar CD_ENABLED=true; cd.json enabled=true.
5. Acionar workflow_dispatch na main com release_sha e implantar=true.
   Build nao recebe OIDC; o job implantar aguardara aprovacao do environment.
6. Conferir SHA/digest no resumo do job construir. Emitir comprovante root vinculado a esse digest,
   calcular seu SHA256 e configurar CD_READINESS_SHA256 ANTES de aprovar o environment.
7. Aprovar o job. Ele revalida HEAD/CI/environment, obtem OIDC, verifica S3/SSM, publica objeto condicional,
   envia UM comando SSM e aguarda status. Qualquer requisito ausente falha fechado.
8. Registrar CommandId, versao S3, logs de operacao, release anterior e saude. Resultado ROLLED_BACK e falha do job.
9. Se a comunicacao falhar/expirar, NAO reenviar nem presumir cancelamento: conferir o comando e lock.
   A execucao remota pode continuar apos cancelamento do runner. O flock impede concorrencia no host.
10. Se rollback falhar, manter manutencao, preservar releases/montagens/dados e usar recuperacao manual autorizada.
    Nao limpar uma release montada. Nao restaurar banco sem autorizacao propria.
11. Desabilitar CD_ENABLED apos a primeira janela se nao houver autorizacao permanente.

Implantar=false preserva a pre-verificacao existente, sem OIDC, build ou AWS.
O deploy nao se torna automatico em push. Concorrencia nunca cancela uma implantacao em andamento.

## Validacao e limites

Testes unitarios direcionados usam AWS, GitHub e operacoes de host simulados.
Actionlint valida o YAML e a estrutura GitHub Actions.
Nenhuma credencial, AWS, EC2, banco, SMTP, migration, backup ou deploy real e usado nos testes.
O ensaio de persistencia e encerramento anterior nao e repetido nem incorporado.
Permissoes reais, configuracao Nginx/systemd e restauracao ainda exigem comprovacao operacional.
A aplicacao precisa de capacidade para duas releases/dependencias, espaco de staging e logs.
Ha custos de S3/requisicoes, retencao temporaria GitHub e eventual observabilidade; nao ha orcamento aprovado.
