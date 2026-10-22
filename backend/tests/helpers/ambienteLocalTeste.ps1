# Testes em processo descartável: constantes sintéticas, sem pg/node/backend.
$ErrorActionPreference='Stop'
$pastaLab = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../laboratorio'))
. (Join-Path $pastaLab 'ambiente-local.ps1')
function Exigir([bool]$Condicao) { if (-not $Condicao) { throw 'Falha na validacao isolada do ambiente.' } }
function node { throw 'Processo Node/backend proibido neste teste PowerShell.' }
$nomes = @('LOGIN_HMAC_SECRET','NR33_TESTE_AUSENTE_27','NR33_TESTE_EXISTENTE_27')
$original = Salvar-AmbienteLocal $nomes
try {
  $hmacFicticio = [Convert]::ToBase64String([byte[]](@(7)*32))
  Exigir (Testar-HmacLocal $hmacFicticio)
  Exigir (-not (Testar-HmacLocal ($hmacFicticio+"`n")))
  Exigir (-not (Testar-HmacLocal ($hmacFicticio.Substring(0,42)+'d=')))
  Exigir (-not (Testar-HmacLocal 'invalido'))
  [Environment]::SetEnvironmentVariable('NR33_TESTE_AUSENTE_27',$null,'Process')
  $env:NR33_TESTE_EXISTENTE_27='antes-sintetico'
  $env:LOGIN_HMAC_SECRET=$hmacFicticio
  $antes=Salvar-AmbienteLocal $nomes
  try {
    $env:LOGIN_HMAC_SECRET='substituicao-sintetica'
    $env:NR33_TESTE_AUSENTE_27='temporario'
    $env:NR33_TESTE_EXISTENTE_27='durante-sintetico'
  } finally { Restaurar-AmbienteLocal $antes }
  foreach($n in $nomes) { Exigir ([Environment]::GetEnvironmentVariable($n,'Process') -ceq $antes[$n]) }
  try {
    try { $env:LOGIN_HMAC_SECRET='temporario';throw 'erro-sintetico' }
    finally { Restaurar-AmbienteLocal $antes }
  } catch { Exigir ($_.Exception.Message -eq 'erro-sintetico') }
  foreach($n in $nomes) { Exigir ([Environment]::GetEnvironmentVariable($n,'Process') -ceq $antes[$n]) }

  # Exercita o finally do inicializador real somente no caminho HMAC inválido,
  # que termina antes de gerar JWT, chamar node ou abrir qualquer conexão.
  $bloqueados=@('NODE_OPTIONS','DATABASE_URL','DB_PASSWORD','JWT_SECRET','PGPASSWORD','PGPASSFILE','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGHOSTADDR','PGHOST','PGPORT','PGDATABASE','PGUSER','PGSSLMODE','PGTARGETSESSIONATTRS','NR33_SENHA_INSTALACAO')
  $salvos=Salvar-AmbienteLocal $bloqueados
  try {
    foreach($n in $bloqueados){[Environment]::SetEnvironmentVariable($n,$null,'Process')}
    $senhaFicticia=ConvertTo-SecureString ('x'*64) -AsPlainText -Force
    $hmacInvalido=ConvertTo-SecureString 'invalido-sintetico' -AsPlainText -Force
    $recusado=$false
    try {
      & (Join-Path $pastaLab 'postgres-local.ps1') -Etapa Backend -Executar -Confirmacao 'BACKEND inventario_nr33_multitenant_dev' -SenhaAplicacao $senhaFicticia -SegredoHmac $hmacInvalido
    } catch { $recusado=$_.Exception.Message.Contains('[HMAC_INVALIDO]') }
    Exigir $recusado
    Exigir ($env:LOGIN_HMAC_SECRET -ceq $hmacFicticio)
    # Armazenamento JWT indisponivel: nunca descriptografa arquivo real nem chega ao node.
    function Import-Clixml { throw 'Leitura DPAPI real proibida neste teste.' }
    $hmacValidoTeste=ConvertTo-SecureString $hmacFicticio -AsPlainText -Force
    $recusadoJwt=$false
    try {
      & (Join-Path $pastaLab 'postgres-local.ps1') -Etapa Backend -Executar -Confirmacao 'BACKEND inventario_nr33_multitenant_dev' -SenhaAplicacao $senhaFicticia -SegredoHmac $hmacValidoTeste
    } catch { $recusadoJwt=$_.Exception.Message.Contains('JWT protegido indisponivel ou invalido') }
    finally { $hmacValidoTeste.Dispose() }
    Exigir $recusadoJwt
    Exigir ($env:LOGIN_HMAC_SECRET -ceq $hmacFicticio)
    foreach($n in @('DB_PASSWORD','JWT_SECRET','NR33_SENHA_INSTALACAO')) { Exigir ($null -eq [Environment]::GetEnvironmentVariable($n,'Process')) }
  } finally { Restaurar-AmbienteLocal $salvos }

  foreach($arquivo in @('postgres-local.ps1','ambiente-local.ps1')) {
    $tokens=$null;$erros=$null
    [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $pastaLab $arquivo),[ref]$tokens,[ref]$erros)
    Exigir ($erros.Count -eq 0)
  }
  Write-Output 'APROVADO: HMAC, restauracao em sucesso/falha e sintaxe PowerShell; sem backend ou PostgreSQL.'
} finally { Restaurar-AmbienteLocal $original }
