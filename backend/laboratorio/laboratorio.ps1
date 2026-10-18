# PREPARADO PARA REVISAO. Nenhuma etapa altera banco sem -Executar e confirmacao exata.
[CmdletBinding()]
param(
  [ValidateSet('Plano', 'Criar', 'Migrar', 'Backend', 'Validar')][string]$Etapa = 'Plano',
  [ValidatePattern('\Anr33_lab_[0-9]{8}_[a-f0-9]{6}\z')][string]$Banco = 'nr33_lab_20261018_702a9f',
  [switch]$Executar,
  [string]$Confirmacao,
  [Security.SecureString]$SenhaAdministrador,
  [Security.SecureString]$SenhaAplicacao
)
$ErrorActionPreference = 'Stop'
$containerLab = $Banco.Replace('_', '-')
$redeLab = "$containerLab-rede"
$idLab = $Banco.Substring('nr33_lab_'.Length)
$imagemLab = 'postgres:17.10'
$encodingLabAnterior = $OutputEncoding

function Exigir-Sucesso {
  if ($LASTEXITCODE -ne 0) { throw 'Comando de laboratorio falhou. Nenhuma limpeza automatica sera executada.' }
}
function Converter-SenhaSintetica([Security.SecureString]$Senha) {
  if ($null -eq $Senha) { throw 'Senha sintetica nova obrigatoria.' }
  $ponteiroLab = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Senha)
  try { $valorLab = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiroLab) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiroLab) }
  if ($valorLab -notmatch '^[A-Za-z0-9_-]{32,128}$') { throw 'Senha sintetica deve ter 32 a 128 caracteres A-Z, a-z, 0-9, _ ou -.' }
  return $valorLab
}
function Confirmar-DockerLocal {
  if ($env:DOCKER_HOST -or $env:DOCKER_CONTEXT -or $env:NODE_OPTIONS) { throw 'Overrides de Docker/NODE_OPTIONS nao sao permitidos nesta entrada.' }
  $endpointLab = & docker context inspect --format '{{.Endpoints.docker.Host}}'
  Exigir-Sucesso
  if ($endpointLab -notin @('npipe:////./pipe/dockerDesktopLinuxEngine', 'npipe:////./pipe/docker_engine')) { throw 'Docker local Windows nao comprovado.' }
}
function Confirmar-Container {
  Confirmar-DockerLocal
  $formatoLab = '{"labels":{{json .Config.Labels}},"ports":{{json .HostConfig.PortBindings}},"image":{{json .Config.Image}},"running":{{json .State.Running}}}'
  $infoLab = (& docker inspect --format $formatoLab $containerLab | ConvertFrom-Json)
  Exigir-Sucesso
  $bindingLab = @($infoLab.ports.'5432/tcp')
  if ($infoLab.labels.'nr33.lab.id' -ne $idLab -or $infoLab.image -ne $imagemLab -or -not $infoLab.running -or
      $bindingLab.Count -ne 1 -or $bindingLab[0].HostIp -ne '127.0.0.1' -or $bindingLab[0].HostPort -ne '55432') {
    throw 'Identidade/porta do container descartavel divergente.'
  }
}

if ($Etapa -eq 'Plano') {
  [pscustomobject]@{ Banco = $Banco; Container = $containerLab; Rede = $redeLab; Imagem = $imagemLab; PostgreSQL = '127.0.0.1:55432'; Backend = '127.0.0.1:3001'; Frontend = '127.0.0.1:5174'; Executado = $false }
  return
}
if (-not $Executar -or $Confirmacao -cne "$($Etapa.ToUpperInvariant()) $Banco") { throw 'Execucao bloqueada. Exige aprovacao especifica, -Executar e confirmacao exata do destino.' }
foreach ($chaveSensivelLab in @('DB_PASSWORD','JWT_SECRET','POSTGRES_PASSWORD','PGPASSWORD','PGSERVICEFILE','PGPASSFILE','DATABASE_URL')) {
  if (Test-Path -LiteralPath "Env:$chaveSensivelLab") { throw 'Variavel de credencial preexistente detectada. Use sessao isolada sem configuracoes reais.' }
}

try {
  $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  if ($Etapa -eq 'Criar') {
    Confirmar-DockerLocal
    & docker image inspect $imagemLab --format '{{.Id}}' | Out-Null
    Exigir-Sucesso # Nunca baixa imagem automaticamente.
    $containerExistenteLab = & docker container ls --all --filter "name=^/$containerLab$" --format '{{.Names}}'
    Exigir-Sucesso
    if ($containerExistenteLab) { throw 'Container ja existe. Reutilizacao automatica proibida.' }
    $redeExistenteLab = & docker network ls --filter "name=^$redeLab$" --format '{{.Name}}'
    Exigir-Sucesso
    if ($redeExistenteLab) { throw 'Rede ja existe. Reutilizacao automatica proibida.' }
    $senhaAdminLab = Converter-SenhaSintetica $SenhaAdministrador
    $senhaAdminAnterior = $env:POSTGRES_PASSWORD
    try {
      $env:POSTGRES_PASSWORD = $senhaAdminLab
      & docker network create --internal --label "nr33.lab.id=$idLab" $redeLab | Out-Null
      Exigir-Sucesso
      & docker run --detach --pull=never --name $containerLab --label "nr33.lab.id=$idLab" --network $redeLab `
        --publish '127.0.0.1:55432:5432' --env "POSTGRES_DB=$Banco" --env POSTGRES_PASSWORD `
        --env 'POSTGRES_INITDB_ARGS=--encoding=UTF8 --locale=C' `
        --health-cmd "pg_isready -h /var/run/postgresql -U postgres -d $Banco" --health-interval=2s --health-timeout=3s --health-retries=30 `
        --tmpfs '/var/lib/postgresql/data:rw' $imagemLab | Out-Null
      Exigir-Sucesso
    } finally { $env:POSTGRES_PASSWORD = $senhaAdminAnterior; $senhaAdminLab = $null }
    Write-Output 'Container novo solicitado. Dados em tmpfs: parar o container pode descarta-los. Nenhum banco existente foi utilizado.'
  } elseif ($Etapa -eq 'Migrar') {
    Confirmar-Container
    $saudeLab = & docker inspect --format '{{.State.Health.Status}}' $containerLab
    Exigir-Sucesso
    if ($saudeLab -ne 'healthy') { throw 'PostgreSQL sintetico ainda nao esta pronto. Aguarde antes de migrar.' }
    $senhaAppLab = Converter-SenhaSintetica $SenhaAplicacao
    $sqlLab = & node (Join-Path $PSScriptRoot 'montar-sql.cjs') --banco $Banco
    Exigir-Sucesso
    # Adiciona papel limitado dentro da MESMA transacao; nao imprime senha/SQL.
    $sqlLab = ($sqlLab -join "`n") -replace 'COMMIT;\s*$', @"
CREATE ROLE nr33_lab_app LOGIN PASSWORD '$senhaAppLab' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE ALL ON DATABASE $Banco FROM PUBLIC;
GRANT CONNECT ON DATABASE $Banco TO nr33_lab_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO nr33_lab_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nr33_lab_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nr33_lab_app;
COMMIT;
"@
    $sqlLab | & docker exec --interactive --env 'PGOPTIONS=-c nr33.laboratorio=passo702' $containerLab `
      psql --no-psqlrc --host=/var/run/postgresql --port=5432 --username=postgres --dbname=$Banco --set=ON_ERROR_STOP=1 --file=-
    Exigir-Sucesso
    $sqlLab = $null; $senhaAppLab = $null
  } elseif ($Etapa -eq 'Validar') {
    Confirmar-Container
    Get-Content -LiteralPath (Join-Path $PSScriptRoot 'validar-integridade.sql') -Raw -Encoding UTF8 |
      & docker exec --interactive --env 'PGOPTIONS=-c nr33.laboratorio=passo702' $containerLab `
      psql --no-psqlrc --host=/var/run/postgresql --port=5432 --username=postgres --dbname=$Banco --set=ON_ERROR_STOP=1 --file=-
    Exigir-Sucesso
  } elseif ($Etapa -eq 'Backend') {
    Confirmar-Container
    $variaveisLab = @('DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD','JWT_SECRET','JWT_ISSUER','JWT_AUDIENCE','JWT_EXPIRES_IN','NR33_LAB_AUTORIZADO')
    $anterioresLab = @{}
    foreach ($nomeLab in $variaveisLab) { $anterioresLab[$nomeLab] = [Environment]::GetEnvironmentVariable($nomeLab, 'Process') }
    try {
      $env:DB_HOST = '127.0.0.1'; $env:DB_PORT = '55432'; $env:DB_NAME = $Banco; $env:DB_USER = 'nr33_lab_app'
      $env:DB_PASSWORD = Converter-SenhaSintetica $SenhaAplicacao
      $env:JWT_SECRET = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
      $env:JWT_ISSUER = 'nr33-laboratorio'; $env:JWT_AUDIENCE = 'nr33-laboratorio-browser'; $env:JWT_EXPIRES_IN = '1h'
      $env:NR33_LAB_AUTORIZADO = 'PASSO702'
      & node (Join-Path $PSScriptRoot 'servidor.cjs')
      Exigir-Sucesso
    } finally {
      foreach ($nomeLab in $variaveisLab) { [Environment]::SetEnvironmentVariable($nomeLab, $anterioresLab[$nomeLab], 'Process') }
    }
  }
} finally { $OutputEncoding = $encodingLabAnterior }
