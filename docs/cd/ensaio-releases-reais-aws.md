# CD-241.46: procedimento para ensaio das releases reais

Preparacao documental em 22/11/2026. Nao executa provisionamento, restauracao,
alteracao de IAM ou comandos na EC2 principal. O ensaio real continua pendente.

Atualizacao CD-241.47: o [adaptador PostgreSQL 17](../../laboratorio/cd-real/README.md)
esta implementado e foi validado com servicos/SQL reais e pacotes artificiais.
O [relatorio](../../laboratorio/cd-real/RELATORIO-CD24147.md) registra os 14 testes,
rollback e limitacoes. A execucao das releases da aplicacao continua pendente.

## Parametros existentes

| Item | Valor | Origem da evidencia |
| --- | --- | --- |
| Conta / regiao | 792440910201 / us-east-2 | Contrato e configuracao versionados |
| EC2 principal, excluida do ensaio | i-0cdae5e3c5debdc02 | Usuario / variavel GitHub consultada |
| Role EC2 | NR33-EC2-SSM-Role | Template aprovado; policy efetiva pendente |
| Role OIDC | arn:aws:iam::792440910201:role/NR33-GitHub-CD-Homologacao | Variavel GitHub consultada |
| Bucket de artefatos | nr33-cd-artifacts-792440910201 | Variavel GitHub consultada |
| Bucket de backups | nr33-db-backups-792440910201 | Template; objetos e permissoes pendentes |
| Documento SSM / versao | nr33-hml-cd-release / 1 | Variaveis GitHub; conteudo remoto pendente |
| Baseline informada | 315fe0539da1e7077ef8204e79274de12832af7a | Usuario; integridade instalada nao relida |
| Candidata conhecida | 7f2b9ffa8a5773166b7cd2df3e23886ee7aebce7 | Base remota do PR #72 |

A candidata final sera o novo SHA da main apos o merge, com CI push/main aprovado.
Nao confundir CI de PR com essa verificacao. Manter o SHA baseline real e os bytes
dos dois pacotes; nunca atribuir SHAs reais aos fixtures sinteticos do laboratorio.

## GitHub verificado nesta etapa

PR #72 publicado com commit inicial `6c9842ed9a41d5fdf4b62e575006f280fe6e6531`.
Environment `homologacao`: revisor `ramirespaes`, `prevent_self_review=true`,
`can_admins_bypass=false`, uma unica politica customizada de branch `main`.
Ha seis variaveis AWS no environment, correspondentes a tabela acima; nao ha
variaveis no repositorio, nem `CD_ENABLED` ou `CD_READINESS_SHA256` no environment.
Nao foram consultados valores de secrets nem alteradas configuracoes.

Bloqueio de escopo: `validar_preparacao` nao usa environment e chama
`github_aws.py ambiente` quando `implantar=true`. Portanto precisa enxergar
`CD_ACCOUNT_ID`, `CD_ROLE_ARN`, `CD_ARTIFACT_BUCKET`, `CD_INSTANCE_ID`,
`CD_SSM_DOCUMENT`, `CD_SSM_VERSION` no escopo do repositorio. A condicao de jobs
tambem precisa enxergar `CD_ENABLED` nesse escopo. Na futura configuracao autorizada,
copiar os seis parametros nao secretos para variaveis do repositorio e manter
`CD_ENABLED=false` ate aprovacao. Evitar valores divergentes entre os dois escopos.
O digest de prontidao pode permanecer protegido no environment: so e exigido no
passo de implantacao apos aprovacao. Nao contornar o revisor para testar OIDC.

## Quem pode verificar cada dependencia

Permissoes abaixo sao as do template, nao certificacao da policy efetivamente aplicada.

| Verificacao | Role EC2 | OIDC GitHub | Sessao administrativa temporaria |
| --- | --- | --- | --- |
| Identidade STS | Sim, dentro da instancia, sem exportar credenciais | Sim, no job protegido | Sim |
| Ler versao exata de artefato S3 | GetObjectVersion previsto | GetObject previsto; leitura de versao exige permissao propria | Conforme acesso concedido |
| Metadados de seguranca do bucket de artefatos | Nao previstos | Sim: privacidade, versionamento, ownership, AES256 | Sim, conforme policy |
| Ler documento SSM dedicado | Sim, previsto | Sim, previsto | Sim, conforme policy |
| Consultar managed node Online / agente | DescribeInstanceInformation nao previsto | Sim, previsto | Sim, conforme policy |
| Inspecionar trust OIDC, policies, boundaries e instance profile | Nao previsto | Nao previsto | Necessario acesso IAM de leitura; SCP requer acesso organizacional |
| Ler/restaurar backup | Apenas se policy independente de backup permitir; nao presumir leitura | Explicitamente negado | Permissao temporaria especifica para o conjunto aprovado |
| Criar ambiente descartavel / PassRole | Nao previsto | Nao previsto | Necessario se o ensaio usar nova EC2 |
| Nginx, systemd, mounts e arquivos root | A role nao concede acesso Linux | SSM de deploy nao e shell de diagnostico | Acesso ao host separado de IAM; pendente, nao executar no principal |

A identidade EC2 e entregue por credenciais temporarias do instance profile,
utilizaveis no host; nao pode autenticar automaticamente este computador local.
Nao copiar tokens IMDS, anexar novas policies ao principal ou reutilizar sua role
compartilhada no laboratorio. OIDC nao concede acesso ao backup nem cria infraestrutura.

## Consultas AWS para uma sessao temporaria autorizada

Executar pela automacao quando a sessao estiver disponivel, registrando JSON,
horario UTC, identidade e erros. Sao consultas de leitura; nao enviar SendCommand.
Esta sessao local ainda nao possui perfil AWS configurado.

```bash
aws sts get-caller-identity
aws ec2 describe-iam-instance-profile-associations --region us-east-2 --filters Name=instance-id,Values=i-0cdae5e3c5debdc02
aws iam get-role --role-name NR33-GitHub-CD-Homologacao
aws iam get-role --role-name NR33-EC2-SSM-Role
aws iam list-open-id-connect-providers
aws iam list-attached-role-policies --role-name NR33-GitHub-CD-Homologacao
aws iam list-role-policies --role-name NR33-GitHub-CD-Homologacao
aws iam list-attached-role-policies --role-name NR33-EC2-SSM-Role
aws iam list-role-policies --role-name NR33-EC2-SSM-Role
aws s3api get-public-access-block --bucket nr33-cd-artifacts-792440910201 --region us-east-2
aws s3api get-bucket-versioning --bucket nr33-cd-artifacts-792440910201 --region us-east-2
aws s3api get-bucket-ownership-controls --bucket nr33-cd-artifacts-792440910201 --region us-east-2
aws s3api get-bucket-encryption --bucket nr33-cd-artifacts-792440910201 --region us-east-2
aws s3api get-bucket-policy --bucket nr33-cd-artifacts-792440910201 --region us-east-2
aws ssm describe-instance-information --region us-east-2 --filters Key=InstanceIds,Values=i-0cdae5e3c5debdc02
aws ssm get-document --region us-east-2 --name nr33-hml-cd-release --document-version 1 --document-format JSON
```

Depois consultar `get-policy-version` nas versoes default das policies anexadas,
`get-role-policy` nas inline, boundary e `get-open-id-connect-provider` no ARN
retornado. Comparar com o template e com `infra/cd/ssm-document.json`, por JSON
estrutural, nao apenas nome ou status. Confirmar agente >=3.3.2746.0.
Simulacao IAM e evidencia auxiliar: nao comprova OIDC, conectividade ou sucesso real.
Nao alterar permissoes para transformar AccessDenied em aprovacao.

## Execucao isolada proposta, apos autorizacao dos recursos e dados

1. Selecionar VM descartavel dedicada ao ensaio, sem volumes do principal, sem
   instance profile de producao, sem portas publicas e sem rota de dados para o
   principal. Pode ser VM local ou nova EC2 com autorizacao de custo e acesso
   administrativo temporario. Nunca executar container privilegiado no principal.
2. Na fase de staging, obter os pacotes baseline/candidata e o conjunto de backup
   aprovado usando a sessao temporaria. Identificar chave S3 e VersionId reais;
   o caminho local informado nao prova que existe copia S3. Conferir manifesto,
   SHA-256, data de captura com timezone e restaurabilidade. Nao criar backup novo
   no principal nesta etapa. Se a baseline nao possui pacote selado, preparar sua
   copia verificavel de fonte confiavel; divergencia para o instalado bloqueia.
3. Construir imagem de ensaio separada, com Node 24, dependencias dos lockfiles
   (`npm ci --omit=dev --ignore-scripts`), PostgreSQL 17, Python, Nginx/systemd e
   utilitarios do executor. Finalizar instalacoes antes de cortar a rede. Copiar
   os pacotes, nunca `.env` de producao ou credenciais AWS para a imagem/container.
4. Iniciar container descartavel somente com loopback, PostgreSQL por socket
   local e SMTP sink local. Manter ausencia de `/etc/nr33/cd.json` e o marcador
   `DISPOSABLE-NR33-LAB`. Nao publicar portas, montar volumes/socket Docker do host
   ou expor dados em logs. Restaurar dump e uploads SOMENTE nesse ambiente, por
   operacao de preparacao separada e autorizada; a transacao CD nao restaura dados.
5. Usar banco local `inventario_nr33_homolog`, roles locais independentes,
   credenciais novas e hosts loopback. Reproduzir o worker se habilitado no ambiente
   real, com SMTP sink sem saida externa. Se for desabilitado, registrar a limitacao;
   nao certificar inventario/parada de escritores sem testa-los. Nao rodar migrations.
6. Instalar as duas releases reais, manifestos e bind mounts internos conforme o
   layout do executor. TLS usa CA local e host `nr33-rollback.invalid`. Validar
   `artefato.verificar()` e `Runtime.release_integrity()` antes de iniciar baseline.
7. Preparar adaptador de laboratorio especifico para dados reais: reutilizar os
   metodos operacionais Runtime e `transacao(..., ensaio_isolado=True)`; substituir
   somente obtencao S3 por staging local e autorizacao administrativa por verificacao
   de isolamento/pacotes. `schema()` e `sql()` precisam consultar PostgreSQL REAL
   restaurado; nao herdar os retornos sinteticos do LabRuntime atual. Comparar
   fingerprint ao catalogo restaurado e revisar diferencas de owners/ACLs locais.
   O adaptador CD-241.47 implementa esse caminho em `laboratorio/cd-real`; seu perfil
   `--prepared` exige cluster/dataset previamente autorizado e nao restaura backups.
8. Com baseline saudavel e fingerprint registrado, executar sob `Lock` a ida para
   candidata e o retorno explicito via `restore()`. Exigir processo real da release,
   marcador frontend correto, HTTP/TLS 200, esquema estavel, parada sem processos
   remanescentes, zero conexoes da role apos stop e manutencao removida ao final.
9. Registrar inventario/hashes dos uploads antes/depois. Criar somente no clone
   uma evidencia identificada pela candidata e comprovar leitura pela baseline.
   Verificar invariantes de dados com consultas de leitura e digest do esquema.
   Nao exigir igualdade de todos os dados se workers produzem mudancas legitimas;
   registrar e reconciliar essas diferencas. Nao inserir dados de teste no principal.
10. Preservar resultado estruturado com ambos SHAs/digests, hashes dos scripts,
    imagem, versoes, mounts, servicos, fingerprint e logs sanitizados. Ausencia de
    qualquer evidencia bloqueia `rollback_tested`. Descartar clone apenas apos
    conferir coleta e autorizar a limpeza, sem tocar em volumes do principal.

O launcher e o backend atuais em `laboratorio/cd-rollback` continuam sinteticos e
nao implementam os passos 2 a 7. Usar `laboratorio/cd-real` para staging verificado,
PostgreSQL real e dados preparados. Nao basta trocar OLD/NEW ou o texto do summary.
Este procedimento nao chama `Runtime.main()` nem habilita o executor no clone.

## Promocao para o primeiro deploy supervisionado

Depois de merge e CI push/main, construir candidato com `construir_candidato=true`,
`implantar=false`, mantendo CD desabilitado. Esse build nao usa OIDC/AWS e permite
iniciar staging/ensaio. Nao acionar esse workflow para SHA de PR: exige HEAD da main.

O workflow atual recompila o pacote na solicitacao posterior de deploy. Conferir
SHA-256 do NOVO pacote; se divergir, repetir o ensaio com esses bytes antes de emitir
prontidao. Nao presumir equivalencia por SHA do Git, nem pela normalizacao do tar/gzip.
O job protegido pode aguardar a evidencia, mas so iniciar essa janela e habilitar
`CD_ENABLED`/executor apos aprovacao explicita. Planejar retencao de artefato (2 dias).

O comprovante final root vincula release, digest do pacote, baseline, fingerprint,
backup restaurado e evidencia de rollback real. Exigir backup <=24h e autorizacao
<=4h na execucao, alem de inventario completo de escritores. Aprovar environment
somente com hash dos bytes finais do JSON configurado. Nao antecipar booleans.

## Referencias oficiais

- [Roles EC2 e credenciais temporarias](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html).
- [Uso de credenciais temporarias](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_use-resources.html).
- [Limites do simulador IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html).
