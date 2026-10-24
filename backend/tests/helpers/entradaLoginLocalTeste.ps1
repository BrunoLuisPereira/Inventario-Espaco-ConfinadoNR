$ErrorActionPreference='Stop'
$pastaLoginTeste=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../laboratorio'))
. (Join-Path $pastaLoginTeste 'entrada-login-local.ps1')
function ExigirLoginTeste([bool]$Condicao) { if(-not $Condicao){throw 'Falha no teste simulado de entrada login.'} }
function SeguroLoginTeste([string]$Texto='SEGREDO_FIXTURE_NAO_PUBLICAR') { return ConvertTo-SecureString $Texto -AsPlainText -Force }
function CredencialLoginTeste { return New-Object Management.Automation.PSCredential('nr33_dev_app',(SeguroLoginTeste ('x'*64))) }
$antesLoginTeste=@{}
Get-ChildItem Env: | ForEach-Object { $antesLoginTeste[$_.Name]=$_.Value }
$script:leituraLoginTeste=0
function Import-Clixml {
  param($LiteralPath,$ErrorAction)
  $script:leituraLoginTeste++
  if($LiteralPath -eq 'ausente'){throw 'SEGREDO_FIXTURE_NAO_PUBLICAR'}
  if($LiteralPath -eq 'errado'){return New-Object Management.Automation.PSCredential('postgres',(SeguroLoginTeste))}
  return CredencialLoginTeste
}
ExigirLoginTeste ((Ler-CredencialAplicacaoLoginLocal 'fixture').UserName -ceq 'nr33_dev_app')
foreach($arquivoLoginTeste in @('ausente','errado')) {
  try { [void](Ler-CredencialAplicacaoLoginLocal $arquivoLoginTeste);throw 'Nao recusou.' }
  catch { ExigirLoginTeste ($_.Exception.Data['CodigoTecnico'] -ceq 'CREDENCIAL_APLICACAO_INDISPONIVEL');ExigirLoginTeste (-not $_.Exception.Message.Contains('SEGREDO_FIXTURE')) }
}
$argumentosLoginTeste=@{Solicitar={SeguroLoginTeste};LerAplicacao={CredencialLoginTeste};LerHmac={SeguroLoginTeste};LerJwt={SeguroLoginTeste};Transmitir={param($c) [pscustomobject]@{Codigo='CANAL_VALIDADO'}}}
$script:referenciaLoginTeste=$null
$argumentosLoginTeste.Transmitir={param($c) $script:referenciaLoginTeste=$c;[pscustomobject]@{Codigo='CANAL_VALIDADO'}}
ExigirLoginTeste ((Invocar-PreparacaoLoginLocal @argumentosLoginTeste).Codigo -ceq 'CANAL_VALIDADO')
ExigirLoginTeste ($script:referenciaLoginTeste.Count -eq 0)
foreach($casoLoginTeste in @(@('Solicitar','ENTRADA_PROTEGIDA_FALHOU'),@('LerAplicacao','CREDENCIAL_APLICACAO_INDISPONIVEL'),@('LerHmac','HMAC_INDISPONIVEL'),@('LerJwt','JWT_INDISPONIVEL'),@('Transmitir','CANAL_PRIVADO_FALHOU'))) {
  $argsFalhaLoginTeste=$argumentosLoginTeste.Clone()
  $argsFalhaLoginTeste[$casoLoginTeste[0]]={throw 'SEGREDO_FIXTURE_NAO_PUBLICAR'}
  try { [void](Invocar-PreparacaoLoginLocal @argsFalhaLoginTeste);throw 'Nao recusou.' }
  catch { ExigirLoginTeste ($_.Exception.Data['CodigoTecnico'] -ceq $casoLoginTeste[1]);ExigirLoginTeste (-not $_.Exception.Message.Contains('SEGREDO_FIXTURE')) }
}
$argsCancelarLoginTeste=$argumentosLoginTeste.Clone()
$argsCancelarLoginTeste.Solicitar={return $null}
$argsCancelarLoginTeste.LerAplicacao={throw 'Cancelamento nao pode ler credenciais.'}
ExigirLoginTeste ((Invocar-PreparacaoLoginLocal @argsCancelarLoginTeste).Codigo -ceq 'CANCELADO')
$mockCanalLoginTeste=Join-Path $PSScriptRoot 'canalLoginMock.cjs'
foreach($modoLoginTeste in @('valido','invalido','preflight','http','timeout','stderr','cancelar')) {
  $textoUtf8LoginTeste='fixture-'+[char]0xe7+'-'+[char]0x6f22+'-'+[char]::ConvertFromUtf32(0x1f4a1)
  $configLoginTeste=@{senha=$textoUtf8LoginTeste;modo=$modoLoginTeste}
  $esperadoLoginTeste=switch($modoLoginTeste){'valido'{'CANAL_VALIDADO'} 'cancelar'{'CANCELADO'} 'stderr'{'PREFLIGHT_FALHOU'} 'preflight'{'PREFLIGHT_FALHOU'} 'http'{'INICIALIZACAO_HTTP_FALHOU'} 'timeout'{'PROCESSO_TIMEOUT'} default {'PROCESSO_FILHO_FALHOU'}}
  $argsCanalLoginTeste=$argumentosLoginTeste.Clone()
  $argsCanalLoginTeste.Transmitir={param($c) Enviar-CanalLoginLocal -Configuracao $configLoginTeste -ScriptNode $mockCanalLoginTeste}
  try {
    $resultadoCanalLoginTeste=Invocar-PreparacaoLoginLocal @argsCanalLoginTeste
    ExigirLoginTeste ($esperadoLoginTeste -cin @('CANAL_VALIDADO','CANCELADO') -and $resultadoCanalLoginTeste.Codigo -ceq $esperadoLoginTeste)
    ExigirLoginTeste (@($resultadoCanalLoginTeste.PSObject.Properties).Count -eq 1)
  } catch {
    ExigirLoginTeste ($_.Exception.Data['CodigoTecnico'] -ceq $esperadoLoginTeste)
    if($modoLoginTeste -eq 'stderr'){ExigirLoginTeste ($_.Exception.Data['ExitCode'] -eq 7)}
    if($modoLoginTeste -eq 'invalido'){ExigirLoginTeste ($_.Exception.Data['ExitCode'] -eq 9)}
    ExigirLoginTeste (-not $_.Exception.Message.Contains('SEGREDO_FIXTURE'))
  }
}
try {
  [void](Enviar-CanalLoginLocal -Configuracao @{} -ScriptNode (Join-Path $PSScriptRoot 'arquivo-ausente-fixture.cjs'))
  throw 'Nao recusou arquivo ausente.'
} catch {
  ExigirLoginTeste ($_.Exception.Data['CodigoTecnico'] -ceq 'PROCESSO_ARQUIVO_AUSENTE')
  ExigirLoginTeste ($_.Exception.Data['ExitCode'] -eq 1)
}
function Get-Command { param($Name,$CommandType,$ErrorAction) throw 'SEGREDO_FIXTURE_NAO_PUBLICAR' }
try { [void](Enviar-CanalLoginLocal -Configuracao @{} -ScriptNode $mockCanalLoginTeste); throw 'Nao recusou invocacao.' }
catch { ExigirLoginTeste ($_.Exception.Data['CodigoTecnico'] -ceq 'PROCESSO_INICIALIZACAO_FALHOU') }
$depoisLoginTeste=@{}
Get-ChildItem Env: | ForEach-Object { $depoisLoginTeste[$_.Name]=$_.Value }
ExigirLoginTeste ($antesLoginTeste.Count -eq $depoisLoginTeste.Count)
foreach($nLoginTeste in $antesLoginTeste.Keys){ExigirLoginTeste ($antesLoginTeste[$nLoginTeste] -ceq $depoisLoginTeste[$nLoginTeste])}
$tokensLoginTeste=$null;$errosLoginTeste=$null
[void][Management.Automation.Language.Parser]::ParseFile((Join-Path $pastaLoginTeste 'entrada-login-local.ps1'),[ref]$tokensLoginTeste,[ref]$errosLoginTeste)
ExigirLoginTeste ($errosLoginTeste.Count -eq 0)
$fonteLoginTeste=[IO.File]::ReadAllText((Join-Path $pastaLoginTeste 'entrada-login-local.ps1'))
ExigirLoginTeste (-not ($fonteLoginTeste -match 'Solicitar-SenhaAdmin|executar-login-023|SetEnvironmentVariable|Export-Clixml'))
Write-Output 'APROVADO: etapas, DPAPI simulado, cancelamento, pipe UTF8 real com fixture, timeout e ambiente; sem PostgreSQL ou backend.'
