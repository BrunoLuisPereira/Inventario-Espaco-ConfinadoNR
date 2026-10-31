# Filho privado do supervisor. Sem senha em argumentos, arquivos ou ambiente.
$ErrorActionPreference = 'Stop'
$entradaInicio = $null; $textoInicio = $null; $senhaInicio = $null; $verificadorInicio = $null; $bytesInicio = $null
$etapaInicio = 'CANAL_PRIVADO'
try {
  $textoInicio = [Console]::In.ReadToEnd()
  if ($textoInicio.Length -gt 32768) { throw 'CANAL_PRIVADO' }
  $entradaInicio = $textoInicio | ConvertFrom-Json
  if ($entradaInicio.senha -isnot [string] -or $entradaInicio.senha.Length -lt 1 -or $entradaInicio.senha.Length -gt 4096 -or $entradaInicio.senha.Contains([string][char]0)) { throw 'CREDENCIAL_POSTGRES' }
  $senhaInicio = ConvertTo-SecureString $entradaInicio.senha -AsPlainText -Force
  $etapaInicio = 'PRECHECK_PROCESSO'
  $infoInicio = New-Object Diagnostics.ProcessStartInfo
  $infoInicio.FileName = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
  $infoInicio.Arguments = '"' + (Join-Path $PSScriptRoot 'verificar-inicio-recuperacao.cjs') + '"'
  $infoInicio.UseShellExecute = $false; $infoInicio.CreateNoWindow = $true
  $infoInicio.RedirectStandardInput = $true; $infoInicio.RedirectStandardOutput = $true; $infoInicio.RedirectStandardError = $true
  $verificadorInicio = New-Object Diagnostics.Process
  $verificadorInicio.StartInfo = $infoInicio
  [void]$verificadorInicio.Start()
  $saidaInicio = $verificadorInicio.StandardOutput.ReadToEndAsync()
  $erroInicio = $verificadorInicio.StandardError.ReadToEndAsync()
  $bytesInicio = [Text.Encoding]::UTF8.GetBytes($textoInicio)
  $verificadorInicio.StandardInput.BaseStream.Write($bytesInicio, 0, $bytesInicio.Length)
  $verificadorInicio.StandardInput.Close()
  [Array]::Clear($bytesInicio, 0, $bytesInicio.Length); $bytesInicio = $null
  $entradaInicio.senha = $null; $textoInicio = $null
  if (-not $verificadorInicio.WaitForExit(20000)) { throw 'POSTGRES_INDISPONIVEL' }
  [void]$saidaInicio.GetAwaiter().GetResult()
  $codigoInicio = $erroInicio.GetAwaiter().GetResult()
  if ($verificadorInicio.ExitCode -ne 0) {
    if ($codigoInicio -cin @('CREDENCIAL_POSTGRES','DESTINO_POSTGRES','FILA_PENDENTE','MIGRATION024_OU_PERMISSOES','POSTGRES_INDISPONIVEL')) { throw $codigoInicio }
    throw 'CANAL_PRIVADO'
  }
  $etapaInicio = 'LAUNCHER_SEGURO'
  & (Join-Path $PSScriptRoot 'postgres-local.ps1') -Etapa Backend -Banco inventario_nr33_multitenant_dev -Executar -Confirmacao 'BACKEND inventario_nr33_multitenant_dev' -SenhaAplicacao $senhaInicio
  if ($LASTEXITCODE -ne 0) { throw 'BACKEND_SEGURANCA' }
} catch {
  $codigoInicio = $_.Exception.Message
  if ($codigoInicio -cnotin @('CREDENCIAL_POSTGRES','DESTINO_POSTGRES','FILA_PENDENTE','MIGRATION024_OU_PERMISSOES','POSTGRES_INDISPONIVEL')) {
    if ($codigoInicio -match 'HMAC|Hmac') { $codigoInicio = 'HMAC_INDISPONIVEL' }
    elseif ($codigoInicio -match 'JWT|Jwt') { $codigoInicio = 'JWT_INDISPONIVEL' }
    elseif ($codigoInicio -match 'sessao isolada|overrides') { $codigoInicio = 'AMBIENTE_NAO_ISOLADO' }
    else { $codigoInicio = 'BACKEND_SEGURANCA_' + $etapaInicio }
  }
  [Console]::Error.WriteLine($codigoInicio)
  exit 1
} finally {
  $textoInicio = $null; if ($null -ne $entradaInicio) { $entradaInicio.senha = $null }
  if ($null -ne $senhaInicio) { $senhaInicio.Dispose() }
  if ($null -ne $bytesInicio) { [Array]::Clear($bytesInicio, 0, $bytesInicio.Length) }
  if ($null -ne $verificadorInicio) {
    try { if (-not $verificadorInicio.HasExited) { $verificadorInicio.Kill(); $verificadorInicio.WaitForExit() } } catch { }
    $verificadorInicio.Dispose()
  }
}
