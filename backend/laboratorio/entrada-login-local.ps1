# Biblioteca de preparacao/diagnostico. Importar nao abre janela, DPAPI, Node ou banco.
function Novo-ErroEntradaLoginLocal([string]$Codigo, $ExitCode=$null) {
  $permitidosLogin=@('ENTRADA_PROTEGIDA_FALHOU','CREDENCIAL_APLICACAO_INDISPONIVEL','HMAC_INDISPONIVEL','JWT_INDISPONIVEL','CANAL_PRIVADO_FALHOU','PREFLIGHT_FALHOU','INICIALIZACAO_HTTP_FALHOU','ENCERRAMENTO_SEGURO_FALHOU')
  $permitidosLogin+=@('PROCESSO_INICIALIZACAO_FALHOU','PROCESSO_ARQUIVO_AUSENTE','PROCESSO_TIMEOUT','PROCESSO_FILHO_FALHOU')
  if ($Codigo -cnotin $permitidosLogin) { $Codigo='CANAL_PRIVADO_FALHOU' }
  $erroLogin=New-Object InvalidOperationException("Preparacao de login interrompida [$Codigo]. Valores privados omitidos.")
  $erroLogin.Data['CodigoTecnico']=$Codigo
  if ($ExitCode -is [int]) { $erroLogin.Data['ExitCode']=$ExitCode }
  return $erroLogin
}
function Solicitar-SenhaLoginLocal {
  # Janela propria da conta descartavel. Nao importa entrada administrativa.
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $formLogin=New-Object Windows.Forms.Form
  $campoLogin=New-Object Windows.Forms.TextBox
  try {
    $formLogin.Text='NR33 - senha da conta descartavel'
    $formLogin.Size=New-Object Drawing.Size(600,240)
    $formLogin.StartPosition='CenterScreen'
    $rotuloLogin=New-Object Windows.Forms.Label
    $rotuloLogin.Text="Conta: Testeacesso@inventario.com`nSomente inventario_nr33_multitenant_dev. Nao informe senha administrativa."
    $rotuloLogin.SetBounds(20,15,550,55)
    $campoLogin.SetBounds(20,80,540,25); $campoLogin.UseSystemPasswordChar=$true
    $okLogin=New-Object Windows.Forms.Button
    $okLogin.Text='Continuar'; $okLogin.SetBounds(20,130,160,30); $okLogin.DialogResult='OK'
    $cancelarLogin=New-Object Windows.Forms.Button
    $cancelarLogin.Text='Cancelar'; $cancelarLogin.SetBounds(260,130,160,30); $cancelarLogin.DialogResult='Cancel'
    $formLogin.Controls.AddRange(@($rotuloLogin,$campoLogin,$okLogin,$cancelarLogin))
    $formLogin.AcceptButton=$okLogin; $formLogin.CancelButton=$cancelarLogin
    if ($formLogin.ShowDialog() -ne 'OK' -or -not $campoLogin.Text) { return $null }
    return ConvertTo-SecureString $campoLogin.Text -AsPlainText -Force
  } finally { $campoLogin.Clear(); $formLogin.Dispose() }
}
function Ler-CredencialAplicacaoLoginLocal([string]$Arquivo) {
  try {
    $credencialLogin=Import-Clixml -LiteralPath $Arquivo -ErrorAction Stop
    if ($credencialLogin -isnot [Management.Automation.PSCredential] -or
        $credencialLogin.UserName -cne 'nr33_dev_app' -or $credencialLogin.Password.Length -lt 32) { throw 'Identidade recusada.' }
    return $credencialLogin
  } catch { throw (Novo-ErroEntradaLoginLocal 'CREDENCIAL_APLICACAO_INDISPONIVEL') }
}
function Enviar-CanalLoginLocal([hashtable]$Configuracao,[string]$ScriptNode) {
  $processoLogin=$null; $bytesLogin=$null; $jsonLogin=$null
  $codigoCanalLogin='PROCESSO_INICIALIZACAO_FALHOU'; $exitCanalLogin=$null
  try {
    $inicioLogin=New-Object Diagnostics.ProcessStartInfo
    $inicioLogin.FileName=(Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
    $inicioLogin.Arguments='"'+[IO.Path]::GetFullPath($ScriptNode)+'"'
    $inicioLogin.WorkingDirectory=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ScriptNode))
    $inicioLogin.UseShellExecute=$false; $inicioLogin.CreateNoWindow=$true
    $inicioLogin.RedirectStandardInput=$true; $inicioLogin.RedirectStandardOutput=$true; $inicioLogin.RedirectStandardError=$true
    $inicioLogin.EnvironmentVariables.Clear()
    foreach($nLogin in @('SystemRoot','WINDIR','TEMP','TMP')) {
      $vLogin=[Environment]::GetEnvironmentVariable($nLogin,'Process')
      if ($null -ne $vLogin) { $inicioLogin.EnvironmentVariables[$nLogin]=$vLogin }
    }
    $jsonLogin=$Configuracao | ConvertTo-Json -Compress
    $bytesLogin=[Text.Encoding]::UTF8.GetBytes($jsonLogin)
    $processoLogin=New-Object Diagnostics.Process; $processoLogin.StartInfo=$inicioLogin
    [void]$processoLogin.Start()
    $codigoCanalLogin='CANAL_PRIVADO_FALHOU'
    # Consome stderr em privado. Nunca retorna stdout/stderr brutos ao chamador.
    $saidaLogin=$processoLogin.StandardOutput.ReadToEndAsync()
    $stderrLogin=$processoLogin.StandardError.ReadToEndAsync()
    $processoLogin.StandardInput.BaseStream.Write($bytesLogin,0,$bytesLogin.Length)
    $processoLogin.StandardInput.BaseStream.Flush(); $processoLogin.StandardInput.Close()
    if (-not $processoLogin.WaitForExit(15000)) { throw (Novo-ErroEntradaLoginLocal 'PROCESSO_TIMEOUT') }
    $exitCanalLogin=[int]$processoLogin.ExitCode
    $respostaLogin=$saidaLogin.GetAwaiter().GetResult()
    $diagnosticoLogin=$stderrLogin.GetAwaiter().GetResult()
    # Somente identificadores conhecidos; nunca devolver texto arbitrario do filho.
    $codigoFilhoLogin=$null
    foreach($permitidoLogin in @('PREFLIGHT_FALHOU','INICIALIZACAO_HTTP_FALHOU','ENTRADA_PROTEGIDA_FALHOU','HMAC_INDISPONIVEL','JWT_INDISPONIVEL')) {
      if ($diagnosticoLogin -match ('\['+[regex]::Escape($permitidoLogin)+'\]')) { $codigoFilhoLogin=$permitidoLogin; break }
    }
    if ($null -eq $codigoFilhoLogin -and $diagnosticoLogin -match '\bMODULE_NOT_FOUND\b') { $codigoFilhoLogin='PROCESSO_ARQUIVO_AUSENTE' }
    if ($exitCanalLogin -ne 0 -and $codigoFilhoLogin) { throw (Novo-ErroEntradaLoginLocal $codigoFilhoLogin $exitCanalLogin) }
    $objetoLogin=$null
    try { $objetoLogin=$respostaLogin | ConvertFrom-Json -ErrorAction Stop } catch { }
    if ($processoLogin.ExitCode -eq 0 -and $objetoLogin.codigo -ceq 'CANAL_VALIDADO') {
      return [pscustomobject]@{Codigo='CANAL_VALIDADO'}
    }
    if ($objetoLogin.codigo -cin @('PREFLIGHT_FALHOU','INICIALIZACAO_HTTP_FALHOU','ENTRADA_PROTEGIDA_FALHOU')) {
      throw (Novo-ErroEntradaLoginLocal $objetoLogin.codigo $exitCanalLogin)
    }
    if ($exitCanalLogin -eq 2 -and -not $respostaLogin) { return [pscustomobject]@{Codigo='CANCELADO';ExitCode=2} }
    if ($exitCanalLogin -ne 0) { throw (Novo-ErroEntradaLoginLocal 'PROCESSO_FILHO_FALHOU' $exitCanalLogin) }
    throw 'Resposta privada recusada.'
  } catch {
    $codigoLogin=$_.Exception.Data['CodigoTecnico']
    if (-not $codigoLogin) { $codigoLogin=$codigoCanalLogin }
    throw (Novo-ErroEntradaLoginLocal $codigoLogin $exitCanalLogin)
  } finally {
    if ($null -ne $bytesLogin) { [Array]::Clear($bytesLogin,0,$bytesLogin.Length) }
    $jsonLogin=$null; $respostaLogin=$null; $diagnosticoLogin=$null
    if ($null -ne $processoLogin) {
      try { if (-not $processoLogin.HasExited) { $processoLogin.Kill(); $processoLogin.WaitForExit() } }
      catch { throw (Novo-ErroEntradaLoginLocal 'ENCERRAMENTO_SEGURO_FALHOU') }
      finally { $processoLogin.Dispose() }
    }
  }
}
function Invocar-PreparacaoLoginLocal {
  param(
    [scriptblock]$Solicitar={ Solicitar-SenhaLoginLocal },
    [Parameter(Mandatory=$true)][scriptblock]$LerAplicacao,
    [scriptblock]$LerHmac={ Ler-HmacProtegidoLocal },
    [scriptblock]$LerJwt={ Ler-JwtProtegidoLocal },
    [Parameter(Mandatory=$true)][scriptblock]$Transmitir
  )
  $senhaLogin=$null; $appLogin=$null; $hmacLogin=$null; $jwtLogin=$null; $configLogin=@{}
  $codigoLogin='ENTRADA_PROTEGIDA_FALHOU'
  try {
    $senhaLogin=& $Solicitar
    if ($null -eq $senhaLogin) { return [pscustomobject]@{Codigo='CANCELADO'} }
    if ($senhaLogin -isnot [Security.SecureString]) { throw 'Entrada incompativel.' }
    $codigoLogin='CREDENCIAL_APLICACAO_INDISPONIVEL'; $appLogin=& $LerAplicacao
    if ($appLogin -isnot [Management.Automation.PSCredential] -or $appLogin.UserName -cne 'nr33_dev_app') { throw 'Credencial recusada.' }
    $codigoLogin='HMAC_INDISPONIVEL'; $hmacLogin=& $LerHmac
    if ($hmacLogin -isnot [Security.SecureString]) { throw 'HMAC recusado.' }
    $codigoLogin='JWT_INDISPONIVEL'; $jwtLogin=& $LerJwt
    if ($jwtLogin -isnot [Security.SecureString]) { throw 'JWT recusado.' }
    $codigoLogin='CANAL_PRIVADO_FALHOU'
    foreach($parLogin in @(@('senha',$senhaLogin),@('appSenha',$appLogin.Password),@('hmac',$hmacLogin),@('jwt',$jwtLogin))) {
      $ptrLogin=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($parLogin[1])
      try { $configLogin[$parLogin[0]]=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptrLogin) }
      finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptrLogin) }
    }
    $resultadoLogin=& $Transmitir $configLogin
    if ($resultadoLogin.Codigo -ceq 'CANCELADO') { return [pscustomobject]@{Codigo='CANCELADO'} }
    if ($resultadoLogin.Codigo -cne 'CANAL_VALIDADO') { throw 'Canal nao confirmado.' }
    return [pscustomobject]@{Codigo='CANAL_VALIDADO'}
  } catch {
    if ($codigoLogin -ceq 'CANAL_PRIVADO_FALHOU' -and $_.Exception.Data['CodigoTecnico']) {
      $codigoLogin=$_.Exception.Data['CodigoTecnico']
    }
    throw (Novo-ErroEntradaLoginLocal $codigoLogin $_.Exception.Data['ExitCode'])
  } finally {
    $configLogin.Clear()
    foreach($seguroLogin in @($senhaLogin,$hmacLogin,$jwtLogin)) { if ($seguroLogin -is [Security.SecureString]) { $seguroLogin.Dispose() } }
    if ($appLogin -is [Management.Automation.PSCredential]) { $appLogin.Password.Dispose() }
  }
}
