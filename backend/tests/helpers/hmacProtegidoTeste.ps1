# Só constantes sintéticas. Leitura de CLIXML e ACL é simulada abaixo.
$ErrorActionPreference='Stop'
$pastaHmacTeste=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../laboratorio'))
. (Join-Path $pastaHmacTeste 'ambiente-local.ps1')
. (Join-Path $pastaHmacTeste 'hmac-protegido-local.ps1')
function Exigir-HmacTeste([bool]$Condicao) { if(-not $Condicao){throw 'Teste privado HMAC falhou; valores omitidos.'} }
$arquivoHmacTeste=Obter-CaminhoHmacLocal
Exigir-HmacTeste ($arquivoHmacTeste.EndsWith('NR33-Dev-Privado\login-hmac-inventario_nr33_multitenant_dev\login-hmac.clixml'))
$recusadoHmacTeste=$false
try { [void](Obter-CaminhoHmacLocal 'postgres') } catch { $recusadoHmacTeste=$true }
Exigir-HmacTeste $recusadoHmacTeste
foreach($arquivoSintaxeHmac in @('hmac-protegido-local.ps1','configurar-hmac-local.ps1','postgres-local.ps1')) {
  $tokensHmacTeste=$null;$errosHmacTeste=$null
  [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $pastaHmacTeste $arquivoSintaxeHmac),[ref]$tokensHmacTeste,[ref]$errosHmacTeste)
  Exigir-HmacTeste ($errosHmacTeste.Count -eq 0)
}
function Confirmar-PaisHmacLocal { param([string]$Caminho) }
$script:aclRecusadaHmacTeste=$false
function Confirmar-AclHmacLocal {
  param([string]$Caminho,[bool]$Diretorio=$false)
  if($script:aclRecusadaHmacTeste){throw 'ACL sintetica recusada'}
}
$seguroHmacTeste=ConvertTo-SecureString ([Convert]::ToBase64String([byte[]](@(7)*32))) -AsPlainText -Force
$script:credencialHmacTeste=New-Object Management.Automation.PSCredential('NR33:inventario_nr33_multitenant_dev:LOGIN_HMAC_SECRET:v1',$seguroHmacTeste)
function Import-Clixml { param([string]$LiteralPath,[string]$ErrorAction) return $script:credencialHmacTeste }
try {
  $recuperadoHmacTeste=Ler-HmacProtegidoLocal
  Exigir-HmacTeste ($recuperadoHmacTeste -is [Security.SecureString])
  # Confirmar-Formato usa o canal Node real com fixture, sem banco ou geração.
  $script:aclRecusadaHmacTeste=$true
  $recusadoHmacTeste=$false
  try { [void](Ler-HmacProtegidoLocal) } catch { $recusadoHmacTeste=$_.Exception.Message.Contains('nenhum segredo sera criado automaticamente') }
  Exigir-HmacTeste $recusadoHmacTeste
  $script:aclRecusadaHmacTeste=$false
  $script:credencialHmacTeste=New-Object Management.Automation.PSCredential('OUTRO_AMBIENTE',$seguroHmacTeste)
  $recusadoHmacTeste=$false
  try { [void](Ler-HmacProtegidoLocal) } catch { $recusadoHmacTeste=$true }
  Exigir-HmacTeste $recusadoHmacTeste
  Write-Output 'APROVADO: recuperacao segura simulada, formato Node, recusas e sintaxe; sem PostgreSQL ou backend.'
} finally { $seguroHmacTeste.Dispose();$script:credencialHmacTeste=$null }
