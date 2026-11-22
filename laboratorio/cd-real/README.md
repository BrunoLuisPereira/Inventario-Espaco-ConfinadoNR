# Adaptador offline com PostgreSQL 17

O adaptador reutiliza `Runtime` e `transacao(..., ensaio_isolado=True)` sem alterar
os contratos ou o executor de producao. Nao chama `Runtime.main()`, nao emite
prontidao e nao restaura backups. Os dois campos de aprovacao de producao no
summary permanecem `false`, inclusive quando a origem e `repository-releases`.

## Verificacao automatica local

```powershell
& ./laboratorio/cd-real/run-fixtures.ps1
```

Usa Docker Desktop local via named pipe. Gera staging somente se ausente; staging
existente precisa ser de fixtures. Preserva entradas e resultados, recusa sobrescrever
staging de releases reais e remove apenas o container exclusivo e seus volumes
anonimos ao terminar. `-NoCache` permite reconstruir apos falha do cache Docker,
sem apagar caches existentes. `python` precisa estar disponivel no host.

A imagem instala dependencias no build; o runtime e container descartavel com
systemd, PostgreSQL 17 somente por socket Unix e Nginx/TLS local. Nao tem rede,
portas publicadas, volumes do host, socket Docker ou credenciais AWS. Privilegios
Docker sao exclusivamente da VM local descartavel, nunca da EC2 principal.
Nao usar o launcher em daemon com dados reais. O default da imagem e usuario nobody.

Os testes geram apenas tabela e dados artificiais. O backend fixture faz consultas
SQL reais em cada healthcheck. Isso comprova PostgreSQL, controles e mecanismo de
rollback, mas nao o comportamento das releases da aplicacao ou backups reais.

## Entradas para releases verificadas

Em `laboratorio/cd-real/staging/`, fornecer SOMENTE:

- `input.json`, `baseline.tar.gz`, `candidate.tar.gz`;
- `source.bundle`: bundle Git com os dois commits para conferir codigo contra blobs.

Formato do input (substituir todos os marcadores; nao e aprovacao):

```json
{
  "protocol": 1,
  "source_kind": "repository-releases",
  "baseline": {"sha": "SHA_ANTERIOR_40_HEX", "sha256": "DIGEST_64_HEX", "package": "baseline.tar.gz"},
  "candidate": {"sha": "SHA_CANDIDATA_40_HEX", "sha256": "DIGEST_64_HEX", "package": "candidate.tar.gz"},
  "data_checks": [{"sql": "SELECT ... ORDER BY ...", "sha256": "HASH_64_HEX_DO_RESULTADO_ESPERADO"}]
}
```

As queries devem ter resultado deterministico, sem registros sensiveis em logs.
O hash e SHA-256 dos bytes UTF-8 de stdout do psql `-X -A -t`, apos `.strip()`;
NULLs, ordem e formatos precisam ser considerados pelo responsavel pelos invariantes.
Nao usar apenas `SELECT 1` para declarar preservacao dos dados da aplicacao.

`stage.py` verifica SHA/digest, inventario, hashes e allowlist dos pacotes e compara
todos os arquivos backend/shared aos blobs dos commits no bundle. Rejeita arquivos
ausentes, extras e conteudo alterado. Frontend compilado tem integridade de pacote,
mas sua reproducao de build nao e certificada pelo bundle; isso fica no summary.
`npm ci --omit=dev --ignore-scripts` roda como nobody, com ambiente limpo; codigo e
dependencias sao selados root antes de executar a aplicacao. Links internos de
dependencias sao inventariados; links externos, hardlinks e arquivos especiais sao
rejeitados. Pacotes, codigo e inventario de dependencias sao revalidados no runtime.

Construir com o staging real revisado:

```text
docker build -f laboratorio/cd-real/Dockerfile -t nr33-cd-real:prepared .
```

Nao chamar `run-fixtures.ps1` para releases reais. Iniciar essa imagem somente em
VM descartavel revisada, com os mesmos flags de isolamento do launcher. O perfil
`--prepared` exige preparacao independente dentro do container, antes do run:

1. Cluster PostgreSQL 17 fisico em `/opt/nr33-lab/pgdata`, owned postgres, sem
   `listen_addresses`, socket em `/var/run/postgresql`; nenhum volume do host.
2. Banco `inventario_nr33_homolog` com roles locais `nr33lab` e `nr33inspect`, sem
   superuser, createdb, createrole, replication ou bypassrls. A role de inspecao
   precisa ler catalogos/dados/pg_stat_activity, sem escrita. Autenticacao local
   deve permitir nr33lab por peer e inspecao root como nr33inspect por socket.
3. Esquema/dataset local preparado e aprovado para as duas releases. A carga ou
   restauracao, se necessaria, e uma operacao separada autorizada. Nenhum restore
   e feito por estes scripts; backups reais requerem aprovacao especifica.
4. `/etc/nr33/lab-schema.sha256`, root:root 0600, contendo o SHA-256 do JSON canonico
   retornado por `SCHEMA_SQL` no cluster preparado. Calcular antes de iniciar a
   baseline; comparar owners/ACLs locais na revisao, sem copiar hash do principal.
5. Uploads de teste em `/var/lib/nr33/uploads/{evidencias,relatorios}`, propriedade
   do usuario nr33lab criado pelo setup, diretorios 0700, sem symlinks/hardlinks.
   O setup preserva os arquivos, aplica permissao aos diretorios e cria binds internos.
   Usar somente copias autorizadas ou dados artificiais, nunca volumes do principal.

Executar `/opt/nr33-lab/run.sh --prepared` somente apos esses requisitos. O setup
recusa criar automaticamente um cluster nesse perfil. Ambiente da aplicacao e
regenerado exclusivamente com socket local e JWT de laboratorio; nao recebe `.env`
real. EMAIL_TRANSPORT fica disabled: worker SMTP continua uma limitacao explicita.
As roles PostgreSQL podem ser criadas antes do usuario Linux, que o setup cria.

## Aceite e limites

O adaptador exige baseline frontend/drop-in/processo coerentes, Node 24,
integridade das duas releases, dependencias e mounts por inode. `schema()` e `sql()`
usam PostgreSQL real pelo contrato de leitura existente. Apos candidata saudavel,
escreve sentinelas como usuario da aplicacao pelos mounts e retorna por `restore()`.
Exige baseline saudavel, esquema e invariantes preservados, uploads originais
identicos e apenas as duas sentinelas adicionais, legiveis pela baseline.

Falha nao gera summary positivo. `failure-real.json` registra falha/pendencia,
e a transacao conserva o comportamento de manutencao/recuperacao manual existente.
Nao ha tentativa automatica adicional nem limpeza de releases montadas.

Resultados ficam em `results/<container>/`, ignorados pelo Git: summary, hashes,
testes, servicos, journal, mounts, versoes e Docker inspect. Logs de aplicacao/dados
de clone devem ser revisados e sanitizados antes de compartilhar. Nenhum resultado
altera `rollback_tested` do comprovante de producao. Ver [relatorio](RELATORIO-CD24147.md).
