# Importação pura. Sem gravação, redefinição de senha ou leitura de .env.
function Obter-ArquivoCredencialAplicacao {
  return Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'NR33-Dev-Privado\passo715-0f96ec9838574923b700d425574629b8\aplicacao.clixml'
}
function Ler-CredencialAplicacaoSalva {
  param([string]$Arquivo = (Obter-ArquivoCredencialAplicacao))
  try {
    $raizCredSalva = [IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'NR33-Dev-Privado')) + [IO.Path]::DirectorySeparatorChar
    $arquivoCredSalva = [IO.Path]::GetFullPath($Arquivo)
    if (-not $arquivoCredSalva.StartsWith($raizCredSalva, [StringComparison]::OrdinalIgnoreCase)) { throw 'Destino recusado.' }
    . (Join-Path $PSScriptRoot 'hmac-protegido-local.ps1')
    Confirmar-PaisHmacLocal $arquivoCredSalva
    Confirmar-AclHmacLocal ([IO.Path]::GetDirectoryName($arquivoCredSalva)) $true
    Confirmar-AclHmacLocal $arquivoCredSalva $false
    $credencialSalva = Import-Clixml -LiteralPath $arquivoCredSalva -ErrorAction Stop
    if ($credencialSalva -isnot [Management.Automation.PSCredential] -or $credencialSalva.UserName -cne 'nr33_dev_app' -or
        $credencialSalva.Password.Length -lt 1 -or $credencialSalva.Password.Length -gt 4096) { throw 'Credencial incompatível.' }
    return $credencialSalva
  } catch { throw 'CLIXML_INDISPONIVEL: confira arquivo, identidade Windows, DPAPI e ACL privada; nenhum segredo foi exibido.' }
}
function Testar-CredencialAplicacaoPostgres([Management.Automation.PSCredential]$Credencial) {
  $processoCred = $null; $ponteiroCred = [IntPtr]::Zero; $textoCred = $null; $jsonCred = $null; $bytesCred = $null
  try {
    if ($Credencial.UserName -cne 'nr33_dev_app') { throw 'Identidade incorreta.' }
    $infoCred = New-Object Diagnostics.ProcessStartInfo
    $infoCred.FileName = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
    $infoCred.Arguments = '"' + (Join-Path $PSScriptRoot 'verificar-credencial-aplicacao.cjs') + '"'
    $infoCred.UseShellExecute=$false; $infoCred.CreateNoWindow=$true
    $infoCred.RedirectStandardInput=$true; $infoCred.RedirectStandardOutput=$true; $infoCred.RedirectStandardError=$true
    $infoCred.EnvironmentVariables.Clear()
    foreach ($nomeCred in @('SystemRoot','WINDIR','TEMP','TMP')) {
      $valorCred = [Environment]::GetEnvironmentVariable($nomeCred,'Process')
      if ($null -ne $valorCred) { $infoCred.EnvironmentVariables[$nomeCred]=$valorCred }
    }
    $processoCred = New-Object Diagnostics.Process; $processoCred.StartInfo=$infoCred
    [void]$processoCred.Start()
    $saidaCred=$processoCred.StandardOutput.ReadToEndAsync(); $erroCred=$processoCred.StandardError.ReadToEndAsync()
    $ponteiroCred=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Credencial.Password)
    $textoCred=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiroCred)
    $jsonCred=@{senha=$textoCred} | ConvertTo-Json -Compress
    $bytesCred=[Text.Encoding]::UTF8.GetBytes($jsonCred)
    $processoCred.StandardInput.BaseStream.Write($bytesCred,0,$bytesCred.Length); $processoCred.StandardInput.Close()
    if (-not $processoCred.WaitForExit(20000)) { throw 'POSTGRES_INDISPONIVEL' }
    $respostaCred=$saidaCred.GetAwaiter().GetResult(); $codigoCred=$erroCred.GetAwaiter().GetResult()
    if ($processoCred.ExitCode -ne 0) {
      if ($codigoCred -cin @('CREDENCIAL_DIVERGENTE','POSTGRES_INDISPONIVEL','DESTINO_INVALIDO','CREDENCIAL_INVALIDA')) { throw $codigoCred }
      throw 'CANAL_PRIVADO_INVALIDO'
    }
    $objetoCred = $respostaCred | ConvertFrom-Json
    if ($objetoCred.autenticada -ne $true -or $objetoCred.papel -cne 'nr33_dev_app' -or $objetoCred.banco -cne 'inventario_nr33_multitenant_dev' -or $objetoCred.versao -ne 17) { throw 'DESTINO_INVALIDO' }
    return $objetoCred
  } finally {
    if ($ponteiroCred -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiroCred) }
    $textoCred=$null; $jsonCred=$null
    if ($null -ne $bytesCred) { [Array]::Clear($bytesCred,0,$bytesCred.Length) }
    if ($null -ne $processoCred) {
      try { if (-not $processoCred.HasExited) { $processoCred.Kill(); $processoCred.WaitForExit() } } catch { }
      $processoCred.Dispose()
    }
  }
}
