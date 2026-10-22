# Só configura/valida DPAPI. Nunca importa pg, executa migration ou inicia backend.
[CmdletBinding()]
param(
  [ValidateSet('Plano','Criar','Validar')][string]$Etapa='Plano',
  [string]$Banco='inventario_nr33_multitenant_dev',
  [switch]$Executar,
  [string]$Confirmacao
)
$ErrorActionPreference='Stop'
trap {
  [Console]::Error.WriteLine('Configuracao JWT recusada. Confira armazenamento protegido, autorizacao e usuario local; detalhes internos omitidos.')
  exit 1
}
. (Join-Path $PSScriptRoot 'ambiente-local.ps1')
. (Join-Path $PSScriptRoot 'jwt-protegido-local.ps1')
$arquivoConfigJwt = Obter-CaminhoJwtLocal $Banco
if ($Etapa -eq 'Plano') {
  [pscustomobject]@{ Banco=$Banco; Metodo='DPAPI CurrentUser + ACL exclusiva'; Arquivo=$arquivoConfigJwt; Executado=$false } | ConvertTo-Json -Compress
  return
}
$criadoJwt=$false
if ($Etapa -eq 'Criar') {
  if (-not $Executar -or $Confirmacao -cne 'CRIAR JWT inventario_nr33_multitenant_dev') { throw 'Criacao JWT exige autorizacao explicita para o banco isolado.' }
  $branchJwt = & git -C ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))) branch --show-current 2>$null
  if ($LASTEXITCODE -ne 0 -or $branchJwt -cne 'feature/recuperacao-senha') { throw 'Branch JWT nao autorizada.' }
  Confirmar-PaisJwtLocal $arquivoConfigJwt
  $diretorioJwt=[IO.Path]::GetDirectoryName($arquivoConfigJwt)
  if (-not (Test-Path -LiteralPath $diretorioJwt)) {
    $sidConfigJwt=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $aclConfigJwt=New-Object Security.AccessControl.DirectorySecurity
    $aclConfigJwt.SetOwner($sidConfigJwt)
    $aclConfigJwt.SetAccessRuleProtection($true,$false)
    $regraConfigJwt=New-Object Security.AccessControl.FileSystemAccessRule($sidConfigJwt,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    [void]$aclConfigJwt.AddAccessRule($regraConfigJwt)
    [void][IO.Directory]::CreateDirectory($diretorioJwt,$aclConfigJwt)
  }
  Confirmar-AclJwtLocal $diretorioJwt $true
  $sidMutexJwt=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $mutexJwt=New-Object Threading.Mutex($false,('Local\NR33-JWT-'+$sidMutexJwt+'-inventario_nr33_multitenant_dev'))
  $adquiridoJwt=$false
  $temporarioJwt=$null
  $novoSeguroJwt=$null
  $credencialConfigJwt=$null
  $novoTextoJwt=$null
  try {
    try { $adquiridoJwt=$mutexJwt.WaitOne(10000) } catch [Threading.AbandonedMutexException] { $adquiridoJwt=$true }
    if (-not $adquiridoJwt) { throw 'Armazenamento JWT ocupado; nenhuma chave foi substituida.' }
    if (-not (Test-Path -LiteralPath $arquivoConfigJwt)) {
      # Pasta protegida já confirmada. O segredo só cruza pipes privados em memória.
      $novoTextoJwt=Invocar-CanalJwtLocal -Modo gerar
      if (-not (Testar-JwtLocal $novoTextoJwt)) { throw 'Geracao JWT incompativel.' }
      $novoSeguroJwt=ConvertTo-SecureString $novoTextoJwt -AsPlainText -Force
      $novoTextoJwt=$null
      $credencialConfigJwt=New-Object Management.Automation.PSCredential('NR33:inventario_nr33_multitenant_dev:JWT_SECRET:v1',$novoSeguroJwt)
      $temporarioJwt=Join-Path $diretorioJwt ('novo-'+[Guid]::NewGuid().ToString('N')+'.clixml')
      $credencialConfigJwt | Export-Clixml -LiteralPath $temporarioJwt -Encoding UTF8 -ErrorAction Stop
      $aclArquivoJwt=New-Object Security.AccessControl.FileSecurity
      $aclArquivoJwt.SetOwner([Security.Principal.WindowsIdentity]::GetCurrent().User)
      $aclArquivoJwt.SetAccessRuleProtection($true,$false)
      [void]$aclArquivoJwt.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','Allow')))
      Set-Acl -LiteralPath $temporarioJwt -AclObject $aclArquivoJwt -ErrorAction Stop
      Confirmar-AclJwtLocal $temporarioJwt
      # Move sem sobrescrita: uma chave existente nunca é rotacionada por este script.
      [IO.File]::Move($temporarioJwt,$arquivoConfigJwt)
      $temporarioJwt=$null
      $criadoJwt=$true
    }
    $recuperadoConfigJwt=Ler-JwtProtegidoLocal $Banco
    $recuperadoConfigJwt.Dispose()
  } finally {
    $novoTextoJwt=$null; $credencialConfigJwt=$null
    if ($null -ne $novoSeguroJwt) { $novoSeguroJwt.Dispose() }
    if ($null -ne $temporarioJwt -and (Test-Path -LiteralPath $temporarioJwt)) {
      $absolutoTempJwt=[IO.Path]::GetFullPath($temporarioJwt)
      $raizTempJwt=[IO.Path]::GetFullPath($diretorioJwt)+[IO.Path]::DirectorySeparatorChar
      if (-not $absolutoTempJwt.StartsWith($raizTempJwt,[StringComparison]::OrdinalIgnoreCase)) { throw 'Limpeza JWT fora do destino recusada.' }
      Remove-Item -LiteralPath $absolutoTempJwt -ErrorAction Stop
    }
    if ($adquiridoJwt) { $mutexJwt.ReleaseMutex() }
    $mutexJwt.Dispose()
  }
} else {
  $recuperadoConfigJwt=Ler-JwtProtegidoLocal $Banco
  $recuperadoConfigJwt.Dispose()
}
[pscustomobject]@{ Banco=$Banco; Existe=$true; FormatoValido=$true; CompativelComNode=$true; AclExclusiva=$true; Criado=$criadoJwt } | ConvertTo-Json -Compress
