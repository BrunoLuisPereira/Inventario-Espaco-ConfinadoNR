# Observabilidade local NR-33

Implementa coleta do processo e do HTTP, sem SQL, migrations ou dependencias de AWS.
Prometheus `v3.5.0` e Grafana `12.3.1` estao fixados. Nao foi iniciado Docker
na implementacao; a verificacao executada foi apenas `docker compose config`.

## Preparacao no Windows (execucao posterior)

Use uma pasta **fora do repositorio**, com ACL restrita ao seu usuario, para tres arquivos:

- `metrics-token.txt`: token aleatorio hexadecimal com pelo menos 64 caracteres.
  Gere, por exemplo, 32 bytes com um gerador criptografico. Nao use JWT ou senha da API.
- `grafana-password.txt`: senha forte e exclusiva do administrador Grafana.
- `targets.json`: `[{"targets":["host.docker.internal:3000"]}]` para o app padrao,
  ou porta `3001` para laboratorio. Nao adicione nomes de pessoas, ambientes ou tenants.
  Monitore apenas o app que estiver executando; pode listar ambos se estiverem ativos.

Nao coloque esses arquivos no Git nem em `.env` versionado. Nao ha segredos de exemplo
utilizaveis neste diretorio. Configure variaveis somente na sessao PowerShell:

```powershell
$env:NR33_METRICS_TOKEN_FILE = 'C:/nr33-secrets/metrics-token.txt'
$env:NR33_GRAFANA_PASSWORD_FILE = 'C:/nr33-secrets/grafana-password.txt'
$env:NR33_PROMETHEUS_TARGETS_FILE = 'C:/nr33-secrets/targets.json'
$env:NR33_METRICS_ENABLED = 'true'
# Padrao: apenas 127.0.0.1 e ::1. Se Docker Desktop chegar com outro IP,
# acrescente exclusivamente o IP de origem real do coletor (nao X-Forwarded-For).
$env:NR33_METRICS_ALLOWED_ADDRESSES = '127.0.0.1,::1,IP_DO_COLETOR'
docker compose -f infra/observabilidade/compose.yml config --quiet
# Somente quando autorizado a iniciar os containers:
docker compose -f infra/observabilidade/compose.yml up -d
```

Substitua `IP_DO_COLETOR` pelo endereco efetivo do Docker Desktop ou remova essa entrada
se a conexao chegar por loopback. Nao libere redes inteiras ou origens publicas.
Reinicie o backend pela entrada local ja utilizada, herdando essas variaveis.
O token e lido somente na inicializacao; sua rotacao exige reiniciar o backend e
recriar o container Prometheus para remontar o segredo. A senha inicial do Grafana
so e aplicada na primeira criacao de seu banco interno; depois altere-a pela interface.

Se o backend escutar somente em loopback e Docker Desktop nao conseguir alcanca-lo,
use o endereco da interface privada do host e regras restritas do Windows Firewall.
Nao abra a API ou `/internal/metrics` para a Internet. A lista de origens e a credencial
sao verificadas antes de produzir metricas e nao dependem da autenticacao da aplicacao.
O HTTP sem TLS deste Compose e destinado somente a rede local confiavel do Docker/host.

## Acesso e demonstracao

- Prometheus: <http://127.0.0.1:9090>, pagina Targets: job `nr33-api` deve estar UP.
- Grafana: <http://127.0.0.1:3002>, usuario inicial `admin` e senha do arquivo externo.
  Login obrigatorio; cadastro publico e acesso anonimo desativados.
- Datasource `nr33-prometheus` e dashboard `NR-33 — Observabilidade da API` provisionados.
- Acesse `/api/health` e uma URL inexistente para gerar trafego sem consultar o banco.
  Aguarde duas ou mais coletas para visualizar `rate()`; latencia exige trafego.
- `up` indica sucesso da coleta autenticada, nao disponibilidade do PostgreSQL.
  Series de erro so aparecem depois do primeiro erro; o percentual mostra zero sem erros.
- Volumes persistem os dados; Prometheus conserva sete dias. Nao execute `down -v`
  se quiser preservar historico e configuracao do Grafana.

## Metricas e seguranca

| Metrica | Tipo / significado |
| --- | --- |
| `nr33_http_requests_total` | Counter de respostas concluidas |
| `nr33_http_errors_total` | Counter de respostas 4xx e 5xx; `rate()` calcula erros/s |
| `nr33_http_request_duration_seconds` | Histogram em segundos, buckets, soma e contagem |
| `nr33_http_requests_in_flight` | Gauge de requisicoes simultaneas |
| `nr33_process_resident_memory_bytes` | Gauge de RSS do processo |
| `nr33_process_heap_used_bytes` | Gauge do heap utilizado |
| `nr33_process_cpu_seconds_total` | Counter de CPU user + system; `rate()` em nucleos |

Labels da aplicacao: apenas metodo de conjunto limitado e status HTTP. Nao coleta
URLs, query strings, bodies, headers, tokens, emails, nomes, IDs ou ambientes.
Requisicoes interrompidas contam como 499 e liberam o gauge uma unica vez.
A coleta e suas tentativas de acesso nao entram nas metricas HTTP.
Nao utiliza metricas padrao de GC/event loop com labels adicionais. CPU usa
`process.cpuUsage()`, inclusive no Windows. Registros sao isolados por app e zeram
ao reiniciar o processo; `rate()` trata resets. Nao ha alteracao de JWT, RBAC ou tenants.
Se habilitado sem arquivo/token valido, o app falha na inicializacao com mensagem fixa.
Se desabilitado (padrao), `/internal/metrics` responde 404.

## Validacao sem infraestrutura

Na pasta `backend`:

```powershell
node --test tests/observabilidade.test.js tests/appTratamentoErros.test.js tests/laboratorioAppErros.test.js tests/laboratorioRotasIntegracao.test.js tests/laboratorioPreparacao.test.js
node --check src/observabilidade/metricas.js
node --check src/app.js
node --check laboratorio/app.cjs
```

Os testes de observabilidade executam os dois apps reais com Express e routers
simulados, usando require fechado para impedir acesso incidental ao banco.
O npm informa que `prom-client@15.1.3` foi descontinuado; esta dependencia foi
mantida por requisito explicito desta etapa. Suas tres dependencias transitivas
sao instaladas automaticamente; nenhuma outra dependencia direta foi adicionada.

## Preparacao para AWS

O modulo e as consultas PromQL sao independentes de infraestrutura. Na implantacao
futura, mantenha o endpoint apenas em rede privada, configure TLS, injete credenciais
por Secrets Manager/SSM e restrinja security groups ao coletor. Adapte os alvos e o
armazenamento persistente conforme o servico escolhido, revise as versoes fixadas e
as politicas de retencao/backup. Este Compose nao provisiona AWS e nao e um deploy.

Referencias: [configuracao Prometheus](https://prometheus.io/docs/prometheus/latest/configuration/),
[segredos no Grafana Docker](https://grafana.com/docs/grafana/latest/setup-grafana/configure-docker/),
[provisionamento Grafana](https://grafana.com/docs/grafana/latest/administration/provisioning/).
