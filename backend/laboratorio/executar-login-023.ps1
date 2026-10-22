[CmdletBinding()]
param(
  [string]$Banco='inventario_nr33_multitenant_dev',
  [switch]$Executar,
  [string]$Confirmacao
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'entrada-admin-023.ps1')
Invocar-MigrationAdmin023 -Banco $Banco -Executar ([bool]$Executar) -Confirmacao $Confirmacao
