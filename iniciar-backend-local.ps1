[CmdletBinding()]
param([switch]$Verificar)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'backend\laboratorio\credencial-aplicacao-salva.ps1')
$credencialBackendSalva=$null
$ambienteBackendSalvo=@{}
foreach ($nomeBackendSalvo in @('NR33_BACKEND_PORT','EMAIL_TRANSPORT')) { $ambienteBackendSalvo[$nomeBackendSalvo]=[Environment]::GetEnvironmentVariable($nomeBackendSalvo,'Process') }
try {
  $credencialBackendSalva=Ler-CredencialAplicacaoSalva
  [void](Testar-CredencialAplicacaoPostgres $credencialBackendSalva)
  if ($Verificar) { Write-Output 'CLIXML_DPAPI_ACL_OK; POSTGRES_AUTENTICADO; DESTINO_LOCAL_OK'; return }
  $env:NR33_BACKEND_PORT='3000'
  $env:EMAIL_TRANSPORT='disabled'
  & (Join-Path $PSScriptRoot 'backend\laboratorio\postgres-local.ps1') -Etapa Backend -Banco inventario_nr33_multitenant_dev -Executar -Confirmacao 'BACKEND inventario_nr33_multitenant_dev' -SenhaAplicacao $credencialBackendSalva.Password
  if ($LASTEXITCODE -ne 0) { throw 'BACKEND_INDISPONIVEL' }
} catch {
  $codigoBackendSalvo=$_.Exception.Message
  if ($codigoBackendSalvo -match 'CREDENCIAL_DIVERGENTE') { throw 'A senha PostgreSQL diverge do CLIXML. Use a sincronizacao supervisionada; nenhuma senha foi alterada automaticamente.' }
  if ($codigoBackendSalvo -match 'CLIXML_INDISPONIVEL') { throw 'CLIXML indisponivel: confira usuario Windows, ACL e DPAPI. Nenhum segredo foi exibido.' }
  throw 'Backend nao iniciado. Verifique PostgreSQL local, credencial e chaves JWT/HMAC protegidas. Detalhes privados omitidos.'
} finally {
  if ($null -ne $credencialBackendSalva) { $credencialBackendSalva.Password.Dispose() }
  foreach ($nomeBackendSalvo in $ambienteBackendSalvo.Keys) { [Environment]::SetEnvironmentVariable($nomeBackendSalvo,$ambienteBackendSalvo[$nomeBackendSalvo],'Process') }
}
