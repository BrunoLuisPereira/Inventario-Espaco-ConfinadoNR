# DPAPI CurrentUser em Windows. Importar não gera, grava ou exibe segredos.
function Testar-JwtLocal([string]$Valor) {
  if ($Valor -cnotmatch '\A[A-Za-z0-9+/]{64}\z') { return $false }
  try {
    $bytesJwt=[Convert]::FromBase64String($Valor)
    return $bytesJwt.Length -eq 48 -and [Convert]::ToBase64String($bytesJwt) -ceq $Valor
  } catch { return $false }
  finally { if ($null -ne $bytesJwt) { [Array]::Clear($bytesJwt,0,$bytesJwt.Length) } }
}
function Obter-CaminhoJwtLocal([string]$Banco = 'inventario_nr33_multitenant_dev') {
  if ($Banco -cne 'inventario_nr33_multitenant_dev' -or [Environment]::OSVersion.Platform -ne 'Win32NT') {
    throw 'Armazenamento JWT restrito ao Windows e ao banco isolado autorizado.'
  }
  $raizJwt = [Environment]::GetFolderPath('LocalApplicationData')
  if ([string]::IsNullOrWhiteSpace($raizJwt)) { throw 'Pasta privada do usuario indisponivel.' }
  return Join-Path $raizJwt 'NR33-Dev-Privado\jwt-inventario_nr33_multitenant_dev\jwt.clixml'
}
function Confirmar-AclJwtLocal([string]$Caminho, [bool]$Diretorio = $false) {
  $itemJwt = Get-Item -LiteralPath $Caminho -Force -ErrorAction Stop
  if (($itemJwt.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $itemJwt.PSIsContainer -ne $Diretorio) {
    throw 'Tipo ou redirecionamento do armazenamento JWT recusado.'
  }
  $sidJwt = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $aclJwt = Get-Acl -LiteralPath $Caminho -ErrorAction Stop
  if ($aclJwt.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $sidJwt.Value -or
      ($Diretorio -and -not $aclJwt.AreAccessRulesProtected)) { throw 'Proprietario ou heranca do armazenamento JWT recusados.' }
  $regrasJwt = @($aclJwt.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
  if ($regrasJwt.Count -ne 1 -or $regrasJwt[0].IdentityReference.Value -cne $sidJwt.Value -or
      $regrasJwt[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
      $regrasJwt[0].FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl) {
    throw 'ACL JWT deve permitir acesso somente ao usuario Windows atual.'
  }
}
function Confirmar-PaisJwtLocal([string]$Caminho) {
  $paiJwt = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Caminho))
  while (-not [string]::IsNullOrEmpty($paiJwt)) {
    if (Test-Path -LiteralPath $paiJwt) {
      $itemPaiJwt = Get-Item -LiteralPath $paiJwt -Force
      if (($itemPaiJwt.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or -not $itemPaiJwt.PSIsContainer) {
        throw 'Pasta de armazenamento JWT redirecionada ou incompativel.'
      }
    }
    $paiJwt = [IO.Path]::GetDirectoryName($paiJwt)
  }
}
function Invocar-CanalJwtLocal([ValidateSet('gerar','validar')][string]$Modo, [string]$Entrada) {
  $nodeJwt = Get-Command node.exe -CommandType Application -ErrorAction Stop
  $inicioJwt = New-Object Diagnostics.ProcessStartInfo
  $inicioJwt.FileName = $nodeJwt.Source
  $inicioJwt.Arguments = '"' + (Join-Path $PSScriptRoot 'jwt-canal.cjs') + '" ' + $Modo
  $inicioJwt.WorkingDirectory = $PSScriptRoot
  $inicioJwt.UseShellExecute = $false
  $inicioJwt.CreateNoWindow = $true
  $inicioJwt.RedirectStandardInput = $true
  $inicioJwt.RedirectStandardOutput = $true
  $inicioJwt.RedirectStandardError = $true
  # O gerador/validador não herda credenciais, JWT, NODE_OPTIONS ou NODE_PATH.
  $inicioJwt.EnvironmentVariables.Clear()
  foreach ($nomeCanalJwt in @('SystemRoot','WINDIR','TEMP','TMP')) {
    $valorCanalJwt = [Environment]::GetEnvironmentVariable($nomeCanalJwt, 'Process')
    if ($null -ne $valorCanalJwt) { $inicioJwt.EnvironmentVariables[$nomeCanalJwt] = $valorCanalJwt }
  }
  $inicioJwt.EnvironmentVariables['NR33_JWT_CANAL_INTERNO'] = 'PASSO295_PIPE'
  $processoJwt = New-Object Diagnostics.Process
  $processoJwt.StartInfo = $inicioJwt
  try {
    [void]$processoJwt.Start()
    $saidaJwt = $processoJwt.StandardOutput.ReadToEndAsync()
    $erroJwt = $processoJwt.StandardError.ReadToEndAsync()
    if ($Modo -eq 'validar') { $processoJwt.StandardInput.Write($Entrada) }
    $processoJwt.StandardInput.Close()
    if (-not $processoJwt.WaitForExit(10000)) { $processoJwt.Kill(); throw 'Tempo do canal JWT excedido.' }
    $textoJwt = $saidaJwt.GetAwaiter().GetResult()
    [void]$erroJwt.GetAwaiter().GetResult()
    if ($processoJwt.ExitCode -ne 0) { throw 'Canal JWT privado recusado.' }
    return $textoJwt
  } catch { throw 'Falha segura no canal JWT privado; detalhes omitidos.' }
  finally { $Entrada=$null; $textoJwt=$null; $processoJwt.Dispose() }
}
function Confirmar-FormatoJwtProtegidoLocal([Security.SecureString]$Segredo) {
  if ($null -eq $Segredo) { throw 'Segredo JWT protegido ausente.' }
  $ponteiroJwt = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Segredo)
  try {
    $textoFormatoJwt = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiroJwt)
    if (-not (Testar-JwtLocal $textoFormatoJwt)) { throw 'Formato JWT protegido invalido.' }
    $validacaoJwt = (Invocar-CanalJwtLocal -Modo validar -Entrada $textoFormatoJwt) | ConvertFrom-Json
    if ($validacaoJwt.formatoValido -ne $true) { throw 'Validacao JWT incompatível.' }
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiroJwt)
    $textoFormatoJwt=$null
  }
}
function Ler-JwtProtegidoLocal([string]$Banco = 'inventario_nr33_multitenant_dev') {
  try {
    $arquivoJwt = Obter-CaminhoJwtLocal $Banco
    Confirmar-PaisJwtLocal $arquivoJwt
    Confirmar-AclJwtLocal ([IO.Path]::GetDirectoryName($arquivoJwt)) $true
    Confirmar-AclJwtLocal $arquivoJwt
    $credencialJwt = Import-Clixml -LiteralPath $arquivoJwt -ErrorAction Stop
    if ($credencialJwt -isnot [Management.Automation.PSCredential] -or
        $credencialJwt.UserName -cne 'NR33:inventario_nr33_multitenant_dev:JWT_SECRET:v1') {
      throw 'Identidade do armazenamento JWT incompativel.'
    }
    Confirmar-FormatoJwtProtegidoLocal $credencialJwt.Password
    return $credencialJwt.Password
  } catch { throw 'JWT protegido indisponivel ou invalido. Confira o cofre DPAPI do usuario local; nenhum segredo sera criado automaticamente.' }
}
