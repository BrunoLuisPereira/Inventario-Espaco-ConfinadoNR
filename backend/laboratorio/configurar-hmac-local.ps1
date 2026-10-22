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
  [Console]::Error.WriteLine('Configuracao HMAC recusada. Confira armazenamento protegido, autorizacao e usuario local; detalhes internos omitidos.')
  exit 1
}
. (Join-Path $PSScriptRoot 'ambiente-local.ps1')
. (Join-Path $PSScriptRoot 'hmac-protegido-local.ps1')
$arquivoConfigHmac = Obter-CaminhoHmacLocal $Banco
if ($Etapa -eq 'Plano') {
  [pscustomobject]@{ Banco=$Banco; Metodo='DPAPI CurrentUser + ACL exclusiva'; Arquivo=$arquivoConfigHmac; Executado=$false } | ConvertTo-Json -Compress
  return
}
$criadoHmac=$false
if ($Etapa -eq 'Criar') {
  if (-not $Executar -or $Confirmacao -cne 'CRIAR HMAC inventario_nr33_multitenant_dev') { throw 'Criacao HMAC exige autorizacao explicita para o banco isolado.' }
  $branchHmac = & git -C ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))) branch --show-current 2>$null
  if ($LASTEXITCODE -ne 0 -or $branchHmac -cne 'feature/recuperacao-senha') { throw 'Branch HMAC nao autorizada.' }
  Confirmar-PaisHmacLocal $arquivoConfigHmac
  $diretorioHmac=[IO.Path]::GetDirectoryName($arquivoConfigHmac)
  if (-not (Test-Path -LiteralPath $diretorioHmac)) {
    $sidConfigHmac=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $aclConfigHmac=New-Object Security.AccessControl.DirectorySecurity
    $aclConfigHmac.SetOwner($sidConfigHmac)
    $aclConfigHmac.SetAccessRuleProtection($true,$false)
    $regraConfigHmac=New-Object Security.AccessControl.FileSystemAccessRule($sidConfigHmac,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    [void]$aclConfigHmac.AddAccessRule($regraConfigHmac)
    [void][IO.Directory]::CreateDirectory($diretorioHmac,$aclConfigHmac)
  }
  Confirmar-AclHmacLocal $diretorioHmac $true
  $sidMutexHmac=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $mutexHmac=New-Object Threading.Mutex($false,('Local\NR33-HMAC-'+$sidMutexHmac+'-inventario_nr33_multitenant_dev'))
  $adquiridoHmac=$false
  $temporarioHmac=$null
  $novoSeguroHmac=$null
  $credencialConfigHmac=$null
  $novoTextoHmac=$null
  try {
    try { $adquiridoHmac=$mutexHmac.WaitOne(10000) } catch [Threading.AbandonedMutexException] { $adquiridoHmac=$true }
    if (-not $adquiridoHmac) { throw 'Armazenamento HMAC ocupado; nenhuma chave foi substituida.' }
    if (-not (Test-Path -LiteralPath $arquivoConfigHmac)) {
      # Pasta protegida já confirmada. O segredo só cruza pipes privados em memória.
      $novoTextoHmac=Invocar-CanalHmacLocal -Modo gerar
      if (-not (Testar-HmacLocal $novoTextoHmac)) { throw 'Geracao HMAC incompativel.' }
      $novoSeguroHmac=ConvertTo-SecureString $novoTextoHmac -AsPlainText -Force
      $novoTextoHmac=$null
      $credencialConfigHmac=New-Object Management.Automation.PSCredential('NR33:inventario_nr33_multitenant_dev:LOGIN_HMAC_SECRET:v1',$novoSeguroHmac)
      $temporarioHmac=Join-Path $diretorioHmac ('novo-'+[Guid]::NewGuid().ToString('N')+'.clixml')
      $credencialConfigHmac | Export-Clixml -LiteralPath $temporarioHmac -Encoding UTF8 -ErrorAction Stop
      $aclArquivoHmac=New-Object Security.AccessControl.FileSecurity
      $aclArquivoHmac.SetOwner([Security.Principal.WindowsIdentity]::GetCurrent().User)
      $aclArquivoHmac.SetAccessRuleProtection($true,$false)
      [void]$aclArquivoHmac.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','Allow')))
      Set-Acl -LiteralPath $temporarioHmac -AclObject $aclArquivoHmac -ErrorAction Stop
      Confirmar-AclHmacLocal $temporarioHmac
      # Move sem sobrescrita: uma chave existente nunca é rotacionada por este script.
      [IO.File]::Move($temporarioHmac,$arquivoConfigHmac)
      $temporarioHmac=$null
      $criadoHmac=$true
    }
    $recuperadoConfigHmac=Ler-HmacProtegidoLocal $Banco
    $recuperadoConfigHmac.Dispose()
  } finally {
    $novoTextoHmac=$null; $credencialConfigHmac=$null
    if ($null -ne $novoSeguroHmac) { $novoSeguroHmac.Dispose() }
    if ($null -ne $temporarioHmac -and (Test-Path -LiteralPath $temporarioHmac)) {
      $absolutoTempHmac=[IO.Path]::GetFullPath($temporarioHmac)
      $raizTempHmac=[IO.Path]::GetFullPath($diretorioHmac)+[IO.Path]::DirectorySeparatorChar
      if (-not $absolutoTempHmac.StartsWith($raizTempHmac,[StringComparison]::OrdinalIgnoreCase)) { throw 'Limpeza HMAC fora do destino recusada.' }
      Remove-Item -LiteralPath $absolutoTempHmac -ErrorAction Stop
    }
    if ($adquiridoHmac) { $mutexHmac.ReleaseMutex() }
    $mutexHmac.Dispose()
  }
} else {
  $recuperadoConfigHmac=Ler-HmacProtegidoLocal $Banco
  $recuperadoConfigHmac.Dispose()
}
[pscustomobject]@{ Banco=$Banco; Existe=$true; FormatoValido=$true; CompativelComNode=$true; AclExclusiva=$true; Criado=$criadoHmac } | ConvertTo-Json -Compress
