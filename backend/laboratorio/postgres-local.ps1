# Entrada local do PASSO 712. Nao cria banco, nao usa Docker, nao carrega .env.
[CmdletBinding()]
param(
  [ValidateSet('Plano','Instalar','Backend')][string]$Etapa = 'Plano',
  [string]$Banco = 'inventario_nr33_multitenant_dev',
  [switch]$Executar,
  [string]$Confirmacao,
  [string]$Psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe',
  [string]$Administrador = 'postgres',
  [Security.SecureString]$SenhaAdministrador,
  [Security.SecureString]$SenhaAplicacao
)
$ErrorActionPreference = 'Stop'
if ($Banco -cne 'inventario_nr33_multitenant_dev') { throw 'Banco local nao autorizado.' }
if ($Etapa -eq 'Plano') {
  [pscustomobject]@{ Banco=$Banco; Host='127.0.0.1'; Porta=5432; Papel='nr33_dev_app'; Backend=3001; Frontend=5174; Executado=$false }
  return
}
if (-not $Executar -or $Confirmacao -cne "$($Etapa.ToUpperInvariant()) $Banco") { throw 'Exige aprovacao, -Executar e confirmacao exata.' }
foreach ($chaveLocal in @('NODE_OPTIONS','DATABASE_URL','DB_PASSWORD','JWT_SECRET','PGPASSWORD','PGPASSFILE','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGHOSTADDR','PGHOST','PGPORT','PGDATABASE','PGUSER','PGSSLMODE','PGTARGETSESSIONATTRS','NR33_SENHA_INSTALACAO')) {
  if (Test-Path -LiteralPath "Env:$chaveLocal") { throw 'Use sessao isolada sem overrides ou credenciais preexistentes.' }
}
function Converter-SegredoLocal([Security.SecureString]$Senha) {
  if ($null -eq $Senha) { throw 'Credencial privada obrigatoria.' }
  $ponteiroLocal = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Senha)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiroLocal) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiroLocal) }
}
$nomesLocal = @('PGPASSWORD','NR33_SENHA_INSTALACAO','DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD','JWT_SECRET','JWT_ISSUER','JWT_AUDIENCE','JWT_EXPIRES_IN','NR33_LOCAL_AUTORIZADO')
$anterioresLocal = @{}
foreach ($nomeLocal in $nomesLocal) { $anterioresLocal[$nomeLocal] = [Environment]::GetEnvironmentVariable($nomeLocal,'Process') }
$encodingLocalAnterior = $OutputEncoding
$sqlLocal = $null
$saidaLocal = $null
try {
  $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  $senhaAppLocal = Converter-SegredoLocal $SenhaAplicacao
  if ($senhaAppLocal -cnotmatch '\A[A-Za-z0-9_-]{32,128}\z') { throw 'Nova senha da aplicacao deve ter 32-128 caracteres A-Z/a-z/0-9/_/-.' }
  if ($Etapa -eq 'Instalar') {
    if (-not (Test-Path -LiteralPath $Psql -PathType Leaf)) { throw 'psql PostgreSQL 17 nao encontrado.' }
    $versaoLocal = & $Psql --version
    if ($LASTEXITCODE -ne 0 -or $versaoLocal -notmatch '\b17\.') { throw 'Exige cliente PostgreSQL 17.' }
    $env:NR33_SENHA_INSTALACAO = $senhaAppLocal
    $sqlLocal = & node (Join-Path $PSScriptRoot 'postgresLocal.cjs') --banco $Banco
    if ($LASTEXITCODE -ne 0) { throw 'Composicao SQL recusada.' }
    $env:PGPASSWORD = Converter-SegredoLocal $SenhaAdministrador
    # Destino fixo. Nunca usa defaults de PGHOST/PGDATABASE, .psqlrc ou outro banco.
    $saidaLocal = $sqlLocal | & $Psql --no-psqlrc --no-password --host=127.0.0.1 --port=5432 --username=$Administrador --dbname=inventario_nr33_multitenant_dev --set=ON_ERROR_STOP=1 --set=VERBOSITY=sqlstate --file=- 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Instalacao falhou; saida tecnica omitida para proteger credenciais. Nao repetir nem limpar automaticamente.' }
    Write-Output 'Instalacao concluida no banco novo. Validacao real de tabelas, permissoes e isolamento ainda necessaria.'
  } else {
    $env:DB_HOST='127.0.0.1'; $env:DB_PORT='5432'; $env:DB_NAME=$Banco; $env:DB_USER='nr33_dev_app'
    $env:DB_PASSWORD=$senhaAppLocal
    $env:JWT_SECRET=[Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
    $env:JWT_ISSUER='nr33-local-dev'; $env:JWT_AUDIENCE='nr33-local-browser'; $env:JWT_EXPIRES_IN='1h'
    $env:NR33_LOCAL_AUTORIZADO='PASSO712'
    & node (Join-Path $PSScriptRoot 'servidor-local.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Inicio local recusado.' }
  }
} finally {
  $sqlLocal=$null; $saidaLocal=$null; $senhaAppLocal=$null
  foreach ($nomeLocal in $nomesLocal) { [Environment]::SetEnvironmentVariable($nomeLocal,$anterioresLocal[$nomeLocal],'Process') }
  $OutputEncoding=$encodingLocalAnterior
}
