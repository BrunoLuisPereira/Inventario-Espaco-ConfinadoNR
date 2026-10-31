param([string]$Banco, [switch]$Executar, [string]$Confirmacao)
$ErrorActionPreference = 'Stop'
# Sem -Executar: plano puro, sem senha e sem conexão.
if (-not $Executar) {
  if ($Banco -or $Confirmacao) { throw 'Para o plano, não informe destino ou confirmação.' }
  & node (Join-Path $PSScriptRoot 'migrar-recuperacao-024.cjs') --plano
  exit $LASTEXITCODE
}
if ($Banco -cne 'inventario_nr33_multitenant_dev' -or $Confirmacao -cne 'APLICAR 024 inventario_nr33_multitenant_dev') {
  throw 'Destino ou confirmação recusados antes da coleta de senha.'
}
$senha024 = $null; $processo024 = $null; $ponteiro024 = [IntPtr]::Zero; $bytes024 = $null
$texto024 = $null; $json024 = $null
try {
  $senha024 = Read-Host 'Senha do operador postgres para 127.0.0.1:5432/inventario_nr33_multitenant_dev (024)' -AsSecureString
  if ($senha024.Length -eq 0) { throw 'Entrada vazia.' }
  $inicio024 = New-Object Diagnostics.ProcessStartInfo
  $inicio024.FileName = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
  $inicio024.Arguments = '"' + (Join-Path $PSScriptRoot 'migration-024-canal.cjs') + '"'
  $inicio024.UseShellExecute = $false; $inicio024.CreateNoWindow = $true
  $inicio024.RedirectStandardInput = $true; $inicio024.RedirectStandardOutput = $true; $inicio024.RedirectStandardError = $true
  $inicio024.EnvironmentVariables.Clear()
  foreach ($nome024 in @('SystemRoot', 'WINDIR', 'TEMP', 'TMP')) {
    $valor024 = [Environment]::GetEnvironmentVariable($nome024, 'Process')
    if ($null -ne $valor024) { $inicio024.EnvironmentVariables[$nome024] = $valor024 }
  }
  $processo024 = New-Object Diagnostics.Process
  $processo024.StartInfo = $inicio024
  [void]$processo024.Start()
  $saida024 = $processo024.StandardOutput.ReadToEndAsync(); $erro024 = $processo024.StandardError.ReadToEndAsync()
  $ponteiro024 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($senha024)
  $texto024 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro024)
  $json024 = @{ banco=$Banco; operador='postgres'; senha=$texto024; confirmacao=$Confirmacao } | ConvertTo-Json -Compress
  $bytes024 = [Text.Encoding]::UTF8.GetBytes($json024)
  $processo024.StandardInput.BaseStream.Write($bytes024, 0, $bytes024.Length)
  $processo024.StandardInput.Close()
  $processo024.WaitForExit()
  [void]$saida024.GetAwaiter().GetResult(); [void]$erro024.GetAwaiter().GetResult()
  if ($processo024.ExitCode -ne 0) { throw 'Operação não confirmada.' }
  Write-Output 'Migration 024 concluída e pós-condições verificadas. Validar login antes de habilitar SMTP local.'
} catch { throw 'Migration 024 recusada ou interrompida. Verificar catálogo antes de repetir; nenhuma credencial foi registrada.' }
finally {
  if ($ponteiro024 -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro024) }
  $texto024 = $null; $json024 = $null
  if ($null -ne $bytes024) { [Array]::Clear($bytes024, 0, $bytes024.Length) }
  if ($null -ne $senha024) { $senha024.Dispose() }
  if ($null -ne $processo024) {
    try { if (-not $processo024.HasExited) { $processo024.Kill(); $processo024.WaitForExit() } } catch { }
    $processo024.Dispose()
  }
}
