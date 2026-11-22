param([switch]$NoCache)
$ErrorActionPreference = 'Stop'
if ($env:DOCKER_HOST) { throw 'Usar somente Docker Desktop local' }
$taskEndpoint = & docker context inspect --format '{{.Endpoints.docker.Host}}'
if ($LASTEXITCODE -ne 0 -or $taskEndpoint -notlike 'npipe:*') { throw 'Daemon remoto proibido' }
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskName = 'nr33-cd-real-fixtures-' + [Guid]::NewGuid().ToString('N').Substring(0,12)
$taskOutput = Join-Path $PSScriptRoot ('results/' + $taskName)
$taskStaging = Join-Path $PSScriptRoot 'staging'
if (Test-Path -LiteralPath $taskStaging) {
    $taskSpec = Get-Content (Join-Path $taskStaging 'input.json') -Raw | ConvertFrom-Json
    if ($taskSpec.source_kind -ne 'fixtures') { throw 'Staging de releases reais: nao sobrescrever' }
}
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
Push-Location $taskRoot
$taskStarted = $false
try {
    if (-not (Test-Path -LiteralPath $taskStaging)) {
        & python -B laboratorio/cd-real/fixtures.py
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar fixtures' }
    }
    $taskBuildOptions = @()
    if ($NoCache) { $taskBuildOptions += '--no-cache' }
    & docker build @taskBuildOptions -f laboratorio/cd-real/Dockerfile -t nr33-cd-real:fixtures .
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao construir imagem' }
    & docker run -d --name $taskName --user 0:0 --privileged --cgroupns private --network none --tmpfs /run --tmpfs /run/lock nr33-cd-real:fixtures /sbin/init
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar container' }
    $taskStarted = $true
    & docker exec $taskName bash -c 'for attempt in {1..30}; do systemctl show-environment >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1'
    if ($LASTEXITCODE -ne 0) { throw 'systemd indisponivel' }
    & docker exec $taskName /opt/nr33-lab/run.sh --fixtures
    if ($LASTEXITCODE -ne 0) { throw 'Ensaio falhou: nao promover evidencias' }
}
finally {
    if ($taskStarted) {
        & docker cp "${taskName}:/lab-results/." $taskOutput
        & docker logs $taskName 2>&1 | Out-File (Join-Path $taskOutput 'container.log') -Encoding utf8
        & docker inspect $taskName | Out-File (Join-Path $taskOutput 'container.json') -Encoding utf8
        & docker image inspect nr33-cd-real:fixtures | Out-File (Join-Path $taskOutput 'image.json') -Encoding utf8
        & docker rm -f -v $taskName
    }
    Pop-Location
    Write-Host "Fixtures apenas. Evidencias: $taskOutput. Staging preservado: $taskStaging"
}
