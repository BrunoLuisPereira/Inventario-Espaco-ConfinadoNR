$ErrorActionPreference='Stop'
$raizPathextTeste=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
. (Join-Path $raizPathextTeste 'iniciar-recuperacao-local.ps1')
$nodePathextTeste=(Get-Command node.exe -CommandType Application).Source
$powershellPathextTeste=(Get-Command powershell.exe -CommandType Application).Source
$opcoesAnterioresPathextTeste=[Environment]::GetEnvironmentVariable('NODE_OPTIONS','Process')
$filhoPathextTeste=$null
try {
  # Não deve ser herdado; caso contrário o Node recusa carregar a fixture.
  $env:NODE_OPTIONS='--require=NAO_CARREGAR_FIXTURE_PATHEXT'
  $fontePathextTeste='& node -e "if(process.env.NODE_OPTIONS)process.exit(9);process.stdout.write(''PATHEXT_OK'')"; exit $LASTEXITCODE'
  $encodedPathextTeste=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($fontePathextTeste))
  $filhoPathextTeste=Novo-ProcessoRecuperacao $powershellPathextTeste ('-NoProfile -EncodedCommand '+$encodedPathextTeste) $raizPathextTeste @{PATH=[IO.Path]::GetDirectoryName($nodePathextTeste)}
  if (-not $filhoPathextTeste.Processo.WaitForExit(10000)) { throw 'Timeout na fixture PATHEXT.' }
  $saidaPathextTeste=$filhoPathextTeste.Saida.GetAwaiter().GetResult()
  if ($filhoPathextTeste.Processo.ExitCode -ne 0 -or $saidaPathextTeste.Trim() -cne 'PATHEXT_OK') { throw 'Node sem extensão falhou no ambiente isolado.' }
  Write-Output 'APROVADO: node resolvido via PATHEXT; NODE_OPTIONS não herdado; sem PostgreSQL ou envio.'
} finally {
  [Environment]::SetEnvironmentVariable('NODE_OPTIONS',$opcoesAnterioresPathextTeste,'Process')
  if ($null -ne $filhoPathextTeste) {
    try { if (-not $filhoPathextTeste.Processo.HasExited) { $filhoPathextTeste.Processo.Kill(); $filhoPathextTeste.Processo.WaitForExit() } } catch { }
    $filhoPathextTeste.Processo.Dispose()
  }
}
