# Sem parametros de destino. Nao executa migrations ou modifica autenticacao.
$ErrorActionPreference = 'Stop'
$credIdioma027 = $null
$ptrIdioma027 = [IntPtr]::Zero
$charsIdioma027 = $null
$bytesIdioma027 = $null
$procIdioma027 = $null
try {
  . (Join-Path $PSScriptRoot 'credencial-aplicacao-salva.ps1')
  $credIdioma027 = Ler-CredencialAplicacaoSalva
  if ($credIdioma027.UserName -cne 'nr33_dev_app') { throw 'DESTINO_INVALIDO' }
  $infoIdioma027 = New-Object Diagnostics.ProcessStartInfo
  $infoIdioma027.FileName = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
  $infoIdioma027.Arguments = '"' + (Join-Path $PSScriptRoot 'diagnosticar-idioma027.cjs') + '"'
  $infoIdioma027.UseShellExecute = $false
  $infoIdioma027.CreateNoWindow = $true
  $infoIdioma027.RedirectStandardInput = $true
  $infoIdioma027.RedirectStandardOutput = $true
  $infoIdioma027.RedirectStandardError = $true
  $infoIdioma027.EnvironmentVariables.Clear()
  foreach ($nomeIdioma027 in @('SystemRoot', 'WINDIR', 'TEMP', 'TMP')) {
    $valorIdioma027 = [Environment]::GetEnvironmentVariable($nomeIdioma027, 'Process')
    if ($null -ne $valorIdioma027) { $infoIdioma027.EnvironmentVariables[$nomeIdioma027] = $valorIdioma027 }
  }
  $procIdioma027 = New-Object Diagnostics.Process
  $procIdioma027.StartInfo = $infoIdioma027
  [void]$procIdioma027.Start()
  $saidaIdioma027 = $procIdioma027.StandardOutput.ReadToEndAsync()
  $erroIdioma027 = $procIdioma027.StandardError.ReadToEndAsync()
  # Sem string gerenciada contendo senha no PowerShell: BSTR -> char[] -> bytes.
  $ptrIdioma027 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credIdioma027.Password)
  $charsIdioma027 = New-Object char[] $credIdioma027.Password.Length
  for ($iIdioma027 = 0; $iIdioma027 -lt $charsIdioma027.Length; $iIdioma027++) {
    $charsIdioma027[$iIdioma027] = [char]([Runtime.InteropServices.Marshal]::ReadInt16($ptrIdioma027, 2 * $iIdioma027) -band 65535)
  }
  $bytesIdioma027 = [Text.Encoding]::UTF8.GetBytes($charsIdioma027)
  $procIdioma027.StandardInput.BaseStream.Write($bytesIdioma027, 0, $bytesIdioma027.Length)
  $procIdioma027.StandardInput.Close()
  if (-not $procIdioma027.WaitForExit(30000)) { throw 'DIAGNOSTICO_TIMEOUT' }
  if ($procIdioma027.ExitCode -ne 0) {
    $codigoIdioma027 = $erroIdioma027.GetAwaiter().GetResult()
    if ($codigoIdioma027 -cin @('DESTINO_INVALIDO', 'TABELA_USUARIO_AUSENTE', 'CANAL_INVALIDO')) { throw $codigoIdioma027 }
    throw 'DIAGNOSTICO_027_INDISPONIVEL'
  }
  $resultadoIdioma027 = $saidaIdioma027.GetAwaiter().GetResult() | ConvertFrom-Json
  if ($resultadoIdioma027.destino.banco -cne 'inventario_nr33_multitenant_dev' -or
      $resultadoIdioma027.destino.usuario -cne 'nr33_dev_app' -or
      $resultadoIdioma027.destino.host -cne '127.0.0.1' -or $resultadoIdioma027.destino.porta -ne 5432) {
    throw 'DESTINO_INVALIDO'
  }
  $resultadoIdioma027 | ConvertTo-Json -Depth 8
} catch {
  $codigoIdioma027 = 'DIAGNOSTICO_027_INTERROMPIDO_DETALHES_PRIVADOS_OMITIDOS'
  if ($_.Exception.Message -cin @('DESTINO_INVALIDO', 'TABELA_USUARIO_AUSENTE', 'CANAL_INVALIDO', 'DIAGNOSTICO_TIMEOUT')) {
    $codigoIdioma027 = $_.Exception.Message
  }
  Write-Output $codigoIdioma027
  exit 1
} finally {
  if ($ptrIdioma027 -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptrIdioma027) }
  if ($null -ne $charsIdioma027) { [Array]::Clear($charsIdioma027, 0, $charsIdioma027.Length) }
  if ($null -ne $bytesIdioma027) { [Array]::Clear($bytesIdioma027, 0, $bytesIdioma027.Length) }
  if ($null -ne $credIdioma027) { $credIdioma027.Password.Dispose() }
  if ($null -ne $procIdioma027) {
    try { if (-not $procIdioma027.HasExited) { $procIdioma027.Kill(); $procIdioma027.WaitForExit() } } catch { }
    $procIdioma027.Dispose()
  }
  $credIdioma027 = $null; $ptrIdioma027 = [IntPtr]::Zero
  $charsIdioma027 = $null; $bytesIdioma027 = $null; $procIdioma027 = $null
}
