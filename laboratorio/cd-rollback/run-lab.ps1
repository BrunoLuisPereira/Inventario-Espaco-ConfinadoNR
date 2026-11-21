$ErrorActionPreference = 'Stop'
if ($env:DOCKER_HOST) { throw 'Remova DOCKER_HOST; usar somente Docker Desktop local descartavel' }
$taskEndpoint = & docker context inspect --format '{{.Endpoints.docker.Host}}'
if ($LASTEXITCODE -ne 0 -or $taskEndpoint -notlike 'npipe:*') {
    throw 'Este launcher exige Docker Desktop local via named pipe; nao usar daemon remoto ou EC2'
}
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskName = 'nr33-rollback-lab-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$taskOutput = Join-Path $taskRoot ('laboratorio/cd-rollback/results/' + $taskName)
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
Push-Location $taskRoot
try {
    & docker build -f laboratorio/cd-rollback/Dockerfile -t nr33-cd-rollback-lab:cd237 .
    if ($LASTEXITCODE -ne 0) { throw 'Falha no build; ensaio PENDENTE' }
    # Privilegios apenas na VM Docker descartavel, sem bind mount, portas ou rede.
    & docker run -d --name $taskName --privileged --cgroupns private --network none --tmpfs /run --tmpfs /run/lock nr33-cd-rollback-lab:cd237
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar Linux; ensaio PENDENTE' }
    & docker exec $taskName bash -c 'for attempt in {1..30}; do systemctl show-environment >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1'
    if ($LASTEXITCODE -ne 0) { throw 'systemd indisponivel; ensaio PENDENTE' }
    & docker exec $taskName /opt/nr33-lab/run.sh
    if ($LASTEXITCODE -ne 0) { throw 'Ensaio falhou: consultar evidencias; nao declarar rollback testado' }
}
finally {
    & docker logs $taskName 2>&1 | Out-File (Join-Path $taskOutput 'container.log') -Encoding utf8
    & docker cp "${taskName}:/lab-results/." $taskOutput
    & docker image inspect nr33-cd-rollback-lab:cd237 | Out-File (Join-Path $taskOutput 'image.json') -Encoding utf8
    & docker inspect $taskName | Out-File (Join-Path $taskOutput 'container.json') -Encoding utf8
    & docker rm -f $taskName
    Pop-Location
    Write-Host "Evidencias: $taskOutput"
}
