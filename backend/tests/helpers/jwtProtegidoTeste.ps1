# Só constantes sintéticas. Leitura de CLIXML e ACL é simulada abaixo.
$ErrorActionPreference='Stop'
$pastaJwtTeste=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../laboratorio'))
. (Join-Path $pastaJwtTeste 'ambiente-local.ps1')
. (Join-Path $pastaJwtTeste 'jwt-protegido-local.ps1')
function Exigir-JwtTeste([bool]$Condicao) { if(-not $Condicao){throw 'Teste privado JWT falhou; valores omitidos.'} }
$arquivoJwtTeste=Obter-CaminhoJwtLocal
Exigir-JwtTeste ($arquivoJwtTeste.EndsWith('NR33-Dev-Privado\jwt-inventario_nr33_multitenant_dev\jwt.clixml'))
$recusadoJwtTeste=$false
try { [void](Obter-CaminhoJwtLocal 'postgres') } catch { $recusadoJwtTeste=$true }
Exigir-JwtTeste $recusadoJwtTeste
foreach($arquivoSintaxeJwt in @('jwt-protegido-local.ps1','configurar-jwt-local.ps1','postgres-local.ps1')) {
  $tokensJwtTeste=$null;$errosJwtTeste=$null
  [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $pastaJwtTeste $arquivoSintaxeJwt),[ref]$tokensJwtTeste,[ref]$errosJwtTeste)
  Exigir-JwtTeste ($errosJwtTeste.Count -eq 0)
}
function Confirmar-PaisJwtLocal { param([string]$Caminho) }
$script:aclRecusadaJwtTeste=$false
function Confirmar-AclJwtLocal {
  param([string]$Caminho,[bool]$Diretorio=$false)
  if($script:aclRecusadaJwtTeste){throw 'ACL sintetica recusada'}
}
$seguroJwtTeste=ConvertTo-SecureString ([Convert]::ToBase64String([byte[]](@(7)*48))) -AsPlainText -Force
$script:credencialJwtTeste=New-Object Management.Automation.PSCredential('NR33:inventario_nr33_multitenant_dev:JWT_SECRET:v1',$seguroJwtTeste)
function Import-Clixml { param([string]$LiteralPath,[string]$ErrorAction) return $script:credencialJwtTeste }
function Confirmar-AusenciaJwtTeste {
  $script:credencialJwtTeste=$null
  $recusadoJwtTeste=$false
  try { [void](Ler-JwtProtegidoLocal) } catch { $recusadoJwtTeste=$true }
  Exigir-JwtTeste $recusadoJwtTeste
}
try {
  $recuperadoJwtTeste=Ler-JwtProtegidoLocal
  Exigir-JwtTeste ($recuperadoJwtTeste -is [Security.SecureString])
  $segundaLeituraJwtTeste=Ler-JwtProtegidoLocal
  Exigir-JwtTeste ($segundaLeituraJwtTeste -is [Security.SecureString])
  Confirmar-AusenciaJwtTeste
  $invalidoJwtTeste=ConvertTo-SecureString 'invalido-sintetico' -AsPlainText -Force
  $script:credencialJwtTeste=New-Object Management.Automation.PSCredential('NR33:inventario_nr33_multitenant_dev:JWT_SECRET:v1',$invalidoJwtTeste)
  $recusadoJwtTeste=$false
  try { [void](Ler-JwtProtegidoLocal) } catch { $recusadoJwtTeste=$true }
  Exigir-JwtTeste $recusadoJwtTeste
  $invalidoJwtTeste.Dispose()
  $script:credencialJwtTeste=New-Object Management.Automation.PSCredential('NR33:inventario_nr33_multitenant_dev:JWT_SECRET:v1',$seguroJwtTeste)
  # Confirmar-Formato usa o canal Node real com fixture, sem banco ou geração.
  $script:aclRecusadaJwtTeste=$true
  $recusadoJwtTeste=$false
  try { [void](Ler-JwtProtegidoLocal) } catch { $recusadoJwtTeste=$_.Exception.Message.Contains('nenhum segredo sera criado automaticamente') }
  Exigir-JwtTeste $recusadoJwtTeste
  $script:aclRecusadaJwtTeste=$false
  $script:credencialJwtTeste=New-Object Management.Automation.PSCredential('OUTRO_AMBIENTE',$seguroJwtTeste)
  $recusadoJwtTeste=$false
  try { [void](Ler-JwtProtegidoLocal) } catch { $recusadoJwtTeste=$true }
  Exigir-JwtTeste $recusadoJwtTeste
  Write-Output 'APROVADO: recuperacao segura simulada, formato Node, recusas e sintaxe; sem PostgreSQL ou backend.'
} finally { $seguroJwtTeste.Dispose();$script:credencialJwtTeste=$null }
