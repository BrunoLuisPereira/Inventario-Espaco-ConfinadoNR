$ErrorActionPreference='Stop'
$pasta023=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../laboratorio'))
. (Join-Path $pasta023 'entrada-admin-023.ps1')
function Exigir023([bool]$condicao) { if (-not $condicao) { throw 'Falha no teste administrativo simulado.' } }
$script:perguntas023=0; $script:envios023=0; $script:cancelar023=$false; $script:falhar023=$false
function Solicitar-SenhaAdmin023 {
  $script:perguntas023++
  if ($script:cancelar023) { return $null }
  return ConvertTo-SecureString 'credencial-sintetica-023' -AsPlainText -Force
}
function Enviar-SenhaAdmin023([Security.SecureString]$Senha) {
  Exigir023 ($Senha -is [Security.SecureString])
  $script:envios023++
  if ($script:falhar023) { throw 'credencial-sintetica-023' }
}
$antes023=@{}
Get-ChildItem Env: | ForEach-Object { $antes023[$_.Name]=$_.Value }
$args023=@{Banco='inventario_nr33_multitenant_dev';Executar=$true;Confirmacao='APLICAR 023 inventario_nr33_multitenant_dev'}
try { Invocar-MigrationAdmin023 -Banco errado -Executar $true -Confirmacao x; throw 'Aceitou destino errado.' }
catch { Exigir023 ($script:perguntas023 -eq 0 -and $script:envios023 -eq 0) }
$script:cancelar023=$true
$cancelado023=Invocar-MigrationAdmin023 @args023
Exigir023 ($cancelado023 -match 'Cancelado' -and $script:envios023 -eq 0)
$script:cancelar023=$false
$saida023=Invocar-MigrationAdmin023 @args023
Exigir023 ($script:envios023 -eq 1 -and $saida023 -notmatch 'credencial-sintetica')
$script:falhar023=$true
try { Invocar-MigrationAdmin023 @args023; throw 'Aceitou falha.' }
catch { Exigir023 ($_.Exception.Message -notmatch 'credencial-sintetica') }
$depois023=@{}
Get-ChildItem Env: | ForEach-Object { $depois023[$_.Name]=$_.Value }
Exigir023 ($antes023.Count -eq $depois023.Count)
foreach($nome023 in $antes023.Keys) { Exigir023 ($antes023[$nome023] -ceq $depois023[$nome023]) }
foreach($arquivo023 in @('entrada-admin-023.ps1','executar-login-023.ps1')) {
  $tokens023=$null; $erros023=$null
  [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $pasta023 $arquivo023),[ref]$tokens023,[ref]$erros023)
  Exigir023 ($erros023.Count -eq 0)
}
$fonte023=[IO.File]::ReadAllText((Join-Path $pasta023 'entrada-admin-023.ps1'))
Exigir023 ($fonte023.Contains('UseSystemPasswordChar=$true'))
Exigir023 ($fonte023.Contains('$inicio023.EnvironmentVariables.Clear()'))
Exigir023 ($fonte023.Contains('$processo023.StandardInput.BaseStream.Write($bytes023,0,$bytes023.Length)'))
Exigir023 (-not ($fonte023 -match 'Export-Clixml|SetEnvironmentVariable|\$env:.*='))
Write-Output 'APROVADO: entrada administrativa simulada; ambiente preservado; sem PostgreSQL.'
