[CmdletBinding()]
param([switch]$Executar, [string]$Confirmacao, [switch]$EntradaGrafica)
$ErrorActionPreference='Stop'
if (-not $Executar -or $Confirmacao -cne 'SINCRONIZAR nr33_dev_app inventario_nr33_multitenant_dev') {
  throw 'Nenhuma alteração executada. Exige -Executar e confirmação exata da sincronização de nr33_dev_app.'
}
. (Join-Path $PSScriptRoot 'backend\laboratorio\credencial-aplicacao-salva.ps1')
$credSync=$null; $adminSync=$null; $janelaSync=$null; $processoSync=$null; $ponteiroSync=[IntPtr]::Zero; $ponteiroAdminSync=[IntPtr]::Zero; $bytesSync=$null
$textoSync=$null; $textoAdminSync=$null; $jsonSync=$null
try {
  $credSync=Ler-CredencialAplicacaoSalva
  if ($EntradaGrafica) {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $janelaSync=New-Object Windows.Forms.Form
    $janelaSync.Text='NR33 — sincronização PostgreSQL autorizada'
    $janelaSync.Size=New-Object Drawing.Size(680,255)
    $janelaSync.StartPosition='CenterScreen'; $janelaSync.TopMost=$true
    $rotuloSync=New-Object Windows.Forms.Label
    $rotuloSync.Text="Destino: 127.0.0.1:5432/inventario_nr33_multitenant_dev`nSomente a senha de nr33_dev_app será sincronizada com o CLIXML existente.`nInforme a senha PostgreSQL do operador postgres (não a senha mestra do pgAdmin)."
    $rotuloSync.SetBounds(15,15,635,70)
    $campoSync=New-Object Windows.Forms.TextBox
    $campoSync.SetBounds(15,95,630,25); $campoSync.UseSystemPasswordChar=$true
    $okSync=New-Object Windows.Forms.Button
    $okSync.Text='Confirmar sincronização'; $okSync.SetBounds(15,145,240,30); $okSync.DialogResult='OK'
    $cancelarSync=New-Object Windows.Forms.Button
    $cancelarSync.Text='Cancelar'; $cancelarSync.SetBounds(300,145,140,30); $cancelarSync.DialogResult='Cancel'
    $janelaSync.Controls.AddRange(@($rotuloSync,$campoSync,$okSync,$cancelarSync))
    $janelaSync.AcceptButton=$okSync; $janelaSync.CancelButton=$cancelarSync
    if ($janelaSync.ShowDialog() -ne 'OK' -or -not $campoSync.Text) { Write-Output 'Cancelado; nenhuma senha alterada.'; return }
    $adminSync=ConvertTo-SecureString $campoSync.Text -AsPlainText -Force
    $campoSync.Clear(); $janelaSync.Dispose(); $janelaSync=$null
  } else {
    Write-Host 'Será sincronizada somente a senha PostgreSQL de nr33_dev_app com o CLIXML existente.'
    if ((Read-Host 'Digite SINCRONIZAR para confirmar') -cne 'SINCRONIZAR') { Write-Output 'Cancelado; nenhuma alteração.'; return }
    $adminSync=Read-Host 'Senha PostgreSQL de postgres' -AsSecureString
  }
  $infoSync=New-Object Diagnostics.ProcessStartInfo
  $infoSync.FileName=(Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
  $infoSync.Arguments='"'+(Join-Path $PSScriptRoot 'backend\laboratorio\sincronizar-credencial-aplicacao.cjs')+'"'
  $infoSync.UseShellExecute=$false; $infoSync.CreateNoWindow=$true
  $infoSync.RedirectStandardInput=$true; $infoSync.RedirectStandardOutput=$true; $infoSync.RedirectStandardError=$true
  $infoSync.EnvironmentVariables.Clear()
  foreach ($nomeSync in @('SystemRoot','WINDIR','TEMP','TMP')) { $valorSync=[Environment]::GetEnvironmentVariable($nomeSync,'Process'); if ($null -ne $valorSync) { $infoSync.EnvironmentVariables[$nomeSync]=$valorSync } }
  $processoSync=New-Object Diagnostics.Process; $processoSync.StartInfo=$infoSync
  [void]$processoSync.Start()
  $saidaSync=$processoSync.StandardOutput.ReadToEndAsync(); $erroSync=$processoSync.StandardError.ReadToEndAsync()
  $ponteiroSync=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($credSync.Password)
  $ponteiroAdminSync=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSync)
  $textoSync=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiroSync)
  $textoAdminSync=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiroAdminSync)
  $jsonSync=@{confirmacao=$Confirmacao;senha=$textoSync;admin=$textoAdminSync} | ConvertTo-Json -Compress
  $bytesSync=[Text.Encoding]::UTF8.GetBytes($jsonSync)
  $processoSync.StandardInput.BaseStream.Write($bytesSync,0,$bytesSync.Length); $processoSync.StandardInput.Close()
  if (-not $processoSync.WaitForExit(30000)) { throw 'Resultado incerto.' }
  $resultadoSync=$saidaSync.GetAwaiter().GetResult(); $codigoSeguroSync=$erroSync.GetAwaiter().GetResult()
  if ($processoSync.ExitCode -ne 0) {
    if ($codigoSeguroSync -cmatch '\A(SINCRONIZACAO_RECUSADA_(AUTENTICACAO_ADMIN|DESTINO|PAPEL|ALTERACAO_PASSWORD)|ADMIN_AUTENTICACAO_RECUSADA|RESULTADO_INCERTO_VERIFICAR_SEM_REPETIR|CREDENCIAL_DIVERGENTE)\z') { throw $codigoSeguroSync }
    throw 'Sincronização não confirmada.'
  }
  $statusSync=$resultadoSync | ConvertFrom-Json
  if ($statusSync.sincronizada -ne $true -or $statusSync.autenticada -ne $true) { throw 'Não confirmado.' }
  Write-Output 'SINCRONIZACAO_OK; POSTGRES_AUTENTICADO; CLIXML_PRESERVADO'
} catch {
  if ($_.Exception.Message -cmatch '\A(SINCRONIZACAO_RECUSADA_(AUTENTICACAO_ADMIN|DESTINO|PAPEL|ALTERACAO_PASSWORD)|ADMIN_AUTENTICACAO_RECUSADA|RESULTADO_INCERTO_VERIFICAR_SEM_REPETIR|CREDENCIAL_DIVERGENTE)\z') { throw $_.Exception.Message }
  throw 'Sincronização não confirmada. Verifique a credencial sem repetir automaticamente. Nenhum detalhe privado foi exibido.'
}
finally {
  if ($ponteiroSync -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiroSync) }
  if ($ponteiroAdminSync -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiroAdminSync) }
  $textoSync=$null; $textoAdminSync=$null; $jsonSync=$null
  if ($null -ne $bytesSync) { [Array]::Clear($bytesSync,0,$bytesSync.Length) }
  if ($null -ne $credSync) { $credSync.Password.Dispose() }; if ($null -ne $adminSync) { $adminSync.Dispose() }
  if ($null -ne $janelaSync) { $janelaSync.Dispose() }
  if ($null -ne $processoSync) { try { if (-not $processoSync.HasExited) { $processoSync.Kill(); $processoSync.WaitForExit() } } catch { }; $processoSync.Dispose() }
}
