# Ensaio isolado de rollback — CD-237

Base de codigo: `96058407d4e749afe53b65c50784c30f4f8cc521`.
Branch: `test/cd-rollback-laboratorio-isolado`. Nao habilita CD nem emite prontidao.

## Executar no Docker Desktop local

Pre-condicoes: Windows/PowerShell, Docker Desktop com engine Linux, espaco para imagem Node/Debian,
acesso a registries/APT somente durante o build. Usar a VM descartavel do Docker Desktop;
container privilegiado nao e uma fronteira de seguranca contra o kernel/daemon.
Nao executar em daemon de producao, host EC2, contexto remoto ou com dados/credenciais reais.
O launcher rejeita DOCKER_HOST e endpoints diferentes de named pipe local.
A imagem normaliza CRLF para LF nos scripts Bash, inclusive em checkouts Windows.
O vhost sintetico usa `nr33-rollback.invalid`, resolvido somente para loopback.

Na raiz deste worktree:

```powershell
& ./laboratorio/cd-rollback/run-lab.ps1
```

O launcher cria um nome exclusivo, compila a imagem, inicia systemd como PID 1 e executa:

```text
docker build -f laboratorio/cd-rollback/Dockerfile -t nr33-cd-rollback-lab:cd237 .
docker run -d --name <nome-exclusivo> --privileged --cgroupns private --network none --tmpfs /run --tmpfs /run/lock nr33-cd-rollback-lab:cd237
docker exec <nome-exclusivo> /opt/nr33-lab/run.sh
docker cp <nome-exclusivo>:/lab-results/. <diretorio-local>
docker rm -f <nome-exclusivo>
```

Nao monta diretorios do host, nao publica portas, nao injeta credenciais e nao monta socket Docker.
O ensaio exige apenas loopback em `/sys/class/net`. A imagem nao instala AWS CLI ou PostgreSQL.
Os resultados sao copiados mesmo em falha e o container e removido. A imagem fica disponivel
para reproducao; sua exclusao posterior e opcional. Nao existe limpeza de recursos AWS.

## O que e real e o que e adaptado

`scripts/cd/{servidor,contrato,artefato}.py` sao copiados sem alteracao. O laboratorio herda
`Runtime` e chama `transacao()` real, com lock real. Usa os metodos reais de manutencao,
parada/cgroup, ativacao, restore, start, verificacao de arquivos, mounts/inodes/permissoes,
HTTP/TLS, marcador frontend e gravacao atomica de logs administrativos.

`LabRuntime` substitui explicitamente construtor, authorize, preflight, prepare, schema e sql:

- Nao chama `main()` nem cria `/etc/nr33/cd.json` ou configura enabled=true.
- Authorize confere somente isolamento e pacote local; NAO e autorizacao de producao.
- Preflight reproduz verificacoes locais, sem STS nem fingerprint PostgreSQL.
- Prepare confere releases previamente instaladas no laboratorio, sem download S3/npm.
- Schema e contagem de conexoes sao fronteiras nao testadas/sinteticas, registradas nos eventos.
- Backend e arquivos sao fixtures sem banco, SMTP, worker ou integracoes.
- SHAs `111...` e `222...` sao identidades sinteticas; nao representam as releases reais.
- Pacotes sao construidos como fixtures e validados com `artefato.verificar()` real.
  `artefato.criar()` e coberto pela suite existente com Git simulado, nao pelo ensaio operacional.

Nao existe comprovante com approved/rollback_tested/restore_tested=true. O exemplo original
de prontidao permanece inalterado e sua rejeicao pelo contrato real e verificada.
Mesmo apos sucesso, `summary.json` declara `production_readiness=false` e
`production_rollback_tested=false`. O sucesso mecanico nao prova backup, restauracao,
compatibilidade, IAM, SSM, identidade EC2 ou autorizacao humana.

## Cenarios e criterios de aceite

1. Baseline ativa: backend nao root, Node 24, Nginx TLS com CA local confiada apenas no container,
   marcador frontend e pacotes integros; dois bind mounts gravaveis, nosuid/nodev/noexec.
2. `transacao`: baseline → candidata (`SUCCESS`). Escrita pelo usuario da aplicacao nos mounts.
3. `transacao`: candidata → baseline (`SUCCESS`). Escrita da candidata visivel pela baseline.
4. Flag local faz o HTTP real da candidata retornar 503. O polling real expira em ~60 segundos;
   transacao real deve gravar `ROLLED_BACK`, restabelecer baseline e retirar manutencao.
5. Mantendo defeito da candidata, flag faz o processo baseline encerrar com codigo 42 no start.
   Transacao deve gravar `MANUAL_RECOVERY_REQUIRED`, manter 503 e backend indisponivel.
6. Recuperacao manual do laboratorio: remover flags, reset-failed, restore/start/health reais,
   retirar manutencao e revalidar baseline, integridade e persistencia.

As falhas nao modificam o codigo selado: flags ficam em `/run/nr33-lab`. A injecao nao exige
alterar o executor. Cada execucao usa container novo, sem reaproveitar estado de releases.

## Evidencias

`results/<nome>/` e ignorado pelo Git e nao deve entrar no commit.
Logs, pacotes, chaves/certificados e caches gerados tambem sao excluidos por padrao.
Conservar as evidencias localmente; revisar e sanitizar antes de qualquer compartilhamento:

- `unit-root.log`: suite Linux root (inclui seis testes administrativos).
- `setup.log`, `operational.log`, `events.json`: comandos de setup, transacoes e estados/assertions.
- `summary.json`: somente aparece apos todos os cenarios; contem hashes dos scripts e pacotes.
- `failure.json`: aparece em falha operacional; nao aceitar execucao como concluida.
- `services.log`, `journal.log`, `curl.log`, `mounts.json`, `versions.log`: diagnosticos reais finais.
- `image.json`, `container.json`, `container.log`: imagem, isolamento, mounts e boot.
- `*.tar.gz`: pacotes sinteticos para repetir a verificacao de integridade.

Executar `sha256sum` ou `Get-FileHash -Algorithm SHA256` sobre os arquivos coletados.
APT nao esta fixado em snapshot: o digest da imagem base e fixo, mas rebuilds podem instalar
versoes diferentes. Registrar image ID e versions.log; nao presumir identidade binaria.
Bookworm usa Python 3.11; isso nao certifica a recomendacao operacional Python 3.12+ da EC2.

Achado de portabilidade: `servidor.executar()` fixa PATH sem `/usr/sbin`. Debian instala
runuser nessa pasta. A imagem fornece link em `/usr/local/bin/runuser`; verificar essa
pre-condicao na arquitetura real antes de um deploy. Nenhum script de producao foi corrigido aqui.

## Limite para a prontidao

Este ensaio pode comprovar somente a mecanica descrita. A baseline real 315fe053..., o pacote
real 96058407..., PostgreSQL 17, integridade dos dados de negocio e a parada do worker real
continuam dependendo de ensaios proprios. Nao copiar flags ou resultados sinteticos para
`/etc/nr33/cd-readiness`. Nenhum resultado autoriza alterar AWS/Environment ou habilitar CD.
