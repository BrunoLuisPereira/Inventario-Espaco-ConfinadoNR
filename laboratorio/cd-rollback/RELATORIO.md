# Relatorio executado ? laboratorio CD-237

Data: 21/11/2026. Base: `96058407d4e749afe53b65c50784c30f4f8cc521`.
Branch: `test/cd-rollback-laboratorio-isolado`. A coleta original antecede o commit desta entrega.

## Resultado

**CONCLUIDO SOMENTE PARA O LABORATORIO SINTETICO.** Execucao final: `nr33-rollback-lab-feda58452ceb`.
47 testes CD passaram em Linux root, incluindo os seis administrativos, sem ignorados.
Sintaxe Bash, Python e JavaScript validada no container; parser PowerShell e whitespace validados no host.
A primeira execucao completa, `nr33-rollback-lab-380162f17457`, tambem passou os cenarios;
a final acrescentou escrita pelo usuario da candidata e leitura pela baseline apos a volta.

| Horario UTC | Resultado gravado por Runtime.record real |
| --- | --- |
| 2026-11-21T11:45:09Z | SUCCESS |
| 2026-11-21T11:45:12Z | SUCCESS |
| 2026-11-21T11:46:15Z | ROLLED_BACK |
| 2026-11-21T11:48:17Z | MANUAL_RECOVERY_REQUIRED |

Recuperacao manual final: `2026-11-21T11:48:19Z`; baseline ativa, HTTP/TLS 200,
manutencao retirada, pacotes integros e mounts/persistencia verificados.
O cenario MANUAL_RECOVERY_REQUIRED confirmou HTTP 503 e backend inativo/falho antes da recuperacao.

## Comandos reproduziveis

Na raiz do worktree, PowerShell:

```powershell
& ./laboratorio/cd-rollback/run-lab.ps1
```

O [README](README.md) descreve os comandos Docker, pre-condicoes, injecoes e adaptadores.
No container, o launcher executou `python3 -B -m unittest discover -s tests/cd -v`,
`/opt/nr33-lab/setup.sh` e `python3 -B /opt/nr33-lab/ensaio.py`.
Comprovacao de sintaxe: `bash -n` nos dois scripts, `node --check` no fixture e
`python3 -m py_compile` no ensaio (todos codigo 0). Uma tentativa anterior de comando
composto para sintaxe Python falhou por aspas do PowerShell; as chamadas diretas passaram.

## Isolamento e ambiente observados

Imagem final: `sha256:301767a146f209073dafc780aeac9b6da417d1da7d1cbd67545bd7fa62079b84`.
Docker Desktop 28.1.1, Linux WSL2 5.15.167.4, Node v24.22.3, Python 3.11.2,
systemd 252, Nginx 1.22.1. Container privilegiado, cgroup namespace privado,
sem rede externa, bind mounts do host ou portas publicadas; somente tmpfs em /run e /run/lock.
As montagens de persistencia sao internas ao container. O launcher removeu o container ao terminar.
Nenhuma credencial AWS, consulta ao banco real, GitHub Environment ou habilitacao CD foi usada.

## Hashes SHA-256

Pacote baseline sintetica `1111111111111111111111111111111111111111`:
`802230d73a1d006a9554e9cc55dd5b3d14728344e0dec02f9fbf709112a2a35f`.

Pacote candidata sintetica `2222222222222222222222222222222222222222`:
`358b1de99a7b8e0af22c2c0c4a91f2a2041cf53df1811c6881e38c136063f80c`.

Os pacotes NAO sao as releases reais 315fe053.../96058407... nem o artefato GitHub #4.
Os hashes abaixo identificam os bytes dos scripts copiados do worktree para o Linux:

| Script original, sem alteracao | SHA-256 |
| --- | --- |
| artefato.py | `154361f03e760dac9a82a364b806bf78157af67853b2ab770fa7fbb007f5a562` |
| contrato.py | `c374fad52df0d286de7b807c95c743e270949d97b51121143ebad3a1d10bb3d0` |
| github_aws.py | `b150b27265bc0452b184ead88e6e95e85afc4ae5a2e471df47c2d02f078b85b9` |
| servidor.py | `07e8cbcfc381f9565957b7a0ba092d26652a4f161a96fac7f4009bfff60a40c7` |

`summary.json`: `62d220b92c2f76db48c5692062d1366709d58c45091b190721336579f6204ccf`.

`unit-root.log`: `4fdab30d8a360176428e31d4eff80c5b17e0743dbd422cda391ac7cd0bb6b75d`.

`events.json`: `7eb0c501793d1b170589c8755fe8c043efe1974be69dd1389308a61ebe3687ca`.

Todos os arquivos coletados estao inventariados em
`hashes.sha256`. Logs, versoes, imagem, inspecao de isolamento,
pacotes e diagnosticos ficam em `results/nr33-rollback-lab-feda58452ceb/`, ignorado pelo Git.
Os registros administrativos foram gravados de verdade no container; seus resultados tambem
foram capturados em operational.log. O diretorio administrativo interno foi descartado com o container.

## Falhas de preparacao registradas

Tres tentativas anteriores nao concluiram e seus logs foram preservados:
`b993e8420cbb` (runuser fora do PATH), `5e1beba3a6e4` e `79006dc371ad`
(Nginx havia iniciado com a configuracao padrao antes de instalar o vhost TLS).
A imagem fornece runuser em /usr/local/bin e o setup reinicia Nginx.
O ensaio aguarda health da baseline antes da primeira verificacao publica.
Esses ajustes nao alteraram os scripts de producao.

## Limites e pendencias de producao

- Construtor, authorize, preflight, prepare, schema e sql usam adaptadores de laboratorio explicitados no README.
- A maquina de estados, systemd, Nginx/TLS, parada/cgroup, mounts/inodes, integridade,
  troca, restore, manutencao, polling de saude e gravacao atomica usam implementacoes reais.
- Sem AWS/OIDC/SSM/S3, backup/restauracao, PostgreSQL ou aprovacao humana reais.
- Sem worker, encerramento e dependencias da aplicacao real. A contagem zero de conexoes e sintetica.
- Releases preinstaladas; nao exercita download versionado nem npm de Runtime.prepare.
- A volta bem-sucedida usa prepare adaptado; producao recusa instalar um SHA ja existente.
- Python 3.11 nao certifica a recomendacao Python 3.12+ da EC2. APT nao usa snapshot fixo.
- O achado de PATH de runuser deve ser conferido na arquitetura real antes de qualquer deploy.
- Nao houve alteracao de backend/frontend, scripts/cd, infra/cd, workflow, banco ou AWS.

`production_readiness=false` e `production_rollback_tested=false` permanecem no resumo.
Nenhum arquivo de prontidao foi emitido e nenhum campo rollback_tested foi promovido.
Este resultado comprova a mecanica sintetica, sem autorizar o primeiro deploy.

## Revisao para versionamento

Somente scripts, configuracao da imagem, regras de exclusao, README e este relatorio
sao versionados. Results, logs, pacotes, certificados/chaves gerados e inspecoes Docker
permanecem locais e ignorados. Os nomes de arquivos e hashes acima referem-se a evidencias
locais, nao distribuidas no repositorio. Nenhum caminho absoluto do host e necessario.
Os caminhos Linux absolutos dos scripts sao internos ao container e reproduzem o contrato
do executor. O hostname do laboratorio foi substituido por `nr33-rollback.invalid`; nao ha
DNS publico ou acesso ao dominio da aplicacao. Nenhum segredo ou dado de negocio e incluido.

## Revalidacao antes do commit

Execucao `nr33-rollback-lab-ccaafcaca95b`, em 21/11/2026, com hostname reservado
`nr33-rollback.invalid` e normalizacao CRLF/LF na imagem: **CONCLUIDA**.
Suite CD Linux root: **47 aprovados, 0 falhos, 0 ignorados**.

- `2026-11-21T11:52:52Z`: `SUCCESS`.
- `2026-11-21T11:52:54Z`: `SUCCESS`.
- `2026-11-21T11:53:58Z`: `ROLLED_BACK`.
- `2026-11-21T11:55:59Z`: `MANUAL_RECOVERY_REQUIRED`.
- `2026-11-21T11:56:01Z`: recuperacao manual concluida e baseline saudavel.

Pacote baseline sintetica: `ee61c06fa3453e537028f2bd99ee26bad9bbecf1a5a0d2a05106860208669d27`.

Pacote candidata sintetica: `fe3f52e7a584aafa874d5add9a84f359c0f734edb8c1ba38e45e4370db1febde`.

Hash do summary.json local desta revalidacao: `e316b6aa93df54cb75db9b0ab297a2e2225011a04f6fa3faa94c64232b22310e`.

Sintaxe Bash/Python/JavaScript no Linux e parser PowerShell no host: aprovados.
Scan dos 10 arquivos destinados ao indice: sem segredos, credenciais, dados de negocio
ou caminhos absolutos do host identificados. Caminhos absolutos Linux sao internos
ao container e necessarios ao contrato. Logs e pacotes continuam excluidos do commit.
A tentativa anterior `9d847b56cb62` parou antes dos testes por CRLF no shebang;
a normalizacao na imagem corrigiu a reproducao em checkout Windows.
Os limites de producao acima permanecem, incluindo production_readiness=false.
