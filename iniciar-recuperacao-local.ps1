[CmdletBinding()]
param([string]$MailpitExecutable)
$ErrorActionPreference = 'Stop'

function Testar-PortaRecuperacao([int]$Porta) {
  $tcpRec = New-Object Net.Sockets.TcpClient
  try {
    $conexaoRec = $tcpRec.ConnectAsync('127.0.0.1', $Porta)
    return ($conexaoRec.Wait(1000) -and $tcpRec.Connected)
  } catch { return $false } finally { $tcpRec.Dispose() }
}
function Novo-ProcessoRecuperacao([string]$Arquivo, [string]$Argumentos, [string]$Pasta, [hashtable]$Ambiente) {
  $infoRec = New-Object Diagnostics.ProcessStartInfo
  $infoRec.FileName = $Arquivo; $infoRec.Arguments = $Argumentos; $infoRec.WorkingDirectory = $Pasta
  $infoRec.UseShellExecute = $false; $infoRec.CreateNoWindow = $true
  $infoRec.RedirectStandardInput = $true; $infoRec.RedirectStandardOutput = $true; $infoRec.RedirectStandardError = $true
  $infoRec.EnvironmentVariables.Clear()
  # Windows PowerShell precisa de PATHEXT para resolver "node" como node.exe.
  # O launcher seguro usa "& node"; não herdar extensões arbitrárias do chamador.
  $infoRec.EnvironmentVariables['PATHEXT'] = '.COM;.EXE;.BAT;.CMD'
  foreach ($nomeRec in @('SystemRoot','WINDIR','TEMP','TMP')) {
    $valorRec = [Environment]::GetEnvironmentVariable($nomeRec, 'Process')
    if ($null -ne $valorRec) { $infoRec.EnvironmentVariables[$nomeRec] = $valorRec }
  }
  foreach ($nomeRec in $Ambiente.Keys) { $infoRec.EnvironmentVariables[$nomeRec] = $Ambiente[$nomeRec] }
  $processoRec = New-Object Diagnostics.Process
  $processoRec.StartInfo = $infoRec
  [void]$processoRec.Start()
  return @{ Processo=$processoRec; Saida=$processoRec.StandardOutput.ReadToEndAsync(); Erro=$processoRec.StandardError.ReadToEndAsync() }
}
function Esperar-ServicoRecuperacao([hashtable]$Filho, [string]$Url, [string]$Nome) {
  $limiteRec = [DateTime]::UtcNow.AddSeconds(40)
  while ([DateTime]::UtcNow -lt $limiteRec) {
    if ($null -ne $Filho -and $Filho.Processo.HasExited) {
      $codigoRec = $Filho.Erro.GetAwaiter().GetResult()
      if ($codigoRec -match 'FILA_PENDENTE') { throw 'Há recuperações pendentes. Inicialização recusada para não enviar mensagens automaticamente; aguarde a expiração ou solicite tratamento supervisionado.' }
      if ($codigoRec -match 'CREDENCIAL_POSTGRES') { throw 'Credencial de nr33_dev_app recusada pelo PostgreSQL. Verifique a sincronização do CLIXML protegido.' }
      if ($codigoRec -match 'MIGRATION024_OU_PERMISSOES') { throw 'Migration 024 ou permissões indisponíveis. Nenhuma migration foi executada.' }
      if ($codigoRec -match 'POSTGRES_INDISPONIVEL|DESTINO_POSTGRES') { throw 'PostgreSQL indisponível ou destino incorreto. Exige PostgreSQL 17 em 127.0.0.1:5432.' }
      if ($codigoRec -match 'HMAC_INDISPONIVEL') { throw 'HMAC protegido indisponível. Confira o cofre DPAPI e a identidade Windows; nenhuma chave foi recriada.' }
      if ($codigoRec -match 'JWT_INDISPONIVEL') { throw 'JWT protegido indisponível. Confira o cofre DPAPI e a identidade Windows; nenhuma chave foi recriada.' }
      if ($codigoRec -match 'AMBIENTE_NAO_ISOLADO') { throw 'O launcher seguro recusou variáveis de ambiente conflitantes.' }
      if ($codigoRec -match 'BACKEND_SEGURANCA_PRECHECK_PROCESSO') { throw 'Não foi possível executar o pré-check Node no processo filho. Confira as dependências e a instalação do Node.' }
      throw "$Nome encerrou durante a partida. Execute iniciar-backend-local.ps1 para o diagnóstico do launcher; saída privada omitida."
    }
    try {
      $respostaRec = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -MaximumRedirection 0
      if ($respostaRec.StatusCode -eq 200) {
        if ($Nome -eq 'API') {
          $healthRec = $respostaRec.Content | ConvertFrom-Json
          if ($healthRec.status -ne 'success' -or $healthRec.banco -ne 'inventario_nr33_multitenant_dev' -or $healthRec.laboratorio -ne $true) { throw 'Destino HTTP incorreto.' }
        }
        return
      }
    } catch { }
    Start-Sleep -Milliseconds 300
  }
  throw "$Nome não ficou disponível em 40 segundos. Confira a porta e as dependências locais."
}
function Iniciar-AmbienteRecuperacao {
  $filhosRec = New-Object 'Collections.Generic.List[hashtable]'
  $senhaRec = $null; $ponteiroRec = [IntPtr]::Zero; $jsonRec = $null; $bytesRec = $null; $textoRec = $null
  try {
    $nodeRec = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
    $powershellRec = (Get-Command powershell.exe -CommandType Application -ErrorAction Stop).Source
    $backendRec = Join-Path $PSScriptRoot 'backend\laboratorio\iniciar-recuperacao-backend.ps1'
    $viteRec = Join-Path $PSScriptRoot 'frontend\node_modules\vite\bin\vite.js'
    if (-not (Test-Path -LiteralPath $viteRec -PathType Leaf) -or -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'backend\node_modules\pg') -PathType Container)) {
      throw 'Dependências ausentes. Instale as dependências de backend/frontend antes de iniciar; este script não instala pacotes.'
    }
    if (-not (Testar-PortaRecuperacao 5432)) { throw 'PostgreSQL não está disponível em 127.0.0.1:5432. Inicie o serviço existente; o script não cria nem altera bancos.' }
    foreach ($portaRec in @(3000,5174)) { if (Testar-PortaRecuperacao $portaRec) { throw "Porta $portaRec ocupada. Encerre a instância anterior antes de iniciar." } }
    $pathRec = [IO.Path]::GetDirectoryName($nodeRec) + ';' + (Join-Path $env:SystemRoot 'System32') + ';' + [IO.Path]::GetDirectoryName($powershellRec)
    $ambienteRec = @{ PATH=$pathRec; EMAIL_TRANSPORT='local-smtp'; SMTP_HOST='127.0.0.1'; SMTP_PORT='1025';
      EMAIL_FROM='nr33@example.invalid'; APP_PUBLIC_URL='http://127.0.0.1:5174'; NR33_BACKEND_PORT='3000' }
    $smtpRec = Testar-PortaRecuperacao 1025; $uiRec = Testar-PortaRecuperacao 8025
    if ($smtpRec -or $uiRec) {
      if (-not ($smtpRec -and $uiRec)) { throw 'Mailpit incompleto: portas 1025 e 8025 precisam estar disponíveis juntas.' }
      $listenersRec = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in @(1025,8025) })
      if ($listenersRec.Count -lt 2 -or @($listenersRec | Where-Object { $_.LocalAddress -ne '127.0.0.1' }).Count -gt 0) {
        throw 'Mailpit existente deve escutar somente em 127.0.0.1. Encerre a instância exposta em 0.0.0.0/:: e repita; ela não será encerrada automaticamente.'
      }
      foreach ($listenerRec in $listenersRec) {
        if ((Get-Process -Id $listenerRec.OwningProcess -ErrorAction Stop).ProcessName -notmatch '^mailpit$') { throw 'Portas 1025/8025 ocupadas por outro serviço.' }
      }
      Write-Host 'Mailpit local existente detectado (será preservado ao encerrar).'
    } else {
      $mailpitRec = $MailpitExecutable
      if (-not $mailpitRec) {
        $comandoMailpitRec = Get-Command mailpit.exe -CommandType Application -ErrorAction SilentlyContinue
        if ($null -ne $comandoMailpitRec) { $mailpitRec = $comandoMailpitRec.Source }
      }
      if (-not $mailpitRec) {
        foreach ($candidatoRec in @((Join-Path $PSScriptRoot 'tools\mailpit.exe'), 'C:\tools\mailpit\mailpit.exe', 'C:\Program Files\Mailpit\mailpit.exe')) {
          if (Test-Path -LiteralPath $candidatoRec -PathType Leaf) { $mailpitRec = $candidatoRec; break }
        }
      }
      if (-not $mailpitRec -or -not (Test-Path -LiteralPath $mailpitRec -PathType Leaf)) { throw 'Mailpit não encontrado. Coloque mailpit.exe no PATH ou use -MailpitExecutable com o caminho completo.' }
      $mailpitFilhoRec = Novo-ProcessoRecuperacao ([IO.Path]::GetFullPath($mailpitRec)) '--smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 --disable-version-check --smtp-disable-rdns --quiet' $PSScriptRoot @{}
      $filhosRec.Add($mailpitFilhoRec)
      Esperar-ServicoRecuperacao $mailpitFilhoRec 'http://127.0.0.1:8025/' 'Mailpit'
      if (-not (Testar-PortaRecuperacao 1025)) { throw 'Mailpit não abriu a porta SMTP 1025.' }
    }
    . (Join-Path $PSScriptRoot 'backend\laboratorio\credencial-aplicacao-salva.ps1')
    $credencialRecSalva = Ler-CredencialAplicacaoSalva
    $senhaRec = $credencialRecSalva.Password
    $backendFilhoRec = Novo-ProcessoRecuperacao $powershellRec ('-NoProfile -File "' + $backendRec + '"') $PSScriptRoot $ambienteRec
    $filhosRec.Add($backendFilhoRec)
    $ponteiroRec = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($senhaRec)
    $textoRec = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiroRec)
    $jsonRec = @{ senha=$textoRec } | ConvertTo-Json -Compress
    $bytesRec = [Text.Encoding]::UTF8.GetBytes($jsonRec)
    $backendFilhoRec.Processo.StandardInput.BaseStream.Write($bytesRec, 0, $bytesRec.Length)
    $backendFilhoRec.Processo.StandardInput.Close()
    [Array]::Clear($bytesRec, 0, $bytesRec.Length); $bytesRec=$null; $jsonRec=$null; $textoRec=$null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiroRec); $ponteiroRec=[IntPtr]::Zero
    $senhaRec.Dispose(); $senhaRec=$null
    Esperar-ServicoRecuperacao $backendFilhoRec 'http://127.0.0.1:3000/api/health' 'API'
    $frontendFilhoRec = Novo-ProcessoRecuperacao $nodeRec ('"' + $viteRec + '" --host 127.0.0.1 --port 5174 --strictPort') (Join-Path $PSScriptRoot 'frontend') @{ PATH=$pathRec }
    $filhosRec.Add($frontendFilhoRec)
    Esperar-ServicoRecuperacao $frontendFilhoRec 'http://127.0.0.1:5174/' 'Frontend'
    Esperar-ServicoRecuperacao $frontendFilhoRec 'http://127.0.0.1:5174/api/health' 'API'
    Write-Host 'API e worker de recuperação iniciados. Nenhuma solicitação de recuperação foi feita pelo script.'
    Write-Host 'Login:   http://127.0.0.1:5174/login'
    Write-Host 'Mailpit: http://127.0.0.1:8025'
    Write-Host 'Use a interface para solicitar o link. Ctrl+C encerra os processos iniciados por este comando.'
    while ($true) {
      foreach ($filhoRec in $filhosRec) { if ($filhoRec.Processo.HasExited) { throw 'Um serviço local encerrou inesperadamente. Reinicie o ambiente; saída privada omitida.' } }
      Start-Sleep -Milliseconds 500
    }
  } catch { Write-Error ('Inicialização local interrompida: ' + $_.Exception.Message) }
  finally {
    if ($ponteiroRec -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiroRec) }
    if ($null -ne $senhaRec) { $senhaRec.Dispose() }
    if ($null -ne $bytesRec) { [Array]::Clear($bytesRec, 0, $bytesRec.Length) }
    $textoRec=$null; $jsonRec=$null
    for ($indiceRec=$filhosRec.Count-1; $indiceRec -ge 0; $indiceRec--) {
      $processoRec = $filhosRec[$indiceRec].Processo
      try { if (-not $processoRec.HasExited) { & "$env:SystemRoot\System32\taskkill.exe" /PID $processoRec.Id /T /F 2>$null | Out-Null } } catch { }
      $processoRec.Dispose()
    }
  }
}
# Dot-source permite testar funções sem processos, rede ou senha.
if ($MyInvocation.InvocationName -ne '.') { Iniciar-AmbienteRecuperacao }
