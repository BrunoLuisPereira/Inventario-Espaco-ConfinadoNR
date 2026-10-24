# DPAPI CurrentUser em Windows. Importar não gera, grava ou exibe segredos.
function Obter-CaminhoHmacLocal([string]$Banco = 'inventario_nr33_multitenant_dev') {
  if ($Banco -cne 'inventario_nr33_multitenant_dev' -or [Environment]::OSVersion.Platform -ne 'Win32NT') {
    throw 'Armazenamento HMAC restrito ao Windows e ao banco isolado autorizado.'
  }
  $raizHmac = [Environment]::GetFolderPath('LocalApplicationData')
  if ([string]::IsNullOrWhiteSpace($raizHmac)) { throw 'Pasta privada do usuario indisponivel.' }
  return Join-Path $raizHmac 'NR33-Dev-Privado\login-hmac-inventario_nr33_multitenant_dev\login-hmac.clixml'
}
function Confirmar-AclHmacLocal([string]$Caminho, [bool]$Diretorio = $false) {
  $itemHmac = Get-Item -LiteralPath $Caminho -Force -ErrorAction Stop
  if (($itemHmac.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $itemHmac.PSIsContainer -ne $Diretorio) {
    throw 'Tipo ou redirecionamento do armazenamento HMAC recusado.'
  }
  $sidHmac = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $aclHmac = Get-Acl -LiteralPath $Caminho -ErrorAction Stop
  if ($aclHmac.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $sidHmac.Value -or
      ($Diretorio -and -not $aclHmac.AreAccessRulesProtected)) { throw 'Proprietario ou heranca do armazenamento HMAC recusados.' }
  $regrasHmac = @($aclHmac.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
  if ($regrasHmac.Count -ne 1 -or $regrasHmac[0].IdentityReference.Value -cne $sidHmac.Value -or
      $regrasHmac[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
      $regrasHmac[0].FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl) {
    throw 'ACL HMAC deve permitir acesso somente ao usuario Windows atual.'
  }
}
function Confirmar-PaisHmacLocal([string]$Caminho) {
  $paiHmac = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Caminho))
  while (-not [string]::IsNullOrEmpty($paiHmac)) {
    if (Test-Path -LiteralPath $paiHmac) {
      $itemPaiHmac = Get-Item -LiteralPath $paiHmac -Force
      if (($itemPaiHmac.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or -not $itemPaiHmac.PSIsContainer) {
        throw 'Pasta de armazenamento HMAC redirecionada ou incompativel.'
      }
    }
    $paiHmac = [IO.Path]::GetDirectoryName($paiHmac)
  }
}
function Invocar-CanalHmacLocal([ValidateSet('gerar','validar')][string]$Modo, [string]$Entrada) {
  $nodeHmac = Get-Command node.exe -CommandType Application -ErrorAction Stop
  $inicioHmac = New-Object Diagnostics.ProcessStartInfo
  $inicioHmac.FileName = $nodeHmac.Source
  $inicioHmac.Arguments = '"' + (Join-Path $PSScriptRoot 'hmac-canal.cjs') + '" ' + $Modo
  $inicioHmac.WorkingDirectory = $PSScriptRoot
  $inicioHmac.UseShellExecute = $false
  $inicioHmac.CreateNoWindow = $true
  $inicioHmac.RedirectStandardInput = $true
  $inicioHmac.RedirectStandardOutput = $true
  $inicioHmac.RedirectStandardError = $true
  # O gerador/validador não herda credenciais, JWT, NODE_OPTIONS ou NODE_PATH.
  $inicioHmac.EnvironmentVariables.Clear()
  foreach ($nomeCanalHmac in @('SystemRoot','WINDIR','TEMP','TMP')) {
    $valorCanalHmac = [Environment]::GetEnvironmentVariable($nomeCanalHmac, 'Process')
    if ($null -ne $valorCanalHmac) { $inicioHmac.EnvironmentVariables[$nomeCanalHmac] = $valorCanalHmac }
  }
  $inicioHmac.EnvironmentVariables['NR33_HMAC_CANAL_INTERNO'] = 'PASSO28_PIPE'
  $processoHmac = New-Object Diagnostics.Process
  $processoHmac.StartInfo = $inicioHmac
  try {
    [void]$processoHmac.Start()
    $saidaHmac = $processoHmac.StandardOutput.ReadToEndAsync()
    $erroHmac = $processoHmac.StandardError.ReadToEndAsync()
    if ($Modo -eq 'validar') { $processoHmac.StandardInput.Write($Entrada) }
    $processoHmac.StandardInput.Close()
    if (-not $processoHmac.WaitForExit(10000)) { $processoHmac.Kill(); throw 'Tempo do canal HMAC excedido.' }
    $textoHmac = $saidaHmac.GetAwaiter().GetResult()
    [void]$erroHmac.GetAwaiter().GetResult()
    if ($processoHmac.ExitCode -ne 0) { throw 'Canal HMAC privado recusado.' }
    return $textoHmac
  } catch { throw 'Falha segura no canal HMAC privado; detalhes omitidos.' }
  finally { $Entrada=$null; $textoHmac=$null; $processoHmac.Dispose() }
}
function Confirmar-FormatoHmacProtegidoLocal([Security.SecureString]$Segredo) {
  if ($null -eq $Segredo) { throw 'Segredo HMAC protegido ausente.' }
  $ponteiroHmac = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Segredo)
  try {
    $textoFormatoHmac = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiroHmac)
    if (-not (Testar-HmacLocal $textoFormatoHmac)) { throw 'Formato HMAC protegido invalido.' }
    $validacaoHmac = (Invocar-CanalHmacLocal -Modo validar -Entrada $textoFormatoHmac) | ConvertFrom-Json
    if ($validacaoHmac.formatoValido -ne $true) { throw 'Validacao HMAC incompatível.' }
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiroHmac)
    $textoFormatoHmac=$null
  }
}
function Ler-HmacProtegidoLocal([string]$Banco = 'inventario_nr33_multitenant_dev') {
  try {
    $arquivoHmac = Obter-CaminhoHmacLocal $Banco
    Confirmar-PaisHmacLocal $arquivoHmac
    Confirmar-AclHmacLocal ([IO.Path]::GetDirectoryName($arquivoHmac)) $true
    Confirmar-AclHmacLocal $arquivoHmac
    $credencialHmac = Import-Clixml -LiteralPath $arquivoHmac -ErrorAction Stop
    if ($credencialHmac -isnot [Management.Automation.PSCredential] -or
        $credencialHmac.UserName -cne 'NR33:inventario_nr33_multitenant_dev:LOGIN_HMAC_SECRET:v1') {
      throw 'Identidade do armazenamento HMAC incompativel.'
    }
    Confirmar-FormatoHmacProtegidoLocal $credencialHmac.Password
    return $credencialHmac.Password
  } catch { throw 'HMAC protegido indisponivel ou invalido. Confira o cofre DPAPI do usuario local; nenhum segredo sera criado automaticamente.' }
}
